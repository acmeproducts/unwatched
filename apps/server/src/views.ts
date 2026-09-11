import type { Town, AgentState } from "@ferrytown/engine";
import type { TownEvent } from "@ferrytown/protocol";

/** What anyone may see about a person: what the town knows. */
export function publicAgent(town: Town, a: AgentState) {
  const job = a.job ? town.jobs.get(a.job)?.title ?? a.job : null;
  return {
    id: a.id, name: a.persona.name, age: a.persona.age, origin: a.persona.origin, summary: a.persona.summary,
    location: a.location, place: town.places.get(a.location)?.name ?? a.location, asleep: a.asleep,
    job, home: a.home?.place ?? null, arrivedDay: Math.floor(a.arrivedAt / 1440) + 1, funded: a.funded,
    ownerId: a.owner, appearance: a.appearance ?? null,
    pose: poseOf(town, a), weak: a.starving >= 2, daysHungry: a.starving,
  };
}

/** What the owner sees: everything the agent knows. */
export function ownerAgent(town: Town, a: AgentState) {
  return {
    ...publicAgent(town, a),
    persona: a.persona,
    needs: a.needs, coins: a.coins, inventory: a.inventory,
    nightsPaid: a.home?.nightsPaid ?? 0,
    budget: a.budget, intentions: a.intentions, plan: a.plan && a.plan.day === town.day && a.plan.goals.length ? { mood: a.plan.mood, goals: a.plan.goals, steps: a.plan.steps } : null,
    people: [...a.relationships.entries()].map(([id, r]) => ({ id, name: town.agents.get(id)?.persona.name ?? id, trust: r.trust, affection: r.affection, opinion: r.opinion, lastSeen: r.lastSeen, tide: tideWord(r.trust, r.affection) })),
    memories: a.memory.slice(-60).reverse(),
    letters: a.letters,
    instructions: a.instructions,
    brainKind: a.brainKind,
  };
}

export function tideWord(trust: number, _affection: number): string {
  if (trust < 0.2) return "gone"; if (trust < 0.3) return "ebbing"; if (trust < 0.45) return "steady"; if (trust < 0.65) return "rising"; return "close";
}

export function serializeEvent(e: TownEvent) { return e; }

/** What the real world adds to the clock, when the island keeps our time. The server sets it. */
export const realClock: { place?: string; temperatureC?: number | null; sunrise?: string | null; sunset?: string | null } = {};
export function clockOf(town: Town) {
  return { t: town.t, day: town.day, minute: town.minuteOfDay, hour: town.hour, label: town.clock(), weather: town.weather, season: town.season, population: town.agents.size, flourShortage: town.flourShortage, ...(realClock.place ? { place: realClock.place, temperatureC: realClock.temperatureC ?? null, sunrise: realClock.sunrise ?? null, sunset: realClock.sunset ?? null } : {}) };
}

/** What the body is doing this minute, for the world to draw: asleep, at work, on a site, at ease somewhere, or standing. */
export function poseOf(town: Town, a: AgentState): "sleep" | "work" | "sit" | "idle" {
  if (a.asleep) return "sleep";
  const here = town.places.get(a.location);
  if (here?.site && town.hour >= 8 && town.hour < 18 && (here.site.by === a.id || town.dueStep(a)?.place === here.id)) return "work";
  const job = a.job ? town.jobs.get(a.job) : null;
  if (job && job.place === a.location && town.hour >= job.hours[0] && town.hour < job.hours[1]) return "work";
  if (here && (here.kind === "inn" || here.kind === "public") && town.hour >= 17) return "sit";
  return "idle";
}
