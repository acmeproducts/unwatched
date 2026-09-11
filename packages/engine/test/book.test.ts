import { describe, it, expect } from "vitest";
import { Town, Rng } from "../src/index.ts";
import type { Brain } from "../src/index.ts";

/** A brain that only writes: the paper and the book. Everything else is habit. */
const scribe: Brain = {
  name: "scribe", async judge() { return { happened: "it passed", plausible: true, coins_spent: 0, item_gained: null, item_lost: null, eases: null, trust: [] }; },
  async decide() { return { action: { kind: "wait" }, remember: [] }; },
  async converse() { throw new Error("no"); }, async reflect() { throw new Error("no"); }, async plan() { throw new Error("no"); },
  async digest() { return { text: "", headline: "" }; }, async child() { throw new Error("no"); },
  async writePaper(ctx) { return { edition: ctx.edition, date: ctx.date, weather: ctx.weather, lead: { headline: "h", deck: "d", body: "b" }, briefs: [], notices: [] }; },
  async life(ctx) { return { title: `The ${ctx.day - ctx.arrivedDay} days of ${ctx.name}`, text: `${ctx.name} came on day ${ctx.arrivedDay} and ${ctx.how} on day ${ctx.day}. ${ctx.events.length} things happened.`, epitaph: "Here briefly." }; },
};
function persona(name: string, rng: Rng) {
  return { name, age: 30, origin: "the mainland", summary: "A person.", want: "A room.", fear: "Debt.", secret: "None.", strangers: "Polite.", advice: "Considers it.", traits: { warmth: rng.next(), pride: rng.next(), caution: rng.next(), honesty: rng.next(), ambition: rng.next() } };
}

describe("the book and the painting", () => {
  it("the front page carries a scene from the record, and a death puts a book on the shelf", async () => {
    const town = new Town({ seed: 7, brain: scribe }); const rng = new Rng(7);
    for (let i = 0; i < 6; i++) town.addAgent({ persona: persona(`P${i}`, rng) });
    const poor = [...town.agents.values()][0]!; poor.coins = 0; poor.inventory = []; poor.needs.hunger = 1;
    await town.run(3);
    const paper = town.papers[0]!; expect(paper.scene).toBeDefined(); expect(town.places.has(paper.scene!.place)).toBe(true); expect(paper.scene!.sprite.length).toBeGreaterThan(0);
    await town.run(9);
    expect(town.events.some((e) => e.kind === "agent.died" && e.actors[0] === poor.id)).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    const book = town.events.find((e) => e.kind === "town.book" && e.actors[0] === poor.id);
    expect(book).toBeDefined(); expect((book!.payload as { title: string }).title).toMatch(/days of P0/); expect((book!.payload as { how: string }).how).toBe("died");
  });
});
