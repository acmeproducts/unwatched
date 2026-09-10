import type { AgentId, PlaceId, Persona, TownEvent, Perception, ActionProposal, Reflection, Dialogue, Paper } from "@ferrytown/protocol";

export type PlaceKind = "harbor" | "inn" | "market" | "shop" | "workplace" | "public" | "home" | "civic";

export interface Place {
  id: PlaceId;
  name: string;
  kind: PlaceKind;
  exits: PlaceId[];
  sells: { item: string; base: number }[];
  beds?: { price: number; capacity: number };
  freeBeds?: number;
}

export interface Job {
  id: string;
  title: string;
  place: PlaceId;
  wage: number;
  hours: [number, number];
  slots: number;
  holders: AgentId[];
}

export interface Relation {
  trust: number;
  affection: number;
  lastSeen: number;
  opinion: string;
}

export interface Memory {
  t: number;
  text: string;
  importance: number;
  kind: "obs" | "reflect" | "letter" | "rumor";
}

export interface Budget {
  tier1Max: number;
  tier2Max: number;
  tier1Left: number;
  tier2Left: number;
}

export interface OwnerLetter { id: number; text: string; t: number; read: boolean }

export interface AgentState {
  id: AgentId;
  persona: Persona;
  needs: { hunger: number; rest: number; social: number };
  location: PlaceId;
  coins: number;
  inventory: string[];
  job: string | null;
  home: { place: PlaceId; nightsPaid: number } | null;
  asleep: boolean;
  arrivedAt: number;
  relationships: Map<AgentId, Relation>;
  memory: Memory[];
  budget: Budget;
  funded: boolean;
  owner: string | null;
  letters: OwnerLetter[];
  intentions: string[];
  lastConversation: number;
  lastThought: number;
  heard: { from: AgentId; name: string; text: string; t: number }[];
  workedToday: boolean;
  rumors: string[];
}

export type Tier = 1 | 2 | 3;

export interface ConverseContext {
  a: AgentState; b: AgentState; place: Place; time: string; weather: string;
  aMemories: string[]; bMemories: string[];
  rumorsA: string[];
}

export interface ReflectContext {
  agent: AgentState; day: number; dayMemories: string[]; keyMemories: string[];
  relationships: { id: AgentId; name: string; trust: number; opinion: string }[];
  unreadLetters: string[];
}

export interface PaperContext {
  edition: number; date: string; weather: string;
  events: { text: string; importance: number; actors: string[] }[];
  laws: string[]; population: number; arrivals: number; departures: number;
}

/** What the engine needs from any mind. Hosted, own-key, and own-brain all implement this. */
export interface Brain {
  readonly name: string;
  decide(p: Perception, agent: AgentState, tier: Tier): Promise<ActionProposal>;
  converse(ctx: ConverseContext): Promise<Dialogue>;
  reflect(ctx: ReflectContext): Promise<Reflection>;
  writePaper(ctx: PaperContext): Promise<Paper>;
}

export type EventSink = (e: TownEvent) => void;
