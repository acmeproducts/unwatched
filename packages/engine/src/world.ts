import type { Place, Job } from "./types.ts";

/** The island. One town, reached by ferry. Scarce beds, few jobs, news that arrives late. */
export function makePlaces(): Map<string, Place> {
  const list: Place[] = [
    { id: "harbor", name: "the harbor", kind: "harbor", exits: ["inn", "market", "chandlery", "boatshed"], sells: [] },
    { id: "inn", name: "the harbor inn", kind: "inn", exits: ["harbor", "market"], sells: [{ item: "soup", base: 2 }, { item: "bread", base: 1 }], beds: { price: 4, capacity: 6 }, freeBeds: 6 },
    { id: "market", name: "the market square", kind: "market", exits: ["harbor", "inn", "bakery", "chandlery", "tavern", "council", "hill"], sells: [{ item: "bread", base: 1 }, { item: "apples", base: 1 }] },
    { id: "bakery", name: "Ilić's bakery", kind: "workplace", exits: ["market"], sells: [{ item: "bread", base: 1 }] },
    { id: "chandlery", name: "the chandlery", kind: "shop", exits: ["harbor", "market"], sells: [{ item: "rope", base: 3 }, { item: "lamp oil", base: 2 }], beds: { price: 3, capacity: 1 }, freeBeds: 1 },
    { id: "tavern", name: "the tavern", kind: "public", exits: ["market"], sells: [{ item: "drink", base: 1 }] },
    { id: "council", name: "the council hall", kind: "civic", exits: ["market"], sells: [] },
    { id: "hill", name: "the hill road", kind: "public", exits: ["market", "mill", "fields"], sells: [] },
    { id: "mill", name: "the mill", kind: "workplace", exits: ["hill", "fields"], sells: [] },
    { id: "fields", name: "the hill fields", kind: "workplace", exits: ["hill", "mill"], sells: [{ item: "apples", base: 1 }] },
    { id: "boatshed", name: "the boat shed", kind: "home", exits: ["harbor"], sells: [], beds: { price: 0, capacity: 8 }, freeBeds: 8 },
  ];
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
  ];
  return new Map(list.map((j) => [j.id, j]));
}

export const FOOD_ITEMS = new Set(["bread", "soup", "apples"]);
export const MINUTES_PER_DAY = 24 * 60;
export const SEASONS = ["winter", "spring", "summer", "autumn"] as const;
