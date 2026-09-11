import type { Place, Job } from "./types.ts";
import type { AgentId } from "@ferrytown/protocol";

/**
 * The island. One town in six districts, reached by ferry. Scarce beds, work that has to be walked to,
 * news that arrives late, and empty land where people can build if they can pay for it and turn up to work.
 * Positions are where things stand on the map the client draws; the client never decides where anything is.
 */
const P = (id: string, name: string, kind: Place["kind"], district: string, sprite: string, x: number, y: number, exits: string[], extra: Partial<Place> = {}): Place =>
  ({ id, name, kind, district, sprite, x, y, exits, sells: [], owner: null, site: null, ...extra });

export function makePlaces(): Map<string, Place> {
  const list: Place[] = [
    // Harbor
    P("harbor", "the harbor", "harbor", "harbor", "harbor-office", 560, 1180, ["inn", "market", "chandlery", "boatshed", "fishhouse", "coast"]),
    P("inn", "the harbor inn", "inn", "harbor", "inn", 820, 1020, ["harbor", "market"], { sells: [{ item: "soup", base: 2 }, { item: "bread", base: 1 }], beds: { price: 4, capacity: 6 }, freeBeds: 6 }),
    P("chandlery", "the chandlery", "shop", "harbor", "chandlery", 880, 1280, ["harbor", "market"], { sells: [{ item: "rope", base: 3 }, { item: "lamp oil", base: 2 }], beds: { price: 3, capacity: 1 }, freeBeds: 1 }),
    P("boatshed", "the boat shed", "home", "harbor", "boatshed", 420, 1400, ["harbor"], { beds: { price: 0, capacity: 8 }, freeBeds: 8 }),
    P("fishhouse", "the fish house", "workplace", "harbor", "fishhouse", 300, 1000, ["harbor"], { sells: [{ item: "fish", base: 1 }] }),
    // Old town
    P("market", "the market square", "market", "old town", "stall", 1180, 1100, ["harbor", "inn", "bakery", "chandlery", "tavern", "council", "hill", "chapel", "smithy", "lane"], { sells: [{ item: "bread", base: 1 }, { item: "apples", base: 1 }, { item: "fish", base: 1 }] }),
    P("bakery", "Ilić's bakery", "workplace", "old town", "bakery", 1160, 840, ["market"], { sells: [{ item: "bread", base: 1 }] }),
    P("tavern", "the tavern", "public", "old town", "tavern", 1500, 1200, ["market", "lane"], { sells: [{ item: "drink", base: 1 }] }),
    P("council", "the council hall", "civic", "old town", "council", 1520, 880, ["market", "chapel"]),
    P("chapel", "the chapel", "public", "old town", "chapel", 1820, 760, ["council", "market", "hill"]),
    P("smithy", "the smithy", "workplace", "old town", "smithy", 900, 760, ["market"], { sells: [{ item: "nails", base: 2 }] }),
    P("lane", "Rope Lane", "public", "old town", "lamp", 1420, 1420, ["market", "tavern", "lane-1", "lane-2"]),
    P("lane-1", "an empty lot on Rope Lane", "plot", "old town", "plot", 1300, 1560, ["lane"]),
    P("lane-2", "the corner lot on Rope Lane", "plot", "old town", "plot", 1620, 1520, ["lane"]),
    // Hill
    P("hill", "the hill road", "public", "hill", "well", 2000, 1000, ["market", "chapel", "mill", "fields", "orchard", "pinewood"]),
    P("mill", "the mill", "workplace", "hill", "mill", 2180, 640, ["hill", "fields"]),
    P("fields", "the hill fields", "workplace", "hill", "field", 2380, 1000, ["hill", "mill", "orchard"], { sells: [{ item: "apples", base: 1 }] }),
    P("orchard", "the old orchard", "workplace", "hill", "orchard", 2360, 1320, ["fields", "hill", "shore"], { sells: [{ item: "apples", base: 1 }] }),
    // North shore
    P("coast", "the coast road", "public", "north shore", "searocks", 520, 620, ["harbor", "cove", "shore"]),
    P("cove", "the cove", "public", "north shore", "rowboat", 300, 380, ["coast", "lighthouse"]),
    P("shore", "the north shore", "public", "north shore", "bench", 1000, 440, ["coast", "shore-1", "shore-2", "shore-3", "pinewood", "orchard"]),
    P("shore-1", "a plot above the cove", "plot", "north shore", "plot", 760, 300, ["shore"]),
    P("shore-2", "a plot on the north shore", "plot", "north shore", "plot", 1060, 220, ["shore"]),
    P("shore-3", "the last plot before the pines", "plot", "north shore", "plot", 1380, 300, ["shore"]),
    // Pinewood and the quarry
    P("pinewood", "the pinewood", "wild", "pinewood", "tree-large", 1900, 380, ["shore", "hill", "sawpit", "quarry"]),
    P("sawpit", "the sawpit", "workplace", "pinewood", "sawpit", 1700, 520, ["pinewood", "wood-1"], { sells: [{ item: "timber", base: 3 }] }),
    P("wood-1", "a clearing in the pines", "plot", "pinewood", "plot", 1620, 260, ["sawpit", "pinewood"]),
    P("quarry", "the quarry", "wild", "pinewood", "quarry", 2300, 260, ["pinewood", "lighthouse", "point-1"]),
    P("lighthouse", "the lighthouse", "public", "pinewood", "lighthouse", 2660, 420, ["quarry", "cove"]),
    P("point-1", "the plot on the point", "plot", "pinewood", "plot", 2560, 700, ["quarry", "lighthouse"]),
  ];
  for (const p of list) for (const e of p.exits) { const q = list.find((x) => x.id === e); if (q && !q.exits.includes(p.id)) q.exits.push(p.id); } // roads run both ways
  return new Map(list.map((p) => [p.id, p]));
}

export function makeJobs(): Map<string, Job> {
  const list: Job[] = [
    { id: "bakery.cook", title: "cook at the bakery", place: "bakery", wage: 3, hours: [6, 12], slots: 2, holders: [] },
    { id: "inn.help", title: "help at the inn", place: "inn", wage: 2, hours: [8, 16], slots: 2, holders: [] },
    { id: "fields.hand", title: "field hand", place: "fields", wage: 2, hours: [7, 15], slots: 4, holders: [] },
    { id: "mill.hand", title: "mill hand", place: "mill", wage: 3, hours: [7, 14], slots: 1, holders: [] },
    { id: "harbor.dock", title: "dock hand", place: "harbor", wage: 2, hours: [6, 12], slots: 2, holders: [] },
    { id: "chandlery.clerk", title: "clerk at the chandlery", place: "chandlery", wage: 2, hours: [9, 17], slots: 1, holders: [] },
    { id: "tavern.keep", title: "tavern keeper's help", place: "tavern", wage: 2, hours: [16, 23], slots: 1, holders: [] },
    { id: "fishhouse.gutter", title: "fish gutter", place: "fishhouse", wage: 2, hours: [5, 11], slots: 2, holders: [] },
    { id: "smithy.help", title: "smith's help", place: "smithy", wage: 3, hours: [8, 16], slots: 1, holders: [] },
    { id: "orchard.picker", title: "picker at the orchard", place: "orchard", wage: 2, hours: [7, 14], slots: 3, holders: [] },
    { id: "pinewood.cutter", title: "woodcutter", place: "pinewood", wage: 3, hours: [7, 15], slots: 2, holders: [] },
    { id: "sawpit.sawyer", title: "sawyer", place: "sawpit", wage: 3, hours: [8, 16], slots: 1, holders: [] },
    { id: "quarry.hand", title: "quarryman", place: "quarry", wage: 3, hours: [7, 14], slots: 2, holders: [] },
  ];
  return new Map(list.map((j) => [j.id, j]));
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
