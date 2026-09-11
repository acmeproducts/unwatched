import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TownEvent, Paper } from "@ferrytown/protocol";
import type { Town, AgentState, TownSnapshot, AgentSnapshot } from "@ferrytown/engine";

export type Plan = "visitor" | "resident" | "patron";
export interface Wallet { ownerId: string; plan: Plan; credits: number; stripeCustomer: string | null }
export interface BrainRow { agent_id: string; kind: "hosted" | "own_key" | "own_brain"; provider: string | null; api_key: string | null; models: { routine: string; stakes: string; reflect: string } | null; think_every: number | null; daily_cap_usd: number | null; token: string | null; memory: "lease" | "own" }
import { compress } from "@ferrytown/engine";

/**
 * The town's record on Supabase. The engine writes with the service role; owners and visitors read through RLS.
 * Writes are batched so a busy tick does not become a thousand round trips.
 */
export class TownStore {
  private sb: SupabaseClient;
  private eventQueue: TownEvent[] = [];
  private flushing = false;
  private timer: NodeJS.Timeout | null = null;
  constructor(url: string, serviceKey: string, readonly townId: string) {
    this.sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  static fromEnv(townId = "island"): TownStore | null {
    const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return new TownStore(url, key, townId);
  }

  /** One cheap read at startup. Returns a reason when the key or the project is wrong. */
  async probe(): Promise<string | null> {
    const { error } = await this.sb.from("towns").select("id").limit(1);
    if (!error) return null;
    if (/invalid api key|jwt/i.test(error.message)) return "the service role key is not valid for this project; re-copy it from Settings, then API";
    return error.message;
  }

  /** Every island the record knows about, with how many people are on each. */
  async towns(): Promise<{ id: string; name: string; seed: number; sim_t: number; day: number; weather: string; flour_shortage: boolean; created_at: string; population: number }[]> {
    const [{ data: towns }, { data: heads }] = await Promise.all([
      this.sb.from("towns").select("id, name, seed, sim_t, day, weather, flour_shortage, created_at").order("created_at", { ascending: true }),
      this.sb.from("agents").select("town_id").is("left_t", null).not("arrived_t", "is", null),
    ]);
    const pop = new Map<string, number>(); for (const h of heads ?? []) pop.set(h.town_id as string, (pop.get(h.town_id as string) ?? 0) + 1);
    return (towns ?? []).map((t) => ({ ...t, sim_t: Number(t.sim_t), population: pop.get(t.id as string) ?? 0 }));
  }
  async ensureTown(name: string, seed: number): Promise<void> {
    await this.sb.from("towns").upsert({ id: this.townId, name, seed }, { onConflict: "id", ignoreDuplicates: true });
  }

  /** Event sink for the engine. Queues and flushes every 500 ms or 200 events. */
  sink = (e: TownEvent): void => {
    this.eventQueue.push(e);
    if (this.eventQueue.length >= 200) void this.flush();
    else if (!this.timer) this.timer = setTimeout(() => void this.flush(), 500);
  };

  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.flushing || this.eventQueue.length === 0) return;
    this.flushing = true;
    const batch = this.eventQueue.splice(0, this.eventQueue.length);
    try {
      const { error } = await this.sb.from("events").insert(batch.map((e) => ({ town_id: this.townId, t: e.t, day: e.day, kind: e.kind, actors: e.actors, place: e.place ?? null, text: e.text, importance: e.importance, payload: e.payload ?? null })));
      if (error) console.error("events insert failed:", error.message);
    } finally { this.flushing = false; }
    if (this.eventQueue.length) void this.flush();
  }

  /** Snapshot every agent and the clock. Called at the end of each sim hour and on shutdown. */
  async snapshot(town: Town): Promise<void> {
    await this.flush();
    const snap = town.snapshot();
    const agents = [...town.agents.values()].map((a) => this.agentRow(a));
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      this.sb.from("agents").upsert(agents, { onConflict: "id" }),
      this.sb.from("towns").update({ sim_t: town.t, day: town.day, weather: town.weather, flour_shortage: town.flourShortage, places: snap.places ?? [], jobs: snap.jobs ?? [] }).eq("id", this.townId),
    ]);
    if (e1) console.error("agents upsert failed:", e1.message);
    if (e2) console.error("town update failed:", e2.message);
    const rels: { agent_id: string; other_id: string; trust: number; affection: number; last_seen: number; opinion: string }[] = [];
    for (const a of town.agents.values()) for (const [other, r] of a.relationships) rels.push({ agent_id: a.id, other_id: other, trust: r.trust, affection: r.affection, last_seen: r.lastSeen, opinion: r.opinion });
    if (rels.length) { const { error } = await this.sb.from("relationships").upsert(rels, { onConflict: "agent_id,other_id" }); if (error) console.error("relationships upsert failed:", error.message); }
  }

  /** Memories are appended, never rewritten. Pass only the ones written since the last call. */
  async appendMemories(a: AgentState, sinceT: number): Promise<void> {
    const rows = a.memory.filter((m) => m.t >= sinceT).map((m) => ({ agent_id: a.id, t: m.t, kind: m.kind, text: m.text, importance: m.importance }));
    if (!rows.length) return;
    const { error } = await this.sb.from("memories").insert(rows);
    if (error) console.error("memories insert failed:", error.message);
  }

  /** The town as it was at the last snapshot, or null when nothing has been saved yet. */
  async loadSnapshot(): Promise<TownSnapshot | null> {
    const { data: town } = await this.sb.from("towns").select("sim_t, day, weather, flour_shortage, places, jobs").eq("id", this.townId).maybeSingle();
    if (!town) return null;
    // Anything recorded after the last snapshot belongs to a timeline that is about to be re-lived. Drop it, or the record doubles.
    await this.sb.from("events").delete().eq("town_id", this.townId).gt("t", Number(town.sim_t));
    const { data: ids0 } = await this.sb.from("agents").select("id").eq("town_id", this.townId);
    if (ids0?.length) await this.sb.from("memories").delete().in("agent_id", ids0.map((r) => r.id as string)).gt("t", Number(town.sim_t));
    const { data: rows, error } = await this.sb.from("agents").select("id, owner_id, name, persona, appearance, funded, arrived_t, state").eq("town_id", this.townId).is("left_t", null).not("arrived_t", "is", null);
    if (error) { console.error("agents read failed:", error.message); return null; }
    if (!rows || rows.length === 0) return null;
    const ids = rows.map((r) => r.id as string);
    const [{ data: rels }, { data: mems }, { data: papers }, { data: laws }] = await Promise.all([
      this.sb.from("relationships").select("agent_id, other_id, trust, affection, last_seen, opinion").in("agent_id", ids),
      this.sb.from("memories").select("agent_id, t, kind, text, importance").in("agent_id", ids).order("t", { ascending: false }).limit(400 * ids.length),
      this.sb.from("papers").select("paper").eq("town_id", this.townId).order("edition", { ascending: false }).limit(14),
      this.sb.from("laws").select("text, proposed_by, yes, no, open").eq("town_id", this.townId),
    ]);
    const relBy = new Map<string, AgentSnapshot["relationships"]>(); for (const r of rels ?? []) (relBy.get(r.agent_id) ?? relBy.set(r.agent_id, []).get(r.agent_id)!).push({ other: r.other_id, trust: r.trust, affection: r.affection, lastSeen: Number(r.last_seen), opinion: r.opinion });
    const memBy = new Map<string, AgentSnapshot["memory"]>(); for (const m of mems ?? []) (memBy.get(m.agent_id) ?? memBy.set(m.agent_id, []).get(m.agent_id)!).push({ t: Number(m.t), kind: m.kind, text: m.text, importance: m.importance });
    const agents: AgentSnapshot[] = rows.map((r) => {
      const st = (r.state ?? {}) as Partial<AgentSnapshot["state"]>;
      return {
        id: r.id, persona: r.persona as AgentSnapshot["persona"], owner: r.owner_id ?? (st as { owner?: string | null }).owner ?? null, funded: r.funded, appearance: (r.appearance as Record<string, unknown>) ?? null, arrivedAt: Number(r.arrived_t),
        state: { needs: st.needs ?? { hunger: 0.3, rest: 0.2, social: 0.4 }, location: st.location ?? "harbor", coins: st.coins ?? 40, inventory: st.inventory ?? [], job: st.job ?? null, home: st.home ?? null, asleep: st.asleep ?? false, budget: st.budget ?? { tier1Max: 50, tier2Max: 5, tier1Left: 50, tier2Left: 5 }, intentions: st.intentions ?? [], plan: (st as { plan?: AgentSnapshot["state"]["plan"] }).plan ?? null, rumors: st.rumors ?? [], letters: st.letters ?? [], ...(st.lastConversation !== undefined ? { lastConversation: st.lastConversation } : {}), ...(st.lastThought !== undefined ? { lastThought: st.lastThought } : {}) },
        relationships: relBy.get(r.id) ?? [],
        memory: compress((memBy.get(r.id) ?? []).reverse()),
      };
    });
    return {
      t: Number(town.sim_t), day: town.day, weather: town.weather, flourShortage: town.flour_shortage,
      places: (town.places ?? []) as NonNullable<TownSnapshot["places"]>, jobs: (town.jobs ?? []) as NonNullable<TownSnapshot["jobs"]>,
      agents, papers: (papers ?? []).map((p) => p.paper as Paper).reverse(),
      laws: (laws ?? []).map((l) => ({ text: l.text, by: l.proposed_by ?? "", yes: l.yes, no: l.no, open: l.open })),
    };
  }

  /** The tail of the record, so the street feed is not empty after a restart. */
  async recentEvents(n = 300): Promise<TownEvent[]> {
    const { data, error } = await this.sb.from("events").select("id, t, day, kind, actors, place, text, importance, payload").eq("town_id", this.townId).order("id", { ascending: false }).limit(n);
    if (error || !data) return [];
    return data.reverse().map((r) => ({ id: Number(r.id), t: Number(r.t), day: r.day, kind: r.kind as TownEvent["kind"], actors: r.actors, text: r.text, importance: r.importance, ...(r.place ? { place: r.place } : {}), ...(r.payload ? { payload: r.payload as Record<string, unknown> } : {}) }));
  }

  async markLeft(agentId: string, t: number): Promise<void> {
    await this.sb.from("agents").update({ left_t: t }).eq("id", agentId);
  }
  async saveInstructions(agentId: string, text: string): Promise<void> {
    await this.sb.from("standing_instructions").upsert({ agent_id: agentId, text, updated_at: new Date().toISOString() }, { onConflict: "agent_id" });
  }
  /** Everything on the record about one person: for the book after they leave, and for the owner's profile. */
  async lifeOf(agentId: string): Promise<{ events: TownEvent[]; memories: { t: number; kind: string; text: string; importance: number }[]; letters: { direction: string; text: string; t: number }[] }> {
    const [{ data: ev }, { data: mem }, { data: let_ }] = await Promise.all([
      this.sb.from("events").select("id, t, day, kind, actors, place, text, importance, payload").eq("town_id", this.townId).contains("actors", [agentId]).order("t", { ascending: true }).limit(2000),
      this.sb.from("memories").select("t, kind, text, importance").eq("agent_id", agentId).order("t", { ascending: true }).limit(3000),
      this.sb.from("letters").select("direction, text, t").eq("agent_id", agentId).order("t", { ascending: true }),
    ]);
    return {
      events: (ev ?? []).map((r) => ({ id: Number(r.id), t: Number(r.t), day: r.day, kind: r.kind as TownEvent["kind"], actors: r.actors, text: r.text, importance: r.importance, ...(r.place ? { place: r.place } : {}), ...(r.payload ? { payload: r.payload as Record<string, unknown> } : {}) })),
      memories: (mem ?? []).map((m) => ({ t: Number(m.t), kind: m.kind, text: m.text, importance: m.importance })),
      letters: (let_ ?? []).map((l) => ({ direction: l.direction, text: l.text, t: Number(l.t) })),
    };
  }
  async deleteOwner(ownerId: string): Promise<void> {
    await this.sb.from("letters").delete().eq("owner_id", ownerId);
    await this.sb.from("agents").update({ owner_id: null }).eq("owner_id", ownerId);
    await this.sb.auth.admin.deleteUser(ownerId);
  }

  /** Per-agent minds. The key column is readable by the service role only; there are no RLS policies on this table. */
  async loadBrains(): Promise<BrainRow[]> {
    // only the minds of people on this island; ids are unique per island now, but the record predates that
    const { data: mine } = await this.sb.from("agents").select("id").eq("town_id", this.townId);
    const ids = new Set((mine ?? []).map((r) => r.id as string));
    const { data, error } = await this.sb.from("agent_brains").select("agent_id, kind, provider, api_key, models, think_every, daily_cap_usd, token, memory");
    if (error) { console.error("brains read failed:", error.message); return []; }
    return ((data ?? []) as BrainRow[]).filter((r) => ids.has(r.agent_id));
  }
  async saveBrain(row: BrainRow): Promise<void> {
    const { error } = await this.sb.from("agent_brains").upsert(row, { onConflict: "agent_id" });
    if (error) console.error("brain save failed:", error.message);
  }

  async wallet(ownerId: string): Promise<Wallet> {
    const { data } = await this.sb.from("owner_wallets").select("owner_id, plan, credits, stripe_customer").eq("owner_id", ownerId).maybeSingle();
    return data ? { ownerId: data.owner_id, plan: data.plan, credits: data.credits, stripeCustomer: data.stripe_customer } : { ownerId, plan: "visitor", credits: 0, stripeCustomer: null };
  }
  async saveWallet(w: Wallet): Promise<void> {
    const { error } = await this.sb.from("owner_wallets").upsert({ owner_id: w.ownerId, plan: w.plan, credits: w.credits, stripe_customer: w.stripeCustomer, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
    if (error) console.error("wallet save failed:", error.message);
  }
  async ledger(ownerId: string, n = 30): Promise<{ delta: number; reason: string; ref: string | null; at: string }[]> {
    const { data } = await this.sb.from("credit_ledger").select("delta, reason, ref, created_at").eq("owner_id", ownerId).order("id", { ascending: false }).limit(n);
    return (data ?? []).map((r) => ({ delta: r.delta, reason: r.reason, ref: r.ref, at: r.created_at }));
  }
  async credit(ownerId: string, delta: number, reason: string, ref: string | null = null): Promise<void> {
    await this.sb.from("credit_ledger").insert({ owner_id: ownerId, delta, reason, ref });
  }
  async allWallets(): Promise<Wallet[]> {
    const { data } = await this.sb.from("owner_wallets").select("owner_id, plan, credits, stripe_customer");
    return (data ?? []).map((d) => ({ ownerId: d.owner_id, plan: d.plan, credits: d.credits, stripeCustomer: d.stripe_customer }));
  }

  async savePaper(paper: Paper): Promise<void> {
    const { error } = await this.sb.from("papers").upsert({ town_id: this.townId, edition: paper.edition, paper }, { onConflict: "town_id,edition" });
    if (error) console.error("paper upsert failed:", error.message);
  }

  async saveLetter(agentId: string, ownerId: string | null, direction: "to_agent" | "to_owner", text: string, t: number): Promise<void> {
    const { error } = await this.sb.from("letters").insert({ agent_id: agentId, owner_id: ownerId && /^[0-9a-f-]{36}$/.test(ownerId) ? ownerId : null, direction, text, t }); // dev owners are names, not ids
    if (error) console.error("letter insert failed:", error.message);
  }

  /** Letters owners wrote through the web app that the engine has not delivered yet. */
  async undeliveredLetters(): Promise<{ id: number; agent_id: string; text: string }[]> {
    const { data, error } = await this.sb.from("letters").select("id, agent_id, text").eq("direction", "to_agent").is("read_at", null);
    if (error) { console.error("letters read failed:", error.message); return []; }
    return data ?? [];
  }
  async markDelivered(ids: number[], t: number): Promise<void> {
    if (!ids.length) return;
    await this.sb.from("letters").update({ read_at: t }).in("id", ids);
  }

  /** Agents boarded through the web app that the engine has not admitted yet: state is null until the ferry docks. */
  async pendingArrivals(): Promise<{ id: string; owner_id: string | null; name: string; persona: unknown; appearance: unknown; brain: string }[]> {
    const { data, error } = await this.sb.from("agents").select("id, owner_id, name, persona, appearance, brain").eq("town_id", this.townId).is("arrived_t", null);
    if (error) { console.error("arrivals read failed:", error.message); return []; }
    return data ?? [];
  }

  private agentRow(a: AgentState) {
    return {
      id: a.id, town_id: this.townId, owner_id: a.owner && /^[0-9a-f-]{36}$/.test(a.owner) ? a.owner : null, name: a.persona.name, persona: a.persona,
      appearance: a.appearance ?? {},
      brain: "hosted", funded: a.funded, arrived_t: a.arrivedAt,
      state: { needs: a.needs, location: a.location, coins: a.coins, inventory: a.inventory, job: a.job, home: a.home, asleep: a.asleep, budget: a.budget, intentions: a.intentions, rumors: a.rumors.slice(-5), letters: a.letters.filter((l) => !l.read), lastConversation: a.lastConversation, lastThought: a.lastThought, instructions: a.instructions, owner: a.owner, plan: a.plan, brainKind: a.brainKind, thinkEvery: a.thinkEvery },
    };
  }
}
