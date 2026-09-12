/**
 * The ground under everything: sand, grass, field, forest, rock and cobble, blended where they meet instead of cut at a tile;
 * roads that are worn where people actually walk; a shore with a wrack line and rocks; contours on the hill.
 * Drawn once, in the island's flat hand, from the same places the engine has. Only the wear changes while you watch.
 */
import { Graphics, Container } from "pixi.js";
import { GROUND, KELP, CORAL, CREAM } from "./palette";

type Pt = { x: number; y: number };
export type TerrainPlace = { id: string; x: number; y: number; kind: string; exits: string[] };
export type TerrainOptions = {
  W: number; H: number; cx: number; cy: number;
  /** 1 at the shore, 0 at the centre, more than 1 at sea */
  inside: (x: number, y: number) => number;
  /** the island's outline at a fraction of its size */
  outline: (t: number) => [number, number][];
  places: Map<string, TerrainPlace>;
  oldTown: string[];
};

/** Value noise: smooth, seeded, the same every time the island is drawn. */
function hash2(i: number, j: number): number { let h = (i * 374761393 + j * 668265263) >>> 0; h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function noise(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j; const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
const smooth = (t: number) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
const shade = (color: number, k: number) => { const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255; const f = 1 + k; return (Math.min(255, Math.round(r * f)) << 16) | (Math.min(255, Math.round(g * f)) << 8) | Math.min(255, Math.round(b * f)); };
const mix = (a: number, b: number, t: number) => { const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t); return (ch(16) << 16) | (ch(8) << 8) | ch(0); };

/** Where the roads meet: a little below each place, where the door is. */
export const doorOf = (p: Pt) => ({ x: p.x, y: p.y + 40 });

export type Seg = { key: string; a: Pt; b: Pt; cobbled: boolean };
export function segmentsOf(places: Map<string, TerrainPlace>, oldTown: string[]): Seg[] {
  const segs: Seg[] = []; const seen = new Set<string>();
  for (const p of places.values()) for (const e of p.exits) { const q = places.get(e); if (!q) continue; const key = [p.id, q.id].sort().join("|"); if (seen.has(key)) continue; seen.add(key); segs.push({ key, a: doorOf(p), b: doorOf(q), cobbled: oldTown.includes(p.id) && oldTown.includes(q.id) }); }
  return segs;
}

/** A road drawn as a slightly wandering ribbon, not a ruler line. */
function ribbon(g: Graphics, a: Pt, b: Pt, width: number, color: number, alpha = 1, wobble = 3, seed = 0): void {
  const L = Math.hypot(b.x - a.x, b.y - a.y); const n = Math.max(2, Math.round(L / 40)); const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  g.moveTo(a.x, a.y);
  for (let k = 1; k <= n; k++) { const t = k / n; const off = k === n ? 0 : (noise(seed + t * 6, seed * 0.37) - 0.5) * 2 * wobble; g.lineTo(a.x + (b.x - a.x) * t + nx * off, a.y + (b.y - a.y) * t + ny * off); }
  g.stroke({ width, color, alpha, cap: "round", join: "round" });
}

export function drawGround(o: TerrainOptions, season: string): Graphics {
  const { W, H, inside, outline, places, oldTown } = o; const g = new Graphics();
  const poly = (pts: [number, number][]) => { g.moveTo(pts[0]![0], pts[0]![1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.closePath(); return g; };
  // the sea's edge: shallows, then wet sand, then sand
  poly(outline(1.09)).fill(GROUND.shallow);
  poly(outline(1.0)).fill(GROUND.wetSand);
  poly(outline(0.975)).fill(GROUND.sand);
  // how much of each ground is at a point: smooth, so kinds fade into each other over sixty pixels
  const at = (ids: string[]) => ids.map((id) => places.get(id)).filter((p): p is TerrainPlace => !!p);
  const zones: { ids: TerrainPlace[]; r: number; color: number; kind: string }[] = [
    { ids: at(["harbor", "cove", "coast", "boatshed"]), r: 200, color: GROUND.sand, kind: "sand" },
    { ids: at(["pinewood", "sawpit", "wood-1"]), r: 300, color: GROUND.forest, kind: "forest" },
    { ids: at(["quarry", "lighthouse"]), r: 230, color: GROUND.rock, kind: "rock" },
    { ids: at(["fields", "orchard"]), r: 240, color: GROUND.field, kind: "field" },
    { ids: at(oldTown), r: 260, color: GROUND.cobble, kind: "cobble" },
  ];
  const weightsAt = (x0: number, y0: number) => {
    // the edges wander: every point is looked up a little off from where it is, by a slow noise, so no border follows the tiles
    const x = x0 + (noise(x0 / 150 + 7, y0 / 90) - 0.5) * 140, y = y0 + (noise(x0 / 120, y0 / 75 + 3) - 0.5) * 70;
    const d = inside(x, y); const out: { kind: string; color: number; w: number }[] = [];
    out.push({ kind: "sand", color: GROUND.sand, w: smooth((d - 0.85) / 0.07) });
    for (const z of zones) { let w = 0; for (const p of z.ids) { const dist = Math.hypot(p.x - x, (p.y - 30 - y) * 1.6); w = Math.max(w, smooth((z.r - dist) / 110)); } if (w > 0) out.push({ kind: z.kind, color: z.color, w }); }
    return out;
  };
  const TW = 64, TH = 32; const hill = places.get("hill") ?? places.get("mill");
  const contour = (x: number, y: number) => hill ? Math.max(0, 1 - Math.hypot(x - hill.x, (y - hill.y) * 1.7) / 420) : 0;
  for (let j = -12; j < (H / TH) * 2 + 12; j++) for (let i = -6; i < W / TW + 6; i++) {
    const x = i * TW + (j % 2 ? TW / 2 : 0), y = j * (TH / 2);
    const d = inside(x, y); if (d > 0.965) continue;
    // blend the grounds by weight, grass underneath
    let color = GROUND.grass; let dominant = "grass"; let best = 0;
    for (const z of weightsAt(x, y)) { color = mix(color, z.color, z.w); if (z.w > best) { best = z.w; dominant = z.w > 0.5 ? z.kind : dominant; } }
    // tone: a slow swell across the ground and a grain per tile, so nothing reads as a grid; the hill is a shade lighter as it rises
    const tone = (noise(x / 260, y / 160) - 0.5) * 0.06 + (hash2(i, j) - 0.5) * 0.012 + Math.floor(contour(x, y) * 3) * 0.012;
    g.moveTo(x, y - TH / 2).lineTo(x + TW / 2, y).lineTo(x, y + TH / 2).lineTo(x - TW / 2, y).closePath().fill(shade(color, tone));
    const h = hash2(i * 7, j * 3);
    if (dominant === "field" && (i + j) % 2 === 0) g.moveTo(x - 22, y - 2).lineTo(x + 22, y - 2).stroke({ width: 1.5, color: 0xb2c6a3, alpha: 0.9 });
    if (dominant === "forest" && h < 0.2) g.circle(x + (h * 50) % 11 - 5, y + (h * 70) % 7 - 3, 4).fill({ color: 0x9fbfa8, alpha: 0.8 });
    if (dominant === "cobble") for (let k = 0; k < 3; k++) { const hh = hash2(i + k * 17, j + k * 31); g.ellipse(x - 18 + hh * 36, y - 8 + ((hh * 97) % 1) * 16, 3.2, 2).fill({ color: KELP, alpha: 0.045 }); }
    if (dominant === "grass") {
      if (h < 0.11) { const gx = x - 10 + h * 180, gy = y - 4 + ((h * 53) % 1) * 8; g.moveTo(gx, gy).lineTo(gx + 2, gy - 6).moveTo(gx + 4, gy).lineTo(gx + 5, gy - 5).stroke({ width: 1.2, color: 0xa9c4a4, alpha: 0.9 }); }
      else if ((season === "spring" || season === "summer") && h > 0.93) { const fx = x - 12 + h * 24, fy = y - 3 + ((h * 31) % 1) * 6; g.circle(fx, fy, 1.6).fill({ color: h > 0.97 ? CORAL : CREAM, alpha: 0.85 }); }
      else if (h > 0.905 && h <= 0.93) g.ellipse(x - 8 + h * 16, y + 2, 3, 1.6).fill({ color: GROUND.rock, alpha: 0.5 });
    }
    if (dominant === "rock" && h < 0.16) g.ellipse(x - 8 + h * 100, y, 6, 3).fill({ color: 0x8e9aa8, alpha: 0.2 });
    if (dominant === "sand" && h < 0.08) g.moveTo(x - 9, y + 3).quadraticCurveTo(x, y + 1, x + 9, y + 3).stroke({ width: 1, color: GROUND.wetSand, alpha: 0.9 });
  }
  // the hill's contours: a thin dark edge on the downhill side of each step, inside the island only
  if (hill) for (const r of [140, 260, 380]) { const pts: [number, number][] = []; for (let k = 0; k <= 60; k++) { const a = (k / 60) * Math.PI; const x = hill.x + Math.cos(a) * r * (1 + (noise(k / 9, r / 100) - 0.5) * 0.18), y = hill.y + 20 + Math.sin(a) * r * 0.58; if (inside(x, y) < 0.95) pts.push([x, y]); else if (pts.length) { break; } } for (let k = 1; k < pts.length; k++) g.moveTo(pts[k - 1]![0], pts[k - 1]![1]).lineTo(pts[k]![0], pts[k]![1]).stroke({ width: 1.5, color: KELP, alpha: 0.07 }); }
  // the shore: a wrack line the tide left, and rocks where the noise put them
  const wrack = outline(0.985);
  for (let k = 0; k < wrack.length; k += 2) { const n = noise(k / 7, 3.3); if (n < 0.45) continue; const a = wrack[k]!, b = wrack[(k + 2) % wrack.length]!; g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 2, color: 0x9a9c7a, alpha: 0.35 + (n - 0.45) * 0.6, cap: "round" }); }
  const rocksAt = outline(0.993);
  for (let k = 0; k < rocksAt.length; k += 5) { const n = noise(k / 4 + 11, 7.1); if (n < 0.72) continue; const [x, y] = rocksAt[k]!; const s = 4 + n * 6; g.ellipse(x, y, s, s * 0.55).fill(GROUND.rock).stroke({ width: 1, color: KELP, alpha: 0.5 }); g.ellipse(x - s * 0.3, y - s * 0.2, s * 0.5, s * 0.25).fill({ color: 0xffffff, alpha: 0.25 }); }
  // where people stand: bare earth at every door and at the junctions
  for (const p of places.values()) { if (p.kind === "plot" || p.kind === "wild") continue; const dr = doorOf(p); g.ellipse(dr.x, dr.y, 62, 24).fill({ color: GROUND.earth, alpha: 0.35 }); g.ellipse(dr.x, dr.y, 40, 15).fill({ color: GROUND.earth, alpha: 0.35 }); }
  return g;
}

/** Roads with an edge, a centre worn pale, and cobbles in the old town. Drawn once; the wear layer above them changes. */
export function drawRoads(segs: Seg[]): Graphics {
  const g = new Graphics();
  segs.forEach((s, i) => ribbon(g, s.a, s.b, 34, s.cobbled ? 0xd3cbb8 : GROUND.earthEdge, 1, 3, i * 1.7));
  segs.forEach((s, i) => ribbon(g, s.a, s.b, 26, s.cobbled ? GROUND.cobble : GROUND.earth, 1, 3, i * 1.7));
  for (const s of segs) {
    if (s.cobbled) { // stones in courses along the street
      const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y); const ux = (s.b.x - s.a.x) / L, uy = (s.b.y - s.a.y) / L, nx = -uy, ny = ux;
      for (let t = 6; t < L - 6; t += 11) for (let k = -1; k <= 1; k++) { const h = hash2(Math.round(t), k + 5); if (h < 0.35) continue; const off = k * 7.5 + (h - 0.5) * 5; const x = s.a.x + ux * t + nx * off + (h * 7 % 1 - 0.5) * 4, y = s.a.y + uy * t + ny * off; g.ellipse(x, y, 3.6, 2).fill({ color: KELP, alpha: 0.045 }); }
    }
  }
  for (const s of segs) if (!s.cobbled) { const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = Math.hypot(dx, dy) || 1; const nx = -dy / L * 6, ny = dx / L * 6; for (const sgn of [-1, 1]) g.moveTo(s.a.x + nx * sgn, s.a.y + ny * sgn).lineTo(s.b.x + nx * sgn, s.b.y + ny * sgn).stroke({ width: 1.2, color: GROUND.earthEdge, alpha: 0.45 }); }
  return g;
}

/** The wear on the roads: the centre goes pale where feet go. Counts steps between places and redraws now and then. */
export class Wear extends Container {
  private g = new Graphics(); private count = new Map<string, number>(); private dirty = true;
  constructor(private segs: Seg[], seed: (s: Seg) => number) { super(); this.addChild(this.g); for (const s of segs) this.count.set(s.key, seed(s)); }
  step(from: string, to: string): void { const key = [from, to].sort().join("|"); if (!this.count.has(key)) return; this.count.set(key, (this.count.get(key) ?? 0) + 1); this.dirty = true; }
  redraw(): void {
    if (!this.dirty) return; this.dirty = false; const g = this.g; g.clear();
    for (const s of this.segs) { const n = this.count.get(s.key) ?? 0; if (n <= 0) continue; const k = Math.min(1, Math.log2(1 + n) / 7); ribbon(g, s.a, s.b, 4 + 9 * k, s.cobbled ? 0xe2dbca : 0xe6dcc4, 0.16 + 0.3 * k, 2, 3); }
  }
}

/** Nothing planted stands in the road: anything whose foot is within a road's width is moved sideways off it. Water and shore props are left alone. */
export function keepOffRoads<T extends { sprite: string; x: number; y: number }>(items: T[], segs: Seg[], margin = 30): T[] {
  const skip = /pier|rowboat|searocks|net|field|washing|fence/;
  return items.map((it) => {
    if (skip.test(it.sprite)) return it;
    let best: { d: number; nx: number; ny: number } | null = null;
    for (const s of segs) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((it.x - s.a.x) * dx + (it.y - s.a.y) * dy) / L2));
      const px = s.a.x + dx * t, py = s.a.y + dy * t; const ox = it.x - px, oy = it.y - py; const d = Math.hypot(ox, oy);
      if (!best || d < best.d) { const L = Math.hypot(dx, dy) || 1; const side = ox * -dy + oy * dx >= 0 ? 1 : -1; best = { d, nx: (-dy / L) * side, ny: (dx / L) * side }; }
    }
    if (!best || best.d >= margin) return it;
    return { ...it, x: it.x + best.nx * (margin - best.d + 6), y: it.y + best.ny * (margin - best.d + 6) };
  });
}
