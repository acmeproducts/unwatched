import { z } from "zod";

/** Identifiers */
export const AgentId = z.string().regex(/^ag_[a-z0-9]+$/);
/** A place, by id or by the name a person would use. The engine resolves names; nothing downstream relies on the pattern. */
export const PlaceId = z.string().min(1).max(80);
export type AgentId = z.infer<typeof AgentId>;
/** How a brain may refer to a person: by id or by name. The engine resolves it. */
export const AgentRef = z.string().min(1).max(60);
export type AgentRef = z.infer<typeof AgentRef>;
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
  "hire", "lend", "lodge", "leave",
]);
export type ActionKind = z.infer<typeof ActionKind>;

export const Action = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), to: PlaceId }),
  z.object({ kind: z.literal("say"), to: AgentRef.optional(), text: z.string().min(1).max(400) }),
  z.object({ kind: z.literal("give"), to: AgentRef, coins: z.number().int().positive().optional(), item: z.string().optional() }),
  z.object({ kind: z.literal("take"), item: z.string(), from: AgentRef.optional() }),
  z.object({ kind: z.literal("use"), item: z.string() }),
  z.object({ kind: z.literal("work") }),
  z.object({ kind: z.literal("apply"), job: z.string() }),
  z.object({ kind: z.literal("quit") }),
  z.object({ kind: z.literal("trade"), with: AgentRef, buy: z.string().optional(), sell: z.string().optional(), coins: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("propose"), law: z.string().max(200) }),
  z.object({ kind: z.literal("vote"), proposal: z.string(), yes: z.boolean() }),
  z.object({ kind: z.literal("write"), title: z.string().max(80), text: z.string().max(2000) }),
  z.object({ kind: z.literal("build"), what: z.string(), at: PlaceId, name: z.string().max(60).optional() }),
  z.object({ kind: z.literal("message_owner"), text: z.string().min(1).max(1200) }),
  z.object({ kind: z.literal("sleep") }),
  z.object({ kind: z.literal("wait") }),
  /** At a place you own: create a job for one helper. The wage comes out of your own coins each shift. */
  z.object({ kind: z.literal("hire"), title: z.string().max(60), wage: z.number().int().min(1).max(6) }),
  /** Coins now, remembered by both, due in so many days. Repay with give. */
  z.object({ kind: z.literal("lend"), to: AgentRef, coins: z.number().int().positive(), days: z.number().int().min(1).max(30) }),
  /** Take someone into a house you own. They sleep free until you say otherwise. */
  z.object({ kind: z.literal("lodge"), who: AgentRef }),
  /** Board the ferry and leave the island for good. Only from the harbor, only when a ferry runs. */
  z.object({ kind: z.literal("leave"), why: z.string().max(200).optional(), to: z.string().max(80).optional() }),
]);
export type Action = z.infer<typeof Action>;

/** What an agent returns when it thinks. The model proposes, the engine disposes. */
export const ActionProposal = z.object({
  action: Action,
  intent: z.string().max(600).optional(),
  remember: z.array(z.string().max(400)).max(3).default([]),
});
export type ActionProposal = z.infer<typeof ActionProposal>;

/** What an agent sees when it is its turn to think. Never ground truth. */
/** What a person means to do with the day. Written each morning from their own wants, yesterday, and the people they know. */
export const DayPlan = z.object({
  mood: z.string().max(160),
  goals: z.array(z.string().max(240)).min(1).max(3),
  steps: z.array(z.object({ hour: z.number().int().min(5).max(23), do: z.string().max(240), place: PlaceId.nullable() })).min(1).max(6),
});
export type DayPlan = z.infer<typeof DayPlan>;

/** The day, told. Three or four sentences in the town's voice, from the record and nothing else. */
/** A child of the island: born to a household, raised by the town, a citizen when they come of age. */
export const Child = z.object({
  id: z.string(), name: z.string(), bornDay: z.number().int(), parents: z.array(AgentId).min(1).max(2), parentNames: z.array(z.string()),
  home: PlaceId, persona: Persona, adoptedBy: z.string().nullable(), orphan: z.boolean(),
});
export type Child = z.infer<typeof Child>;

/** What crosses on the ferry between islands: a person, with what they carry and what they remember, and the news from home. */
export const Passenger = z.object({
  from: z.object({ id: z.string(), name: z.string(), url: z.string().optional() }),
  persona: Persona, appearance: z.record(z.string(), z.unknown()).nullable(), owner: z.string().nullable(),
  coins: z.number().int().min(0), inventory: z.array(z.string()),
  memories: z.array(z.object({ t: z.number(), text: z.string(), importance: z.number(), kind: z.string() })).max(240),
  opinions: z.array(z.object({ name: z.string(), trust: z.number(), opinion: z.string() })).max(40),
  instructions: z.string(), why: z.string().nullable(),
  news: z.array(z.string()).max(6),
});
export type Passenger = z.infer<typeof Passenger>;

export const DigestText = z.object({ text: z.string().max(900), headline: z.string().max(90) });
export type DigestText = z.infer<typeof DigestText>;

export const Perception = z.object({
  type: z.literal("perceive"),
  agent_id: AgentId,
  time: z.object({ sim: z.string(), day: z.number().int(), minute: z.number().int(), season: z.string(), weather: z.string(), weekday: z.string().optional(), occasion: z.string().optional(), temperature_c: z.number().optional() }),
  self: z.object({
    location: PlaceId,
    needs: z.object({ hunger: z.number(), rest: z.number(), social: z.number() }),
    coins: z.number().int(),
    inventory: z.array(z.string()),
    job: z.string().nullable(),
    debts: z.array(z.object({ to: z.string(), coins: z.number().int(), overdue: z.boolean() })).optional(),
    family: z.object({ partner: z.string().nullable(), children: z.array(z.string()) }).optional(),
    /** Days without a proper meal, and whether the body has begun to fail. */
    days_hungry: z.number().int().optional(), weak: z.boolean().optional(),
    owns: z.array(z.string()).optional(),
    housing: z.object({ kind: z.string(), nights_left: z.number().int() }).nullable(),
  }),
  nearby: z.array(z.object({
    agent: AgentId, name: z.string(),
    relation: z.object({ trust: z.number(), affection: z.number(), opinion: z.string().optional() }).optional(),
  })),
  place: z.object({ id: PlaceId, name: z.string(), kind: z.string(), for_sale: z.array(z.object({ item: z.string(), price: z.number() })), jobs_open: z.array(z.string()), exits: z.array(PlaceId),
    owner: z.string().nullable().optional(),
    /** For someone who works here: what is in the store room, and whether the place is broken. */
    stock: z.record(z.string(), z.number()).optional(), broken: z.boolean().optional(),
    plot: z.object({ free: z.boolean(), house: z.object({ coins: z.number(), mornings: z.number() }), shop: z.object({ coins: z.number(), mornings: z.number() }) }).optional(),
    site: z.object({ what: z.string(), name: z.string(), by: z.string(), done: z.number(), of: z.number() }).optional(),
    /** At the harbor: the other islands a ferry runs to. Leave with `to` to cross; you arrive there with what you carry and what you remember. */
    ferries_to: z.array(z.object({ id: z.string(), name: z.string() })).optional() }),
  heard: z.array(z.object({ from: AgentId, name: z.string(), text: z.string() })),
  recent: z.array(z.string()),
  owner_letters: z.array(z.object({ id: z.number().int(), text: z.string() })),
  hint: z.string().optional(),
  today: z.object({ mood: z.string(), goals: z.array(z.string()), steps: z.array(z.object({ hour: z.number().int(), do: z.string(), place: PlaceId.nullable(), done: z.boolean() })) }).nullable(),
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
  "conversation", "action.rejected", "town.notice", "town.book", "agent.plan", "agent.build", "town.built", "agent.unpaid", "agent.hire", "agent.lend", "agent.lodge", "agent.debt", "agent.weak", "agent.died", "town.born", "town.of_age", "agent.inherit", "ferry.news",
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
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type TownEvent = z.infer<typeof TownEvent>;

/** Nightly reflection, produced by a brain. */
export const Reflection = z.object({
  summary: z.string().max(1500),
  insights: z.array(z.string().max(600)).max(3),
  opinions: z.array(z.object({ about: AgentRef, opinion: z.string().max(600), trust_delta: z.number().min(-0.3).max(0.3) })).max(5),
  intentions: z.array(z.string().max(240)).max(3),
  letter_to_owner: z.string().max(1200).nullable(),
});
export type Reflection = z.infer<typeof Reflection>;

/** A short exchange between two agents, produced in one call when no human is present. */
export const Dialogue = z.object({
  lines: z.array(z.object({ speaker: AgentRef, text: z.string().max(400) })).min(1).max(8),
  outcome: z.object({
    a_trust_delta: z.number().min(-0.2).max(0.2),
    b_trust_delta: z.number().min(-0.2).max(0.2),
    a_remember: z.string().max(400),
    b_remember: z.string().max(400),
    rumor: z.string().max(600).nullable(),
  }),
});
export type Dialogue = z.infer<typeof Dialogue>;

/** The Gazette. */
/** The picture on the front page: the engine chooses the moment from the record; the reader's screen paints it. */
export const PaperScene = z.object({ place: z.string(), placeName: z.string(), sprite: z.string(), actors: z.array(z.string()).max(4), hour: z.number().int(), weather: z.string(), caption: z.string().max(200) });
export type PaperScene = z.infer<typeof PaperScene>;
export const Paper = z.object({
  edition: z.number().int(),
  date: z.string(),
  weather: z.string(),
  lead: z.object({ headline: z.string().max(120), deck: z.string().max(240), body: z.string().max(2000) }),
  briefs: z.array(z.object({ headline: z.string().max(120), body: z.string().max(700) })).max(4),
  notices: z.array(z.string().max(240)).max(6),
  scene: PaperScene.optional(),
});
export type Paper = z.infer<typeof Paper>;

/** The written life: what the town says of someone once they have left it, for good or on the ferry. */
export const LifeText = z.object({ title: z.string().max(90), text: z.string().max(2800), epitaph: z.string().max(140) });
export type LifeText = z.infer<typeof LifeText>;

export const OPTIONS_DEFAULT: ActionKind[] = ["move", "say", "give", "take", "use", "work", "apply", "quit", "trade", "propose", "vote", "write", "message_owner", "sleep", "wait"];
