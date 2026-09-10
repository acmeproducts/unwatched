import type { Action } from "@ferrytown/protocol";
import type { AgentState, Place, Job } from "./types.ts";
import { FOOD_ITEMS } from "./world.ts";

export interface HabitView {
  places: Map<string, Place>;
  jobs: Map<string, Job>;
  hour: number;
  crowd(placeId: string): number;
  price(place: Place, item: string): number | null;
  path(from: string, to: string): string | null;
}

/**
 * Tier 0. What a person does without thinking: eat, sleep, go to work, drift toward people.
 * Runs every tick for every agent and costs nothing. It never makes a decision with stakes.
 */
export function habit(a: AgentState, v: HabitView): Action {
  const here = v.places.get(a.location)!;
  const wake = 6 + Math.round(a.persona.traits.caution * 1.5);

  if (a.asleep) {
    if (v.hour >= wake && a.needs.rest < 0.4) return { kind: "wait" }; // wake handled by engine
    return { kind: "sleep" };
  }

  // Night: find a bed.
  if (v.hour >= 22 || (v.hour >= 21 && a.needs.rest > 0.85)) {
    const bedPlace = chooseBed(a, v);
    if (bedPlace === a.location) return { kind: "sleep" };
    const next = v.path(a.location, bedPlace);
    return next ? { kind: "move", to: next } : { kind: "wait" };
  }

  // Hunger: buy food where it is sold, if it can be afforded.
  if (a.needs.hunger > 0.6) {
    const has = a.inventory.find((i) => FOOD_ITEMS.has(i));
    if (has) return { kind: "use", item: has };
    const cheapest = cheapestFood(here, v);
    if (cheapest && a.coins >= cheapest.price) return { kind: "trade", with: here.id, buy: cheapest.item, coins: cheapest.price };
    const target = nearestFoodPlace(a, v);
    if (target && target !== a.location) {
      const next = v.path(a.location, target);
      if (next) return { kind: "move", to: next };
    }
  }

  // Work: be at work during hours.
  if (a.job) {
    const job = v.jobs.get(a.job);
    if (job && v.hour >= job.hours[0] && v.hour < job.hours[1]) {
      if (a.location === job.place) return { kind: "work" };
      const next = v.path(a.location, job.place);
      if (next) return { kind: "move", to: next };
    }
  }

  // Social: drift toward people in public places.
  if (a.needs.social > 0.5 && v.hour >= 8 && v.hour < 22) {
    const candidates = ["market", "inn", "tavern", "harbor"].filter((p) => p !== a.location);
    let best: string | null = null; let bestCrowd = v.crowd(a.location);
    for (const c of candidates) { const n = v.crowd(c); if (n > bestCrowd) { best = c; bestCrowd = n; } }
    if (best) { const next = v.path(a.location, best); if (next) return { kind: "move", to: next }; }
  }

  return { kind: "wait" };
}

export function chooseBed(a: AgentState, v: HabitView): string {
  if (a.home && a.home.nightsPaid > 0) return a.home.place;
  const inn = v.places.get("inn")!;
  if (a.coins >= (inn.beds?.price ?? 99) && (inn.freeBeds ?? 0) > 0) return "inn";
  return "boatshed";
}

function cheapestFood(here: Place, v: HabitView): { item: string; price: number } | null {
  let best: { item: string; price: number } | null = null;
  for (const s of here.sells) {
    if (!FOOD_ITEMS.has(s.item)) continue;
    const p = v.price(here, s.item);
    if (p !== null && (best === null || p < best.price)) best = { item: s.item, price: p };
  }
  return best;
}

function nearestFoodPlace(a: AgentState, v: HabitView): string | null {
  const order = ["market", "inn", "bakery", "fields"];
  for (const id of order) { const p = v.places.get(id); if (p && p.sells.some((s) => FOOD_ITEMS.has(s.item))) return id; }
  return null;
}
