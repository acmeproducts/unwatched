"use client";
import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { API, WS, type PublicAgent, type TownEvent, type Clock } from "@/lib/api";

/**
 * The island, drawn by PixiJS from the live event stream, in the Tide style.
 * The server owns the map: every place arrives with its position, district and sprite, so a house someone builds
 * this morning stands on the canvas by the time the paper prints it. Labels and bubbles are HTML over the canvas.
 */
const C = { water: 0xdcebe3, waterDeep: 0xcfe3d8, sand: 0xefede4, shell: 0xf7f5ee, grass: 0xd5e6da, sage: 0xb9d9c6, teal: 0x1f5f5b, kelp: 0x1e2a2b, coral: 0xe8735a, drift: 0x6f7a78 };

type PlaceView = { id: string; name: string; kind: string; exits: string[]; x: number; y: number; district: string; sprite: string; owner: string | null; site: { what: string; name: string; by: string; done: number; of: number } | null; crowd: number };
type TownView = Clock & { size: { w: number; h: number }; places: PlaceView[] };

/** How wide each sprite stands, in map units. Anything not listed stands 160 wide. */
const WIDTH: Record<string, number> = { "harbor-office": 150, inn: 240, stall: 170, bakery: 200, chandlery: 150, tavern: 190, council: 220, well: 90, mill: 200, field: 230, boatshed: 190, cottage: 150, house: 160, shop: 170, lamp: 30, bench: 70, rowboat: 90, searocks: 110, "tree-large": 160, "tree-small": 100, rock: 60, crates: 80, fence: 140, pier: 260, ferry: 170, bush: 70, fishhouse: 170, chapel: 170, smithy: 160, orchard: 220, sawpit: 150, quarry: 200, lighthouse: 120 };
/** Until a sprite of its own is drawn, a new kind of place borrows a neighbour's. */
const STAND_IN: Record<string, string> = { fishhouse: "boatshed", chapel: "council", smithy: "chandlery", orchard: "field", sawpit: "crates", quarry: "rock", lighthouse: "harbor-office", house: "cottage", shop: "stall" };

const CHARS = ["char-mira", "char-innkeeper", "char-baker", "char-farmer", "char-elder", "char-young", "char-banker", "char-constable", "char-teen", "char-fisherman", "char-painter", "char-priest"];
const ROLE: [RegExp, string][] = [[/rosa|dora/i, "char-innkeeper"], [/petar/i, "char-baker"], [/luka|franjo|goran/i, "char-farmer"], [/mara|vesna/i, "char-elder"], [/marko|jure|bruno/i, "char-young"], [/davor|ivana|teodor/i, "char-banker"], [/katarina/i, "char-constable"], [/iva /i, "char-teen"], [/nikola/i, "char-fisherman"], [/ana/i, "char-painter"], [/stjepan/i, "char-priest"]];
/** An owner's person looks like what they chose at boarding, from the parts the atlas has. */
function charFromLook(look: Record<string, unknown> | null): string | null {
  if (!look) return null;
  const hat = String(look.hat ?? ""), hair = String(look.hair ?? ""), carry = String(look.carrying ?? ""), build = String(look.build ?? "");
  if (/baker/i.test(hat)) return "char-baker";
  if (/knit/i.test(hat)) return "char-fisherman";
  if (/wide/i.test(hat)) return "char-farmer";
  if (/headscarf/i.test(hat)) return "char-elder";
  if (/grey/i.test(hair)) return "char-elder";
  if (/basket/i.test(carry)) return "char-innkeeper";
  if (/tool/i.test(carry)) return build === "Sturdy" ? "char-farmer" : "char-fisherman";
  if (/satchel/i.test(carry)) return "char-banker";
  if (/suitcase/i.test(carry)) return "char-mira";
  if (/curls/i.test(hair)) return "char-painter";
  if (/bun/i.test(hair)) return "char-innkeeper";
  if (/short/i.test(hair)) return "char-young";
  return null;
}
function charFor(a: PublicAgent): string {
  if (a.ownerId) return charFromLook(a.appearance) ?? "char-mira";
  for (const [re, s] of ROLE) if (re.test(a.name + " ")) return s;
  let h = 0; for (const ch of a.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CHARS[1 + (h % (CHARS.length - 1))]!;
}

/** Trees, rocks and props laid by district so the island reads as a landscape and not a diagram. Positions are map units. */
function decorFor(places: PlaceView[]): { sprite: string; x: number; y: number; w?: number; flip?: boolean }[] {
  const at = (id: string) => places.find((p) => p.id === id) ?? { x: 0, y: 0 };
  const h = at("harbor"), m = at("market"), pw = at("pinewood"), q = at("quarry"), f = at("fields"), o = at("orchard"), cv = at("cove"), lh = at("lighthouse"), sh = at("shore"), ln = at("lane");
  const out: { sprite: string; x: number; y: number; w?: number; flip?: boolean }[] = [
    { sprite: "pier", x: h.x - 250, y: h.y + 40 }, { sprite: "rowboat", x: h.x - 230, y: h.y + 110 }, { sprite: "crates", x: h.x + 110, y: h.y + 30 }, { sprite: "lamp", x: h.x + 150, y: h.y - 10 }, { sprite: "searocks", x: h.x - 320, y: h.y + 220 },
    { sprite: "bench", x: m.x - 200, y: m.y + 40 }, { sprite: "lamp", x: m.x - 150, y: m.y + 70 }, { sprite: "lamp", x: m.x + 160, y: m.y + 60 }, { sprite: "bush", x: m.x + 210, y: m.y - 40 }, { sprite: "tree-small", x: m.x - 260, y: m.y - 120 },
    { sprite: "lamp", x: ln.x, y: ln.y + 10 }, { sprite: "bench", x: ln.x + 120, y: ln.y + 30 }, { sprite: "bush", x: ln.x - 140, y: ln.y + 60 },
    { sprite: "fence", x: f.x + 60, y: f.y + 120 }, { sprite: "field", x: f.x - 120, y: f.y + 200, w: 200 }, { sprite: "tree-small", x: o.x + 180, y: o.y - 60 }, { sprite: "tree-small", x: o.x - 160, y: o.y + 80 }, { sprite: "tree-small", x: o.x + 40, y: o.y + 140 },
    { sprite: "searocks", x: cv.x - 120, y: cv.y + 120 }, { sprite: "searocks", x: cv.x + 260, y: cv.y - 60 }, { sprite: "rowboat", x: cv.x + 120, y: cv.y + 80, flip: true }, { sprite: "bush", x: sh.x + 120, y: sh.y + 90 }, { sprite: "tree-small", x: sh.x - 200, y: sh.y + 60 },
    { sprite: "rock", x: q.x - 120, y: q.y + 90 }, { sprite: "rock", x: q.x + 140, y: q.y + 60 }, { sprite: "searocks", x: lh.x + 140, y: lh.y + 120 }, { sprite: "rock", x: lh.x - 100, y: lh.y + 60 },
  ];
  // the pinewood is a wood
  for (let i = 0; i < 14; i++) out.push({ sprite: i % 3 === 0 ? "tree-small" : "tree-large", x: pw.x - 260 + (i * 173) % 520, y: pw.y - 140 + (i * 97) % 300, flip: i % 2 === 0 });
  return out;
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
      const [manifest, townView] = await Promise.all([
        (await fetch("/world/manifest.json")).json() as Promise<Record<string, { w: number; h: number }>>,
        (await fetch(`${API}/api/town`, { cache: "no-store" })).json() as Promise<TownView>,
      ]);
      const W = townView.size?.w ?? 3000, H = townView.size?.h ?? 1800;
      const places = new Map<string, PlaceView>(townView.places.map((p) => [p.id, p]));
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
      // the island: a soft blob with a sandy heart, big enough that every district has shore or hill behind it
      const ground = new Graphics();
      const blob = (g: Graphics, inset: number, color: number) => {
        const pts: [number, number][] = [];
        const cx = W / 2, cy = H / 2 + 40, n = 28;
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const r = 1 + 0.14 * Math.sin(a * 3 + 0.7) + 0.08 * Math.cos(a * 5 + 2); pts.push([cx + Math.cos(a) * (W / 2 - 120 - inset) * r, cy + Math.sin(a) * (H / 2 - 100 - inset) * r]); }
        g.moveTo(pts[0]![0], pts[0]![1]);
        for (let i = 0; i < n; i++) { const p = pts[i]!, q = pts[(i + 1) % n]!; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
        g.closePath().fill(color);
      };
      blob(ground, 0, C.grass); blob(ground, 110, C.sand);
      const gather = (p: PlaceView) => ({ x: p.x - 110, y: p.y + 40, w: 220 });
      const roads = new Set<string>();
      for (const p of places.values()) for (const e of p.exits) { const q = places.get(e); if (!q) continue; const k = [p.id, q.id].sort().join("|"); if (roads.has(k)) continue; roads.add(k); const A = gather(p), B = gather(q); ground.moveTo(A.x + A.w / 2, A.y).lineTo(B.x + B.w / 2, B.y).stroke({ width: 16, color: C.shell, cap: "round" }); }
      world.addChild(ground);

      // everything with a foot on the ground sorts by y
      const scene = new Container(); scene.sortableChildren = true; world.addChild(scene);
      const put = (name: string, x: number, y: number, w?: number, flip = false) => {
        const real = manifest[name] ? name : STAND_IN[name] ?? name; const m = manifest[real]; if (!m) return null;
        const s = new Sprite(tex(real)); s.anchor.set(0.5, 1); s.scale.set((w ?? WIDTH[name] ?? WIDTH[real] ?? 160) / m.w); if (flip) s.scale.x *= -1; s.position.set(x, y); s.zIndex = y; scene.addChild(s); return s;
      };
      const nameStyle = new TextStyle({ fontFamily: "Nunito Sans, sans-serif", fontSize: 12, fontWeight: "700", fill: C.drift, letterSpacing: 1.2 });
      const smallStyle = new TextStyle({ fontFamily: "Nunito Sans, sans-serif", fontSize: 11, fontWeight: "700", fill: C.teal });
      // each place owns its drawn things so it can be redrawn when someone builds on it
      const drawn = new Map<string, Container>();
      const drawPlace = (p: PlaceView) => {
        drawn.get(p.id)?.destroy({ children: true });
        const g = new Container(); g.sortableChildren = true; g.zIndex = p.y; scene.addChild(g); drawn.set(p.id, g);
        const local = (name: string, w?: number) => { const s = put(name, 0, 0, w); if (s) { scene.removeChild(s); g.addChild(s); } return s; };
        if (p.kind === "plot" && !p.site) {
          // pegged-out land: a dashed rectangle and four stakes
          const r = new Graphics(); for (let i = 0; i < 4; i++) { const x0 = -80 + (i % 2) * 160, y0 = -60 + Math.floor(i / 2) * 70; r.rect(x0 - 3, y0 - 14, 6, 14).fill(C.drift); }
          for (let x = -80; x < 80; x += 16) r.moveTo(x, -60).lineTo(x + 8, -60).moveTo(x, 10).lineTo(x + 8, 10).stroke({ width: 2, color: C.drift });
          for (let y = -60; y < 10; y += 16) r.moveTo(-80, y).lineTo(-80, y + 8).moveTo(80, y).lineTo(80, y + 8).stroke({ width: 2, color: C.drift });
          r.rect(-80, -60, 160, 70).fill({ color: C.sage, alpha: 0.35 }); g.addChild(r);
        } else if (p.site) {
          // a site: timber frame, a crates pile, and how many mornings are done
          const r = new Graphics(); r.rect(-70, -70, 140, 70).fill({ color: C.sand, alpha: 0.9 });
          for (let x = -70; x <= 70; x += 35) r.moveTo(x, 0).lineTo(x, -70).stroke({ width: 5, color: 0xc9b58f });
          r.moveTo(-70, -70).lineTo(70, -70).stroke({ width: 6, color: 0xc9b58f }); r.moveTo(-70, -35).lineTo(70, -35).stroke({ width: 4, color: 0xc9b58f });
          if (p.site.what === "house") r.moveTo(-76, -70).lineTo(0, -120).lineTo(76, -70).stroke({ width: 6, color: 0xc9b58f });
          g.addChild(r); const c = local("crates", 60); if (c) c.position.set(95, 4);
          const t = new Text({ text: `${p.site.name} · ${p.site.done} of ${p.site.of}`, style: smallStyle }); t.anchor.set(0.5, 0); t.position.set(0, 6); g.addChild(t);
        } else {
          local(p.sprite);
        }
        const t = new Text({ text: p.name.replace(/^the /, "").replace(/^an? /, "").toUpperCase(), style: nameStyle }); t.anchor.set(0.5, 0); t.position.set(0, p.site ? 22 : 6); t.zIndex = 100000; g.addChild(t);
        g.position.set(p.x, p.y);
      };
      for (const p of places.values()) drawPlace(p);
      const decor = decorFor([...places.values()]);
      for (const d of decor) put(d.sprite, d.x, d.y, d.w, d.flip);
      const harbor = places.get("harbor") ?? { x: 560, y: 1180 };
      const dockX = harbor.x - 420, awayX = -300;
      const ferry = put("ferry", dockX, harbor.y + 20)!; ferry.zIndex = harbor.y - 30; let ferryTarget = dockX;

      // weather and time
      const rain = new Graphics(); rain.zIndex = 200000; scene.addChild(rain);
      const night = new Graphics(); night.rect(-3000, -3000, W + 6000, H + 6000).fill(C.kelp); night.alpha = 0; world.addChild(night);
      const lamps = new Graphics(); lamps.zIndex = 150000; scene.addChild(lamps);

      const spot = (place: string, seat: number) => { const p = places.get(place) ?? places.get("market")!; const g = gather(p); const cols = 5; return { x: g.x + 20 + (seat % cols) * ((g.w - 40) / (cols - 1)), y: g.y + Math.floor(seat / cols) * 26 }; };
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
      const moveTo = (id: string, place: string) => { const f = figs.current.get(id); if (!f) return; const seat = seatOf.current.get(place) ?? 0; seatOf.current.set(place, (seat + 1) % 10); const sp = spot(place, seat); f.tx = sp.x; f.ty = sp.y; f.place = place; const a = agents.current.get(id); if (a) { a.location = place; a.place = places.get(place)?.name ?? place; } };
      const refreshPlaces = async () => { try { const t = (await (await fetch(`${API}/api/town`, { cache: "no-store" })).json()) as TownView; for (const p of t.places) { const old = places.get(p.id); places.set(p.id, p); if (!old || old.kind !== p.kind || old.name !== p.name || JSON.stringify(old.site) !== JSON.stringify(p.site)) drawPlace(p); } } catch {} };

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
          if (e.kind === "ferry.dock") { ferry.position.x = awayX; ferryTarget = dockX; }
          if (e.kind === "ferry.depart") ferryTarget = awayX;
          if (e.kind === "agent.arrive") { void fetch(`${API}/api/agents/${e.actors[0]}`).then((r) => r.json()).then((a: PublicAgent) => { if (a?.id) ensure(a); }); }
          if (e.kind === "agent.build" || e.kind === "town.built" || (e.kind === "agent.work" && /mornings done/.test(e.text))) void refreshPlaces();
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
        if (viewRef.current === "street") { const f = cam.follow ? figs.current.get(cam.follow) : null; if (f) { fx = f.x; fy = f.y - 60; } else { const mk = places.get("market"); if (mk) { fx = mk.x; fy = mk.y; } } }
        const tx = Wd / 2 - fx * cam.zoom, ty = Hd / 2 - fy * cam.zoom;
        cam.x += (tx - cam.x) * 0.08; cam.y += (ty - cam.y) * 0.08;
        world.scale.set(cam.zoom); world.position.set(cam.x, cam.y);
        // sea
        sea.clear(); sea.rect(-3000, -3000, W + 6000, H + 6000).fill(C.water);
        if (tick % 6 === 0) { ripples.clear(); for (let i = 0; i < 48; i++) { const yy = ((i * 97 + tick * 0.4) % (H + 600)) - 300; const xx = ((i * 331) % (W + 800)) - 400 + Math.sin(tick / 90 + i) * 12; ripples.moveTo(xx, yy).lineTo(xx + 60 + (i % 3) * 20, yy).stroke({ width: 3, color: C.waterDeep, cap: "round" }); } }
        // ferry
        ferry.position.x += (ferryTarget - ferry.position.x) * 0.02;
        // weather
        const c = clockRef.current;
        if (tick % 2 === 0) { rain.clear(); if (c && (c.weather === "rain" || c.weather === "storm")) { const n = c.weather === "storm" ? 360 : 180; for (let i = 0; i < n; i++) { const xx = ((i * 137 + tick * 9) % (W + 200)) - 100; const yy = ((i * 251 + tick * 14) % (H + 200)) - 100; rain.moveTo(xx, yy).lineTo(xx - 3, yy + 14).stroke({ width: 1.5, color: C.teal, alpha: 0.35 }); } } }
        const hour = c ? c.hour + (c.minute % 60) / 60 : 12;
        const nightAmt = hour < 5 ? 0.38 : hour < 7 ? 0.38 * (7 - hour) / 2 : hour < 19 ? 0 : hour < 21 ? 0.38 * (hour - 19) / 2 : 0.38;
        night.alpha += (nightAmt - night.alpha) * 0.05;
        if (tick % 10 === 0) { lamps.clear(); if (night.alpha > 0.05) for (const d of decor) if (d.sprite === "lamp") lamps.circle(d.x, d.y - 24, 26).fill({ color: 0xfff2c2, alpha: 0.35 * (night.alpha / 0.38) }); }
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
