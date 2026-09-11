import { describe, it, expect } from "vitest";
import { Town, MINUTES_PER_DAY } from "../src/index.ts";
import type { Brain, AgentState, Tier } from "../src/index.ts";
import type { Perception, ActionProposal, Persona } from "@smallhours/protocol";

const persona = (name: string): Persona => ({ name, age: 30, origin: "the mainland", summary: "A settled person.", want: "a family", fear: "loneliness", secret: "none", strangers: "warm", advice: "listens", traits: { warmth: 0.8, pride: 0.3, caution: 0.5, honesty: 0.8, ambition: 0.4 } });
/** A brain that does nothing but name the children. */
const quiet: Brain = {
  name: "quiet", async judge() { return { happened: "it passed", plausible: true, coins_spent: 0, item_gained: null, item_lost: null, eases: null, trust: [] }; },
  async decide(_p: Perception, _a: AgentState, _t: Tier): Promise<ActionProposal> { return { action: { kind: "wait" }, remember: [] }; },
  async converse() { throw new Error("no"); }, async reflect() { return { summary: "a day", insights: [], opinions: [], intentions: [], letter_to_owner: null }; },
  async plan() { return { mood: "settled", goals: ["keep the house"], steps: [{ hour: 9, do: "stay home", place: null }] }; },
  async digest() { return { text: "", headline: "" }; }, async writePaper() { return { edition: 1, date: "d", weather: "clear", lead: { headline: "h", deck: "d", body: "b" }, briefs: [], notices: [] }; }, async life() { return { title: "t", text: "x", epitaph: "e" }; },
  async child(ctx) { return { ...persona(`Child ${ctx.parents[0]!.persona.name.split(" ")[1]}`), age: 16, origin: "born on the island" }; },
};

describe("generations", () => {
  it("a settled couple has a child, the child comes of age as a citizen, and the house passes on when a parent dies", async () => {
    const town = new Town({ seed: 4, brain: quiet, minutesPerTick: 1, ageOfMajority: 3 });
    const a = town.addAgent({ persona: persona("Ana Kos"), owner: "o1", budget: { tier1Max: 0, tier2Max: 0 } });
    const b = town.addAgent({ persona: persona("Bruno Kos"), owner: "o2", budget: { tier1Max: 0, tier2Max: 0 } });
    // a house of their own, both under its roof, fond of each other, fed and solvent
    const house = town.places.get("lane-1")!; house.kind = "home"; house.owner = a.id; house.name = "the Kos house"; house.beds = { price: 2, capacity: 2 }; house.freeBeds = 2;
    a.home = { place: house.id, nightsPaid: 36500 }; b.home = { place: house.id, nightsPaid: 30 }; a.location = house.id; b.location = house.id;
    a.coins = 60; b.coins = 60;
    for (const [x, y] of [[a, b], [b, a]] as const) { const r = town.rel(x, y.id); r.trust = 0.8; r.affection = 0.9; }
    let born = 0, ofAge = 0;
    for (let d = 0; d < 60 && !ofAge; d++) {
      for (let t = 0; t < MINUTES_PER_DAY; t++) { a.needs.hunger = 0.2; b.needs.hunger = 0.2; a.location = house.id; b.location = house.id; await town.tick(); }
      born = town.events.filter((e) => e.kind === "town.born").length;
      ofAge = town.events.filter((e) => e.kind === "town.of_age").length;
    }
    expect(born).toBeGreaterThanOrEqual(1);
    expect(ofAge).toBe(1);
    const child = [...town.agents.values()].find((x) => x.persona.name.startsWith("Child"))!;
    expect(child).toBeTruthy(); expect(child.persona.origin).toContain("born on the island"); expect(child.owner).toBeNull();
    expect(child.relationships.get(a.id)?.trust).toBeGreaterThan(0.7);
    // the parents paid for the child, a coin a day
    expect(a.coins + b.coins).toBeLessThan(120);
    // then Ana dies and the house goes to Bruno
    town.removeAgent(a.id, "died", "of age");
    expect(house.owner).toBe(b.id);
    expect(town.events.some((e) => e.kind === "agent.inherit" && e.actors[0] === b.id)).toBe(true);
  });
});
