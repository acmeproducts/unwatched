"use client";
import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { WS, type PublicAgent, type TownEvent, type Clock } from "@/lib/api";

/**
 * The island, drawn by PixiJS from the live event stream, in the Tide style:
 * real vector-drawn buildings, trees, props and citizens rendered as sprites on a hand-laid map.
 * Labels and bubbles are HTML positioned over the canvas so they use the real fonts.
 */
const W = 1700, H = 1100;
const C = { water: 0xdcebe3, waterDeep: 0xcfe3d8, sand: 0xefede4, shell: 0xf7f5ee, grass: 0xd5e6da, sage: 0xb9d9c6, teal: 0x1f5f5b, kelp: 0x1e2a2b, coral: 0xe8735a };

/** Where each place stands: its foot point, its sprite, how wide it should be, and where people gather. */
const PLACES: Record<string, { x: number; y: number; sprite: string; w: number; name: string; gather: { x: number; y: number; w: number } }> = {
  harbor:    { x: 330, y: 700, sprite: "harbor-office", w: 150, name: "the harbor",        gather: { x: 250, y: 760, w: 220 } },
  inn:       { x: 560, y: 560, sprite: "inn",           w: 240, name: "the harbor inn",    gather: { x: 480, y: 610, w: 200 } },
  market:    { x: 880, y: 620, sprite: "stall",         w: 170, name: "the market square", gather: { x: 800, y: 680, w: 260 } },
  bakery:    { x: 860, y: 380, sprite: "bakery",        w: 200, name: "Ilić's bakery",     gather: { x: 790, y: 420, w: 180 } },
  chandlery: { x: 620, y: 800, sprite: "chandlery",     w: 150, name: "the chandlery",     gather: { x: 560, y: 840, w: 160 } },
  tavern:    { x: 1140, y: 700, sprite: "tavern",       w: 190, name: "the tavern",        gather: { x: 1060, y: 740, w: 200 } },
  council:   { x: 1150, y: 430, sprite: "council",      w: 220, name: "the council hall",  gather: { x: 1080, y: 470, w: 200 } },
  hill:      { x: 1330, y: 560, sprite: "well",         w: 90,  name: "the hill road",     gather: { x: 1280, y: 600, w: 160 } },
  mill:      { x: 1440, y: 300, sprite: "mill",         w: 200, name: "the mill",          gather: { x: 1380, y: 340, w: 160 } },
  fields:    { x: 1520, y: 560, sprite: "field",        w: 230, name: "the hill fields",   gather: { x: 1450, y: 640, w: 220 } },
  boatshed:  { x: 250, y: 880, sprite: "boatshed",      w: 190, name: "the boat shed",     gather: { x: 200, y: 930, w: 180 } },
};
const ROADS: [string, string][] = [["harbor", "inn"], ["harbor", "market"], ["harbor", "chandlery"], ["harbor", "boatshed"], ["inn", "market"], ["market", "bakery"], ["market", "chandlery"], ["market", "tavern"], ["market", "council"], ["market", "hill"], ["hill", "mill"], ["hill", "fields"], ["mill", "fields"]];
const DECOR: { sprite: string; x: number; y: number; w: number; flip?: boolean }[] = [
  { sprite: "pier", x: 150, y: 735, w: 260 }, { sprite: "rowboat", x: 170, y: 800, w: 90 }, { sprite: "crates", x: 420, y: 720, w: 80 }, { sprite: "lamp", x: 470, y: 690, w: 30 },
  { sprite: "bench", x: 660, y: 600, w: 70 }, { sprite: "lamp", x: 720, y: 640, w: 30 }, { sprite: "tree-large", x: 440, y: 480, w: 160 }, { sprite: "tree-small", x: 700, y: 470, w: 100 },
  { sprite: "bush", x: 760, y: 560, w: 70 }, { sprite: "cottage", x: 700, y: 330, w: 150 }, { sprite: "cottage", x: 1010, y: 300, w: 150, flip: true }, { sprite: "tree-large", x: 1280, y: 260, w: 160 },
  { sprite: "tree-small", x: 1000, y: 780, w: 100 }, { sprite: "bush", x: 1230, y: 770, w: 70 }, { sprite: "lamp", x: 990, y: 660, w: 30 }, { sprite: "bench", x: 1240, y: 640, w: 70 },
  { sprite: "fence", x: 1560, y: 680, w: 140 }, { sprite: "field", x: 1300, y: 720, w: 200 }, { sprite: "tree-small", x: 1600, y: 420, w: 100 }, { sprite: "rock", x: 1200, y: 880, w: 60 },
  { sprite: "bush", x: 380, y: 940, w: 70 }, { sprite: "tree-large", x: 900, y: 900, w: 150 }, { sprite: "searocks", x: 80, y: 980, w: 110 }, { sprite: "searocks", x: 1640, y: 900, w: 110 },
  { sprite: "crates", x: 560, y: 870, w: 70 }, { sprite: "lamp", x: 1130, y: 500, w: 30 }, { sprite: "tree-small", x: 300, y: 560, w: 100 },
];
const CHARS = ["char-mira", "char-innkeeper", "char-baker", "char-farmer", "char-elder", "char-young", "char-banker", "char-constable", "char-teen", "char-fisherman", "char-painter", "char-priest"];
const ROLE: [RegExp, string][] = [[/rosa|dora/i, "char-innkeeper"], [/petar/i, "char-baker"], [/luka|franjo|goran/i, "char-farmer"], [/mara|vesna/i, "char-elder"], [/marko|jure|bruno/i, "char-young"], [/davor|ivana|teodor/i, "char-banker"], [/katarina/i, "char-constable"], [/iva /i, "char-teen"], [/nikola/i, "char-fisherman"], [/ema|ana /i, "char-painter"], [/stjepan/i, "char-priest"]];
function charFor(a: PublicAgent): string {
  if (a.ownerId) return "char-mira";
  for (const [re, s] of ROLE) if (re.test(a.name + " ")) return s;
  let h = 0; for (const ch of a.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CHARS[1 + (h % (CHARS.length - 1))]!;
}

type Fig = { id: string; g: Container; sprite: Sprite; x: number; y: number; tx: number; ty: number; place: string; asleep: boolean; mine: boolean; name: string };

export function World({ mineId, onSelect, view }: { mineId: string | null; onSelect: (a: PublicAgent | null) => void; view: "street" | "map" }) {
  const host = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<{ id: string; name: string; x: number; y: number; mine: boolean; bubble?: string }[]>([]);
  const [feed, setFeed] = useState<TownEvent[]>([]);
  const [clock, setClock] = useState<Clock | null>(null);
  const [ready, setReady] = useState(false);
  const figs = useRef(new Map<string, Fig>());
  const agents = useRef(new Map<string, PublicAgent>());
  const bubbles = useRef(new Map<string, { text: string; until: number }>());
  const camera = useRef({ x: 0, y: 0, zoom: 1, follow: mineId as string | null });
  const seatOf = useRef(new Map<string, number>());
  const viewRef = useRef(view); viewRef.current = view;
  const clockRef = useRef<Clock | null>(null);

  useEffect(() => {
    let app: Application | null = null; let ws: WebSocket | null = null; let alive = true; let inited = false;
    (async () => {
      const el = host.current!;
      const manifest = await (await fetch("/world/manifest.json")).json() as Record<string, { w: number; h: number }>;
      const names = Object.keys(manifest);
      const textures = (await Assets.load(names.map((n) => ({ alias: n, src: `/world/png/${n}.png` })))) as unknown as Record<string, Texture>;
      const tex = (n: string) => textures[n] ?? Texture.WHITE;
      if (!alive) return;
      app = new Application();
      await app.init({ background: C.water, resizeTo: el, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
      inited = true;
      if (!alive) { try { app.destroy(true); } catch {} return; }
      el.appendChild(app.canvas);
      const world = new Container(); app.stage.addChild(world);

      // sea, with slow ripples
      const sea = new Graphics(); world.addChild(sea);
      const ripples: Graphics = new Graphics(); world.addChild(ripples);
      // island
      const ground = new Graphics();
      ground.moveTo(120, 640).bezierCurveTo(140, 420, 420, 260, 760, 240).bezierCurveTo(1100, 210, 1400, 180, 1600, 320).bezierCurveTo(1720, 440, 1700, 700, 1560, 820).bezierCurveTo(1400, 960, 1000, 1020, 620, 990).bezierCurveTo(360, 970, 100, 880, 120, 640).closePath().fill(C.grass);
      ground.moveTo(200, 660).bezierCurveTo(230, 500, 460, 340, 780, 320).bezierCurveTo(1060, 300, 1360, 280, 1520, 400).bezierCurveTo(1620, 500, 1600, 700, 1480, 790).bezierCurveTo(1330, 900, 980, 950, 640, 920).bezierCurveTo(400, 900, 180, 820, 200, 660).closePath().fill(C.sand);
      for (const [a, b] of ROADS) { const A = PLACES[a]!, B = PLACES[b]!; ground.moveTo(A.gather.x + A.gather.w / 2, A.gather.y).lineTo(B.gather.x + B.gather.w / 2, B.gather.y).stroke({ width: 16, color: C.shell, cap: "round" }); }
      world.addChild(ground);

      // everything with a foot on the ground sorts by y
      const scene = new Container(); scene.sortableChildren = true; world.addChild(scene);
      const put = (name: string, x: number, y: number, w: number, flip = false) => {
        const m = manifest[name]; if (!m) return null;
        const s = new Sprite(tex(name)); s.anchor.set(0.5, 1); s.scale.set(w / m.w); if (flip) s.scale.x *= -1; s.position.set(x, y); s.zIndex = y; scene.addChild(s); return s;
      };
      for (const [id, p] of Object.entries(PLACES)) put(p.sprite, p.x, p.y, p.w);
      for (const d of DECOR) put(d.sprite, d.x, d.y, d.w, d.flip);
      const ferry = put("ferry", 140, 700, 170)!; ferry.zIndex = 650; let ferryTarget = 140;
      // place names
      const nameStyle = new TextStyle({ fontFamily: "Nunito Sans, sans-serif", fontSize: 12, fontWeight: "700", fill: 0x6f7a78, letterSpacing: 1.2 });
      for (const p of Object.values(PLACES)) { const t = new Text({ text: p.name.replace(/^the /, "").toUpperCase(), style: nameStyle }); t.anchor.set(0.5, 0); t.position.set(p.x, p.y + 6); t.zIndex = 100000; scene.addChild(t); }

      // weather and time
      const rain = new Graphics(); rain.zIndex = 200000; scene.addChild(rain);
      const night = new Graphics(); night.rect(-2000, -2000, W + 4000, H + 4000).fill(C.kelp); night.alpha = 0; world.addChild(night);
      const lamps = new Graphics(); lamps.zIndex = 150000; scene.addChild(lamps);

      const spot = (place: string, seat: number) => { const p = PLACES[place] ?? PLACES.market!; const g = p.gather; const cols = 5; return { x: g.x + 20 + (seat % cols) * ((g.w - 40) / (cols - 1)), y: g.y + Math.floor(seat / cols) * 26 }; };
      const ensure = (a: PublicAgent) => {
        agents.current.set(a.id, a);
        let f = figs.current.get(a.id);
        if (!f) {
          const g = new Container();
          const s = new Sprite(tex(charFor(a))); const m = manifest[charFor(a)] ?? { w: 400, h: 600 };
          s.anchor.set(0.5, 1); s.scale.set(72 / m.h); g.addChild(s);
          g.eventMode = "static"; g.cursor = "pointer"; g.hitArea = { contains: (x: number, y: number) => x > -20 && x < 20 && y > -80 && y < 0 } as never;
          g.on("pointertap", () => onSelect(agents.current.get(a.id) ?? null));
          scene.addChild(g);
          const seat = seatOf.current.get(a.location) ?? 0; seatOf.current.set(a.location, (seat + 1) % 10);
          const sp = spot(a.location, seat);
          f = { id: a.id, g, sprite: s, x: sp.x, y: sp.y, tx: sp.x, ty: sp.y, place: a.location, asleep: a.asleep, mine: a.id === mineId, name: a.name };
          figs.current.set(a.id, f);
        }
        return f;
      };
      const moveTo = (id: string, place: string) => { const f = figs.current.get(id); if (!f) return; const seat = seatOf.current.get(place) ?? 0; seatOf.current.set(place, (seat + 1) % 10); const sp = spot(place, seat); f.tx = sp.x; f.ty = sp.y; f.place = place; const a = agents.current.get(id); if (a) { a.location = place; a.place = PLACES[place]?.name ?? place; } };

      ws = new WebSocket(WS);
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data as string) as { type: string; agents?: PublicAgent[]; recent?: TownEvent[]; event?: TownEvent; clock?: Clock };
        if (msg.type === "hello") { for (const a of msg.agents ?? []) ensure(a); setFeed((msg.recent ?? []).filter((e) => e.importance >= 0.1 && e.kind !== "agent.move").slice(-12).reverse()); if (msg.clock) { setClock(msg.clock); clockRef.current = msg.clock; } setReady(true); }
        if (msg.type === "clock" && msg.clock) { setClock(msg.clock); clockRef.current = msg.clock; }
        if (msg.type === "event" && msg.event) {
          const e = msg.event;
          if (e.kind === "agent.move" && e.place) moveTo(e.actors[0]!, e.place);
          if (e.kind === "agent.sleep") { const f = figs.current.get(e.actors[0]!); if (f) f.asleep = true; }
          if (e.kind === "agent.wake") { const f = figs.current.get(e.actors[0]!); if (f) f.asleep = false; }
          if (e.kind === "agent.say") { const q = /“([^”]+)”/.exec(e.text)?.[1]; if (q) bubbles.current.set(e.actors[0]!, { text: q, until: Date.now() + 7000 }); }
          if (e.kind === "conversation") { const lines = (e.payload?.lines as { speaker: string; text: string }[] | undefined) ?? []; lines.forEach((l, i) => setTimeout(() => bubbles.current.set(l.speaker, { text: l.text, until: Date.now() + 5500 }), i * 2600)); }
          if (e.kind === "ferry.dock") { ferry.position.x = -200; ferryTarget = 140; }
          if (e.kind === "ferry.depart") ferryTarget = -260;
          if (e.kind === "agent.arrive") { void fetch(`${WS.replace(/^ws/, "http").replace("/stream", "")}/api/agents/${e.actors[0]}`).then((r) => r.json()).then((a: PublicAgent) => { if (a?.id) ensure(a); }); }
          if (e.importance >= 0.1 && e.kind !== "agent.move") setFeed((f) => [e, ...f].slice(0, 12));
        }
      };

      let tick = 0;
      app.ticker.add(() => {
        if (!app) return; tick++;
        const Wd = app.screen.width, Hd = app.screen.height; const cam = camera.current;
        const zoom = viewRef.current === "map" ? Math.min(Wd / W, Hd / H) : 1.05;
        cam.zoom += (zoom - cam.zoom) * 0.08;
        let fx = W / 2, fy = H / 2 + 40;
        if (viewRef.current === "street" && cam.follow) { const f = figs.current.get(cam.follow); if (f) { fx = f.x; fy = f.y - 60; } }
        const tx = Wd / 2 - fx * cam.zoom, ty = Hd / 2 - fy * cam.zoom;
        cam.x += (tx - cam.x) * 0.08; cam.y += (ty - cam.y) * 0.08;
        world.scale.set(cam.zoom); world.position.set(cam.x, cam.y);
        // sea
        sea.clear(); sea.rect(-2000, -2000, W + 4000, H + 4000).fill(C.water);
        if (tick % 6 === 0) { ripples.clear(); for (let i = 0; i < 28; i++) { const yy = ((i * 97 + tick * 0.4) % (H + 400)) - 200; const xx = ((i * 331) % (W + 600)) - 300 + Math.sin(tick / 90 + i) * 12; ripples.moveTo(xx, yy).lineTo(xx + 60 + (i % 3) * 20, yy).stroke({ width: 3, color: C.waterDeep, cap: "round" }); } }
        // ferry
        ferry.position.x += (ferryTarget - ferry.position.x) * 0.02;
        // weather
        const c = clockRef.current;
        if (tick % 2 === 0) { rain.clear(); if (c && (c.weather === "rain" || c.weather === "storm")) { const n = c.weather === "storm" ? 220 : 110; for (let i = 0; i < n; i++) { const xx = ((i * 137 + tick * 9) % (W + 200)) - 100; const yy = ((i * 251 + tick * 14) % (H + 200)) - 100; rain.moveTo(xx, yy).lineTo(xx - 3, yy + 14).stroke({ width: 1.5, color: C.teal, alpha: 0.35 }); } } }
        const hour = c ? c.hour + (c.minute % 60) / 60 : 12;
        const nightAmt = hour < 5 ? 0.38 : hour < 7 ? 0.38 * (7 - hour) / 2 : hour < 19 ? 0 : hour < 21 ? 0.38 * (hour - 19) / 2 : 0.38;
        night.alpha += (nightAmt - night.alpha) * 0.05;
        if (tick % 10 === 0) { lamps.clear(); if (night.alpha > 0.05) for (const d of DECOR) if (d.sprite === "lamp") lamps.circle(d.x, d.y - 24, 26).fill({ color: 0xfff2c2, alpha: 0.35 * (night.alpha / 0.38) }); }
        // people
        const now = Date.now(); const next: typeof labels = [];
        for (const f of figs.current.values()) {
          const moving = Math.abs(f.tx - f.x) > 1 || Math.abs(f.ty - f.y) > 1;
          f.x += (f.tx - f.x) * 0.05; f.y += (f.ty - f.y) * 0.05;
          f.g.position.set(f.x, f.y + (moving ? Math.abs(Math.sin(now / 120 + f.x)) * -3 : 0));
          if (moving) f.sprite.scale.x = Math.abs(f.sprite.scale.x) * (f.tx < f.x ? -1 : 1);
          f.g.alpha = f.asleep ? 0.3 : 1; f.g.zIndex = f.y;
          const b = bubbles.current.get(f.id); if (b && b.until < now) bubbles.current.delete(f.id);
          next.push({ id: f.id, name: f.name, x: f.x * cam.zoom + cam.x, y: (f.y - 78) * cam.zoom + cam.y, mine: f.mine, ...(b ? { bubble: b.text } : {}) });
        }
        if (tick % 2 === 0) setLabels(next);
      });
    })();
    return () => { alive = false; ws?.close(); if (inited) { try { app?.destroy(true); } catch {} } figs.current.clear(); seatOf.current.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineId]);

  useEffect(() => { camera.current.follow = mineId; }, [mineId]);
  const z = camera.current.zoom;
  const showLabels = view === "street" || z > 0.6;

  return (
    <div className="absolute inset-0 overflow-hidden rounded-[28px] bg-glass">
      <div ref={host} className="absolute inset-0" />
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-teal font-bold">Crossing to the island…</div>}
      <div className="absolute inset-0 pointer-events-none">
        {labels.map((l) => (
          <div key={l.id} className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-full" style={{ left: l.x, top: l.y }}>
            {l.bubble && <div className="bg-glass px-3 py-2 italic text-[13px] max-w-[260px] leading-[1.3] pointer-events-auto shadow-none" style={{ borderRadius: "16px 16px 16px 4px" }}>“{l.bubble}”</div>}
            <div className={`crossfade rounded-xl px-2 text-xs font-bold ${l.mine ? "bg-coral text-sand" : "bg-shell text-teal"}`} style={{ opacity: showLabels || l.mine || l.bubble ? 1 : 0 }}>{l.name.split(" ")[0]}{l.mine ? " · you" : ""}</div>
          </div>
        ))}
      </div>
      <div className="absolute left-3 bottom-3 sm:left-6 sm:bottom-6 bg-shell rounded-card p-3 sm:p-4 w-[calc(100%-24px)] sm:w-[330px] flex flex-col gap-1.5 pointer-events-auto max-h-[38%] sm:max-h-none overflow-hidden">
        <div className="label">Just now{clock ? ` · day ${clock.day} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute % 60).padStart(2, "0")} · ${clock.weather}` : ""}</div>
        {feed.slice(0, 6).map((e) => <div key={e.id} className="grid gap-x-2.5 items-center" style={{ gridTemplateColumns: "44px 14px 1fr" }}><span className="text-[12px] text-drift tabular">{String(Math.floor((e.t % 1440) / 60)).padStart(2, "0")}:{String(e.t % 60).padStart(2, "0")}</span><span className="rounded-full" style={{ width: e.importance >= 0.45 ? 10 : 7, height: e.importance >= 0.45 ? 10 : 7, background: e.importance >= 0.45 ? "#E8735A" : "#1F5F5B" }} /><span className={`text-[13px] leading-tight line-clamp-2 ${e.importance >= 0.45 ? "font-semibold" : ""}`}>{e.text}</span></div>)}
        {feed.length === 0 && <div className="text-sm text-drift">A quiet minute on the island.</div>}
      </div>
    </div>
  );
}
