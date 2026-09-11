import { describe, it, expect } from "vitest";
import { Town, Rng } from "../src/index.ts";
import type { Brain } from "../src/index.ts";

const none: Brain = {
  name: "none", async decide() { return { action: { kind: "wait" }, remember: [] }; }, async judge() { return { happened: "it passed", plausible: true, coins_spent: 0, item_gained: null, item_lost: null, eases: null, trust: [] }; },
  async converse() { throw new Error("no"); }, async reflect() { throw new Error("no"); }, async plan() { throw new Error("no"); },
  async digest() { return { text: "", headline: "" }; }, async child() { throw new Error("no"); }, async writePaper() { throw new Error("no"); }, async life() { throw new Error("no"); },
};
const persona = (name: string, rng: Rng) => ({ name, age: 30, origin: "the mainland", summary: "A person.", want: "A room.", fear: "Debt.", secret: "None.", strangers: "Polite.", advice: "Considers it.", traits: { warmth: rng.next(), pride: rng.next(), caution: rng.next(), honesty: rng.next(), ambition: rng.next() } });

describe("an island its citizens shape", () => {
  it("a shop sets its stock, a workshop learns a recipe the boat pays for, three voices name a place, and a passed law bites", () => {
    const town = new Town({ seed: 12, brain: none }); const rng = new Rng(12);
    const [a, b, c] = Array.from({ length: 3 }, (_, i) => town.addAgent({ persona: persona(`P${i}`, rng) })) as [ReturnType<Town["addAgent"]>, ReturnType<Town["addAgent"]>, ReturnType<Town["addAgent"]>];
    // stock: only the owner, only things the island has
    const tavern = town.places.get("tavern")!; tavern.owner = a.id; a.location = "tavern"; a.asleep = false;
    expect(town.apply(a, { kind: "stock", item: "fish", price: 2 }, "test")).toBe(true); expect(tavern.sells.find((s) => s.item === "fish")?.base).toBe(2);
    expect(town.apply(a, { kind: "stock", item: "dragon eggs", price: 5 }, "test")).toBe(false);
    b.location = "tavern"; expect(town.apply(b, { kind: "stock", item: "fish", price: 1 }, "test")).toBe(false);
    // make: lavender oil from lavender, at a workplace where you work; the recipe is learned and priced by its makings
    const sawpit = town.places.get("sawpit")!; sawpit.stock.lavender = 3; const job = town.jobs.get("sawpit.sawyer")!; job.holders.push(a.id); a.job = job.id; a.location = "sawpit";
    expect(town.apply(a, { kind: "make", item: "lavender oil", from: ["lavender", "lavender", "lavender"] }, "test")).toBe(true);
    expect(sawpit.stock.lavender).toBe(0); expect(sawpit.stock["lavender oil"]).toBe(1); expect(sawpit.recipes?.[0]?.item).toBe("lavender oil");
    expect(town.pack.exports.find((e) => e.item === "lavender oil")?.price).toBe(9); expect(town.events.some((e) => e.kind === "town.recipe")).toBe(true);
    expect(town.apply(a, { kind: "make", item: "planks", from: ["stone"] }, "test")).toBe(false); // nothing on hand to make it from
    expect(town.apply(a, { kind: "make", item: "timber", from: ["timber"] }, "test")).toBe(false); // a thing cannot be made from itself
    // call: three people and the island takes the name
    for (const x of [a, b, c]) { x.location = "market"; x.asleep = false; }
    expect(town.apply(a, { kind: "call", name: "the Square" }, "test")).toBe(true); expect(town.places.get("market")!.nickname).toBeUndefined();
    town.apply(b, { kind: "call", name: "the square" }, "test"); expect(town.places.get("market")!.nickname).toBeUndefined();
    town.apply(c, { kind: "call", name: "The Square" }, "test"); expect(town.places.get("market")!.nickname).toBe("the Square");
    expect(town.perceive(a).place.known_as).toBe("the Square");
    // laws with teeth
    expect(town.enact("A tax of 10% on all wages, for the council treasury.")?.kind).toBe("tax");
    expect(town.enact("Bread shall cost no more than 1 coin.")?.kind).toBe("cap");
    expect(town.enact("Curfew at 22: the tavern shuts.")?.kind).toBe("curfew");
    expect(town.enact("Be kind to strangers.")).toBeNull();
    expect(town.ways().rules.length).toBe(3);
    const bakery = town.places.get("bakery")!; town.flourShortage = true; expect(town.price(bakery, "bread")).toBe(1); // capped even in a shortage
    expect(town.perceive(a).town?.rules.length).toBe(3);
  });
});
