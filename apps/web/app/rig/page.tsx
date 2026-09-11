"use client";
import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import { Page, Label } from "@/components/ui";
import { Citizen, lookFor, type Look, type Pose } from "@/components/world/citizen";
import { drawThing, drawStock, DRAWN } from "@/components/world/buildings";

/** The citizen rig, laid out like a model sheet: every part, every pose, and one person walking the length of the harbor. */
export default function Rig() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let app: Application | null = null; let alive = true;
    (async () => {
      const el = host.current!;
      app = new Application();
      await app.init({ background: 0xefede4, resizeTo: el, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
      if (!alive) { app.destroy(true); return; }
      el.appendChild(app.canvas);
      const stage = new Container(); app.stage.addChild(stage);
      const S = 1.6; // model-sheet scale
      const rigs: { c: Citizen; walker?: boolean }[] = [];
      const row = (y: number, looks: Look[], pose: Pose) => looks.forEach((l, i) => { const c = new Citizen(l); c.scale.set(S); c.position.set(70 + i * 110, y); c.setPose(pose); stage.addChild(c); rigs.push({ c }); });
      const base: Look = { build: "Average", hair: "Bob", hat: "None", carrying: "Nothing", top: "Teal", bottom: "Sage", coral: "None" };
      // hair and hats
      row(150, (["Short dark", "Bob", "Curls", "Bun", "Grey", "Under a hat"] as const).map((hair) => ({ ...base, hair, hat: hair === "Under a hat" ? "Knit cap" : "None" })), "idle");
      row(150, (["Knit cap", "Wide brim", "Baker's cap", "Headscarf"] as const).map((hat, i): Look => ({ ...base, hat, coral: i % 2 ? "Hat band" : "None", top: (["Sage", "Cream", "Sand", "Kelp"] as const)[i]! })), "idle");
      // shift the second group to the right of the first
      rigs.slice(6).forEach((r, i) => r.c.position.set(70 + (6 + i) * 110, 150));
      // builds and carrying
      row(300, (["Slight", "Average", "Sturdy", "Tall"] as const).map((build, i) => ({ ...base, build, top: (["Teal", "Sage", "Kelp", "Cream"] as const)[i]!, bottom: (["Kelp", "Sand", "Sage", "Teal"] as const)[i]! })), "idle");
      const carries: Look[] = (["Suitcase", "Satchel", "Basket", "Tool bag", "Suitcase"] as const).map((carrying, i) => ({ ...base, carrying, coral: (i === 4 ? "Suitcase" : i === 1 ? "Scarf" : i === 2 ? "Buttons" : "None") as Look["coral"], hair: (["Short dark", "Curls", "Bun", "Grey", "Bob"] as const)[i]! }));
      carries.forEach((l, i) => { const c = new Citizen(l); c.scale.set(S); c.position.set(70 + (4 + i) * 110, 300); c.setPose("idle"); stage.addChild(c); rigs.push({ c }); });
      // poses
      const poses: Pose[] = ["idle", "walk", "run", "talk", "work", "sit", "sleep"];
      poses.forEach((pose, i) => { const c = new Citizen({ ...base, hair: "Short dark", carrying: "Tool bag", top: "Kelp", bottom: "Sand", build: "Sturdy" }); c.scale.set(S); c.position.set(70 + i * 110, 450); c.setPose(pose); stage.addChild(c); rigs.push({ c }); });
      // facings and faces: toward you, away, side on; hungry, glad, grieving, mid-word
      const faces: [string, (c: Citizen) => void][] = [["front", (c) => c.facing4("front")], ["back", (c) => c.facing4("back")], ["hungry", (c) => c.mood({ hunger: 1 })], ["glad", (c) => c.mood({ joy: 1 })], ["grieving", (c) => c.mood({ grief: 1 })], ["talking", (c) => { c.setPose("talk"); c.lookAt(60); }]];
      faces.forEach(([label, apply], i) => { const c = new Citizen({ ...base, hair: "Bob", top: "Sage", bottom: "Kelp" }); c.scale.set(S); c.position.set(780 + i * 80, 450); c.setPose("idle"); apply(c); stage.addChild(c); rigs.push({ c }); const t = new Text({ text: label, style: { fontFamily: "Nunito Sans, sans-serif", fontSize: 11, fontWeight: "700", fill: 0x6f7a78 } }); t.anchor.set(0.5, 0); t.position.set(780 + i * 80, 458); stage.addChild(t); });
      // the walk: one citizen crossing the sheet and back
      const pier = new Graphics(); pier.roundRect(40, 560, 1000, 14, 7).fill(0xf7f5ee).stroke({ width: 1.6, color: 0x1e2a2b }); stage.addChild(pier);
      const walker = new Citizen(lookFor("Tomo Radić", { build: "Sturdy", hair: "Short dark", carrying: "Tool bag", top: "Kelp", bottom: "Sage" })); walker.scale.set(S); walker.position.set(80, 562); walker.setPose("walk"); stage.addChild(walker); rigs.push({ c: walker, walker: true });
      // a dozen strangers from names alone, so no two house citizens look the same
      ["Rosa Vidal", "Petar Ilić", "Ivana Horvat", "Luka Babić", "Ana Perić", "Vesna Marić", "Teodor Ilić", "Marko Petrić", "Katarina Jurić", "Goran Šimić", "Mara Tomić", "Jure Barić"].forEach((n, i) => { const c = new Citizen(lookFor(n, null)); c.scale.set(S); c.position.set(70 + i * 90, 700); c.setPose(i % 3 === 0 ? "talk" : "idle"); stage.addChild(c); rigs.push({ c }); });
      // every building and prop, at the world's scale
      const names = [...DRAWN]; let bx = 90, by = 990, rowH = 0;
      for (const n of names) { const d = drawThing(n); if (!d) continue; const wpx = d.w * 1.1 + 30; if (bx + wpx > 1180) { bx = 90; by += rowH + 40; rowH = 0; } d.c.scale.set(1.1); d.c.position.set(bx + d.w * 0.55, by); stage.addChild(d.c); const t = new Text({ text: n, style: { fontFamily: "Nunito Sans, sans-serif", fontSize: 11, fontWeight: "700", fill: 0x6f7a78 } }); t.anchor.set(0.5, 0); t.position.set(bx + d.w * 0.55, by + 6); stage.addChild(t); bx += wpx; rowH = Math.max(rowH, 150); }
      // the shelves as the street shows them: full, and half empty
      const SHELVES: [string, Record<string, number>][] = [["stall", { bread: 12, fish: 9, apples: 6 }], ["stall", { bread: 3, fish: 0, apples: 0 }], ["sawpit", { planks: 24, timber: 8 }], ["sawpit", { planks: 4 }], ["mill", { flour: 30, grain: 12 }], ["fishhouse", { fish: 14 }], ["tree-large", { timber: 14 }]];
      bx = 90; by += rowH + 60; rowH = 0;
      for (const [sprite, stock] of SHELVES) { const d = drawThing(sprite); if (!d) continue; const wpx = d.w * 1.1 + 30; if (bx + wpx > 1180) { bx = 90; by += rowH + 40; rowH = 0; } d.c.scale.set(1.1); d.c.position.set(bx + d.w * 0.55, by); stage.addChild(d.c); const st = drawStock(sprite, stock); if (st) { st.scale.set(1.1); st.position.set(bx + d.w * 0.55, by); stage.addChild(st); } const t = new Text({ text: Object.entries(stock).map(([k, v]) => `${v} ${k}`).join(" · "), style: { fontFamily: "Nunito Sans, sans-serif", fontSize: 11, fontWeight: "700", fill: 0x6f7a78 } }); t.anchor.set(0.5, 0); t.position.set(bx + d.w * 0.55, by + 6); stage.addChild(t); bx += wpx; rowH = Math.max(rowH, 150); }
      // a building the island invented: Recraft's SVG, parsed straight into a Graphics context, footed and scaled like the drawn ones
      try {
        const svg = await (await fetch("/generated/boathouse.svg")).text();
        const g = new Graphics(); g.svg(svg); const b = g.getLocalBounds(); const target = 120; const sc = target / b.width;
        const gx = 1080, gy = 300;
        g.scale.set(sc); g.position.set(gx - (b.x + b.width / 2) * sc, gy - (b.y + b.height) * sc); stage.addChild(g);
        const t = new Text({ text: "boathouse · generated by Recraft, parsed as SVG", style: { fontFamily: "Nunito Sans, sans-serif", fontSize: 11, fontWeight: "700", fill: 0x6f7a78 } }); t.anchor.set(0.5, 0); t.position.set(gx, gy + 6); stage.addChild(t);
      } catch (e) { console.warn("generated building did not load", e); }
      let dir = 1;
      app.ticker.add(() => {
        const t = performance.now() / 1000;
        for (const r of rigs) { if (r.walker) { r.c.position.x += dir * 1.4; if (r.c.position.x > 1020) dir = -1; if (r.c.position.x < 60) dir = 1; r.c.face(dir as 1 | -1); } r.c.update(t); }
      });
    })();
    return () => { alive = false; try { app?.destroy(true); } catch {} };
  }, []);
  return (
    <Page>
      <div className="flex flex-col gap-2 pt-4"><Label>The citizen rig · model sheet</Label><h1 className="display text-[32px] sm:text-[40px] font-bold">One body, drawn from parts.</h1><p className="text-[17px] text-ink2 max-w-[70ch]">Hair and hats, builds and what they carry, the seven poses and the faces, one person walking the pier, twelve house citizens whose looks come from their names alone, and every building and prop on the island in the same hand, with the shelves full and half empty.</p></div>
      <div ref={host} className="relative w-full h-[2150px] rounded-[28px] overflow-hidden bg-sand" />
    </Page>
  );
}
