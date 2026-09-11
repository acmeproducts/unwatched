import { describe, it, expect } from "vitest";
import { Town, Rng, lookHash, buildKind } from "../src/index.ts";
import type { Brain } from "../src/index.ts";

const none: Brain = {
  name: "none", async decide() { return { action: { kind: "wait" }, remember: [] }; },
  async converse() { throw new Error("no"); }, async reflect() { throw new Error("no"); }, async plan() { throw new Error("no"); },
  async digest() { return { text: "", headline: "" }; }, async child() { throw new Error("no"); }, async writePaper() { throw new Error("no"); }, async life() { throw new Error("no"); }, async judge() { return { happened: "it passed", plausible: true, coins_spent: 0, item_gained: null, item_lost: null, eases: null, trust: [] }; },
};
const persona = (name: string, rng: Rng) => ({ name, age: 30, origin: "the mainland", summary: "A person.", want: "A room.", fear: "Debt.", secret: "None.", strangers: "Polite.", advice: "Considers it.", traits: { warmth: rng.next(), pride: rng.next(), caution: rng.next(), honesty: rng.next(), ambition: rng.next() } });

describe("a building with a look", () => {
  it("keeps the builder's words, names the sprite by their hash, and tells the world when it is done", async () => {
    const town = new Town({ seed: 9, brain: none }); const rng = new Rng(9);
    const a = town.addAgent({ persona: persona("Mira", rng) }); a.coins = 60;
    const plot = [...town.places.values()].find((p) => p.kind === "plot")!; a.location = plot.id; a.asleep = false;
    expect(buildKind("a stone boathouse")).toBe("house"); expect(buildKind("a smokehouse workshop")).toBe("shop");
    expect(town.apply(a, { kind: "build", what: "a house", at: plot.id, look: "a stone boathouse with a red door and a teal roof" }, "test")).toBe(true);
    expect(plot.site?.look).toMatch(/boathouse/);
    for (let d = 0; d < 8; d++) { await town.run(town.day + 1); while (town.hour < 9) await town.tick(); a.location = plot.id; a.asleep = false; a.needs.hunger = 0; town.apply(a, { kind: "work" }, "test"); }
    const built = town.events.find((e) => e.kind === "town.built"); expect(built).toBeDefined();
    const hash = lookHash("a stone boathouse with a red door and a teal roof");
    expect(plot.sprite).toBe(`look:${hash}`); expect((built!.payload as { hash: string }).hash).toBe(hash); expect(plot.look).toMatch(/boathouse/);
    const snap = town.snapshot(); const again = new Town({ seed: 9, brain: none }); again.restore(snap); expect(again.places.get(plot.id)!.look).toMatch(/boathouse/);
  });
});
