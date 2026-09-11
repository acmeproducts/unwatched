import { describe, it, expect } from "vitest";
import { Town, Rng } from "../src/index.ts";
import type { Brain } from "../src/index.ts";

const none: Brain = {
  name: "none", async decide() { return { action: { kind: "wait" }, remember: [] }; },
  async converse() { throw new Error("no"); }, async reflect() { throw new Error("no"); }, async plan() { throw new Error("no"); },
  async digest() { return { text: "", headline: "" }; }, async child() { throw new Error("no"); }, async writePaper() { throw new Error("no"); }, async life() { throw new Error("no"); }, async judge() { return { happened: "it passed", plausible: true, coins_spent: 0, item_gained: null, item_lost: null, eases: null, trust: [] }; },
};

describe("cargo between islands", () => {
  it("one island's surplus fills another's empty shelves; coins leave one and arrive at the other, none minted by the trade", () => {
    const south = new Town({ seed: 1, brain: none }), north = new Town({ seed: 2, brain: none, idPrefix: "north" });
    south.places.get("fields")!.stock.grain = 100; // well above what it keeps
    north.places.get("mill")!.stock.grain = 0; north.places.get("fields")!.stock.grain = 0; // a hungry mill with nothing local
    const offers = south.cargoOffers(); expect(offers.find((o) => o.item === "grain")!.qty).toBe(40);
    const wants = north.cargoWants(); expect(wants.find((w) => w.item === "grain")!.qty).toBe(12);
    const coinsNorthBefore = [...north.places.values()].reduce((s, p) => s + p.treasury, 0), coinsSouthBefore = [...south.places.values()].reduce((s, p) => s + p.treasury, 0);
    const load = offers.filter((o) => o.item === "grain").map((o) => ({ ...o, qty: Math.min(o.qty, 12) }));
    const taken = north.receive(load, "the south island"); expect(taken).toEqual([{ item: "grain", qty: 12 }]);
    south.ship(load, "the north island");
    expect(north.places.get("mill")!.stock.grain).toBe(12); expect(south.places.get("fields")!.stock.grain).toBe(88);
    const coinsNorthAfter = [...north.places.values()].reduce((s, p) => s + p.treasury, 0), coinsSouthAfter = [...south.places.values()].reduce((s, p) => s + p.treasury, 0);
    expect(coinsNorthBefore - coinsNorthAfter).toBe(12); expect(coinsSouthAfter - coinsSouthBefore).toBe(12);
    expect(north.burned).toBe(12); expect(south.minted).toBe(12);
    expect(north.events.some((e) => e.kind === "boat.cargo" && /brought 12 grain/.test(e.text))).toBe(true);
    // a shelf that cannot pay takes nothing
    north.places.get("mill")!.treasury = 0; north.places.get("mill")!.stock.grain = 0;
    expect(north.receive(load, "the south island")).toEqual([]);
  });
});
