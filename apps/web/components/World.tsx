"use client";
import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { WS, type PublicAgent, type TownEvent, type Clock } from "@/lib/api";

/**
 * The world, drawn on a PixiJS canvas from the live event stream.
 * Placeholder sprites: every place is a roofed block, every person is a round-headed figure in Tide colors.
 * Labels and bubbles are HTML positioned over the canvas so they use the real fonts.
 */
const PLACES: Record<string, { x: number; y: number; w: number; h: number; name: string }> = {
  harbor: { x: 160, y: 520, w: 220, h: 90, name: "the harbor" },
  inn: { x: 340, y: 360, w: 150, h: 110, name: "the harbor inn" },
  market: { x: 620, y: 420, w: 220, h: 140, name: "the market square" },
  bakery: { x: 620, y: 250, w: 120, h: 90, name: "Ilić's bakery" },
  chandlery: { x: 440, y: 560, w: 130, h: 80, name: "the chandlery" },
  tavern: { x: 900, y: 500, w: 130, h: 90, name: "the tavern" },
  council: { x: 900, y: 320, w: 150, h: 100, name: "the council hall" },
  hill: { x: 1080, y: 380, w: 120, h: 60, name: "the hill road" },
  mill: { x: 1180, y: 200, w: 110, h: 100, name: "the mill" },
  fields: { x: 1260, y: 360, w: 200, h: 140, name: "the hill fields" },
  boatshed: { x: 120, y: 660, w: 140, h: 70, name: "the boat shed" },
};
const ROADS: [string, string][] = [["harbor", "inn"], ["harbor", "market"], ["harbor", "chandlery"], ["harbor", "boatshed"], ["inn", "market"], ["market", "bakery"], ["market", "chandlery"], ["market", "tavern"], ["market", "council"], ["market", "hill"], ["hill", "mill"], ["hill", "fields"], ["mill", "fields"]];
const C = { sand: 0xefede4, shell: 0xf7f5ee, glass: 0xdcebe3, teal: 0x1f5f5b, coral: 0xe8735a, kelp: 0x1e2a2b, sage: 0xb9d9c6, line: 0xe4e0d3 };
const WORLD_W = 1520, WORLD_H = 800;

type Fig = { id: string; name: string; g: Container; x: number; y: number; tx: number; ty: number; place: string; asleep: boolean; mine: boolean; seat: number };

export function World({ mineId, onSelect, view }: { mineId: string | null; onSelect: (a: PublicAgent | null) => void; view: "street" | "map" }) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<{ id: string; name: string; x: number; y: number; mine: boolean; bubble?: string }[]>([]);
  const [feed, setFeed] = useState<TownEvent[]>([]);
  const [clock, setClock] = useState<Clock | null>(null);
  const figs = useRef(new Map<string, Fig>());
  const agents = useRef(new Map<string, PublicAgent>());
  const bubbles = useRef(new Map<string, { text: string; until: number }>());
  const camera = useRef({ x: 0, y: 0, zoom: 1, follow: mineId as string | null });
  const seatOf = useRef(new Map<string, number>());

  useEffect(() => {
    let app: Application | null = null; let ws: WebSocket | null = null; let alive = true; let inited = false;
    (async () => {
      const el = host.current!;
      app = new Application();
      await app.init({ background: C.glass, resizeTo: el, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
      inited = true;
      if (!alive) { try { app.destroy(true); } catch {} return; }
      el.appendChild(app.canvas);
      const world = new Container(); app.stage.addChild(world);

      // ground
      const ground = new Graphics();
      ground.roundRect(60, 120, 1400, 620, 180).fill(C.sand);
      for (const [a, b] of ROADS) { const A = PLACES[a]!, B = PLACES[b]!; ground.moveTo(A.x + A.w / 2, A.y + A.h / 2).lineTo(B.x + B.w / 2, B.y + B.h / 2).stroke({ width: 10, color: C.shell }); }
      // pier
      ground.rect(60, 555, 110, 16).fill(C.teal);
      world.addChild(ground);
      // places
      const placeLayer = new Container(); world.addChild(placeLayer);
      const placeStyle = new TextStyle({ fontFamily: "Nunito Sans, sans-serif", fontSize: 12, fontWeight: "700", fill: 0x6f7a78, letterSpacing: 1.2 });
      for (const [id, p] of Object.entries(PLACES)) {
        const g = new Graphics();
        if (id === "fields") { g.roundRect(p.x, p.y, p.w, p.h, 30).fill(C.sage); for (let i = 0; i < 5; i++) g.moveTo(p.x + 20, p.y + 20 + i * 24).lineTo(p.x + p.w - 20, p.y + 20 + i * 24).stroke({ width: 2, color: C.teal, alpha: 0.5 }); }
        else if (id === "hill" || id === "harbor") { g.roundRect(p.x, p.y, p.w, p.h, 20).fill(C.shell); }
        else { g.roundRect(p.x, p.y + 18, p.w, p.h - 18, 10).fill(C.shell).stroke({ width: 2, color: C.kelp, alpha: 0.6 }); g.moveTo(p.x - 6, p.y + 20).lineTo(p.x + p.w / 2, p.y - 6).lineTo(p.x + p.w + 6, p.y + 20).closePath().fill(C.teal); g.roundRect(p.x + p.w / 2 - 9, p.y + p.h - 26, 18, 26, 4).fill(C.sage); }
        placeLayer.addChild(g);
        const t = new Text({ text: p.name.replace(/^the /, "").toUpperCase(), style: placeStyle }); t.x = p.x; t.y = p.y + p.h + 6; placeLayer.addChild(t);
      }
      const people = new Container(); world.addChild(people);

      const spot = (place: string, seat: number) => { const p = PLACES[place] ?? PLACES.market!; const cols = 4; return { x: p.x + 24 + (seat % cols) * ((p.w - 48) / (cols - 1 || 1)), y: p.y + p.h - 4 - Math.floor(seat / cols) * 22 }; };
      const ensure = (a: PublicAgent) => {
        agents.current.set(a.id, a);
        let f = figs.current.get(a.id);
        if (!f) {
          const g = new Container();
          const body = new Graphics(); const mine = a.id === mineId;
          const top = mine ? C.coral : [C.teal, C.sage, C.kelp, C.shell][a.name.length % 4]!;
          body.roundRect(-9, -30, 18, 22, 6).fill(top).stroke({ width: 2, color: C.kelp });
          body.circle(0, -38, 9).fill(C.shell).stroke({ width: 2, color: C.kelp });
          body.circle(-3, -39, 1.2).fill(C.kelp); body.circle(3, -39, 1.2).fill(C.kelp);
          body.roundRect(-8, -8, 7, 8, 2).fill(C.kelp); body.roundRect(1, -8, 7, 8, 2).fill(C.kelp);
          g.addChild(body); g.eventMode = "static"; g.cursor = "pointer";
          g.on("pointertap", () => onSelect(agents.current.get(a.id) ?? null));
          people.addChild(g);
          const seat = seatOf.current.get(a.location) ?? 0; seatOf.current.set(a.location, seat + 1);
          const s = spot(a.location, seat);
          f = { id: a.id, name: a.name, g, x: s.x, y: s.y, tx: s.x, ty: s.y, place: a.location, asleep: a.asleep, mine, seat };
          figs.current.set(a.id, f);
        }
        return f;
      };
      const moveTo = (id: string, place: string) => { const f = figs.current.get(id); if (!f) return; const seat = seatOf.current.get(place) ?? 0; seatOf.current.set(place, (seat + 1) % 12); const s = spot(place, seat); f.tx = s.x; f.ty = s.y; f.place = place; const a = agents.current.get(id); if (a) a.location = place; };

      ws = new WebSocket(WS);
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data as string) as { type: string; agents?: PublicAgent[]; recent?: TownEvent[]; event?: TownEvent; clock?: Clock };
        if (msg.type === "hello") { for (const a of msg.agents ?? []) ensure(a); setFeed((msg.recent ?? []).filter((e) => e.importance >= 0.1).slice(-12).reverse()); setClock(msg.clock ?? null); }
        if (msg.type === "clock" && msg.clock) setClock(msg.clock);
        if (msg.type === "event" && msg.event) {
          const e = msg.event;
          if (e.kind === "agent.move" && e.place) moveTo(e.actors[0]!, e.place);
          if (e.kind === "agent.arrive") { /* new citizen: fetched by the next hello or reload */ }
          if (e.kind === "agent.sleep") { const f = figs.current.get(e.actors[0]!); if (f) f.asleep = true; }
          if (e.kind === "agent.wake") { const f = figs.current.get(e.actors[0]!); if (f) f.asleep = false; }
          if (e.kind === "agent.say") { const q = /“([^”]+)”/.exec(e.text)?.[1]; if (q) bubbles.current.set(e.actors[0]!, { text: q, until: Date.now() + 6000 }); }
          if (e.kind === "conversation") { const lines = (e.payload?.lines as { speaker: string; text: string }[] | undefined) ?? []; lines.forEach((l, i) => setTimeout(() => bubbles.current.set(l.speaker, { text: l.text, until: Date.now() + 5000 }), i * 2200)); }
          if (e.importance >= 0.1 && e.kind !== "agent.move") setFeed((f) => [e, ...f].slice(0, 12));
        }
      };

      app.ticker.add(() => {
        if (!app) return;
        const W = app.screen.width, H = app.screen.height;
        const cam = camera.current;
        const zoom = view === "map" ? Math.min(W / WORLD_W, H / WORLD_H) : 1.15;
        cam.zoom += (zoom - cam.zoom) * 0.08;
        let fx = WORLD_W / 2, fy = WORLD_H / 2;
        if (view === "street" && cam.follow) { const f = figs.current.get(cam.follow); if (f) { fx = f.x; fy = f.y - 40; } }
        const tx = W / 2 - fx * cam.zoom, ty = H / 2 - fy * cam.zoom;
        cam.x += (tx - cam.x) * 0.08; cam.y += (ty - cam.y) * 0.08;
        world.scale.set(cam.zoom); world.position.set(cam.x, cam.y);
        const now = Date.now();
        const next: typeof labels = [];
        for (const f of figs.current.values()) {
          f.x += (f.tx - f.x) * 0.06; f.y += (f.ty - f.y) * 0.06;
          f.g.position.set(f.x, f.y + (f.asleep ? 0 : Math.sin(now / 180 + f.x) * (Math.abs(f.tx - f.x) > 1 ? 2 : 0)));
          f.g.alpha = f.asleep ? 0.35 : 1;
          f.g.zIndex = f.y;
          const b = bubbles.current.get(f.id); if (b && b.until < now) bubbles.current.delete(f.id);
          next.push({ id: f.id, name: f.name, x: f.x * cam.zoom + cam.x, y: (f.y - 50) * cam.zoom + cam.y, mine: f.mine, ...(b ? { bubble: b.text } : {}) });
        }
        people.sortChildren();
        setLabels(next);
      });
      people.sortableChildren = true;
    })();
    return () => { alive = false; ws?.close(); if (inited) { try { app?.destroy(true); } catch {} } figs.current.clear(); seatOf.current.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineId, view]);

  useEffect(() => { camera.current.follow = mineId; }, [mineId]);

  return (
    <div className="absolute inset-0 overflow-hidden rounded-[28px] bg-glass">
      <div ref={host} className="absolute inset-0" />
      <div ref={overlay} className="absolute inset-0 pointer-events-none">
        {labels.map((l) => (
          <div key={l.id} className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-full" style={{ left: l.x, top: l.y }}>
            {l.bubble && <div className="bg-glass px-3 py-2 italic text-[13px] max-w-[240px] leading-[1.3] pointer-events-auto" style={{ borderRadius: "16px 16px 16px 4px" }}>“{l.bubble}”</div>}
            <div className={`rounded-xl px-2 text-xs font-bold ${l.mine ? "bg-coral text-sand" : "bg-shell text-teal"}`}>{l.name.split(" ")[0]}{l.mine ? " · you" : ""}</div>
          </div>
        ))}
      </div>
      <div className="absolute left-6 bottom-6 bg-shell rounded-card p-4 w-[330px] flex flex-col gap-1.5 pointer-events-auto">
        <div className="label">Just now{clock ? ` · day ${clock.day} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute % 60).padStart(2, "0")}` : ""}</div>
        {feed.slice(0, 6).map((e) => <div key={e.id} className="grid gap-x-2.5 items-center" style={{ gridTemplateColumns: "44px 14px 1fr" }}><span className="text-[12px] text-drift tabular">{String(Math.floor((e.t % 1440) / 60)).padStart(2, "0")}:{String(e.t % 60).padStart(2, "0")}</span><span className="rounded-full" style={{ width: e.importance >= 0.45 ? 10 : 7, height: e.importance >= 0.45 ? 10 : 7, background: e.importance >= 0.45 ? "#E8735A" : "#1F5F5B" }} /><span className={`text-[13px] leading-tight line-clamp-2 ${e.importance >= 0.45 ? "font-semibold" : ""}`}>{e.text}</span></div>)}
        {feed.length === 0 && <div className="text-sm text-drift">Waiting for the town…</div>}
      </div>
    </div>
  );
}
