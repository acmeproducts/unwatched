import { describe, it, expect } from "vitest";
import { Town, MINUTES_PER_DAY } from "../src/index.ts";
import type { Brain, AgentState, Tier } from "../src/index.ts";
import type { Perception, ActionProposal } from "@ferrytown/protocol";

const none: Brain = {
  name: "none",
  async decide(_p: Perception, _a: AgentState, _t: Tier): Promise<ActionProposal> { return { action: { kind: "wait" }, remember: [] }; },
  async converse() { throw new Error("no"); }, async reflect() { throw new Error("no"); }, async plan() { throw new Error("no"); },
  async digest() { return { text: "", headline: "" }; }, async child() { throw new Error("no"); }, async writePaper() { throw new Error("no"); },
};
const persona = (name: string) => ({ name, age: 40, origin: "the mainland", summary: "A person with nothing.", want: "food", fear: "hunger", secret: "none", strangers: "quiet", advice: "listens", traits: { warmth: 0.3, pride: 0.3, caution: 0.5, honesty: 0.7, ambition: 0.2 } });

describe("hunger", () => {
  it("weakens the hungry after two days and kills after five, owned or not", async () => {
    const town = new Town({ seed: 21, brain: none, minutesPerTick: 1 });
    const poor = town.addAgent({ persona: persona("Poor House"), owner: null });
    const safe = town.addAgent({ persona: persona("Poor Owned"), owner: "o" });
    for (const a of [poor, safe]) { a.coins = 0; a.inventory = []; a.home = null; a.location = "boatshed"; }
    let weakBeforeDeath = false;
    let weakDay = 0, deathDay = 0;
    for (let d = 1; d <= 8 && town.agents.has(poor.id); d++) {
      for (let t = 0; t < MINUTES_PER_DAY; t++) await town.tick();
      if (!weakDay && poor.starving >= 2) { weakDay = d; safe.location = "fields"; safe.job = "fields.hand"; town.jobs.get("fields.hand")!.holders.push(safe.id); while (town.hour < 8) await town.tick(); weakBeforeDeath = town.apply(safe, { kind: "work" }, "test") === false; }
      if (!town.agents.has(poor.id)) deathDay = d;
    }
    expect(weakDay).toBeGreaterThan(0); expect(weakDay).toBeLessThanOrEqual(3);
    expect(deathDay).toBeGreaterThanOrEqual(5); expect(deathDay).toBeLessThanOrEqual(6);
    expect(town.events.some((e) => e.kind === "agent.weak" && e.actors[0] === poor.id)).toBe(true);
    expect(town.events.some((e) => e.kind === "agent.died" && e.actors[0] === poor.id)).toBe(true);
    // the owned one is just as hungry and dies the same night; the weak could not work before the end
    expect(town.agents.has(safe.id)).toBe(false);
    expect(weakBeforeDeath).toBe(true);
  });
});
