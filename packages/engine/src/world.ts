import type { Place, Job } from "./types.ts";
import type { AgentId } from "@ferrytown/protocol";
import { ISLAND, type WorldPack } from "./packs/island.ts";

export { ISLAND } from "./packs/island.ts";
export type { WorldPack, PlaceSpec, JobSpec } from "./packs/island.ts";

/** The island, from a world pack. Roads run both ways; unowned businesses start with their float in the till. */
export function makePlaces(pack: WorldPack = ISLAND): Map<string, Place> {
  const list: Place[] = pack.places.map((p) => ({ id: p.id, name: p.name, kind: p.kind, district: p.district, sprite: p.sprite, x: p.x, y: p.y, exits: [...p.exits], sells: p.sells ? p.sells.map((s) => ({ ...s })) : [], owner: null, site: null, treasury: pack.float[p.id] ?? 0, ...(p.beds ? { beds: { ...p.beds }, freeBeds: p.beds.capacity } : {}) }));
  for (const p of list) for (const e of p.exits) { const q = list.find((x) => x.id === e); if (q && !q.exits.includes(p.id)) q.exits.push(p.id); }
  return new Map(list.map((p) => [p.id, p]));
}

export function makeJobs(pack: WorldPack = ISLAND): Map<string, Job> {
  return new Map(pack.jobs.map((j) => [j.id, { ...j, hours: [...j.hours] as [number, number], holders: [] }]));
}

/** What can be built on a plot: the price of the land and materials, paid to the council, and the mornings of work it takes. */
export const BUILDS: Record<"house" | "shop", { coins: number; labor: number; describe: string }> = {
  house: { coins: 15, labor: 6, describe: "a house with two beds; the builder sleeps free and can let the other bed" },
  shop: { coins: 30, labor: 10, describe: "a shop that sells bread, soup and drink, keeps what it earns, and can take on one helper" },
};
/** Loose words a person might use for what they mean to build. */
export function buildKind(what: string): keyof typeof BUILDS | null {
  const w = what.toLowerCase();
  if (/shop|store|stall|bakery|tavern|inn|cafe|café|kitchen|smithy|workshop|forge|boatyard|yard/.test(w)) return "shop";
  if (/house|home|cottage|hut|cabin|room|place to live|roof/.test(w)) return "house";
  return null;
}
/** The site's name once someone names it, else the builder's. */
export function siteName(kind: keyof typeof BUILDS, by: string, name: string | undefined): string {
  if (name && name.trim()) return name.trim().slice(0, 60);
  const first = by.split(" ")[0] ?? by;
  return kind === "house" ? `${first}'s house` : `${first}'s shop`;
}
export type BuildKind = keyof typeof BUILDS;
export const owns = (p: Place, id: AgentId) => p.owner === id;

export const FOOD_ITEMS = new Set(["bread", "soup", "apples", "fish"]);
export const MINUTES_PER_DAY = 24 * 60;
export const SEASONS = ["winter", "spring", "summer", "autumn"] as const;
