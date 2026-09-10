import { z } from "zod";

/** Identifiers */
export const AgentId = z.string().regex(/^ag_[a-z0-9]+$/);
export const PlaceId = z.string().regex(/^[a-z][a-z0-9_.]*$/);
export type AgentId = z.infer<typeof AgentId>;
export type PlaceId = z.infer<typeof PlaceId>;

/** Who a person is. Written once at boarding; everything after is memory. */
export const Persona = z.object({
  name: z.string().min(1),
  age: z.number().int().min(16).max(99),
  origin: z.string(),
  summary: z.string().describe("One sentence, who they are"),
  want: z.string(),
  fear: z.string(),
  secret: z.string().describe("Known to nobody on the island"),
  strangers: z.string().describe("How they treat strangers"),
  advice: z.string().describe("How they take advice"),
  traits: z.object({
    warmth: z.number().min(0).max(1),
    pride: z.number().min(0).max(1),
    caution: z.number().min(0).max(1),
    honesty: z.number().min(0).max(1),
    ambition: z.number().min(0).max(1),
  }),
});
export type Persona = z.infer<typeof Persona>;

/** The action kinds the town can carry out. Nothing else exists. */
export const ActionKind = z.enum([
  "move", "say", "give", "take", "use", "work", "apply", "quit", "trade",
  "propose", "vote", "write", "build", "message_owner", "sleep", "wait",
]);
export type ActionKind = z.infer<typeof ActionKind>;

export const Action = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), to: PlaceId }),
  z.object({ kind: z.literal("say"), to: AgentId.optional(), text: z.string().min(1).max(400) }),
  z.object({ kind: z.literal("give"), to: AgentId, coins: z.number().int().positive().optional(), item: z.string().optional() }),
  z.object({ kind: z.literal("take"), item: z.string(), from: z.union([AgentId, PlaceId]).optional() }),
  z.object({ kind: z.literal("use"), item: z.string() }),
  z.object({ kind: z.literal("work") }),
  z.object({ kind: z.literal("apply"), job: z.string() }),
  z.object({ kind: z.literal("quit") }),
  z.object({ kind: z.literal("trade"), with: z.union([AgentId, PlaceId]), buy: z.string().optional(), sell: z.string().optional(), coins: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("propose"), law: z.string().max(200) }),
  z.object({ kind: z.literal("vote"), proposal: z.string(), yes: z.boolean() }),
  z.object({ kind: z.literal("write"), title: z.string().max(80), text: z.string().max(2000) }),
  z.object({ kind: z.literal("build"), what: z.string(), at: PlaceId }),
  z.object({ kind: z.literal("message_owner"), text: z.string().min(1).max(600) }),
  z.object({ kind: z.literal("sleep") }),
  z.object({ kind: z.literal("wait") }),
]);
export type Action = z.infer<typeof Action>;

/** What an agent returns when it thinks. The model proposes, the engine disposes. */
export const ActionProposal = z.object({
  action: Action,
  intent: z.string().max(200).optional(),
  remember: z.array(z.string().max(300)).max(3).default([]),
});
export type ActionProposal = z.infer<typeof ActionProposal>;

/** What an agent sees when it is its turn to think. Never ground truth. */
export const Perception = z.object({
  type: z.literal("perceive"),
  agent_id: AgentId,
  time: z.object({ sim: z.string(), day: z.number().int(), minute: z.number().int(), season: z.string(), weather: z.string() }),
  self: z.object({
    location: PlaceId,
    needs: z.object({ hunger: z.number(), rest: z.number(), social: z.number() }),
    coins: z.number().int(),
    inventory: z.array(z.string()),
    job: z.string().nullable(),
    housing: z.object({ kind: z.string(), nights_left: z.number().int() }).nullable(),
  }),
  nearby: z.array(z.object({
    agent: AgentId, name: z.string(),
    relation: z.object({ trust: z.number(), affection: z.number(), opinion: z.string().optional() }).optional(),
  })),
  place: z.object({ id: PlaceId, name: z.string(), kind: z.string(), for_sale: z.array(z.object({ item: z.string(), price: z.number() })), jobs_open: z.array(z.string()), exits: z.array(PlaceId) }),
  heard: z.array(z.object({ from: AgentId, name: z.string(), text: z.string() })),
  recent: z.array(z.string()),
  owner_letters: z.array(z.object({ id: z.number().int(), text: z.string() })),
  options: z.array(ActionKind),
  deadline_ms: z.number().int(),
});
export type Perception = z.infer<typeof Perception>;

/** Everything that happens is one of these. */
export const EventKind = z.enum([
  "tick.day", "ferry.dock", "ferry.depart", "agent.arrive", "agent.leave",
  "agent.move", "agent.say", "agent.give", "agent.take", "agent.trade",
  "agent.work", "agent.hired", "agent.quit", "agent.fired", "agent.sleep", "agent.wake",
  "agent.eat", "agent.rent", "agent.evicted", "agent.reflect", "agent.letter",
  "relation.change", "economy.price", "weather.change", "law.proposed", "law.passed", "law.failed",
  "conversation", "action.rejected",
]);
export type EventKind = z.infer<typeof EventKind>;

export const TownEvent = z.object({
  id: z.number().int(),
  t: z.number().int().describe("sim minute since founding"),
  day: z.number().int(),
  kind: EventKind,
  actors: z.array(AgentId),
  place: PlaceId.optional(),
  text: z.string(),
  importance: z.number().min(0).max(1),
  payload: z.record(z.unknown()).optional(),
});
export type TownEvent = z.infer<typeof TownEvent>;

/** Nightly reflection, produced by a brain. */
export const Reflection = z.object({
  summary: z.string().max(600),
  insights: z.array(z.string().max(200)).max(3),
  opinions: z.array(z.object({ about: AgentId, opinion: z.string().max(200), trust_delta: z.number().min(-0.3).max(0.3) })).max(5),
  intentions: z.array(z.string().max(160)).max(3),
  letter_to_owner: z.string().max(600).nullable(),
});
export type Reflection = z.infer<typeof Reflection>;

/** A short exchange between two agents, produced in one call when no human is present. */
export const Dialogue = z.object({
  lines: z.array(z.object({ speaker: AgentId, text: z.string().max(240) })).min(1).max(8),
  outcome: z.object({
    a_trust_delta: z.number().min(-0.2).max(0.2),
    b_trust_delta: z.number().min(-0.2).max(0.2),
    a_remember: z.string().max(200),
    b_remember: z.string().max(200),
    rumor: z.string().max(200).nullable(),
  }),
});
export type Dialogue = z.infer<typeof Dialogue>;

/** The Gazette. */
export const Paper = z.object({
  edition: z.number().int(),
  date: z.string(),
  weather: z.string(),
  lead: z.object({ headline: z.string().max(90), deck: z.string().max(160), body: z.string().max(1200) }),
  briefs: z.array(z.object({ headline: z.string().max(90), body: z.string().max(400) })).max(4),
  notices: z.array(z.string().max(160)).max(6),
});
export type Paper = z.infer<typeof Paper>;

export const OPTIONS_DEFAULT: ActionKind[] = ["move", "say", "give", "take", "use", "work", "apply", "quit", "trade", "propose", "vote", "write", "message_owner", "sleep", "wait"];
