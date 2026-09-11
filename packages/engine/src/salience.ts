import type { AgentState, Tier } from "./types.ts";

export interface SalienceView { hour: number; t: number; nearby: AgentState[]; jobsOpenHere: number; plotHere?: boolean }

/** A plan step whose hour has come, not yet acted on. Habit walks them there; this is the thought on arrival. */
function dueStep(a: AgentState, hour: number, day: number) { return a.plan?.day === day ? a.plan.steps.find((s) => !s.done && s.hour <= hour) ?? null : null; }

/**
 * Decides whether this minute deserves a thought, and how expensive a one.
 * Returns null when habit is enough. Budgets are enforced by the engine, not here.
 */
export function salience(a: AgentState, v: SalienceView): { tier: Tier; why: string } | null {
  if (a.asleep) return null;
  if (a.thinkEvery !== null && v.t - a.lastThought >= a.thinkEvery) return { tier: 1, why: "cadence" };
  if (a.brainKind === "own_brain" && v.t - a.lastThought >= 1) return { tier: 1, why: "own brain, every minute" };
  if (a.hint && v.t - a.lastThought >= 1) return { tier: 2, why: "something at stake with someone here" };
  if (a.letters.some((l) => !l.read) && v.hour >= 6 && v.hour < 9) return { tier: 1, why: "letter" };
  const step = a.plan ? dueStep(a, v.hour, a.plan.day) : null;
  if (step && (step.place === null || step.place === a.location) && v.t - a.lastThought >= 3) return { tier: 1, why: `plan: ${step.do}` };
  if (v.plotHere && a.coins >= 15 && v.t - a.lastThought > 60 && v.hour >= 7 && v.hour < 19) return { tier: 2, why: "standing on land for sale" };
  if (a.coins <= 3 && a.job === null && v.hour >= 8 && v.hour < 18 && v.t - a.lastThought > 90) return { tier: 2, why: "broke" };
  if (a.job === null && v.jobsOpenHere > 0 && v.hour >= 6 && v.hour < 18 && v.t - a.lastThought > 45) return { tier: 1, why: "job here" };
  if (a.heard.length > 0 && v.t - a.lastThought > 10) return { tier: 1, why: "spoken to" };
  if (a.intentions.length > 0 && v.t - a.lastThought > 120 && v.hour >= 8 && v.hour < 21) return { tier: 1, why: "intention" };
  return null;
}

/** Two people in the same place, awake, with something to say. */
export function wantsConversation(a: AgentState, b: AgentState, t: number): boolean {
  if (a.asleep || b.asleep) return false;
  if (t - a.lastConversation < 60 || t - b.lastConversation < 60) return false;
  const pull = a.needs.social * 0.6 + a.persona.traits.warmth * 0.4;
  return pull > 0.55;
}
