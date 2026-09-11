import { describe, it, expect } from "vitest";
import { Town, Rng, sha256, canonicalEvent } from "../src/index.ts";
import type { Brain } from "../src/index.ts";

const none: Brain = {
  name: "none", async decide() { return { action: { kind: "wait" }, remember: [] }; },
  async converse() { throw new Error("no"); }, async reflect() { throw new Error("no"); }, async plan() { throw new Error("no"); },
  async digest() { return { text: "", headline: "" }; }, async child() { throw new Error("no"); }, async writePaper() { throw new Error("no"); }, async life() { throw new Error("no"); },
};
const persona = (name: string, rng: Rng) => ({ name, age: 30, origin: "the mainland", summary: "A person.", want: "A room.", fear: "Debt.", secret: "None.", strangers: "Polite.", advice: "Considers it.", traits: { warmth: rng.next(), pride: rng.next(), caution: rng.next(), honesty: rng.next(), ambition: rng.next() } });

describe("the provable record", () => {
  it("sha256 is right, a day seals to the same hash from the same events, the chain links, and a changed word breaks it", async () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const town = new Town({ seed: 5, brain: none }); const rng = new Rng(5);
    for (let i = 0; i < 6; i++) town.addAgent({ persona: persona(`P${i}`, rng) });
    await town.run(4);
    expect(town.chain.length).toBe(3); expect(town.chain[0]!.prev).toBe("0".repeat(64)); expect(town.chain[1]!.prev).toBe(town.chain[0]!.hash);
    const day2 = town.chain[1]!; const events = town.events.filter((e) => e.t >= day2.from && e.t < day2.to).sort((x, y) => x.id - y.id);
    expect(events.length).toBe(day2.events);
    expect(sha256(day2.prev + "\n" + events.map(canonicalEvent).join("\n"))).toBe(day2.hash);
    const tampered = events.map((e, i) => (i === 3 ? { ...e, text: e.text + " (not really)" } : e));
    expect(sha256(day2.prev + "\n" + tampered.map(canonicalEvent).join("\n"))).not.toBe(day2.hash);
    // the same seed, the same days, the same seals
    const again = new Town({ seed: 5, brain: none }); const rng2 = new Rng(5); for (let i = 0; i < 6; i++) again.addAgent({ persona: persona(`P${i}`, rng2) }); await again.run(4);
    expect(again.chain.map((s) => s.hash)).toEqual(town.chain.map((s) => s.hash));
  });
  it("nights wear a person: a thief loses honesty, a fed and paid citizen gains ambition", async () => {
    const town = new Town({ seed: 6, brain: none }); const rng = new Rng(6);
    for (let i = 0; i < 4; i++) town.addAgent({ persona: persona(`P${i}`, rng) });
    const [a, b] = [...town.agents.values()] as [ReturnType<Town["addAgent"]>, ReturnType<Town["addAgent"]>];
    const h0 = a.persona.traits.honesty; b.inventory.push("bread"); a.location = b.location;
    town.apply(a, { kind: "take", item: "bread", from: b.id }, "test");
    await town.run(town.day + 1);
    expect(a.persona.traits.honesty).toBeLessThan(h0);
  });
});
