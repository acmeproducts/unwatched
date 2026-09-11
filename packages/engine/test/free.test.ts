import { describe, it, expect } from "vitest";
import { Town, Rng } from "../src/index.ts";
import type { Brain } from "../src/index.ts";

/** A brain that rewrites itself, chooses what to watch, and acts in its own words. */
const mind: Brain = {
  name: "mind",
  async decide(p) { return p.self.watching?.length ? { action: { kind: "do", what: "whistle the old harbour tune for whoever is here" }, remember: [] } : { action: { kind: "wait" }, remember: [] }; },
  async converse() { throw new Error("no"); }, async plan() { throw new Error("no"); },
  async reflect(ctx) { return { summary: `Day ${ctx.day}.`, insights: [], opinions: [], intentions: [], letter_to_owner: null, watch: ["the market square", "Vesna"], self: { want: "to stay, now, and to be known here", fear: "the ferry" } }; },
  async digest() { return { text: "", headline: "" }; }, async child() { throw new Error("no"); }, async writePaper() { throw new Error("no"); }, async life() { throw new Error("no"); },
  async judge(ctx) { return { happened: `${ctx.agent.persona.name} whistled; two heads turned.`, plausible: true, coins_spent: 0, item_gained: null, item_lost: null, eases: "social", trust: ctx.nearby.slice(0, 1).map((who) => ({ who, delta: 0.05 })) }; },
};
const persona = (name: string, rng: Rng) => ({ name, age: 30, origin: "the mainland", summary: "A person.", want: "A room.", fear: "Debt.", secret: "None.", strangers: "Polite.", advice: "Considers it.", traits: { warmth: rng.next(), pride: rng.next(), caution: rng.next(), honesty: rng.next(), ambition: rng.next() } });

describe("free minds", () => {
  it("a reflection can rewrite the self and set what to watch; what is watched draws a thought; a free deed is judged and remembered", async () => {
    const town = new Town({ seed: 8, brain: mind }); const rng = new Rng(8);
    const a = town.addAgent({ persona: persona("Mira", rng), funded: true }); town.addAgent({ persona: persona("Vesna", rng), funded: true });
    a.budget.tier2Max = 5;
    await town.run(2); // midnight: reflection
    expect(a.persona.want).toBe("to stay, now, and to be known here"); expect(a.persona.fear).toBe("the ferry"); expect(a.persona.summary).toBe("A person.");
    expect(a.selves.length).toBe(1); expect(a.selves[0]!.want).toBe("A room.");
    expect(town.events.some((e) => e.kind === "agent.became" && /now wants/.test(e.text))).toBe(true);
    expect(a.watch).toEqual(["the market square", "Vesna"]);
    expect(town.perceive(a).self.watching).toEqual(["the market square", "Vesna"]);
    // the second night must not rewrite again so soon
    await town.run(3); expect(a.selves.length).toBe(1);
    // the watched place draws a thought, and the free deed comes to something
    a.location = "market"; a.asleep = false; a.lastThought = -999; while (town.hour < 10) await town.tick();
    for (let i = 0; i < 40 && !town.events.some((e) => e.kind === "agent.do" && /whistled/.test(e.text)); i++) { a.location = "market"; a.asleep = false; await town.tick(); }
    const did = town.events.find((e) => e.kind === "agent.do" && /whistled/.test(e.text)); expect(did).toBeDefined();
    expect(a.memory.some((m) => /whistle/.test(m.text))).toBe(true);
    expect(a.doToday).toBeGreaterThan(0); expect((did!.payload as { spent?: number }).spent ?? 0).toBe(0); // a whistle costs nothing; bread and a bed still do
  });
});
