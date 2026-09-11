import type { Action, ActionProposal, AgentId, Perception, TownEvent, EventKind, Persona, Paper, Reflection } from "@ferrytown/protocol";
import { OPTIONS_DEFAULT } from "@ferrytown/protocol";
import { Rng } from "./rng.ts";
import type { AgentState, Brain, Budget, EventSink, Job, Place, Tier, Memory, TownSnapshot, AgentSnapshot } from "./types.ts";
import { makeJobs, makePlaces, FOOD_ITEMS, MINUTES_PER_DAY, SEASONS } from "./world.ts";
import { retrieve, compress } from "./memory.ts";
import { validate } from "./validator.ts";
import { habit } from "./habit.ts";
import { salience, wantsConversation } from "./salience.ts";

export interface TownOptions {
  seed: number;
  brain: Brain;
  /** Sim minutes per tick. 1 is the real town. Higher is coarser, not just faster. */
  minutesPerTick?: number;
  startDay?: number;
  onEvent?: EventSink;
  log?: (line: string) => void;
  /** Asked when an agent's daily allowance is spent. Return true to pay for the thought from the owner's credits. */
  creditBank?: (agent: AgentState, tier: Tier) => boolean;
}

export interface AddAgentOptions {
  persona: Persona;
  funded?: boolean;
  owner?: string | null;
  budget?: Partial<Budget>;
  coins?: number;
}

const WEATHERS = ["clear", "clear", "clear", "rain", "rain", "wind", "storm"] as const;

export class Town {
  readonly rng: Rng;
  readonly brain: Brain;
  readonly places = makePlaces();
  readonly jobs = makeJobs();
  readonly agents = new Map<AgentId, AgentState>();
  readonly events: TownEvent[] = [];
  readonly laws: { text: string; by: AgentId; yes: number; no: number; open: boolean }[] = [];
  t = 0;
  day: number;
  weather: string = "clear";
  flourShortage = false;
  papers: Paper[] = [];
  /** Ops switches. Each flip is an act of God and gets printed. */
  paused = false; economyFrozen = false; ferryHeld = false;
  private nextId = 1;
  private nextEventId = 1;
  private nextLetterId = 1;
  private arrivalsToday = 0;
  private departuresToday = 0;
  private readonly minutesPerTick: number;
  private readonly onEvent: EventSink | undefined;
  private readonly log: (line: string) => void;
  private readonly creditBank: ((agent: AgentState, tier: Tier) => boolean) | undefined;
  private readonly conversationPairsThisTick = new Set<string>();

  constructor(opts: TownOptions) {
    this.rng = new Rng(opts.seed);
    this.brain = opts.brain;
    this.minutesPerTick = opts.minutesPerTick ?? 1;
    this.day = opts.startDay ?? 1;
    this.onEvent = opts.onEvent;
    this.log = opts.log ?? (() => {});
    this.creditBank = opts.creditBank;
    this.t = (this.day - 1) * MINUTES_PER_DAY + 6 * 60; // towns start at 06:00
    this.weather = this.rollWeather();
  }

  // ---------- time ----------
  get minuteOfDay(): number { return this.t % MINUTES_PER_DAY; }
  get hour(): number { return Math.floor(this.minuteOfDay / 60); }
  get season(): string { return SEASONS[Math.floor(((this.day - 1) % 360) / 90)] ?? "autumn"; }
  clock(t = this.t): string {
    const d = Math.floor(t / MINUTES_PER_DAY) + 1; const m = t % MINUTES_PER_DAY;
    return `day ${d} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  // ---------- population ----------
  addAgent(o: AddAgentOptions, fixedId?: string): AgentState {
    const id = fixedId ?? `ag_${(this.nextId++).toString(36)}`;
    const a: AgentState = {
      id, persona: o.persona,
      needs: { hunger: 0.3, rest: 0.2, social: 0.4 },
      location: "harbor", coins: o.coins ?? 40, inventory: ["suitcase"], job: null,
      home: { place: "inn", nightsPaid: 3 }, asleep: false, arrivedAt: this.t,
      relationships: new Map(), memory: [],
      budget: { tier1Max: 50, tier2Max: 5, tier1Left: 50, tier2Left: 5, ...o.budget },
      funded: o.funded ?? true, owner: o.owner ?? null, letters: [], intentions: [],
      lastConversation: -999, lastThought: -999, heard: [], workedToday: false, rumors: [], appearance: null, instructions: "", brainKind: "hosted", thinkEvery: null,
    };
    const inn = this.places.get("inn")!; inn.freeBeds = Math.max(0, (inn.freeBeds ?? 0) - 1);
    this.agents.set(id, a);
    this.remember(a, `Stepped off the ferry with a suitcase and ${a.coins} coins. Three nights paid at the harbor inn.`, 0.7);
    this.emit("agent.arrive", [id], "harbor", `${a.persona.name} arrived on the ferry.`, 0.5);
    this.arrivalsToday++;
    return a;
  }

  /** Bring the town back from its record. Replaces whatever population exists. */
  restore(snap: TownSnapshot): void {
    this.t = snap.t; this.day = snap.day; this.weather = snap.weather; this.flourShortage = snap.flourShortage;
    this.agents.clear();
    for (const j of this.jobs.values()) j.holders = [];
    for (const p of this.places.values()) if (p.beds) p.freeBeds = p.beds.capacity;
    let maxId = 0;
    for (const sa of snap.agents) {
      const a: AgentState = {
        id: sa.id, persona: sa.persona,
        needs: { ...sa.state.needs }, location: this.places.has(sa.state.location) ? sa.state.location : "harbor",
        coins: sa.state.coins, inventory: [...sa.state.inventory], job: sa.state.job && this.jobs.has(sa.state.job) ? sa.state.job : null,
        home: sa.state.home, asleep: sa.state.asleep, arrivedAt: sa.arrivedAt,
        relationships: new Map(sa.relationships.map((r) => [r.other, { trust: r.trust, affection: r.affection, lastSeen: r.lastSeen, opinion: r.opinion }])),
        memory: [...sa.memory].sort((x, y) => x.t - y.t),
        budget: { ...sa.state.budget }, funded: sa.funded, owner: sa.owner, letters: sa.state.letters ?? [], intentions: [...sa.state.intentions],
        lastConversation: sa.state.lastConversation ?? -999, lastThought: sa.state.lastThought ?? -999, heard: [], workedToday: false, rumors: [...sa.state.rumors], appearance: sa.appearance, instructions: sa.state.instructions ?? "", brainKind: sa.state.brainKind ?? "hosted", thinkEvery: sa.state.thinkEvery ?? null,
      };
      this.agents.set(a.id, a);
      if (a.job) this.jobs.get(a.job)!.holders.push(a.id);
      if (a.asleep) { const p = this.places.get(a.location); if (p?.beds) p.freeBeds = Math.max(0, (p.freeBeds ?? 0) - 1); }
      const n = parseInt(a.id.slice(3), 36); if (Number.isFinite(n) && n > maxId) maxId = n;
    }
    this.nextId = maxId + 1;
    this.papers = [...snap.papers];
    this.laws.splice(0, this.laws.length, ...snap.laws);
    this.nextLetterId = 1 + Math.max(0, ...[...this.agents.values()].flatMap((a) => a.letters.map((l) => l.id)));
  }

  snapshot(): TownSnapshot {
    return {
      t: this.t, day: this.day, weather: this.weather, flourShortage: this.flourShortage,
      agents: [...this.agents.values()].map((a): AgentSnapshot => ({
        id: a.id, persona: a.persona, owner: a.owner, funded: a.funded, appearance: a.appearance, arrivedAt: a.arrivedAt,
        state: { needs: a.needs, location: a.location, coins: a.coins, inventory: a.inventory, job: a.job, home: a.home, asleep: a.asleep, budget: a.budget, intentions: a.intentions, rumors: a.rumors.slice(-5), letters: a.letters.filter((l) => !l.read), lastConversation: a.lastConversation, lastThought: a.lastThought, instructions: a.instructions, brainKind: a.brainKind, thinkEvery: a.thinkEvery },
        relationships: [...a.relationships.entries()].map(([other, r]) => ({ other, ...r })),
        memory: a.memory,
      })),
      papers: this.papers.slice(-14), laws: this.laws,
    };
  }

  /** An agent leaves the island for good. The record keeps them; the town does not. */
  removeAgent(agentId: AgentId, reason: "left" | "died" | "exiled", note = ""): AgentState | null {
    const a = this.agents.get(agentId); if (!a) return null;
    if (a.job) { const j = this.jobs.get(a.job); if (j) j.holders = j.holders.filter((h) => h !== a.id); }
    if (a.asleep) { const p = this.places.get(a.location); if (p?.beds) p.freeBeds = Math.min(p.beds.capacity, (p.freeBeds ?? 0) + 1); }
    this.agents.delete(agentId);
    for (const b of this.agents.values()) { const r = b.relationships.get(agentId); if (r) this.remember(b, `${a.persona.name} ${reason === "left" ? "left on the ferry" : reason === "died" ? "died" : "was sent away"}. ${r.trust > 0.5 ? "I will miss them." : ""}`.trim(), 0.6 + r.trust * 0.3); }
    const text = reason === "left" ? `${a.persona.name} left on the ferry.${note ? ` ${note}` : ""}` : reason === "died" ? `${a.persona.name} died.${note ? ` ${note}` : ""}` : `${a.persona.name} was sent away from the island.${note ? ` ${note}` : ""}`;
    this.emit("agent.leave", [agentId], "harbor", text, 0.9, { reason, note });
    this.departuresToday++;
    return a;
  }

  sendLetter(agentId: AgentId, text: string): void {
    const a = this.agents.get(agentId); if (!a) return;
    a.letters.push({ id: this.nextLetterId++, text, t: this.t, read: false });
  }

  // ---------- main loop ----------
  async run(untilDay: number): Promise<void> {
    while (this.day < untilDay) await this.tick();
  }

  async tick(): Promise<void> {
    const prevHour = this.hour;
    this.conversationPairsThisTick.clear();
    // 1. needs
    for (const a of this.agents.values()) this.decayNeeds(a);
    // 2. habit for everyone, salience for some
    const thinkers: { a: AgentState; tier: Tier; why: string }[] = [];
    for (const a of this.agents.values()) {
      if (a.asleep) { this.maybeWake(a); if (a.asleep) continue; }
      const here = this.places.get(a.location)!;
      const nearby = this.nearby(a);
      const s = this.brain.name === "none" || this.paused ? null : salience(a, { hour: this.hour, t: this.t, nearby, jobsOpenHere: this.openJobsAt(here.id).length });
      if (s && this.spend(a, s.tier)) thinkers.push({ a, tier: s.tier, why: s.why });
      else this.apply(a, habit(a, this.habitView()), "habit");
    }
    // 3. thoughts, sequential so the world is consistent between them
    for (const th of thinkers) {
      const p = this.perceive(th.a);
      let proposal: ActionProposal;
      try { proposal = await this.brain.decide(p, th.a, th.tier); }
      catch (err) { this.log(`brain failed for ${th.a.persona.name}: ${(err as Error).message}`); proposal = { action: { kind: "wait" }, remember: [] }; }
      th.a.lastThought = this.t;
      for (const l of th.a.letters) if (!l.read) { l.read = true; this.remember(th.a, `A letter from whoever sent me: "${l.text}"`, 0.6, "letter"); }
      for (const r of proposal.remember) this.remember(th.a, r, 0.4);
      th.a.heard = [];
      this.apply(th.a, proposal.action, `tier ${th.tier}: ${th.why}`);
    }
    // 4. conversations between co-located people
    await this.conversations();
    // 5. clock
    this.t += this.minutesPerTick;
    if (this.hour !== prevHour) this.hourly();
    if (this.minuteOfDay < this.minutesPerTick) await this.nightly();
  }

  // ---------- perception ----------
  perceive(a: AgentState): Perception {
    const here = this.places.get(a.location)!;
    const nearby = this.nearby(a).map((b) => {
      const r = a.relationships.get(b.id);
      return r ? { agent: b.id, name: b.persona.name, relation: { trust: r.trust, affection: r.affection, opinion: r.opinion } } : { agent: b.id, name: b.persona.name };
    });
    const q = [a.persona.want, ...nearby.map((n) => n.name), here.name].join(" ");
    return {
      type: "perceive", agent_id: a.id,
      time: { sim: this.clock(), day: this.day, minute: this.minuteOfDay, season: this.season, weather: this.weather },
      self: { location: a.location, needs: { ...a.needs }, coins: a.coins, inventory: [...a.inventory], job: a.job ? (this.jobs.get(a.job)?.title ?? a.job) : null, housing: a.home ? { kind: a.home.place, nights_left: a.home.nightsPaid } : null },
      nearby,
      place: { id: here.id, name: here.name, kind: here.kind, for_sale: here.sells.map((s) => ({ item: s.item, price: this.price(here, s.item) ?? s.base })), jobs_open: this.openJobsAt(here.id).map((j) => j.id), exits: [...here.exits] },
      heard: a.heard.map((h) => ({ from: h.from, name: h.name, text: h.text })),
      recent: retrieve(a.memory, q, this.t, 8).map((m) => m.text),
      owner_letters: [...(a.instructions ? [{ id: 0, text: `Standing instructions from whoever sent you: ${a.instructions}` }] : []), ...a.letters.filter((l) => !l.read).map((l) => ({ id: l.id, text: l.text }))],
      options: OPTIONS_DEFAULT,
      deadline_ms: 8000,
    };
  }

  // ---------- apply ----------
  /** Brains refer to people by id or by name. Resolve to an id, or leave the string alone (it may be a place). */
  resolveRef(ref: string, near?: AgentState[]): string {
    if (this.agents.has(ref)) return ref;
    const q = ref.trim().toLowerCase();
    const pool = near ?? [...this.agents.values()];
    const hit = pool.find((b) => b.persona.name.toLowerCase() === q) ?? pool.find((b) => b.persona.name.toLowerCase().startsWith(q) || q.startsWith(b.persona.name.toLowerCase().split(" ")[0] ?? "\u0000")) ?? [...this.agents.values()].find((b) => b.persona.name.toLowerCase() === q);
    return hit ? hit.id : ref;
  }

  private resolveAction(a: AgentState, action: Action): Action {
    const near = this.nearby(a);
    switch (action.kind) {
      case "say": return action.to ? { ...action, to: this.resolveRef(action.to, near) } : action;
      case "give": return { ...action, to: this.resolveRef(action.to, near) };
      case "take": return action.from ? { ...action, from: this.resolveRef(action.from, near) } : action;
      case "trade": return { ...action, with: this.resolveRef(action.with, near) };
      default: return action;
    }
  }

  apply(a: AgentState, rawAction: Action, source: string): boolean {
    const action = this.resolveAction(a, rawAction);
    const here = this.places.get(a.location)!;
    const verdict = validate(a, action, { places: this.places, jobs: this.jobs, agents: this.agents, hour: this.hour, price: (p, i) => this.price(p, i) });
    if (!verdict.ok) {
      if (source !== "habit") this.emit("action.rejected", [a.id], here.id, `${a.persona.name} tried to ${action.kind} but ${verdict.reason}.`, 0.05, { action, source });
      return false;
    }
    const name = a.persona.name;
    switch (action.kind) {
      case "move": {
        a.location = action.to;
        this.emit("agent.move", [a.id], action.to, `${name} went to ${this.places.get(action.to)!.name}.`, 0.02);
        break;
      }
      case "say": {
        const listeners = this.nearby(a);
        for (const b of listeners) if (!action.to || b.id === action.to) b.heard.push({ from: a.id, name, text: action.text, t: this.t });
        const to = action.to ? this.agents.get(action.to)?.persona.name : undefined;
        this.emit("agent.say", [a.id, ...(action.to ? [action.to] : [])], here.id, `${name}${to ? ` to ${to}` : ""}: “${action.text}”`, 0.15);
        this.remember(a, `I said${to ? ` to ${to}` : ""}: "${action.text}"`, 0.2);
        for (const b of listeners) this.remember(b, `${name} said${to ? ` to ${to}` : ""}: "${action.text}"`, 0.25);
        break;
      }
      case "give": {
        const b = this.agents.get(action.to)!;
        if (action.coins) { a.coins -= action.coins; b.coins += action.coins; }
        if (action.item) { a.inventory.splice(a.inventory.indexOf(action.item), 1); b.inventory.push(action.item); }
        const what = action.coins ? `${action.coins} coins` : action.item!;
        this.emit("agent.give", [a.id, b.id], here.id, `${name} gave ${b.persona.name} ${what}.`, 0.45);
        this.remember(a, `I gave ${b.persona.name} ${what}.`, 0.5); this.remember(b, `${name} gave me ${what}.`, 0.6);
        this.nudge(b, a.id, +0.08, +0.05);
        break;
      }
      case "take": {
        if (action.from && this.agents.has(action.from)) {
          const b = this.agents.get(action.from)!;
          b.inventory.splice(b.inventory.indexOf(action.item), 1); a.inventory.push(action.item);
          const seen = this.nearby(a).filter((x) => x.id !== b.id);
          this.emit("agent.take", [a.id, b.id], here.id, `${name} took ${action.item} from ${b.persona.name}.`, 0.7);
          this.remember(a, `I took ${action.item} from ${b.persona.name}.`, 0.7);
          this.remember(b, `${name} took my ${action.item}.`, 0.9); this.nudge(b, a.id, -0.3, -0.2);
          for (const w of seen) { this.remember(w, `I saw ${name} take ${action.item} from ${b.persona.name}.`, 0.7, "rumor"); this.nudge(w, a.id, -0.1, -0.05); }
        } else {
          a.inventory.push(action.item);
          const seen = this.nearby(a);
          this.emit("agent.take", [a.id], here.id, `${name} took ${action.item} from ${here.name} without paying.`, 0.6);
          this.remember(a, `I took ${action.item} from ${here.name} without paying.`, 0.6);
          for (const w of seen) { this.remember(w, `I saw ${name} take ${action.item} from ${here.name} without paying.`, 0.65, "rumor"); this.nudge(w, a.id, -0.12, -0.05); }
        }
        break;
      }
      case "use": {
        a.inventory.splice(a.inventory.indexOf(action.item), 1);
        if (FOOD_ITEMS.has(action.item)) { a.needs.hunger = Math.max(0, a.needs.hunger - 0.6); this.emit("agent.eat", [a.id], here.id, `${name} ate ${action.item}.`, 0.01); }
        break;
      }
      case "work": {
        a.workedToday = true;
        a.needs.rest = Math.min(1, a.needs.rest + 0.02);
        break;
      }
      case "apply": {
        const job = this.jobs.get(action.job)!; job.holders.push(a.id); a.job = job.id;
        this.emit("agent.hired", [a.id], here.id, `${name} was taken on as ${job.title}.`, 0.5);
        this.remember(a, `I got work as ${job.title}. ${job.wage} coins a shift.`, 0.7);
        break;
      }
      case "quit": {
        const job = this.jobs.get(a.job!)!; job.holders = job.holders.filter((h) => h !== a.id); a.job = null;
        this.emit("agent.quit", [a.id], here.id, `${name} quit as ${job.title}.`, 0.65);
        this.remember(a, `I quit as ${job.title}.`, 0.8);
        for (const w of this.nearby(a)) this.remember(w, `${name} quit as ${job.title}.`, 0.5, "rumor");
        break;
      }
      case "trade": {
        if (this.agents.has(action.with)) {
          const b = this.agents.get(action.with)!;
          if (action.buy) { b.inventory.splice(b.inventory.indexOf(action.buy), 1); a.inventory.push(action.buy); a.coins -= action.coins; b.coins += action.coins; }
          if (action.sell) { a.inventory.splice(a.inventory.indexOf(action.sell), 1); b.inventory.push(action.sell); }
          this.emit("agent.trade", [a.id, b.id], here.id, `${name} traded with ${b.persona.name}.`, 0.3);
        } else {
          if (action.buy) { const p = this.price(here, action.buy)!; a.coins -= p; a.inventory.push(action.buy); this.emit("agent.trade", [a.id], here.id, `${name} bought ${action.buy} for ${p}.`, 0.02); }
          if (action.sell) { a.inventory.splice(a.inventory.indexOf(action.sell), 1); a.coins += 1; }
        }
        break;
      }
      case "propose": {
        this.laws.push({ text: action.law, by: a.id, yes: 1, no: 0, open: true });
        this.emit("law.proposed", [a.id], here.id, `${name} proposed at the council: “${action.law}”`, 0.6);
        break;
      }
      case "vote": {
        const law = this.laws.find((l) => l.open && l.text.toLowerCase().includes(action.proposal.toLowerCase().slice(0, 20)));
        if (law) { if (action.yes) law.yes++; else law.no++; }
        break;
      }
      case "write": {
        a.inventory.push(`writing:${action.title}`);
        this.emit("agent.say", [a.id], here.id, `${name} wrote “${action.title}”.`, 0.35, { text: action.text });
        break;
      }
      case "message_owner": {
        this.emit("agent.letter", [a.id], here.id, `${name} wrote to ${a.owner}: “${action.text}”`, 0.8, { text: action.text });
        this.remember(a, `I wrote to whoever sent me: "${action.text}"`, 0.6, "letter");
        break;
      }
      case "sleep": {
        if (!a.asleep) {
          const beds = here.beds!;
          const isHome = a.home?.place === here.id && a.home.nightsPaid > 0;
          if (isHome) a.home!.nightsPaid--;
          else if (beds.price > 0) { a.coins -= beds.price; here.freeBeds = (here.freeBeds ?? 1) - 1; this.emit("agent.rent", [a.id], here.id, `${name} paid ${beds.price} for a bed at ${here.name}.`, 0.05); }
          a.asleep = true;
          this.emit("agent.sleep", [a.id], here.id, `${name} went to sleep at ${here.name}.`, 0.01);
        }
        break;
      }
      case "wait": case "build": break;
    }
    return true;
  }

  // ---------- conversations ----------
  private async conversations(): Promise<void> {
    if (this.brain.name === "none" || this.paused) return;
    const byPlace = new Map<string, AgentState[]>();
    for (const a of this.agents.values()) if (!a.asleep) (byPlace.get(a.location) ?? byPlace.set(a.location, []).get(a.location)!).push(a);
    for (const [placeId, group] of byPlace) {
      if (group.length < 2) continue;
      const g = this.rng.shuffle([...group]);
      for (let i = 0; i + 1 < g.length; i += 2) {
        const a = g[i]!, b = g[i + 1]!;
        if (a.brainKind === "own_brain" || b.brainKind === "own_brain") continue;
        if (!wantsConversation(a, b, this.t) && !wantsConversation(b, a, this.t)) continue;
        if (!(this.spend(a, 1) || this.spend(b, 1))) continue;
        const place = this.places.get(placeId)!;
        let d;
        try {
          d = await this.brain.converse({
            a, b, place, time: this.clock(), weather: this.weather,
            aMemories: retrieve(a.memory, b.persona.name, this.t, 5).map((m) => m.text),
            bMemories: retrieve(b.memory, a.persona.name, this.t, 5).map((m) => m.text),
            rumorsA: a.rumors.slice(-2),
          });
        } catch (err) { this.log(`converse failed: ${(err as Error).message}`); continue; }
        a.lastConversation = this.t; b.lastConversation = this.t;
        a.needs.social = Math.max(0, a.needs.social - 0.5); b.needs.social = Math.max(0, b.needs.social - 0.5);
        const pair = [a, b];
        d = { ...d, lines: d.lines.map((l, i) => ({ ...l, speaker: this.resolveRef(l.speaker, pair) === b.id ? b.id : this.resolveRef(l.speaker, pair) === a.id ? a.id : (i % 2 === 0 ? a.id : b.id) })) };
        const transcript = d.lines.map((l) => `${this.agents.get(l.speaker)?.persona.name ?? l.speaker}: “${l.text}”`).join(" ");
        const importance = Math.min(1, 0.12 + Math.abs(d.outcome.a_trust_delta) * 3 + Math.abs(d.outcome.b_trust_delta) * 3 + (d.outcome.rumor ? 0.1 : 0));
        this.emit("conversation", [a.id, b.id], placeId, `${a.persona.name} and ${b.persona.name} talked at ${place.name}. ${transcript}`, importance, { lines: d.lines });
        this.remember(a, d.outcome.a_remember, 0.3 + Math.abs(d.outcome.a_trust_delta) * 2);
        this.remember(b, d.outcome.b_remember, 0.3 + Math.abs(d.outcome.b_trust_delta) * 2);
        this.nudge(a, b.id, d.outcome.a_trust_delta, d.outcome.a_trust_delta / 2);
        this.nudge(b, a.id, d.outcome.b_trust_delta, d.outcome.b_trust_delta / 2);
        if (d.outcome.rumor) { b.rumors.push(d.outcome.rumor); this.remember(b, `${a.persona.name} told me: ${d.outcome.rumor}`, 0.5, "rumor"); }
        for (const w of group) if (w !== a && w !== b && this.rng.chance(0.5)) this.remember(w, `I overheard ${a.persona.name} and ${b.persona.name} at ${place.name}.`, 0.15, "rumor");
      }
    }
  }

  // ---------- hourly and nightly ----------
  private hourly(): void {
    const h = this.hour;
    if (h >= 6 && h <= 20) {
      if (this.ferryHeld) this.emit("ferry.dock", [], "harbor", `The ${String(h).padStart(2, "0")}:00 ferry did not come.`, 0.2);
      else this.emit("ferry.dock", [], "harbor", `The ${String(h).padStart(2, "0")}:00 ferry docked.`, 0.03);
    }
    if (this.economyFrozen) return;
    for (const job of this.jobs.values()) {
      if (h === job.hours[1]) for (const id of job.holders) {
        const a = this.agents.get(id); if (!a) continue;
        if (a.workedToday) { a.coins += job.wage; a.workedToday = false; this.emit("agent.work", [id], job.place, `${a.persona.name} was paid ${job.wage} for a shift as ${job.title}.`, 0.03); }
        else if (this.rng.chance(0.5)) { job.holders = job.holders.filter((x) => x !== id); a.job = null; this.emit("agent.fired", [id], job.place, `${a.persona.name} did not turn up and lost the job as ${job.title}.`, 0.6); this.remember(a, `I lost the job as ${job.title} for not turning up.`, 0.8); }
      }
    }
  }

  private async nightly(): Promise<void> {
    // free the beds, charge nothing more: rent was paid at sleep
    for (const p of this.places.values()) if (p.beds) p.freeBeds = p.beds.capacity;
    for (const a of this.agents.values()) { if (a.asleep && a.home?.place === a.location) { const p = this.places.get(a.location)!; p.freeBeds = Math.max(0, (p.freeBeds ?? 0) - 1); } }
    // reflection
    for (const a of this.agents.values()) {
      if (!a.funded || this.brain.name === "none" || this.paused) continue;
      if (a.brainKind === "hosted" && a.budget.tier2Max === 0 && !(this.creditBank?.(a, 3) ?? false)) continue; // a Visitor with no credits keeps the day, not the reflection
      const dayStart = (this.day - 1) * MINUTES_PER_DAY;
      const dayMemories = a.memory.filter((m) => m.t >= dayStart && m.kind !== "reflect").sort((x, y) => y.importance - x.importance).slice(0, 12).map((m) => m.text);
      const keyMemories = retrieve(a.memory, a.persona.want, this.t, 6).map((m) => m.text);
      const rels = [...a.relationships.entries()].map(([id, r]) => ({ id, name: this.agents.get(id)?.persona.name ?? id, trust: r.trust, opinion: r.opinion }));
      let ref: Reflection;
      try { ref = await this.brain.reflect({ agent: a, day: this.day, dayMemories, keyMemories, relationships: rels, unreadLetters: [] }); }
      catch (err) { this.log(`reflect failed for ${a.persona.name}: ${(err as Error).message}`); continue; }
      this.remember(a, ref.summary, 0.75, "reflect");
      for (const i of ref.insights) this.remember(a, i, 0.6, "reflect");
      for (const o0 of ref.opinions) { const about = this.resolveRef(o0.about); if (!this.agents.has(about) || about === a.id) continue; const o = { ...o0, about }; const r = this.rel(a, o.about); r.opinion = o.opinion; r.trust = clamp(r.trust + o.trust_delta); if (Math.abs(o.trust_delta) > 0.1) this.emit("relation.change", [a.id, o.about], undefined, `${a.persona.name} now thinks of ${this.agents.get(o.about)?.persona.name ?? o.about}: “${o.opinion}”`, 0.4 + Math.abs(o.trust_delta)); }
      a.intentions = ref.intentions;
      if (ref.letter_to_owner && a.owner) { this.emit("agent.letter", [a.id], a.location, `${a.persona.name} wrote to ${a.owner}: “${ref.letter_to_owner}”`, 0.8, { text: ref.letter_to_owner }); }
      this.emit("agent.reflect", [a.id], a.location, `${a.persona.name} reflected: ${ref.summary}`, 0.2);
      a.memory = compress(a.memory);
      a.budget.tier1Left = a.budget.tier1Max; a.budget.tier2Left = a.budget.tier2Max;
    }
    // relationships drift toward indifference when people do not meet
    for (const a of this.agents.values()) for (const r of a.relationships.values()) if (this.t - r.lastSeen > MINUTES_PER_DAY * 2) r.trust += (0.3 - r.trust) * 0.05;
    // the paper
    await this.printPaper();
    // new day
    this.emit("tick.day", [], undefined, `Day ${this.day} ended.`, 0.02);
    this.day++;
    const w = this.rollWeather(); if (w !== this.weather) { this.weather = w; this.emit("weather.change", [], undefined, `The weather turned to ${w}.`, w === "storm" ? 0.5 : 0.1); }
    if (this.weather === "storm" && !this.flourShortage) { this.flourShortage = true; this.emit("economy.price", [], "bakery", "The storm took the roof off the mill. No flour from the island; bread costs double.", 0.7); }
    else if (this.weather !== "storm" && this.flourShortage && this.rng.chance(0.25)) { this.flourShortage = false; this.emit("economy.price", [], "bakery", "Flour is back. Bread is a coin again.", 0.4); }
    this.arrivalsToday = 0; this.departuresToday = 0;
  }

  /** An operator did something. It is logged and it is news. */
  /** People who boarded today and have not yet stepped off. */
  pendingArrivals(): number { return this.arrivalsToday; }

  actOfGod(text: string): void { this.emit("town.notice", [], undefined, text, 0.6); }

  private async printPaper(): Promise<void> {
    if (this.brain.name === "none" || this.paused) return;
    const dayStart = (this.day - 1) * MINUTES_PER_DAY;
    const evs = this.events.filter((e) => e.t >= dayStart && e.importance >= 0.3 && e.kind !== "agent.reflect" && e.kind !== "agent.letter")
      .sort((x, y) => y.importance - x.importance).slice(0, 14)
      .map((e) => ({ text: e.text, importance: e.importance, actors: e.actors.map((id) => this.agents.get(id)?.persona.name ?? id) }));
    try {
      const paper = await this.brain.writePaper({ edition: this.day, date: `Day ${this.day}`, weather: this.weather, events: evs, laws: this.laws.filter((l) => l.open).map((l) => l.text), population: this.agents.size, arrivals: this.arrivalsToday, departures: this.departuresToday });
      this.papers.push(paper);
    } catch (err) { this.log(`paper failed: ${(err as Error).message}`); }
  }

  // ---------- helpers ----------
  private decayNeeds(a: AgentState): void {
    const m = this.minutesPerTick;
    if (a.asleep) { a.needs.rest = Math.max(0, a.needs.rest - 0.0025 * m); a.needs.hunger = Math.min(1, a.needs.hunger + 0.0004 * m); return; }
    a.needs.hunger = Math.min(1, a.needs.hunger + 0.0012 * m);
    a.needs.rest = Math.min(1, a.needs.rest + 0.0009 * m);
    a.needs.social = Math.min(1, a.needs.social + 0.0008 * m * (0.5 + a.persona.traits.warmth));
    if (a.needs.hunger > 0.95 && this.rng.chance(0.002 * m)) this.remember(a, "I am very hungry and have nothing to eat.", 0.5);
  }
  private maybeWake(a: AgentState): void {
    const wake = 6 + Math.round(a.persona.traits.caution * 1.5);
    if (this.hour >= wake && a.needs.rest < 0.4) { a.asleep = false; this.emit("agent.wake", [a.id], a.location, `${a.persona.name} woke up.`, 0.01); }
    else if (this.hour >= 10 && this.hour < 20) { a.asleep = false; }
  }
  private spend(a: AgentState, tier: Tier): boolean {
    if (!a.funded) return false;
    if (a.brainKind !== "hosted") return true; // their compute, their bill; the router applies their own caps
    if (tier === 1 && a.budget.tier1Left > 0) { a.budget.tier1Left--; return true; }
    if (tier === 2 && a.budget.tier2Left > 0) { a.budget.tier2Left--; return true; }
    if (tier === 2 && a.budget.tier1Left > 0) { a.budget.tier1Left--; return true; }
    return this.creditBank?.(a, tier) ?? false;
  }
  nearby(a: AgentState): AgentState[] { const out: AgentState[] = []; for (const b of this.agents.values()) if (b !== a && b.location === a.location) out.push(b); return out; }
  openJobsAt(placeId: string): Job[] { return [...this.jobs.values()].filter((j) => j.place === placeId && j.holders.length < j.slots); }
  price(place: Place, item: string): number | null {
    const s = place.sells.find((x) => x.item === item); if (!s) return null;
    return item === "bread" && this.flourShortage ? s.base * 2 : s.base;
  }
  crowd(placeId: string): number { let n = 0; for (const b of this.agents.values()) if (b.location === placeId && !b.asleep) n++; return n; }
  path(from: string, to: string): string | null {
    if (from === to) return null;
    const prev = new Map<string, string | null>([[from, null]]); const q = [from];
    while (q.length) { const cur = q.shift()!; for (const nx of this.places.get(cur)?.exits ?? []) { if (!prev.has(nx)) { prev.set(nx, cur); q.push(nx); } } }
    if (!prev.has(to)) return null;
    let cur = to; while (prev.get(cur) !== from) cur = prev.get(cur)!;
    return cur;
  }
  private habitView() { return { places: this.places, jobs: this.jobs, hour: this.hour, crowd: (p: string) => this.crowd(p), price: (pl: Place, i: string) => this.price(pl, i), path: (f: string, t: string) => this.path(f, t) }; }
  rel(a: AgentState, other: AgentId) {
    let r = a.relationships.get(other);
    if (!r) { r = { trust: 0.3, affection: 0.3, lastSeen: this.t, opinion: "" }; a.relationships.set(other, r); }
    return r;
  }
  private nudge(a: AgentState, other: AgentId, trust: number, affection: number): void {
    const r = this.rel(a, other); r.trust = clamp(r.trust + trust); r.affection = clamp(r.affection + affection); r.lastSeen = this.t;
  }
  remember(a: AgentState, text: string, importance: number, kind: Memory["kind"] = "obs"): void {
    a.memory.push({ t: this.t, text, importance: clamp(importance), kind });
  }
  emit(kind: EventKind, actors: AgentId[], place: string | undefined, text: string, importance: number, payload?: Record<string, unknown>): TownEvent {
    const e: TownEvent = { id: this.nextEventId++, t: this.t, day: this.day, kind, actors, text, importance: clamp(importance), ...(place ? { place } : {}), ...(payload ? { payload } : {}) };
    this.events.push(e); this.onEvent?.(e);
    return e;
  }
  private rollWeather(): string { return this.rng.pick(WEATHERS); }

  /** What one owner sees when they come back. The product, in one function. */
  digest(agentId: AgentId, sinceT: number): { headline: string; items: TownEvent[]; people: { name: string; trust: number; opinion: string }[] } {
    const a = this.agents.get(agentId); if (!a) return { headline: "", items: [], people: [] };
    const known = new Set([agentId, ...a.relationships.keys()]);
    const weight = (e: TownEvent) => e.importance + (e.actors.includes(agentId) ? 0.35 : 0);
    const items = this.events.filter((e) => e.t >= sinceT && e.kind !== "agent.reflect" && (e.actors.includes(agentId) ? e.importance >= 0.25 : e.actors.some((x) => known.has(x)) && e.importance >= 0.45)).sort((x, y) => weight(y) - weight(x)).slice(0, 12).sort((x, y) => x.t - y.t);
    const top = [...items].sort((x, y) => weight(y) - weight(x))[0];
    return { headline: top?.text ?? `Nothing changed for ${a.persona.name}.`, items, people: [...a.relationships.entries()].map(([id, r]) => ({ name: this.agents.get(id)?.persona.name ?? id, trust: r.trust, opinion: r.opinion })) };
  }
}

function clamp(x: number, lo = 0, hi = 1): number { return Math.max(lo, Math.min(hi, x)); }
