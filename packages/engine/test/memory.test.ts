import { describe, it, expect } from "vitest";
import { age, drift } from "../src/index.ts";
import type { Memory } from "../src/index.ts";

describe("memory that ages", () => {
  it("what did not matter fades and is gone; what one thought about oneself wears slowest", () => {
    let mem: Memory[] = [{ t: 0, text: "Bought bread for 1.", importance: 0.1, kind: "obs" }, { t: 0, text: "I am not the man who boarded.", importance: 0.1, kind: "reflect" }, { t: 0, text: "Heard the mill roof is bad.", importance: 0.5, kind: "rumor" }];
    for (let night = 1; night <= 90; night++) mem = age(mem, night * 1440);
    expect(mem.find((m) => m.kind === "obs")).toBeUndefined();
    const refl = mem.find((m) => m.kind === "reflect")!; expect(refl.importance).toBeGreaterThan(0.06);
    const rumor = mem.find((m) => m.kind === "rumor")!; expect(rumor.importance).toBeLessThan(0.1);
  });
  it("a story drifts between mouths: numbers slip, the teller drops out", () => {
    let seed = 7; const chance = () => { seed = (seed * 16807) % 2147483647; return (seed % 1000) / 1000; };
    const stories = Array.from({ length: 40 }, () => drift("I saw Petar take 12 coins from the till yesterday", chance));
    expect(stories.some((s) => s !== "I saw Petar take 12 coins from the till yesterday")).toBe(true);
    expect(stories.some((s) => /Someone saw/.test(s))).toBe(true);
    expect(stories.some((s) => !/12/.test(s))).toBe(true);
    expect(stories.every((s) => /Petar/.test(s))).toBe(true); // names hold; numbers and tellers do not
  });
});
