import { describe, it, expect } from "vitest";
import { Town, Rng } from "../src/index.ts";
import type { Brain } from "../src/index.ts";

const none: Brain = {
  name: "none",
  async decide() { return { action: { kind: "wait" }, remember: [] }; },
  async converse() { throw new Error("no"); }, async reflect() { throw new Error("no"); }, async plan() { throw new Error("no"); },
  async digest() { return { text: "", headline: "" }; }, async child() { throw new Error("no"); }, async writePaper() { throw new Error("no"); }, async life() { throw new Error("no"); },
};
function persona(name: string, rng: Rng, secret = "None.") {
  return { name, age: 30, origin: "the mainland", summary: "A person.", want: "A room.", fear: "Debt.", secret, strangers: "Polite.", advice: "Considers it.", traits: { warmth: rng.next(), pride: rng.next(), caution: rng.next(), honesty: 0.8, ambition: rng.next() } };
}

describe("secrets with gravity", () => {
  it("a search while the resident is out learns the secret; a witness tells; an exposé puts it on the whole island", async () => {
    const town = new Town({ seed: 5, brain: none }); const rng = new Rng(5);
    const snoop = town.addAgent({ persona: persona("Snoop", rng) }); const owner = town.addAgent({ persona: persona("Owner", rng, "Left a debt of 200 coins on the mainland under another name.") }); const witness = town.addAgent({ persona: persona("Witness", rng) });
    const house = [...town.places.values()].find((p) => p.beds && p.kind !== "inn")!; house.owner = owner.id; owner.home = { place: house.id, nightsPaid: 0 };
    snoop.location = house.id; witness.location = house.id; owner.location = "market"; snoop.asleep = witness.asleep = false;
    // the resident at home: refused
    owner.location = house.id; expect(town.apply(snoop, { kind: "search" }, "test")).toBe(false); owner.location = "market";
    expect(town.perceive(snoop).options).toContain("search");
    expect(town.apply(snoop, { kind: "search" }, "test")).toBe(true);
    expect(snoop.secretsKnown[owner.id]).toMatch(/200 coins/);
    expect(town.perceive(snoop).self.knows?.[0]?.who).toBe("Owner");
    expect(witness.memory.some((m) => /going through Owner's things/.test(m.text))).toBe(true);
    expect(witness.relationships.get(snoop.id)!.trust).toBeLessThan(0.3);
    // the exposé
    snoop.location = "market";
    expect(town.apply(snoop, { kind: "write", title: "What Owner left behind", text: "The truth about a neighbor.", about: "Owner" }, "test")).toBe(true);
    const ex = town.events.find((e) => e.kind === "town.expose"); expect(ex).toBeDefined(); expect(ex!.importance).toBeGreaterThan(0.9);
    expect(witness.secretsKnown[owner.id]).toMatch(/200 coins/);
    expect(owner.memory.some((m) => /whole island knows/.test(m.text))).toBe(true);
    expect(owner.relationships.get(snoop.id)!.trust).toBeLessThan(0.1);
    // writing about someone whose secret you do not know is just writing
    expect(town.apply(witness, { kind: "write", title: "On Snoop", text: "A neighbor.", about: "Snoop" }, "test")).toBe(true);
    expect(town.events.filter((e) => e.kind === "town.expose").length).toBe(1);
  });
});
