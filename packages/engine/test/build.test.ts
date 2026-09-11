import { describe, it, expect } from "vitest";
import { Town } from "../src/index.ts";
import type { Brain, AgentState, Tier } from "../src/index.ts";
import type { Perception, ActionProposal } from "@unwatched/protocol";

/** A brain with one idea: buy the plot it stands on and work until the house is up. */
const builder: Brain = {
  name: "builder",
  async decide(p: Perception, _a: AgentState, _t: Tier): Promise<ActionProposal> {
    if (p.place.plot?.free) return { action: { kind: "build", what: "a small house", at: p.place.id, name: "Stone Cottage" }, remember: [] };
    if (p.place.site) return { action: { kind: "work" }, remember: [] };
    return { action: { kind: "wait" }, remember: [] };
  },
  async converse() { throw new Error("no"); },
  async reflect() { return { summary: "a day", insights: [], opinions: [], intentions: [], letter_to_owner: null }; },
  async plan() { return { mood: "set", goals: ["build"], steps: [{ hour: 9, do: "build", place: "shore-1" }] }; },
  async digest() { return { text: "a day", headline: "A day" }; },
  async child() { throw new Error("no"); },
  async writePaper() { throw new Error("no"); },
  async life() { throw new Error("no"); }, async judge() { return { happened: "it passed", plausible: true, coins_spent: 0, item_gained: null, item_lost: null, eases: null, trust: [] }; },
};

describe("building", () => {
  it("turns a plot into a house after the mornings are worked, and the builder sleeps free", async () => {
    const town = new Town({ seed: 3, brain: builder, minutesPerTick: 1 });
    const persona = { name: "Ivo Test", age: 34, origin: "the mainland", summary: "A carpenter who wants a roof of his own.", want: "a house", fear: "the boat shed", secret: "none", strangers: "polite", advice: "listens", traits: { warmth: 0.5, pride: 0.5, caution: 0.5, honesty: 0.8, ambition: 0.8 } };
    const a = town.addAgent({ persona, owner: "o", funded: true, budget: { tier1Max: 500, tier2Max: 50 } });
    a.coins = 40; a.location = "shore-1"; a.job = null;
    // stand on the plot at nine in the morning
    while (town.hour < 9) await town.tick();
    a.location = "shore-1"; a.asleep = false;
    const plot = town.places.get("shore-1")!;
    let guard = 0;
    while (!plot.site && guard++ < 200) { a.location = "shore-1"; await town.tick(); }
    expect(plot.site?.name).toBe("Stone Cottage");
    expect(a.coins).toBe(25);
    // a morning of work a day, six days
    guard = 0;
    // a builder who never eats would be too weak to work by the third morning, so this one is fed
    while (plot.site && guard++ < 20000) { if (!a.asleep) a.location = "shore-1"; a.needs.hunger = 0.2; await town.tick(); }
    expect(plot.site).toBeNull();
    expect(plot.kind).toBe("home"); expect(plot.owner).toBe(a.id); expect(plot.name).toBe("Stone Cottage");
    expect(a.home?.place).toBe("shore-1");
    expect(town.events.some((e) => e.kind === "town.built")).toBe(true);
    // the snapshot keeps it, and a restore brings it back on a fresh map
    const snap = town.snapshot();
    const again = new Town({ seed: 3, brain: builder, minutesPerTick: 1 }); again.restore(snap);
    expect(again.places.get("shore-1")?.kind).toBe("home"); expect(again.places.get("shore-1")?.owner).toBe(a.id);
  });
});
