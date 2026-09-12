import { z } from "zod";
import { ActionProposal, Dialogue, Paper, Reflection, type Perception, DayPlan, DigestText, Persona, LifeText, Judgement } from "@unwatched/protocol";
import type { AgentState, Brain, ConverseContext, PaperContext, ReflectContext, Tier, PlanContext, DigestContext, ChildContext, LifeContext, JudgeContext } from "@unwatched/engine";
import { MockBrain } from "./mock.ts";
import { WORLD, personaBlock, decidePrompt, conversePrompt, reflectPrompt, paperSystem, paperPrompt, lifeSystem, lifePrompt, judgeSystem, judgePrompt, planPrompt, digestSystem, digestPrompt, childSystem, childPrompt } from "./prompts.ts";

export interface OpenRouterBrainOptions {
  apiKey?: string;
  routine?: string;
  stakes?: string;
  reflect?: string;
  log?: (line: string) => void;
}

/**
 * The "your own key" path from the design: same prompts and same schemas as the hosted brain,
 * sent to OpenRouter, which fronts Claude and everything else. The engine cannot tell the difference.
 */
export class OpenRouterBrain implements Brain {
  readonly name = "openrouter";
  private key: string;
  private routine: string; private stakes: string; private reflectModel: string;
  private log: (l: string) => void;
  private fallback = new MockBrain(13);
  private spent = { calls: 0, prompt: 0, completion: 0 };

  constructor(o: OpenRouterBrainOptions = {}) {
    const key = o.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY is not set");
    this.key = key;
    this.routine = o.routine ?? process.env.UW_OR_MODEL_ROUTINE ?? "anthropic/claude-haiku-4.5";
    this.stakes = o.stakes ?? process.env.UW_OR_MODEL_STAKES ?? "anthropic/claude-sonnet-5";
    this.reflectModel = o.reflect ?? process.env.UW_OR_MODEL_REFLECT ?? "anthropic/claude-opus-5";
    this.log = o.log ?? (() => {});
  }

  usage() { return { ...this.spent }; }
  private cached = 0;
  /** Prompt tokens served from the cache so far. */
  cachedTokens() { return this.cached; }
  /** Called whenever an answer could not be used and the plain fallback stood in. The ops room listens. */
  onFallback: ((f: { what: string; model: string; reason: string }) => void) | null = null;
  /** The models for one citizen when they differ from the town's: a Patron's careful thoughts and reflection go to the most capable mind. */
  modelsFor: ((a: AgentState) => Partial<{ routine: string; stakes: string; reflect: string }> | null) | null = null;
  /** The island itself, in words, the same for every citizen: places, work, the calendar. Set by the server; part of the shared cached prefix. */
  primer = "";
  private m(a: AgentState) { const o = this.modelsFor?.(a); return { routine: o?.routine ?? this.routine, stakes: o?.stakes ?? this.stakes, reflect: o?.reflect ?? this.reflectModel }; }

  private async call<T>(model: string, system: { shared: string; own?: string }, user: string, schema: z.ZodType<T>, name: string, maxTokens: number): Promise<T | null> {
    // Providers behind OpenRouter accept a subset of JSON Schema: no regex patterns, no defaults, anyOf not oneOf.
    // The schema goes in the request as a strict format and in the system prompt as belt and braces.
    const jsonSchema = cleanSchema(z.toJSONSchema(schema));
    const body = {
      model,
      max_tokens: maxTokens,
      // The prefix is built to cache: the world's rules, the island and the schema are the same for every citizen and every call of a kind
      // (one block, over four thousand tokens, which is what Haiku needs before it will cache at all); the persona is the same for one
      // citizen across all their calls (a second block). Anthropic bills a cached read at a tenth of the price.
      messages: [{ role: "system", content: [
        { type: "text", text: `${system.shared}${this.primer ? `\n\n${this.primer}` : ""}\n\nAnswer with a single JSON object matching this JSON schema exactly, no prose:\n${JSON.stringify(jsonSchema)}`, cache_control: { type: "ephemeral" } },
        ...(system.own ? [{ type: "text", text: system.own, cache_control: { type: "ephemeral" } }] : []),
      ] }, { role: "user", content: user }],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema: jsonSchema } },
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", "HTTP-Referer": "https://unwatched.town", "X-Title": "Unwatched" },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) { this.log(`openrouter ${res.status}; ${attempt === 0 ? "retrying" : "falling back"}`); if (attempt === 1) this.onFallback?.({ what: name, model, reason: `openrouter ${res.status}` }); await new Promise((r) => setTimeout(r, 1500)); continue; }
      if (!res.ok) { const msg = (await res.text()).slice(0, 200); this.log(`openrouter ${res.status}: ${msg}`); this.onFallback?.({ what: name, model, reason: `openrouter ${res.status}` }); return null; }
      const data = await res.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } };
      this.spent.calls++; this.spent.prompt += data.usage?.prompt_tokens ?? 0; this.spent.completion += data.usage?.completion_tokens ?? 0; this.cached += data.usage?.prompt_tokens_details?.cached_tokens ?? 0;
      const text = data.choices?.[0]?.message?.content ?? "";
      try {
        const parsed = schema.safeParse(JSON.parse(text.trim().replace(/^```json\s*|```$/g, "")));
        if (parsed.success) return parsed.data;
        this.log(`schema mismatch from ${model}: ${parsed.error.issues[0]?.message ?? "?"} at ${parsed.error.issues[0]?.path.join(".") || "root"}; got ${text.slice(0, 160)}`);
        if (attempt === 1) this.onFallback?.({ what: name, model, reason: `schema: ${parsed.error.issues[0]?.message ?? "?"}` });
      } catch { this.log(`not json from ${model}: ${text.slice(0, 80)}`); if (attempt === 1) this.onFallback?.({ what: name, model, reason: "not json" }); }
    }
    return null;
  }

  async decide(p: Perception, a: AgentState, tier: Tier): Promise<ActionProposal> {
    const mm = this.m(a); const out = await this.call(tier >= 2 ? mm.stakes : mm.routine, { shared: WORLD, own: personaBlock(a) }, decidePrompt(p), ActionProposal, "action_proposal", 1024);
    return out ?? this.fallback.decide(p, a, tier);
  }
  async converse(ctx: ConverseContext): Promise<Dialogue> {
    const out = await this.call(this.routine, { shared: WORLD, own: conversePrompt.system(ctx) }, conversePrompt.user(ctx), Dialogue, "dialogue", 1500);
    return out ?? this.fallback.converse(ctx);
  }
  async reflect(ctx: ReflectContext): Promise<Reflection> {
    const out = await this.call(this.m(ctx.agent).reflect, { shared: WORLD, own: personaBlock(ctx.agent) }, reflectPrompt(ctx), Reflection, "reflection", 2000);
    return out ?? this.fallback.reflect(ctx);
  }
  async plan(ctx: PlanContext, tier: Tier): Promise<DayPlan> {
    const mm = this.m(ctx.agent); const out = await this.call(tier >= 2 ? mm.stakes : mm.routine, { shared: WORLD, own: personaBlock(ctx.agent) }, planPrompt(ctx), DayPlan, "day_plan", 1200);
    return out ?? this.fallback.plan(ctx, tier);
  }
  async digest(ctx: DigestContext): Promise<DigestText> {
    const out = await this.call(this.stakes, { shared: digestSystem }, digestPrompt(ctx), DigestText, "digest", 700); // the owner's reading is the product: the middle mind writes it
    return out ?? this.fallback.digest(ctx);
  }
  async child(ctx: ChildContext): Promise<Persona> {
    const out = await this.call(this.stakes, { shared: childSystem }, childPrompt(ctx), Persona, "child", 900);
    return out ?? this.fallback.child(ctx);
  }
  async writePaper(ctx: PaperContext): Promise<Paper> {
    const out = await this.call(this.reflectModel, { shared: paperSystem }, paperPrompt(ctx), Paper, "paper", 3000);
    return out ?? this.fallback.writePaper(ctx);
  }
  async judge(ctx: JudgeContext): Promise<Judgement> {
    const out = await this.call(this.routine, { shared: judgeSystem }, judgePrompt(ctx), Judgement, "judgement", 400);
    return out ?? this.fallback.judge(ctx);
  }
  async life(ctx: LifeContext): Promise<LifeText> {
    const out = await this.call(this.reflectModel, { shared: lifeSystem }, lifePrompt(ctx), LifeText, "life", 3200);
    return out ?? this.fallback.life(ctx);
  }
}

function cleanSchema(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(cleanSchema);
  if (x && typeof x === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if (k === "pattern" || k === "$schema" || k === "default") continue;
      o[k === "oneOf" ? "anyOf" : k] = cleanSchema(v);
    }
    return o;
  }
  return x;
}
