import { describe, it, expect } from "vitest";
import { Town, MINUTES_PER_DAY } from "../src/index.ts";
import type { Brain, AgentState, Tier } from "../src/index.ts";
import type { Perception, ActionProposal } from "@ferrytown/protocol";

/** The physics that every contributor's change must keep. Runs on habit alone, so no key is needed. */
const persona = (i: number, ambition = 0.5) => ({ name: `Citizen ${i}`, age: 30 + i, origin: "the mainland", summary: "A person.", want: "a quiet life", fear: "debt", secret: "none", strangers: "polite", advice: "listens", traits: { warmth: 0.5, pride: 0.4, caution: 0.5, honesty: 0.7, ambition } });
const none: Brain = {
  name: "none",
  async decide(_p: Perception, _a: AgentState, _t: Tier): Promise<ActionProposal> { return { action: { kind: "wait" }, remember: [] }; },
  async converse() { throw new Error("no"); }, async reflect() { throw new Error("no"); }, async plan() { throw new Error("no"); },
  async digest() { return { text: "", headline: "" }; }, async child() { throw new Error("no"); }, async writePaper() { throw new Error("no"); }, async life() { throw new Error("no"); },
};
function coinsOnIsland(town: Town): number {
  let s = 0; for (const a of town.agents.values()) s += a.coins; for (const p of town.places.values()) s += p.treasury; return s;
}

describe("the physics hold over five days of habit", () => {
  it("keeps the books, keeps everyone above zero, never overfills a bed, and only walks along roads", async () => {
    const town = new Town({ seed: 11, brain: none, minutesPerTick: 1 });
    for (let i = 0; i < 24; i++) town.addAgent({ persona: persona(i, (i % 5) / 5), owner: null });
    // habit alone never applies for work, so give a dozen people jobs to start; wages, tills and the mainland's payments are then all exercised
    const jobs = [...town.jobs.values()]; let k = 0;
    for (const a of town.agents.values()) { const j = jobs[k % jobs.length]!; if (j.holders.length < j.slots) { j.holders.push(a.id); a.job = j.id; } if (++k >= 12) break; }
    const start = coinsOnIsland(town) - town.minted; // minted counts the arrivals' suitcases
    const where = new Map([...town.agents.values()].map((a) => [a.id, a.location]));
    let moves = 0;
    for (let t = 0; t < 5 * MINUTES_PER_DAY; t++) {
      await town.tick();
      for (const a of town.agents.values()) { expect(a.coins).toBeGreaterThanOrEqual(0); }
      for (const p of town.places.values()) { expect(p.treasury).toBeGreaterThanOrEqual(0); if (p.beds) expect(p.freeBeds ?? 0).toBeGreaterThanOrEqual(0); }
      for (const a of town.agents.values()) {
        const prev = where.get(a.id)!;
        if (prev !== a.location) { moves++; expect(town.places.get(prev)!.exits, `${a.persona.name} walked ${prev} -> ${a.location} without a road`).toContain(a.location); where.set(a.id, a.location); }
      }
    }
    expect(moves).toBeGreaterThan(50);
    // every coin is accounted for: what is on the island equals what arrived plus what the mainland paid, minus what left
    expect(coinsOnIsland(town)).toBe(start + town.minted - town.burned);
    expect(town.events.some((e) => e.kind === "agent.work")).toBe(true);
  });
});

describe("the new verbs", () => {
  it("lends and remembers, hires at an owned place, lodges a friend, and leaves on the ferry", async () => {
    const town = new Town({ seed: 5, brain: none, minutesPerTick: 1 });
    const a = town.addAgent({ persona: persona(1), owner: "o1" }); const b = town.addAgent({ persona: persona(2), owner: "o2" });
    a.coins = 30; b.coins = 2; a.location = "market"; b.location = "market";
    while (town.hour < 9) await town.tick();
    a.location = "market"; b.location = "market"; a.asleep = false; b.asleep = false;
    expect(town.apply(a, { kind: "lend", to: b.id, coins: 10, days: 1 }, "test")).toBe(true);
    expect(a.coins).toBe(20); expect(b.coins).toBe(12); expect(b.debts[0]?.to).toBe(a.id);
    expect(town.apply(b, { kind: "give", to: a.id, coins: 10 }, "test")).toBe(true);
    expect(b.debts.length).toBe(0); expect(town.events.some((e) => e.kind === "agent.debt")).toBe(true);
    // a house of a's own, then a helper and a lodger
    const house = town.places.get("shore-1")!; house.kind = "home"; house.owner = a.id; house.beds = { price: 2, capacity: 2 }; house.freeBeds = 2; house.name = "A's house";
    a.location = "shore-1"; b.location = "shore-1";
    expect(town.apply(a, { kind: "hire", title: "Housekeeper", wage: 2 }, "test")).toBe(true);
    expect([...town.jobs.values()].some((j) => j.place === "shore-1")).toBe(true);
    expect(town.apply(a, { kind: "lodge", who: b.id }, "test")).toBe(true);
    expect(b.home?.place).toBe("shore-1");
    // and the ferry out
    b.location = "harbor";
    expect(town.apply(b, { kind: "leave", why: "nothing here for me" }, "test")).toBe(true);
    expect(town.agents.has(b.id)).toBe(false);
    expect(town.events.some((e) => e.kind === "agent.leave")).toBe(true);
  });
});
