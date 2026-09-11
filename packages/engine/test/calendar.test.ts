import { describe, it, expect } from "vitest";
import { Town, Rng } from "../src/index.ts";
import type { Brain } from "../src/index.ts";

const none: Brain = {
  name: "none", async decide() { return { action: { kind: "wait" }, remember: [] }; },
  async converse() { throw new Error("no"); }, async reflect() { throw new Error("no"); }, async plan() { throw new Error("no"); },
  async digest() { return { text: "", headline: "" }; }, async child() { throw new Error("no"); }, async writePaper() { throw new Error("no"); }, async life() { throw new Error("no"); }, async judge() { return { happened: "it passed", plausible: true, coins_spent: 0, item_gained: null, item_lost: null, eases: null, trust: [] }; },
};
const persona = (name: string, rng: Rng) => ({ name, age: 30, origin: "the mainland", summary: "A person.", want: "A room.", fear: "Debt.", secret: "None.", strangers: "Polite.", advice: "Considers it.", traits: { warmth: rng.next(), pride: rng.next(), caution: rng.next(), honesty: rng.next(), ambition: rng.next() } });

describe("the island's own year", () => {
  it("keeps twelve months, grows lavender only in its season and sells all of it, and feeds the town on its feast day", async () => {
    const town = new Town({ seed: 41, brain: none }); const rng = new Rng(41);
    for (let i = 0; i < 8; i++) town.addAgent({ persona: persona(`P${i}`, rng) });
    const people = [...town.agents.values()]; let i = 0; for (const job of town.jobs.values()) { const a = people[i++]; if (!a) break; a.job = job.id; job.holders.push(a.id); }
    expect(town.month).toBe(1); expect(town.inSeason()).toEqual([]);
    // June: lavender in the fields, gone to the boat by the next morning
    town.monthOverride = 6; expect(town.inSeason()).toContain("lavender");
    await town.run(4);
    const fields = town.places.get("fields")!; expect(town.events.some((e) => e.kind === "boat.depart" && /lavender/.test(e.text))).toBe(true);
    while (town.hour < 9) await town.tick(); expect(fields.stock.lavender ?? 0).toBe(0); // keep is nothing: after the eight o'clock boat, none is left
    // the island's day: the feast at one, no shifts after noon, everyone fed
    town.monthOverride = 7; town.dayOfMonthOverride = 24; const feastDay = town.day + 1; await town.run(feastDay);
    for (const a of town.agents.values()) a.needs.hunger = 0.9;
    while (town.hour < 14) await town.tick();
    expect(town.occasion).toMatch(/island's day/);
    const held = town.events.find((e) => e.kind === "town.gathering" && (e.payload as { kind: string }).kind === "feast"); expect(held).toBeDefined();
    expect((held!.payload as { crowd: string[] }).crowd.length).toBeGreaterThan(4);
    const worked = town.events.filter((e) => e.kind === "agent.work" && e.day === feastDay && e.t % 1440 >= 12 * 60 + 60); expect(worked.length).toBe(0);
  });
});
