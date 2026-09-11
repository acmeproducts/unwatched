import { describe, it, expect } from "vitest";
import { Town, Rng } from "../src/index.ts";
import type { Brain } from "../src/index.ts";

const none: Brain = {
  name: "none", async decide() { return { action: { kind: "wait" }, remember: [] }; },
  async converse() { throw new Error("no"); }, async reflect() { throw new Error("no"); }, async plan() { throw new Error("no"); },
  async digest() { return { text: "", headline: "" }; }, async child() { throw new Error("no"); }, async writePaper() { throw new Error("no"); }, async life() { throw new Error("no"); },
};
const persona = (name: string, rng: Rng) => ({ name, age: 30, origin: "the mainland", summary: "A person.", want: "A room.", fear: "Debt.", secret: "None.", strangers: "Polite.", advice: "Considers it.", traits: { warmth: rng.next(), pride: rng.next(), caution: rng.next(), honesty: rng.next(), ambition: rng.next() } });

describe("fire", () => {
  it("the bell wakes the town, whoever is near runs with buckets, and the place stands dark for fewer days the more who came", async () => {
    const town = new Town({ seed: 31, brain: none }); const rng = new Rng(31);
    for (let i = 0; i < 10; i++) town.addAgent({ persona: persona(`P${i}`, rng) });
    await town.run(2); while (town.hour < 14) await town.tick();
    const bakery = town.places.get("bakery")!; bakery.stock.bread = 9;
    town.fire(bakery, "the oven got away");
    expect(town.events.some((e) => e.kind === "town.fire")).toBe(true);
    const going = [...town.agents.values()].filter((a) => a.heading === "bakery" || a.location === "bakery").length; expect(going).toBeGreaterThan(3);
    while (town.hour < 15) await town.tick();
    const out = town.events.find((e) => e.kind === "town.gathering" && (e.payload as { kind: string }).kind === "fire"); expect(out).toBeDefined();
    const p = out!.payload as { crowd: string[]; days: number }; expect(p.crowd.length).toBeGreaterThan(3); expect(p.days).toBe(Math.max(2, 12 - p.crowd.length));
    expect(bakery.brokenUntil).toBe(town.day + p.days); expect(bakery.stock.bread).toBe(0);
    expect(town.price(bakery, "bread")).toBeNull();
    // nobody sleeps in a burnt inn
    const inn = town.places.get("inn")!; inn.brokenUntil = town.day + 3; const a = [...town.agents.values()][0]!; a.location = "inn"; a.asleep = false; a.needs.rest = 1;
    expect(town.apply(a, { kind: "sleep" }, "test")).toBe(false);
  });
});
