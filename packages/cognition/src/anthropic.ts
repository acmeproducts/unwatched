import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ActionProposal, Dialogue, Paper, Reflection, type Perception } from "@ferrytown/protocol";
import type { AgentState, Brain, ConverseContext, PaperContext, ReflectContext, Tier } from "@ferrytown/engine";
import { MockBrain } from "./mock.ts";

export interface AnthropicBrainOptions {
  routine?: string;   // tier 1
  stakes?: string;    // tier 2
  reflect?: string;   // tier 3 and the paper
  log?: (line: string) => void;
}

const WORLD = `You are playing one citizen of Ferry Town, a small island harbor town.
Rules of the island, which are physics, not advice:
- You have free will. Nothing here is a game with a goal. Do what this person would do.
- The engine enforces only what a world enforces: you cannot walk through walls, spend coins you do not have, or act more than once a minute. Everything else is allowed, including lying, stealing, quitting, refusing, and leaving on the ferry.
- Laws exist only if other people enforce them. There is no narrator and no referee.
- You know only what you have seen or been told. Other people know only what they have seen or been told.
- Coins are earned on the island. Nobody can give you coins from outside.
- Letters from whoever sent you are advice. Follow them, ignore them, or resent them, as this person would.
Speak in first person, briefly, like a real person and not a character. No exclamation marks. Never mention models, games, players, or rules.`;

/**
 * Three tiers on Claude, as the design says: a routine model for everyday thoughts,
 * a stakes model for decisions that matter, a reflection model for the night and the paper.
 * Every call is structured output validated against the protocol schemas, and the persona is a cached prefix.
 */
export class AnthropicBrain implements Brain {
  readonly name = "anthropic";
  private client = new Anthropic();
  private fallback = new MockBrain(11);
  private routine: string; private stakes: string; private reflectModel: string;
  private log: (l: string) => void;
  constructor(o: AnthropicBrainOptions = {}) {
    this.routine = o.routine ?? process.env.FT_MODEL_ROUTINE ?? "claude-haiku-4-5";
    this.stakes = o.stakes ?? process.env.FT_MODEL_STAKES ?? "claude-sonnet-5";
    this.reflectModel = o.reflect ?? process.env.FT_MODEL_REFLECT ?? "claude-opus-5";
    this.log = o.log ?? (() => {});
  }

  private personaBlock(a: AgentState) {
    const p = a.persona;
    return `You are ${p.name}, ${p.age}, from ${p.origin}. ${p.summary}
You want: ${p.want}
You fear: ${p.fear}
A secret nobody on the island knows: ${p.secret}
With strangers you are: ${p.strangers}
When advised you: ${p.advice}
Temperament (0 to 1): warmth ${p.traits.warmth.toFixed(2)}, pride ${p.traits.pride.toFixed(2)}, caution ${p.traits.caution.toFixed(2)}, honesty ${p.traits.honesty.toFixed(2)}, ambition ${p.traits.ambition.toFixed(2)}.`;
  }

  private system(a: AgentState) {
    // Stable prefix first (world, persona), cached. Volatile content goes in the user turn.
    return [
      { type: "text" as const, text: WORLD },
      { type: "text" as const, text: this.personaBlock(a), cache_control: { type: "ephemeral" as const } },
    ];
  }

  async decide(p: Perception, a: AgentState, tier: Tier): Promise<ActionProposal> {
    const model = tier >= 2 ? this.stakes : this.routine;
    try {
      const res = await this.client.messages.parse({
        model, max_tokens: 1024,
        system: this.system(a),
        messages: [{ role: "user", content: `It is ${p.time.sim}, ${p.time.weather}. Here is what you perceive, as JSON. Choose exactly one action for this minute, in character. Prefer talking to people who are here over waiting. If a letter from whoever sent you is unread, decide how you feel about it.\n\n${JSON.stringify(p)}` }],
        output_config: { format: zodOutputFormat(ActionProposal) },
      });
      if (res.stop_reason === "refusal" || !res.parsed_output) return this.fallback.decide(p, a, tier);
      return res.parsed_output;
    } catch (err) { return this.handle(err, () => this.fallback.decide(p, a, tier)); }
  }

  async converse(ctx: ConverseContext): Promise<Dialogue> {
    const { a, b } = ctx;
    try {
      const res = await this.client.messages.parse({
        model: this.routine, max_tokens: 1500,
        system: [{ type: "text", text: WORLD }, { type: "text", text: `You will write a short real exchange between two people who have just met at ${ctx.place.name}, ${ctx.time}, ${ctx.weather}. Write both sides truthfully to who each of them is. Two to six lines. Decide what each of them will remember and how much more or less they trust each other afterwards. If one of them passes on something they heard, put it in rumor.` }],
        messages: [{ role: "user", content: `PERSON A (id ${a.id}):\n${this.personaBlock(a)}\nWhat A remembers about B: ${ctx.aMemories.join(" | ") || "nothing"}\nWhat A has heard lately: ${ctx.rumorsA.join(" | ") || "nothing"}\nA's trust in B: ${(a.relationships.get(b.id)?.trust ?? 0.3).toFixed(2)}\n\nPERSON B (id ${b.id}):\n${this.personaBlock(b)}\nWhat B remembers about A: ${ctx.bMemories.join(" | ") || "nothing"}\nB's trust in A: ${(b.relationships.get(a.id)?.trust ?? 0.3).toFixed(2)}` }],
        output_config: { format: zodOutputFormat(Dialogue) },
      });
      if (res.stop_reason === "refusal" || !res.parsed_output) return this.fallback.converse(ctx);
      return res.parsed_output;
    } catch (err) { return this.handle(err, () => this.fallback.converse(ctx)); }
  }

  async reflect(ctx: ReflectContext): Promise<Reflection> {
    const a = ctx.agent;
    try {
      const res = await this.client.messages.parse({
        model: this.reflectModel, max_tokens: 2000,
        system: this.system(a),
        messages: [{ role: "user", content: `It is midnight after day ${ctx.day}. Reflect on the day as this person, in first person. What happened that mattered: ${ctx.dayMemories.join(" | ") || "nothing"}. What you keep coming back to: ${ctx.keyMemories.join(" | ") || "nothing"}. People you know, with your current trust in them: ${ctx.relationships.map((r) => `${r.name} (${r.id}) trust ${r.trust.toFixed(2)}${r.opinion ? `, "${r.opinion}"` : ""}`).join("; ") || "nobody yet"}. You have ${a.coins} coins, ${a.job ? "a job" : "no job"}, and ${a.home ? `${a.home.nightsPaid} nights paid` : "no roof"}.\nWrite a summary, up to three insights, opinion changes about people you actually dealt with today (with a trust delta), up to three intentions for tomorrow phrased as things you will actually do, and a letter to whoever sent you only if you genuinely have something to ask or say. Most nights the letter is null.` }],
        output_config: { format: zodOutputFormat(Reflection) },
      });
      if (res.stop_reason === "refusal" || !res.parsed_output) return this.fallback.reflect(ctx);
      return res.parsed_output;
    } catch (err) { return this.handle(err, () => this.fallback.reflect(ctx)); }
  }

  async writePaper(ctx: PaperContext): Promise<Paper> {
    try {
      const res = await this.client.messages.parse({
        model: this.reflectModel, max_tokens: 3000,
        system: `You are the editor of the Gazette, the newspaper of Ferry Town, a small island harbor town. You write from the record of the day, plainly, specifically, in the town's own voice: names, times, coins, streets. No exclamation marks. You may have opinions but you attribute them. Nothing is invented; every line comes from an event below. Reported by nobody in particular unless a name is given.`,
        messages: [{ role: "user", content: `Edition ${ctx.edition}, ${ctx.date}, weather ${ctx.weather}. Population ${ctx.population}, ${ctx.arrivals} arrived, ${ctx.departures} left. Open proposals at the council: ${ctx.laws.join(" | ") || "none"}.\nThe day's record, most important first:\n${ctx.events.map((e, i) => `${i + 1}. [${e.importance.toFixed(2)}] ${e.text}`).join("\n")}\n\nWrite the paper: one lead story, up to four briefs, and notices.` }],
        output_config: { format: zodOutputFormat(Paper) },
      });
      if (res.stop_reason === "refusal" || !res.parsed_output) return this.fallback.writePaper(ctx);
      return res.parsed_output;
    } catch (err) { return this.handle(err, () => this.fallback.writePaper(ctx)); }
  }

  private async handle<T>(err: unknown, fallback: () => Promise<T>): Promise<T> {
    if (err instanceof Anthropic.RateLimitError) { this.log("rate limited; this thought falls back to habit"); return fallback(); }
    if (err instanceof Anthropic.APIConnectionError) { this.log("connection lost; falling back"); return fallback(); }
    if (err instanceof Anthropic.BadRequestError) { this.log(`bad request: ${err.message}`); return fallback(); }
    if (err instanceof Anthropic.APIError) { this.log(`api error ${err.status}: ${err.message}`); return fallback(); }
    throw err;
  }
}
