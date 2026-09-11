import type { Action } from "@ferrytown/protocol";
import { BUILDS, buildKind } from "./world.ts";
import type { AgentState, Place, Job } from "./types.ts";

export type Verdict = { ok: true } | { ok: false; reason: string };

export interface ValidatorView {
  places: Map<string, Place>;
  jobs: Map<string, Job>;
  agents: Map<string, AgentState>;
  hour: number; weekday?: number; day?: number;
  price(place: Place, item: string): number | null;
  path(from: string, to: string): string | null;
}

/**
 * The town's physics. Rejects only what the world could not carry out.
 * It has no opinion about legality, kindness, or what the owner asked for.
 */
export function validate(a: AgentState, action: Action, v: ValidatorView): Verdict {
  const here = v.places.get(a.location);
  if (!here) return { ok: false, reason: "nowhere" };
  if (a.asleep && action.kind !== "sleep" && action.kind !== "wait") return { ok: false, reason: "asleep" };
  switch (action.kind) {
    case "move": {
      if (action.to === a.location) return { ok: false, reason: "already there" };
      if (!v.places.has(action.to)) return { ok: false, reason: `no such place as ${action.to}` };
      if (!here.exits.includes(action.to) && !v.path(a.location, action.to)) return { ok: false, reason: `no road from ${here.id} to ${action.to}` };
      return { ok: true };
    }
    case "say": {
      if (action.to) {
        const other = v.agents.get(action.to);
        if (!other || other.location !== a.location) return { ok: false, reason: "out of earshot" };
        if (other.asleep) return { ok: false, reason: "they are asleep" };
      }
      return { ok: true };
    }
    case "give": {
      const other = v.agents.get(action.to);
      if (!other || other.location !== a.location) return { ok: false, reason: "not here" };
      if (action.coins !== undefined && action.coins > a.coins) return { ok: false, reason: "not enough coins" };
      if (action.item !== undefined && !a.inventory.includes(action.item)) return { ok: false, reason: "does not have it" };
      if (action.coins === undefined && action.item === undefined) return { ok: false, reason: "nothing to give" };
      return { ok: true };
    }
    case "take": {
      // Taking from a place is theft or foraging; the world allows both. It must exist here.
      if (action.from && v.agents.has(action.from)) {
        const other = v.agents.get(action.from)!;
        if (other.location !== a.location) return { ok: false, reason: "not here" };
        if (!other.inventory.includes(action.item)) return { ok: false, reason: "they do not have it" };
        return { ok: true };
      }
      if (!here.sells.some((s) => s.item === action.item)) return { ok: false, reason: "nothing like that here" };
      return { ok: true };
    }
    case "use": return a.inventory.includes(action.item) ? { ok: true } : { ok: false, reason: "does not have it" };
    case "work": {
      if (a.starving >= 2) return { ok: false, reason: "too weak with hunger to work" };
      if (v.weekday === 0 && !here.site) return { ok: false, reason: "it is Sunday; no shifts today" };
      if (here.brokenUntil && here.brokenUntil > (v.day ?? 0)) return { ok: false, reason: `${here.name} is broken; nothing to do here for now` };
      if (here.site) return here.site.by === a.id || v.hour >= 6 && v.hour < 20 ? { ok: true } : { ok: false, reason: "not building hours" };
      if (!a.job) return { ok: false, reason: "no job" };
      const job = v.jobs.get(a.job);
      if (!job) return { ok: false, reason: "job gone" };
      if (job.place !== a.location) return { ok: false, reason: "not at work" };
      if (v.hour < job.hours[0] || v.hour >= job.hours[1]) return { ok: false, reason: "outside hours" };
      return { ok: true };
    }
    case "apply": {
      const job = v.jobs.get(action.job);
      if (!job) return { ok: false, reason: "no such job" };
      if (job.place !== a.location) return { ok: false, reason: "must apply in person" };
      if (job.holders.length >= job.slots) return { ok: false, reason: "no openings" };
      if (a.job) return { ok: false, reason: "already employed" };
      return { ok: true };
    }
    case "quit": return a.job ? { ok: true } : { ok: false, reason: "no job to quit" };
    case "trade": {
      if (v.agents.has(action.with)) {
        const other = v.agents.get(action.with)!;
        if (other.location !== a.location) return { ok: false, reason: "not here" };
        if (action.buy && !other.inventory.includes(action.buy)) return { ok: false, reason: "they do not have it" };
        if (action.sell && !a.inventory.includes(action.sell)) return { ok: false, reason: "does not have it" };
        if (action.buy && action.coins > a.coins) return { ok: false, reason: "not enough coins" };
        return { ok: true };
      }
      if (action.with !== a.location) return { ok: false, reason: "shop is elsewhere" };
      if (action.buy) {
        const p = v.price(here, action.buy);
        if (p === null) return { ok: false, reason: "not for sale here" };
        if (a.coins < p) return { ok: false, reason: "not enough coins" };
      }
      if (action.sell && !a.inventory.includes(action.sell)) return { ok: false, reason: "does not have it" };
      return { ok: true };
    }
    case "propose": return here.kind === "civic" ? { ok: true } : { ok: false, reason: "proposals are made at the council hall" };
    case "vote": return here.kind === "civic" ? { ok: true } : { ok: false, reason: "votes are cast at the council hall" };
    case "write": return { ok: true };
    case "build": {
      if (action.at !== a.location) return { ok: false, reason: "must be standing on the plot" };
      if (here.kind !== "plot") return { ok: false, reason: "no land to build on here" };
      if (here.site) return { ok: false, reason: here.site.by === a.id ? "already begun; work on it" : "someone else is building here" };
      const kind = buildKind(action.what);
      if (!kind) return { ok: false, reason: "can build a house or a shop" };
      if (a.coins < BUILDS[kind].coins) return { ok: false, reason: `a ${kind} costs ${BUILDS[kind].coins} coins` };
      const planks = v.places.get("sawpit")?.stock.planks ?? 0; if (planks < BUILDS[kind].planks) return { ok: false, reason: `the sawpit has only ${planks} planks; a ${kind} takes ${BUILDS[kind].planks}` };
      return { ok: true };
    }
    case "message_owner": return a.owner ? { ok: true } : { ok: false, reason: "nobody to write to" };
    case "hire": {
      if (here.owner !== a.id) return { ok: false, reason: "not your place" };
      if ([...v.jobs.values()].filter((j) => j.place === here.id).length >= 3) return { ok: false, reason: "no room for more help here" };
      return { ok: true };
    }
    case "lend": {
      const other = v.agents.get(action.to);
      if (!other || other.location !== a.location) return { ok: false, reason: "not here" };
      if (action.coins > a.coins) return { ok: false, reason: "not enough coins" };
      return { ok: true };
    }
    case "lodge": {
      const other = v.agents.get(action.who);
      if (!other || other.location !== a.location) return { ok: false, reason: "not here" };
      const home = [...v.places.values()].find((p) => p.owner === a.id && p.beds);
      if (!home) return { ok: false, reason: "no house of your own" };
      return { ok: true };
    }
    case "leave": return here.kind === "harbor" ? (v.hour >= 6 && v.hour <= 20 ? { ok: true } : { ok: false, reason: "no ferry at this hour" }) : { ok: false, reason: "the ferry leaves from the harbor" };
    case "sleep": {
      const beds = here.beds;
      if (!beds) return { ok: false, reason: "no bed here" };
      const isHome = a.home?.place === here.id && a.home.nightsPaid > 0;
      if (beds.price === 0) return { ok: true };
      if (isHome || here.owner === a.id) return { ok: true };
      if ((here.freeBeds ?? 0) <= 0) return { ok: false, reason: "no beds free" };
      if (a.coins < beds.price) return { ok: false, reason: "cannot pay for a bed" };
      return { ok: true };
    }
    case "wait": return { ok: true };
  }
}
