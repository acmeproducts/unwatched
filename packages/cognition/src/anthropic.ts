import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ActionProposal, Dialogue, Paper, Reflection, type Perception } from "@ferrytown/protocol";
import type { AgentState, Brain, ConverseContext, PaperContext, ReflectContext, Tier } from "@ferrytown/engine";
import { MockBrain } from "./mock.ts";
import { WORLD, personaBlock, decidePrompt, conversePrompt, reflectPrompt, paperSystem, paperPrompt } from "./prompts.ts";

export interface AnthropicBrainOptions {
  routine?: string;   // tier 1
  stakes?: string;    // tier 2
  reflect?: string;   // tier 3 and the paper
  log?: (line: string) => void;
}


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

  private system(a: AgentState) {
    // Stable prefix first (world, persona), cached. Volatile content goes in the user turn.
    return [
      { type: "text" as const, text: WORLD },
      { type: "text" as const, text: personaBlock(a), cache_control: { type: "ephemeral" as const } },
    ];
  }

  async decide(p: Perception, a: AgentState, tier: Tier): Promise<ActionProposal> {
    const model = tier >= 2 ? this.stakes : this.routine;
    try {
      const res = await this.client.messages.parse({
        model, max_tokens: 1024,
        system: this.system(a),
        messages: [{ role: "user", content: decidePrompt(p) }],
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
        system: [{ type: "text", text: WORLD }, { type: "text", text: conversePrompt.system(ctx) }],
        messages: [{ role: "user", content: conversePrompt.user(ctx) }],
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
        messages: [{ role: "user", content: reflectPrompt(ctx) }],
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
        system: paperSystem,
        messages: [{ role: "user", content: paperPrompt(ctx) }],
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
