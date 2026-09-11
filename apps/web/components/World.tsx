"use client";
import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { API, WS, type PublicAgent, type TownEvent, type Clock } from "@/lib/api";
import { Citizen, lookFor, type Look, type Pose } from "./world/citizen";
import { Ambience } from "./world/ambience";
import { drawThing } from "./world/buildings";

/**
 * The island, drawn by PixiJS from the live event stream, in the Tide style.
 * The server owns the map: every place arrives with its position, district and sprite, so a house someone builds
 * this morning stands on the canvas by the time the paper prints it. Labels and bubbles are HTML over the canvas.
 */
const C = { water: 0xdcebe3, waterDeep: 0xcfe3d8, sand: 0xefede4, shell: 0xf7f5ee, grass: 0xd5e6da, sage: 0xb9d9c6, teal: 0x1f5f5b, kelp: 0x1e2a2b, coral: 0xe8735a, drift: 0x6f7a78 };

type PlaceView = { id: string; name: string; kind: string; exits: string[]; x: number; y: number; district: string; sprite: string; owner: string | null; site: { what: string; name: string; by: string; done: number; of: number } | null; crowd: number };
type TownView = Clock & { size: { w: number; h: number }; places: PlaceView[] };


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
  for (let i = 0; i < 22; i++) out.push({ sprite: i % 3 === 0 ? "tree-small" : "tree-large", x: pw.x - 340 + (i * 173) % 680, y: pw.y - 160 + (i * 97) % 340, flip: i % 2 === 0 });
  // a few more trees where the land is empty, so the island is not bare between districts
  for (const [x, y] of [[h.x + 420, h.y - 260], [m.x - 420, m.y + 260], [ln.x + 300, ln.y + 40], [o.x - 300, o.y - 160], [sh.x + 380, sh.y + 120], [q.x - 320, q.y + 220]] as const) out.push({ sprite: "tree-large", x, y }, { sprite: "tree-small", x: x + 70, y: y + 30 });
  return out;
}

type Fig = { id: string; g: Container; rig: Citizen; x: number; y: number; tx: number; ty: number; place: string; asleep: boolean; mine: boolean; name: string; pose: Pose; facing: 1 | -1 };

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
  const ambienceRef = useRef<Ambience | null>(null);
  const [sound, setSound] = useState(false);
  const [placeInfo, setPlaceInfo] = useState<{ id: string; name: string; district: string; kind: string; owner: string | null; site: PlaceView["site"]; people: { name: string; asleep: boolean; job: string | null }[] } | null>(null);
  const [mini, setMini] = useState<{ w: number; h: number; places: { id: string; x: number; y: number; kind: string; crowd: number }[]; view: { x: number; y: number; w: number; h: number }; people: { x: number; y: number; mine: boolean }[] } | null>(null);

  useEffect(() => {
    let app: Application | null = null; let ws: WebSocket | null = null; let alive = true; let inited = false; let poll: ReturnType<typeof setInterval> | null = null;
    (async () => {
      const el = host.current!;
      const townView = (await (await fetch(`${API}/api/town`, { cache: "no-store" })).json()) as TownView;
      const W = townView.size?.w ?? 3000, H = townView.size?.h ?? 1800;
      const places = new Map<string, PlaceView>(townView.places.map((p) => [p.id, p]));
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
      // the ground is isometric tiles: land inside the island's outline, sand at the shore and the harbor, wood around the pines,
      // rock at the quarry, furrows at the fields, and roads laid tile by tile along the exits
      const gather = (p: PlaceView) => ({ x: p.x - 110, y: p.y + 40, w: 220 });
      const inside = (x: number, y: number): number => { // >1 is sea; ~1 is the shore
        const cx = W / 2, cy = H / 2 + 40; const a = Math.atan2((y - cy) / (H / 2 - 100), (x - cx) / (W / 2 - 120)); const r = 1 + 0.14 * Math.sin(a * 3 + 0.7) + 0.08 * Math.cos(a * 5 + 2);
        return Math.hypot((x - cx) / ((W / 2 - 120) * r), (y - cy) / ((H / 2 - 100) * r));
      };
      const near = (x: number, y: number, ids: string[], radius: number) => ids.some((id) => { const p = places.get(id); return !!p && Math.hypot(p.x - x, (p.y - 30 - y) * 1.6) < radius; });
      const segs: { ax: number; ay: number; bx: number; by: number }[] = []; const roads = new Set<string>();
      for (const p of places.values()) for (const e of p.exits) { const q = places.get(e); if (!q) continue; const k = [p.id, q.id].sort().join("|"); if (roads.has(k)) continue; roads.add(k); const A = gather(p), B = gather(q); segs.push({ ax: A.x + A.w / 2, ay: A.y, bx: B.x + B.w / 2, by: B.y }); }
      const distToSeg = (x: number, y: number, s: { ax: number; ay: number; bx: number; by: number }) => { const dx = s.bx - s.ax, dy = s.by - s.ay; const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - (s.ax + t * dx), y - (s.ay + t * dy)); };
      const TW = 64, TH = 32; const FOREST = 0xb8cfbd, ROCK = 0xdcd9cf, FIELD = 0xcfe0c6, SHALLOW = 0xd3e6dc;
      // rows step by half a tile so the diamonds interlock with no gaps; odd rows shift by half a tile width
      for (let j = -12; j < (H / TH) * 2 + 12; j++) for (let i = -6; i < W / TW + 6; i++) {
        const x = i * TW + (j % 2 ? TW / 2 : 0), y = j * (TH / 2);
        const d = inside(x, y); if (d > 1.06) continue;
        let color = C.grass; const alt = (i + j) % 2 === 0;
        void alt;
        if (d > 1) color = SHALLOW; else if (d > 0.9 || near(x, y, ["harbor", "cove", "coast", "boatshed"], 200)) color = C.sand;
        else if (near(x, y, ["pinewood", "sawpit", "wood-1"], 300)) color = FOREST;
        else if (near(x, y, ["quarry", "lighthouse"], 230)) color = ROCK;
        else if (near(x, y, ["fields", "orchard"], 240)) color = FIELD;
        else if (near(x, y, ["market", "lane", "council", "chapel", "bakery", "smithy", "tavern"], 260)) color = C.sand;
        const onRoad = segs.some((sg) => distToSeg(x, y, sg) < 22);
        if (onRoad) color = C.shell;
        ground.moveTo(x, y - TH / 2).lineTo(x + TW / 2, y).lineTo(x, y + TH / 2).lineTo(x - TW / 2, y).closePath().fill(color).stroke({ width: 1, color: C.kelp, alpha: onRoad ? 0.03 : 0.045 });
        if (color === FIELD && alt) ground.moveTo(x - 20, y).lineTo(x + 20, y).stroke({ width: 1.5, color: 0xb9d9c6, alpha: 0.9 });
        if (color === FOREST && (i * 7 + j * 3) % 5 === 0) ground.circle(x, y, 4).fill({ color: 0x9fbfa8, alpha: 0.8 });
      }
      world.addChild(ground);

      // everything with a foot on the ground sorts by y
      const scene = new Container(); scene.sortableChildren = true; world.addChild(scene);
      // everything standing on the ground is drawn in code, in one projection, at its natural size; props may be scaled
      const put = (name: string, x: number, y: number, w?: number, flip = false) => {
        const d = drawThing(name); if (!d) return null;
        const c = d.c; if (w) c.scale.set(w / d.w); if (flip) c.scale.x *= -1; c.position.set(x, y); c.zIndex = y; scene.addChild(c); return c;
      };
      const nameStyle = new TextStyle({ fontFamily: "Nunito Sans, sans-serif", fontSize: 12, fontWeight: "700", fill: C.drift, letterSpacing: 1.2 });
      const smallStyle = new TextStyle({ fontFamily: "Nunito Sans, sans-serif", fontSize: 11, fontWeight: "700", fill: C.teal });
      // each place owns its drawn things so it can be redrawn when someone builds on it
      const drawn = new Map<string, Container>();
      const drawPlace = (p: PlaceView) => {
        drawn.get(p.id)?.destroy({ children: true });
        const g = new Container(); g.sortableChildren = true; g.zIndex = p.y; scene.addChild(g); drawn.set(p.id, g);
        const local = (name: string, w?: number) => { const s = put(name, 0, 0, w); if (s) { scene.removeChild(s); s.zIndex = 0; g.addChild(s); } return s; };
        if (p.kind === "plot" && !p.site) {
          // pegged-out land: a dashed rectangle and four stakes
          const r = new Graphics(); for (let i = 0; i < 4; i++) { const x0 = -80 + (i % 2) * 160, y0 = -60 + Math.floor(i / 2) * 70; r.rect(x0 - 3, y0 - 14, 6, 14).fill(C.drift); }
          for (let x = -80; x < 80; x += 16) r.moveTo(x, -60).lineTo(x + 8, -60).moveTo(x, 10).lineTo(x + 8, 10).stroke({ width: 2, color: C.drift });
          for (let y = -60; y < 10; y += 16) r.moveTo(-80, y).lineTo(-80, y + 8).moveTo(80, y).lineTo(80, y + 8).stroke({ width: 2, color: C.drift });
          r.rect(-80, -60, 160, 70).fill({ color: C.sage, alpha: 0.35 }); g.addChild(r);
        } else if (p.site) {
          // a site: timber frame, a crates pile, and how many mornings are done
          const r = new Graphics(); const done = Math.min(1, p.site.done / Math.max(1, p.site.of));
          r.rect(-70, -70, 140, 70).fill({ color: C.sand, alpha: 0.9 });
          for (let x = -70; x <= 70; x += 35) r.moveTo(x, 0).lineTo(x, -70).stroke({ width: 5, color: 0xc9b58f });
          r.moveTo(-70, -70).lineTo(70, -70).stroke({ width: 6, color: 0xc9b58f });
          // walls go up a plank per morning worked
          const planks = Math.round(done * 8); for (let k = 0; k < planks; k++) r.rect(-68, -8 - k * 8, 136, 7).fill(0xf7f5ee).stroke({ width: 1.2, color: C.kelp });
          if (p.site.what === "house") r.moveTo(-76, -70).lineTo(0, -120).lineTo(76, -70).stroke({ width: 6, color: 0xc9b58f });
          if (done >= 0.8) r.moveTo(-76, -70).lineTo(0, -120).lineTo(76, -70).closePath().fill(C.teal);
          g.addChild(r); const c = local("crates", 60); if (c) c.position.set(95, 4);
          const t = new Text({ text: `${p.site.name} · ${p.site.done} of ${p.site.of}`, style: smallStyle }); t.anchor.set(0.5, 0); t.position.set(0, 6); g.addChild(t);
        } else {
          local(p.sprite);
        }
        const t = new Text({ text: p.name.replace(/^the /, "").replace(/^an? /, "").toUpperCase(), style: nameStyle }); t.anchor.set(0.5, 0); t.position.set(0, p.site ? 22 : 6); t.zIndex = 100000; g.addChild(t);
        g.position.set(p.x, p.y);
        g.eventMode = "static"; g.cursor = "pointer"; g.hitArea = { contains: (x: number, y: number) => x > -90 && x < 90 && y > -170 && y < 30 } as never;
        g.on("pointertap", () => { const here = [...agents.current.values()].filter((a) => a.location === p.id); setPlaceInfo({ id: p.id, name: p.name, district: p.district, kind: p.kind, owner: p.owner, site: p.site, people: here.map((a) => ({ name: a.name, asleep: a.asleep, job: a.job })) }); });
      };
      for (const p of places.values()) drawPlace(p);
      const decor = decorFor([...places.values()]);
      const trees: Container[] = [];
      for (const d of decor) { const sp = put(d.sprite, d.x, d.y, d.w, d.flip); if (sp && /tree|bush/.test(d.sprite)) trees.push(sp); }
      const CHIMNEYS: Record<string, [number, number]> = { smithy: [44, -150], bakery: [30, -180], inn: [60, -210], mill: [0, -220], tavern: [40, -150], fishhouse: [30, -120] };
      const harbor = places.get("harbor") ?? { x: 560, y: 1180 };
      const dockX = harbor.x - 420, awayX = -300;
      const ferry = put("ferry", dockX, harbor.y + 20)!; ferry.zIndex = harbor.y - 30; let ferryTarget = dockX;

      // weather and time
      const rain = new Graphics(); rain.zIndex = 200000; scene.addChild(rain);
      const puddles = new Graphics(); puddles.zIndex = 1; scene.addChild(puddles); let wetness = 0;
      const smoke = new Graphics(); smoke.zIndex = 190000; scene.addChild(smoke);
      const fog = new Graphics(); fog.zIndex = 210000; scene.addChild(fog);
      const flash = new Graphics(); flash.rect(-3000, -3000, W + 6000, H + 6000).fill(0xffffff); flash.alpha = 0; world.addChild(flash); let nextBolt = 0;
      const night = new Graphics(); night.rect(-3000, -3000, W + 6000, H + 6000).fill(C.kelp); night.alpha = 0; world.addChild(night);
      const dusk = new Graphics(); dusk.rect(-3000, -3000, W + 6000, H + 6000).fill(0xe8735a); dusk.alpha = 0; world.addChild(dusk);
      const lamps = new Graphics(); lamps.zIndex = 150000; scene.addChild(lamps);
      const windows = new Graphics(); windows.zIndex = 160000; scene.addChild(windows);
      const ambience = new Ambience(); ambienceRef.current = ambience;

      const spot = (place: string, seat: number) => { const p = places.get(place) ?? places.get("market")!; const g = gather(p); const cols = 5; return { x: g.x + 20 + (seat % cols) * ((g.w - 40) / (cols - 1)), y: g.y + Math.floor(seat / cols) * 26 }; };
      const ensure = (a: PublicAgent) => {
        agents.current.set(a.id, a);
        let f = figs.current.get(a.id);
        if (!f) {
          const g = new Container();
          const rig = new Citizen(lookFor(a.name, a.appearance as Partial<Look> | null)); g.addChild(rig);
          g.eventMode = "static"; g.cursor = "pointer"; g.hitArea = { contains: (x: number, y: number) => x > -20 && x < 20 && y > -80 && y < 0 } as never;
          g.on("pointertap", () => onSelect(agents.current.get(a.id) ?? null));
          scene.addChild(g);
          const seat = seatOf.current.get(a.location) ?? 0; seatOf.current.set(a.location, (seat + 1) % 10);
          const sp = spot(a.location, seat);
          f = { id: a.id, g, rig, x: sp.x, y: sp.y, tx: sp.x, ty: sp.y, place: a.location, asleep: a.asleep, mine: a.id === mineId, name: a.name, pose: a.pose ?? (a.asleep ? "sleep" : "idle"), facing: 1 };
          figs.current.set(a.id, f);
        } else { f.asleep = a.asleep; f.pose = a.pose ?? (a.asleep ? "sleep" : "idle"); if (a.location !== f.place) moveTo(a.id, a.location); }
        return f;
      };
      const moveTo = (id: string, place: string) => { const f = figs.current.get(id); if (!f) return; const seat = seatOf.current.get(place) ?? 0; seatOf.current.set(place, (seat + 1) % 10); const sp = spot(place, seat); f.tx = sp.x; f.ty = sp.y; f.place = place; const a = agents.current.get(id); if (a) { a.location = place; a.place = places.get(place)?.name ?? place; } };
      const refreshPlaces = async () => { try { const t = (await (await fetch(`${API}/api/town`, { cache: "no-store" })).json()) as TownView; for (const p of t.places) { const old = places.get(p.id); places.set(p.id, p); if (!old || old.kind !== p.kind || old.name !== p.name || JSON.stringify(old.site) !== JSON.stringify(p.site)) drawPlace(p); } } catch {} };

      poll = setInterval(() => { void fetch(`${API}/api/agents`, { cache: "no-store" }).then((r) => r.json()).then((list: PublicAgent[]) => { for (const a of list) ensure(a); }).catch(() => {}); void refreshPlaces(); }, 30000);
      ws = new WebSocket(WS);
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data as string) as { type: string; agents?: PublicAgent[]; recent?: TownEvent[]; event?: TownEvent; clock?: Clock };
        if (msg.type === "hello") { for (const a of msg.agents ?? []) ensure(a); setFeed((msg.recent ?? []).filter((e) => e.importance >= 0.1 && e.kind !== "agent.move").slice(-12).reverse()); if (msg.clock) { setClock(msg.clock); clockRef.current = msg.clock; } setReady(true); }
        if (msg.type === "clock" && msg.clock) { setClock(msg.clock); clockRef.current = msg.clock; }
        if (msg.type === "event" && msg.event) {
          const e = msg.event;
          if (e.kind === "agent.move" && e.place) moveTo(e.actors[0]!, e.place);
          if (e.kind === "agent.sleep") { const f = figs.current.get(e.actors[0]!); if (f) { f.asleep = true; f.pose = "sleep"; } }
          if (e.kind === "agent.wake") { const f = figs.current.get(e.actors[0]!); if (f) { f.asleep = false; f.pose = "idle"; } }
          if (e.kind === "agent.work" && /worked on|mornings done/.test(e.text)) { const f = figs.current.get(e.actors[0]!); if (f) f.pose = "work"; }
          if (e.kind === "agent.leave") { const f = figs.current.get(e.actors[0]!); if (f) { f.g.destroy({ children: true }); figs.current.delete(e.actors[0]!); } }
          if (e.kind === "agent.say") { const q = /“([^”]+)”/.exec(e.text)?.[1]; if (q) bubbles.current.set(e.actors[0]!, { text: q, until: Date.now() + 7000 }); }
          if (e.kind === "conversation") { const lines = (e.payload?.lines as { speaker: string; text: string }[] | undefined) ?? []; lines.forEach((l, i) => setTimeout(() => bubbles.current.set(l.speaker, { text: l.text, until: Date.now() + 5500 }), i * 2600)); }
          if (e.kind === "ferry.dock") { if (/docked/.test(e.text)) { ferry.position.x = awayX; ferryTarget = dockX; ambience.horn(); } }
          if (e.kind === "ferry.depart") ferryTarget = awayX;
          if (e.kind === "agent.arrive") { void fetch(`${API}/api/agents/${e.actors[0]}`).then((r) => r.json()).then((a: PublicAgent) => { if (a?.id) { const f = ensure(a); f.x = ferry.position.x + 40; f.y = ferry.position.y - 10; f.g.position.set(f.x, f.y); } }); }
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
        // weather: what falls, what lingers, what blows
        const c = clockRef.current; const weather = c?.weather ?? "clear"; const winter = c?.season === "winter";
        const wet = weather === "rain" || weather === "storm"; const snowing = wet && winter;
        const wind = weather === "storm" ? 1 : weather === "wind" ? 0.8 : weather === "rain" ? 0.45 : weather === "fog" ? 0.1 : 0.2;
        if (tick % 2 === 0) {
          rain.clear();
          if (wet) {
            const n = weather === "storm" ? 420 : 200;
            for (let i = 0; i < n; i++) {
              const xx = ((i * 137 + tick * (snowing ? 2 : 9)) % (W + 400)) - 200 + Math.sin(tick / 40 + i) * wind * 6; const yy = ((i * 251 + tick * (snowing ? 4 : 16)) % (H + 200)) - 100;
              if (snowing) rain.circle(xx, yy, 2.2).fill({ color: 0xffffff, alpha: 0.8 }); else rain.moveTo(xx, yy).lineTo(xx - 3 - wind * 6, yy + 14).stroke({ width: 1.5, color: C.teal, alpha: 0.35 });
            }
            // splashes on the ground
            if (!snowing) for (let i = 0; i < 40; i++) { const xx = ((i * 419 + tick * 23) % W); const yy = ((i * 733 + tick * 31) % H); rain.circle(xx, yy, 2 + (tick + i) % 3).stroke({ width: 1, color: C.shell, alpha: 0.5 }); }
          }
        }
        wetness += ((wet && !snowing ? 1 : 0) - wetness) * (wet ? 0.002 : 0.0006);
        if (tick % 15 === 0) { puddles.clear(); if (wetness > 0.02) for (let i = 0; i < 26; i++) { const xx = ((i * 587) % (W - 400)) + 200, yy = ((i * 911) % (H - 400)) + 200; puddles.ellipse(xx, yy, 26 + (i % 4) * 8, 9 + (i % 3) * 3).fill({ color: C.waterDeep, alpha: 0.55 * wetness }); } }
        for (let i = 0; i < trees.length; i++) { const tr = trees[i]!; tr.skew.x = Math.sin(tick / 22 + i) * 0.035 * wind + Math.sin(tick / 7 + i * 2) * 0.012 * wind; }
        if (tick % 3 === 0) { fog.clear(); if (weather === "fog") for (let i = 0; i < 18; i++) { const xx = ((i * 431 + tick * 0.6) % (W + 800)) - 400, yy = ((i * 277) % (H + 200)) - 100; fog.ellipse(xx, yy, 340 + (i % 3) * 120, 110 + (i % 2) * 50).fill({ color: C.shell, alpha: 0.16 }); } }
        if (weather === "storm") { if (tick > nextBolt) { flash.alpha = 0.55; nextBolt = tick + 300 + Math.random() * 900; } flash.alpha *= 0.82; } else flash.alpha = 0;
        // light: a warm dawn, a coral dusk, kelp at night
        const hour = c ? c.hour + (c.minute % 60) / 60 : 12;
        const nightAmt = (hour < 5 ? 0.42 : hour < 7 ? 0.42 * (7 - hour) / 2 : hour < 19 ? 0 : hour < 21 ? 0.42 * (hour - 19) / 2 : 0.42) + (weather === "storm" ? 0.12 : weather === "rain" ? 0.05 : 0);
        const duskAmt = hour >= 5.5 && hour < 7.5 ? 0.16 * (1 - Math.abs(hour - 6.5)) : hour >= 18.5 && hour < 20.5 ? 0.2 * (1 - Math.abs(hour - 19.5)) : 0;
        night.alpha += (nightAmt - night.alpha) * 0.05; dusk.alpha += (duskAmt - dusk.alpha) * 0.05;
        if (tick % 10 === 0) {
          lamps.clear(); windows.clear();
          if (night.alpha > 0.05) {
            for (const d of decor) if (d.sprite === "lamp") lamps.circle(d.x, d.y - 24, 26).fill({ color: 0xfff2c2, alpha: 0.35 * (night.alpha / 0.42) });
            // a lit window where someone is inside
            for (const p of places.values()) if (p.crowd > 0 && p.kind !== "plot" && p.kind !== "wild" && p.kind !== "public" && p.kind !== "harbor" && p.kind !== "market") windows.roundRect(p.x - 30, p.y - 34, 16, 12, 3).fill({ color: 0xffe3a3, alpha: 0.5 * (night.alpha / 0.42) });
          }
        }
        // smoke from a chimney where someone works
        if (tick % 2 === 0) { smoke.clear(); for (const [id, [ox, oy]] of Object.entries(CHIMNEYS)) { const p = places.get(id); if (!p || p.crowd === 0 || hour < 6 || hour > 20) continue; for (let i = 0; i < 6; i++) { const age = ((tick / 3 + i * 17) % 60) / 60; smoke.circle(p.x + ox + Math.sin(age * 6 + i) * 6 + age * wind * 30, p.y + oy - age * 70, 4 + age * 10).fill({ color: C.shell, alpha: 0.5 * (1 - age) }); } } }
        // sound follows the camera
        if (tick % 30 === 0 && c) { const f = cam.follow ? figs.current.get(cam.follow) : null; const p = places.get(f?.place ?? "market"); ambience.tick({ weather, hour: c.hour, season: c.season, district: p?.district ?? "old town", place: p?.id ?? "market", crowd: p?.crowd ?? 0 }); }
        // people
        const now = Date.now(); const next: typeof labels = []; const secs = now / 1000;
        for (const f of figs.current.values()) {
          const moving = Math.abs(f.tx - f.x) > 1.5 || Math.abs(f.ty - f.y) > 1.5;
          // walk at a person's pace, not a spring's
          const dx = f.tx - f.x, dy = f.ty - f.y, dist = Math.hypot(dx, dy), step = Math.min(dist, 1.6);
          if (dist > 0.01) { f.x += (dx / dist) * step; f.y += (dy / dist) * step; }
          f.g.position.set(f.x, f.y);
          if (moving) f.facing = dx < 0 ? -1 : 1;
          const b = bubbles.current.get(f.id); if (b && b.until < now) bubbles.current.delete(f.id);
          f.rig.face(f.facing); f.rig.setPose(f.asleep ? "sleep" : moving ? "walk" : b ? "talk" : f.pose); f.rig.update(secs);
          f.g.zIndex = f.y;
          next.push({ id: f.id, name: f.name, x: f.x * cam.zoom + cam.x, y: (f.y - 78) * cam.zoom + cam.y, mine: f.mine, ...(b ? { bubble: b.text } : {}) });
        }
        if (tick % 2 === 0) setLabels(next);
        if (tick % 20 === 0) setMini({ w: W, h: H, places: [...places.values()].map((p) => ({ id: p.id, x: p.x, y: p.y, kind: p.kind, crowd: p.crowd })), view: { x: -cam.x / cam.zoom, y: -cam.y / cam.zoom, w: Wd / cam.zoom, h: Hd / cam.zoom }, people: [...figs.current.values()].map((f) => ({ x: f.x, y: f.y, mine: f.mine })) });
      });
    })();
    return () => { alive = false; ws?.close(); if (poll) clearInterval(poll); void ambienceRef.current?.disable(); if (inited) { try { app?.destroy(true); } catch {} } figs.current.clear(); seatOf.current.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineId]);

  useEffect(() => { camera.current.follow = mineId; }, [mineId]);
  const z = camera.current.zoom;
  const showLabels = view === "street" || z > 0.6;

  return (
    <div className="absolute inset-0 overflow-hidden rounded-[28px] bg-glass">
      <div ref={host} className="absolute inset-0" />
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-teal font-bold">Crossing to the island…</div>}
      <button onClick={() => { const a = ambienceRef.current; if (!a) return; if (sound) { void a.disable(); setSound(false); } else { void a.enable().then(() => setSound(true)); } }} className="absolute right-3 top-3 sm:right-6 sm:top-6 h-9 px-3.5 rounded-full bg-shell text-teal text-[13px] font-bold pointer-events-auto transition-colors" aria-pressed={sound}>{sound ? "Sound on" : "Sound off"}</button>
      <div className="absolute inset-0 pointer-events-none">
        {labels.map((l) => (
          <div key={l.id} className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-full" style={{ left: l.x, top: l.y }}>
            {l.bubble && <div className="bg-glass px-3 py-2 italic text-[13px] max-w-[260px] leading-[1.3] pointer-events-auto shadow-none" style={{ borderRadius: "16px 16px 16px 4px" }}>“{l.bubble}”</div>}
            <div className={`crossfade rounded-xl px-2 text-xs font-bold ${l.mine ? "bg-coral text-sand" : "bg-shell text-teal"}`} style={{ opacity: showLabels || l.mine || l.bubble ? 1 : 0 }}>{l.name.split(" ")[0]}{l.mine ? " · you" : ""}</div>
          </div>
        ))}
      </div>
      {mini && <svg className="absolute right-3 bottom-3 sm:right-6 sm:bottom-6 hidden sm:block rounded-2xl bg-shell/90 pointer-events-none" width={180} height={Math.round(180 * mini.h / mini.w)} viewBox={`0 0 ${mini.w} ${mini.h}`} aria-hidden>
        {mini.places.filter((p) => p.kind !== "public" && p.kind !== "wild").map((p) => <circle key={p.id} cx={p.x} cy={p.y} r={p.kind === "plot" ? 22 : 34} fill={p.kind === "plot" ? "#B9CFC8" : "#1F5F5B"} opacity={0.55} />)}
        {mini.people.map((pp, i) => <circle key={i} cx={pp.x} cy={pp.y} r={pp.mine ? 30 : 16} fill={pp.mine ? "#E8735A" : "#1E2A2B"} />)}
        <rect x={mini.view.x} y={mini.view.y} width={mini.view.w} height={mini.view.h} fill="none" stroke="#1F5F5B" strokeWidth={18} rx={40} />
      </svg>}
      {placeInfo && <div className="absolute right-3 top-14 sm:right-6 sm:top-16 w-[min(320px,calc(100%-24px))] bg-shell rounded-card p-4 flex flex-col gap-2 pointer-events-auto rise">
        <div className="flex justify-between items-baseline gap-2"><div><div className="label">{placeInfo.district}</div><div className="display text-[20px] font-semibold">{placeInfo.name}</div></div><button onClick={() => setPlaceInfo(null)} className="text-sm text-drift">Close</button></div>
        {placeInfo.owner && <div className="text-sm text-ink2">Owned by {placeInfo.owner}.</div>}
        {placeInfo.site && <div className="text-sm text-ink2">{placeInfo.site.by} is building {placeInfo.site.name}: {placeInfo.site.done} of {placeInfo.site.of} mornings done.</div>}
        {placeInfo.kind === "plot" && !placeInfo.site && <div className="text-sm text-ink2">Empty land. A house costs 15 coins and six mornings; a shop 30 and ten.</div>}
        <div className="text-sm">{placeInfo.people.length === 0 ? <span className="text-drift">Nobody here right now.</span> : placeInfo.people.map((pp) => <div key={pp.name}>{pp.name}{pp.asleep ? ", asleep" : pp.job ? `, ${pp.job}` : ""}</div>)}</div>
      </div>}
      <div className="absolute left-3 bottom-3 sm:left-6 sm:bottom-6 bg-shell rounded-card p-3 sm:p-4 w-[calc(100%-24px)] sm:w-[330px] flex flex-col gap-1.5 pointer-events-auto max-h-[38%] sm:max-h-none overflow-hidden">
        <div className="label">Just now{clock ? ` · day ${clock.day} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute % 60).padStart(2, "0")} · ${clock.weather}` : ""}</div>
        {feed.slice(0, 6).map((e) => <div key={e.id} className="grid gap-x-2.5 items-center" style={{ gridTemplateColumns: "44px 14px 1fr" }}><span className="text-[12px] text-drift tabular">{String(Math.floor((e.t % 1440) / 60)).padStart(2, "0")}:{String(e.t % 60).padStart(2, "0")}</span><span className="rounded-full" style={{ width: e.importance >= 0.45 ? 10 : 7, height: e.importance >= 0.45 ? 10 : 7, background: e.importance >= 0.45 ? "#E8735A" : "#1F5F5B" }} /><span className={`text-[13px] leading-tight line-clamp-2 ${e.importance >= 0.45 ? "font-semibold" : ""}`}>{e.text}</span></div>)}
        {feed.length === 0 && <div className="text-sm text-drift">A quiet minute on the island.</div>}
      </div>
    </div>
  );
}
