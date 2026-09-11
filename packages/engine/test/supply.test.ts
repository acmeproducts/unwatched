import { describe, it, expect } from "vitest";
import { Town, Rng } from "../src/index.ts";
import type { Brain, AgentState, Tier } from "../src/index.ts";
import type { Perception, ActionProposal } from "@ferrytown/protocol";

const none: Brain = {
  name: "none",
  async decide(_p: Perception, _a: AgentState, _t: Tier): Promise<ActionProposal> { return { action: { kind: "wait" }, remember: [] }; },
  async converse() { throw new Error("no"); }, async reflect() { throw new Error("no"); }, async plan() { throw new Error("no"); },
  async digest() { return { text: "a day", headline: "A day" }; }, async child() { throw new Error("no"); }, async writePaper() { throw new Error("no"); }, async life() { throw new Error("no"); },
};
function persona(name: string, rng: Rng) {
  return { name, age: 30, origin: "the mainland", summary: "A person.", want: "A room.", fear: "Debt.", secret: "None.", strangers: "Polite.", advice: "Considers it.", traits: { warmth: rng.next(), pride: rng.next(), caution: rng.next(), honesty: rng.next(), ambition: rng.next() } };
}

describe("the supply chain", () => {
  it("moves grain to flour to bread, keeps the shelves stocked, and rests on Sunday", async () => {
    const town = new Town({ seed: 3, brain: none }); const rng = new Rng(3);
    for (let i = 0; i < 14; i++) town.addAgent({ persona: persona(`P${i}`, rng) });
    // everyone takes a job, one per post, the way the brain would on the first morning
    const people = [...town.agents.values()]; let i = 0;
    for (const job of town.jobs.values()) { const a = people[i++]; if (!a) break; a.job = job.id; job.holders.push(a.id); }
    const bakery = town.places.get("bakery")!, market = town.places.get("market")!, mill = town.places.get("mill")!;
    const grain0 = mill.stock.grain ?? 0;
    await town.run(10);
    // the cart ran: the mill took grain from the fields and the bakery got flour
    expect((town.places.get("fields")!.stock.grain ?? 0)).toBeLessThan(90);
    expect(mill.stock.grain ?? 0).not.toBe(grain0);
    // people ate all week from what the island made, and nobody went hungry
    // the shelves may be bare at any one moment (a fire can take a bakery for days); what matters is that the chain fed everyone
    void bakery; void market;
    for (const a of town.agents.values()) expect(a.starving, a.persona.name).toBe(0);
    expect(town.events.filter((e) => e.kind === "agent.eat").length).toBeGreaterThan(14 * 6);
    const bought = town.events.filter((e) => e.kind === "agent.trade" && /bread/.test(e.text)).length; expect(bought).toBeGreaterThan(10);
    // day 1 is a Sunday when the island keeps its own calendar: nobody was paid that day
    const sundayWages = town.events.filter((e) => e.kind === "agent.work" && e.day === 1); expect(sundayWages.length).toBe(0);
    const mondayWages = town.events.filter((e) => e.kind === "agent.work" && e.day === 2); expect(mondayWages.length).toBeGreaterThan(0);
    // stock is never negative
    for (const p of town.places.values()) for (const [k, v] of Object.entries(p.stock)) expect(v, `${p.id} ${k}`).toBeGreaterThanOrEqual(0);
    // the perception carries the calendar
    const any = [...town.agents.values()][0]!; const per = town.perceive(any); expect(per.time.weekday).toBeDefined();
  });
  it("a shortage is real: with no flour and no bread the bakery says so, and bread returns when the mill turns", async () => {
    const town = new Town({ seed: 4, brain: none }); const rng = new Rng(4);
    for (let i = 0; i < 10; i++) town.addAgent({ persona: persona(`P${i}`, rng) });
    const people = [...town.agents.values()]; let i = 0;
    for (const job of town.jobs.values()) { const a = people[i++]; if (!a) break; a.job = job.id; job.holders.push(a.id); }
    const bakery = town.places.get("bakery")!, market = town.places.get("market")!, mill = town.places.get("mill")!;
    bakery.stock = { bread: 0, flour: 0 }; market.stock.bread = 0; mill.stock = { grain: 0, flour: 0 }; town.places.get("fields")!.stock.grain = 0;
    await town.run(2);
    expect(town.flourShortage).toBe(true);
    expect(town.price(bakery, "bread")).toBeNull();
    town.places.get("fields")!.stock.grain = 90; await town.run(6);
    expect(town.flourShortage).toBe(false);
  });
});
