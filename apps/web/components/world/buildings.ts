import { Container, Graphics } from "pixi.js";

/**
 * Every building and prop on the island, drawn in code in one projection, so they match each other and the people.
 * Dimetric, two to one: a point (i, j, k) on the ground grid stands at x = i - j, y = (i + j) / 2 - k.
 * Each drawing's origin is the bottom front corner of its footprint, which is where the place's (x, y) puts it.
 * Cream walls, teal roofs, sage doors and awnings, one coral thing at most, thin kelp outlines. The Tide palette.
 */
import { KELP, TEAL, TEAL_DARK, CREAM, CREAM_DARK, SAND, SAGE, SAGE_DARK, CORAL, WOOD, WOOD_DARK, STONE, STONE_DARK, GLASS, DARK } from "./palette";
const S = { width: 1.5, color: KELP, join: "round" as const };

type Pt = [number, number];
/** Project grid coordinates so that the front corner (w, d, 0) lands on the origin. */
const proj = (w: number, d: number) => (i: number, j: number, k: number): Pt => [(i - j) - (w - d), (i + j) / 2 - (w + d) / 2 - k];
const poly = (g: Graphics, pts: Pt[], fill: number, stroke = true) => { g.moveTo(pts[0]![0], pts[0]![1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath().fill(fill); if (stroke) g.stroke(S); };

/** A box on the ground: left face, right face, flat top. Returns the projector so details can be placed on faces. */
function box(g: Graphics, w: number, d: number, h: number, left = CREAM, right = CREAM_DARK, top = CREAM) {
  const P = proj(w, d);
  poly(g, [P(0, d, 0), P(w, d, 0), P(w, d, h), P(0, d, h)], left);   // left face (front, j = d)
  poly(g, [P(w, d, 0), P(w, 0, 0), P(w, 0, h), P(w, d, h)], right);  // right face (front, i = w)
  poly(g, [P(0, 0, h), P(w, 0, h), P(w, d, h), P(0, d, h)], top);    // top
  return P;
}
/** A gabled roof along the i axis on top of a box, with eaves. */
function gable(g: Graphics, w: number, d: number, h: number, rise: number, color = TEAL, dark = TEAL_DARK, eave = 6) {
  const P = proj(w, d);
  poly(g, [P(-eave, d + eave, h), P(w + eave, d + eave, h), P(w + eave, d / 2, h + rise), P(-eave, d / 2, h + rise)], color);      // front slope
  poly(g, [P(w + eave, d + eave, h), P(w + eave, -eave, h), P(w + eave, d / 2, h + rise)], dark);                                  // right gable end
  poly(g, [P(-eave, -eave, h), P(w + eave, -eave, h), P(w + eave, d / 2, h + rise), P(-eave, d / 2, h + rise)], dark, false);         // back slope, hidden mostly
}
/** A hipped roof: four slopes meeting at a ridge. */
function hip(g: Graphics, w: number, d: number, h: number, rise: number, color = TEAL, dark = TEAL_DARK, eave = 6) {
  const P = proj(w, d); const r1 = P(w * 0.3, d / 2, h + rise), r2 = P(w * 0.7, d / 2, h + rise);
  poly(g, [P(-eave, d + eave, h), P(w + eave, d + eave, h), r2, r1], color);
  poly(g, [P(w + eave, d + eave, h), P(w + eave, -eave, h), r2], dark);
}
/** A door on the left face at position t along it, and windows. */
function door(g: Graphics, P: ReturnType<typeof proj>, d: number, i: number, h = 20, color = SAGE) { poly(g, [P(i, d, 0), P(i + 12, d, 0), P(i + 12, d, h), P(i, d, h)], color); g.circle(P(i + 10, d, h / 2)[0], P(i + 10, d, h / 2)[1], 1.2).fill(KELP); }
function windowL(g: Graphics, P: ReturnType<typeof proj>, d: number, i: number, k: number, w = 10, h = 10, lit = false) { poly(g, [P(i, d, k), P(i + w, d, k), P(i + w, d, k + h), P(i, d, k + h)], lit ? 0xffe3a3 : GLASS); const m = P(i + w / 2, d, k); g.moveTo(m[0], m[1]).lineTo(m[0], m[1] - h).stroke({ width: 1, color: KELP }); }
function windowR(g: Graphics, P: ReturnType<typeof proj>, w: number, j: number, k: number, ww = 10, h = 10) { poly(g, [P(w, j, k), P(w, j + ww, k), P(w, j + ww, k + h), P(w, j, k + h)], GLASS); }
function chimney(g: Graphics, P: ReturnType<typeof proj>, i: number, j: number, base: number, h = 14) { const w = 8, d = 8; poly(g, [P(i, j + d, base), P(i + w, j + d, base), P(i + w, j + d, base + h), P(i, j + d, base + h)], CREAM); poly(g, [P(i + w, j + d, base), P(i + w, j, base), P(i + w, j, base + h), P(i + w, j + d, base + h)], CREAM_DARK); poly(g, [P(i, j, base + h), P(i + w, j, base + h), P(i + w, j + d, base + h), P(i, j + d, base + h)], CORAL); }
function awning(g: Graphics, P: ReturnType<typeof proj>, d: number, i0: number, i1: number, k: number, out = 14) { const n = Math.max(2, Math.round((i1 - i0) / 10)); for (let s = 0; s < n; s++) { const a = i0 + ((i1 - i0) * s) / n, b = i0 + ((i1 - i0) * (s + 1)) / n; poly(g, [P(a, d, k), P(b, d, k), P(b, d + out, k - 6), P(a, d + out, k - 6)], s % 2 ? CREAM : SAGE); } }
function sign(g: Graphics, P: ReturnType<typeof proj>, d: number, i: number, k: number, color = CORAL) { const a = P(i, d, k); g.moveTo(a[0], a[1]).lineTo(a[0] + 10, a[1] + 2).stroke(S); g.roundRect(a[0] + 8, a[1] + 1, 10, 8, 2).fill(color).stroke(S); }
function post(g: Graphics, P: ReturnType<typeof proj>, i: number, j: number, h: number) { const b = P(i, j, 0), t = P(i, j, h); g.moveTo(b[0], b[1]).lineTo(t[0], t[1]).stroke({ width: 3.5, color: WOOD_DARK }); g.moveTo(b[0], b[1]).lineTo(t[0], t[1]).stroke({ width: 1.2, color: KELP, alpha: 0.5 }); }
function treeBall(g: Graphics, x: number, y: number, r: number, color: number) { g.circle(x, y, r).fill(color).stroke(S); }

/** The foliage follows the calendar. Set once per season; the world redraws its trees after. */
export type Season = "winter" | "spring" | "summer" | "autumn";
const FOLIAGE: Record<Season, { a: number; b: number; c: number; d: number; bare: boolean }> = {
  spring: { a: 0x8fc4a8, b: 0x6fae91, c: 0xb9d9c6, d: 0x9fc2ad, bare: false },
  summer: { a: TEAL, b: TEAL_DARK, c: SAGE, d: SAGE_DARK, bare: false },
  autumn: { a: 0xc98a4b, b: 0xa8652f, c: 0xd9b26a, d: 0xb98a45, bare: false },
  winter: { a: 0x8ea3a0, b: 0x6f8683, c: 0xb4c3bd, d: 0x9aada7, bare: true },
};
let season: Season = "summer";
export function setSeason(s: string): boolean { const next = (s in FOLIAGE ? s : "summer") as Season; const changed = next !== season; season = next; return changed; }
/** A bare crown: a few branches instead of leaves. */
function bareCrown(g: Graphics, x: number, y: number, r: number) { for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.5; g.moveTo(x, y + r * 0.6).lineTo(x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.2).stroke({ width: 2.2, color: WOOD_DARK, cap: "round" }); g.moveTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7).lineTo(x + Math.cos(a + 0.45) * r * 1.1, y + Math.sin(a + 0.45) * r * 1.1).stroke({ width: 1.4, color: WOOD_DARK, cap: "round" }); } }
function crown(g: Graphics, x: number, y: number, r: number, which: "a" | "b" | "c" | "d") { const f = FOLIAGE[season]; if (f.bare) bareCrown(g, x, y, r); else treeBall(g, x, y, r, f[which]); }

type Drawn = { c: Container; w: number };
const D: Record<string, () => Drawn> = {
  house: () => { const g = new Graphics(); const w = 60, d = 44, h = 34; const P = box(g, w, d, h); door(g, P, d, 8); windowL(g, P, d, 34, 14); windowR(g, P, w, 12, 14); gable(g, w, d, h, 20); g.roundRect(P(35, d, 12)[0] - 1, P(35, d, 12)[1] - 4, 12, 4, 1).fill(CORAL); return { c: g, w: w + d }; },
  cottage: () => { const g = new Graphics(); const w = 50, d = 40, h = 30; const P = box(g, w, d, h); door(g, P, d, 6, 18); windowL(g, P, d, 30, 12); gable(g, w, d, h, 16, SAGE_DARK, 0x86ab95); return { c: g, w: w + d }; },
  shop: () => { const g = new Graphics(); const w = 70, d = 50, h = 38; const P = box(g, w, d, h); door(g, P, d, 50, 22); windowL(g, P, d, 8, 12, 30, 14); for (let i = 0; i < 4; i++) g.circle(P(13 + i * 7, d, 18)[0], P(13 + i * 7, d, 18)[1], 2).fill(CORAL); awning(g, P, d, 4, 44, 30); hip(g, w, d, h, 12); sign(g, P, d, 66, 30); return { c: g, w: w + d }; },
  inn: () => { const g = new Graphics(); const w = 120, d = 76, h = 64; const P = box(g, w, d, h); door(g, P, d, 52, 24); for (const i of [8, 28, 80, 100]) { windowL(g, P, d, i, 12); windowL(g, P, d, i, 40); } for (const j of [10, 34, 56]) { windowR(g, P, w, j, 12); windowR(g, P, w, j, 40); } gable(g, w, d, h, 30); chimney(g, P, 90, 30, h + 12); sign(g, P, d, 46, 34, TEAL); g.roundRect(P(24, d + 8, 0)[0] - 10, P(24, d + 8, 0)[1] - 6, 20, 5, 2).fill(WOOD).stroke(S); return { c: g, w: w + d }; },
  bakery: () => { const g = new Graphics(); const w = 90, d = 56, h = 46; const P = box(g, w, d, h); door(g, P, d, 70, 22); windowL(g, P, d, 10, 10, 44, 18); for (let i = 0; i < 5; i++) g.ellipse(P(16 + i * 8, d, 16)[0], P(16 + i * 8, d, 16)[1], 3.5, 2.2).fill(CORAL); awning(g, P, d, 6, 58, 30); windowR(g, P, w, 16, 16); gable(g, w, d, h, 22); chimney(g, P, 10, 40, h + 8); return { c: g, w: w + d }; },
  chandlery: () => { const g = new Graphics(); const w = 56, d = 46, h = 52; const P = box(g, w, d, h); door(g, P, d, 8, 22); windowL(g, P, d, 30, 14); windowL(g, P, d, 30, 34); windowR(g, P, w, 14, 34); gable(g, w, d, h, 18); const c = P(44, d + 2, 40); g.circle(c[0], c[1], 5).stroke({ width: 3, color: CORAL }); return { c: g, w: w + d }; },
  tavern: () => { const g = new Graphics(); const w = 90, d = 56, h = 44; const P = box(g, w, d, h); door(g, P, d, 38, 24); windowL(g, P, d, 10, 14, 14, 12); windowL(g, P, d, 64, 14, 14, 12); windowR(g, P, w, 14, 16, 14, 12); hip(g, w, d, h, 14); const l = P(30, d + 1, 30); g.roundRect(l[0] - 3, l[1] - 5, 6, 8, 2).fill(CORAL).stroke(S); const b = P(84, d + 10, 0); g.roundRect(b[0] - 7, b[1] - 16, 14, 16, 4).fill(WOOD).stroke(S); return { c: g, w: w + d }; },
  council: () => { const g = new Graphics(); const w = 110, d = 76, h = 54; const P = proj(w, d); poly(g, [P(-8, d + 8, 0), P(w + 8, d + 8, 0), P(w + 8, d + 8, 6), P(-8, d + 8, 6)], STONE); poly(g, [P(w + 8, d + 8, 0), P(w + 8, -8, 0), P(w + 8, -8, 6), P(w + 8, d + 8, 6)], STONE_DARK); box(g, w, d, h); door(g, P, d, 46, 28, KELP); for (const i of [6, 22, 74, 90]) { const b = P(i, d + 6, 6), t = P(i, d + 6, h); g.moveTo(b[0], b[1]).lineTo(t[0], t[1]).stroke({ width: 6, color: CREAM }); g.moveTo(b[0], b[1]).lineTo(t[0], t[1]).stroke({ width: 1.4, color: KELP, alpha: 0.6 }); } hip(g, w, d, h, 16); const t = P(w / 2, d / 2, h + 16); g.roundRect(t[0] - 4, t[1] - 14, 8, 14, 2).fill(CREAM).stroke(S); g.moveTo(t[0], t[1] - 14).lineTo(t[0] + 10, t[1] - 11).lineTo(t[0], t[1] - 8).closePath().fill(CORAL); return { c: g, w: w + d }; },
  chapel: () => { const g = new Graphics(); const w = 64, d = 56, h = 44; const P = box(g, w, d, h); poly(g, [P(28, d, 0), P(40, d, 0), P(40, d, 22), P(34, d, 27), P(28, d, 22)], SAGE); windowL(g, P, d, 8, 16, 8, 14); windowL(g, P, d, 50, 16, 8, 14); gable(g, w, d, h, 22); const tw = 20; const Q = proj(tw, tw); const t = new Graphics(); box(t, tw, tw, 74, CREAM, CREAM_DARK); poly(t, [Q(2, tw, 56), Q(tw - 2, tw, 56), Q(tw - 2, tw, 68), Q(2, tw, 68)], DARK); const bq = Q(tw / 2, tw, 62); const bell = new Graphics(); bell.label = "bell"; bell.position.set(bq[0], bq[1] - 5); bell.moveTo(0, 0).lineTo(0, 3).stroke({ width: 1.2, color: KELP }); bell.circle(0, 6, 3).fill(CORAL).stroke({ width: 1, color: KELP }); poly(t, [Q(-3, tw + 3, 74), Q(tw + 3, tw + 3, 74), Q(tw / 2, tw / 2, 92)], TEAL); poly(t, [Q(tw + 3, tw + 3, 74), Q(tw + 3, -3, 74), Q(tw / 2, tw / 2, 92)], TEAL_DARK); const at = P(6, 8, 0); t.position.set(at[0] + (tw - tw), at[1]); bell.position.set(bell.position.x + t.position.x, bell.position.y + t.position.y); const c = new Container(); c.addChild(g, t, bell); return { c, w: w + d }; },
  smithy: () => { const g = new Graphics(); const w = 80, d = 56, h = 36; const P = box(g, w, d, h); poly(g, [P(10, d, 0), P(50, d, 0), P(50, d, 26), P(10, d, 26)], DARK); const a = P(30, d + 2, 0); g.roundRect(a[0] - 8, a[1] - 9, 16, 6, 2).fill(KELP); g.roundRect(a[0] - 3, a[1] - 3, 6, 3, 1).fill(KELP); windowR(g, P, w, 16, 14); gable(g, w, d, h, 16, SAGE_DARK, 0x86ab95); chimney(g, P, 60, 36, h + 6, 18); return { c: g, w: w + d }; },
  mill: () => {
    const g = new Graphics(); const w = 44, d = 44, h = 80; const P = proj(w, d);
    poly(g, [P(0, d, 0), P(w, d, 0), P(w - 6, d - 6, h), P(6, d - 6, h)], CREAM); poly(g, [P(w, d, 0), P(w, 0, 0), P(w - 6, 6, h), P(w - 6, d - 6, h)], CREAM_DARK); poly(g, [P(6, 6, h), P(w - 6, 6, h), P(w - 6, d - 6, h), P(6, d - 6, h)], CREAM);
    door(g, P, d, 16, 18, KELP); windowL(g, P, d, 18, 40, 8, 10); windowL(g, P, d, 18, 60, 8, 8);
    poly(g, [P(-2, d + 2, h), P(w + 2, d + 2, h), P(w / 2, d / 2, h + 26)], TEAL); poly(g, [P(w + 2, d + 2, h), P(w + 2, -2, h), P(w / 2, d / 2, h + 26)], TEAL_DARK);
    // the sails: four arms from a hub on the right face, each with a lattice sail set to one side of the arm
    const hub = P(w + 4, d / 2, h - 8); const len = 50, sw = 12;
    // the sails are their own part, pivoted on the hub, so the world can turn them while the mill is worked
    const sails = new Graphics(); sails.label = "sails"; sails.position.set(hub[0], hub[1]);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + 0.35; const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux; // along the arm, and perpendicular
      const at = (t: number, side: number): Pt => [ux * t + nx * side, uy * t + ny * side];
      sails.moveTo(0, 0).lineTo(at(len, 0)[0], at(len, 0)[1]).stroke({ width: 3.5, color: KELP });
      poly(sails, [at(14, 0), at(len - 2, 0), at(len - 2, sw), at(14, sw)], CREAM);
      for (let t = 20; t < len - 2; t += 8) sails.moveTo(at(t, 0)[0], at(t, 0)[1]).lineTo(at(t, sw)[0], at(t, sw)[1]).stroke({ width: 1, color: KELP, alpha: 0.7 });
      sails.moveTo(at(14, sw / 2)[0], at(14, sw / 2)[1]).lineTo(at(len - 2, sw / 2)[0], at(len - 2, sw / 2)[1]).stroke({ width: 1, color: KELP, alpha: 0.7 });
    }
    sails.circle(0, 0, 4).fill(CORAL).stroke(S);
    const c = new Container(); c.addChild(g, sails);
    return { c, w: w + d + 50 };
  },
  fishhouse: () => { const g = new Graphics(); const w = 80, d = 46, h = 28; const P = box(g, w, d, h, CREAM, CREAM_DARK); poly(g, [P(8, d, 0), P(60, d, 0), P(60, d, 22), P(8, d, 22)], DARK); for (let i = 0; i < 4; i++) { const f = P(16 + i * 12, d + 1, 18); g.ellipse(f[0], f[1] + 4, 2.5, 5).fill(SAGE).stroke({ width: 1, color: KELP }); } gable(g, w, d, h, 12, SAGE_DARK, 0x86ab95); const b = P(74, d + 8, 0); g.roundRect(b[0] - 6, b[1] - 12, 12, 12, 3).fill(WOOD).stroke(S); return { c: g, w: w + d }; },
  "harbor-office": () => { const g = new Graphics(); const w = 54, d = 46, h = 42; const P = box(g, w, d, h); door(g, P, d, 8, 22, TEAL); windowL(g, P, d, 32, 16, 12, 12); windowR(g, P, w, 12, 16); hip(g, w, d, h, 12); const f = P(w, 0, h + 12); g.moveTo(f[0], f[1]).lineTo(f[0], f[1] - 26).stroke(S); g.moveTo(f[0], f[1] - 26).lineTo(f[0] + 14, f[1] - 22).lineTo(f[0], f[1] - 17).closePath().fill(CORAL); return { c: g, w: w + d }; },
  boatshed: () => { const g = new Graphics(); const w = 84, d = 56, h = 32; const P = box(g, w, d, h, CREAM, CREAM_DARK); poly(g, [P(12, d, 0), P(72, d, 0), P(72, d, 26), P(12, d, 26)], DARK); const b = P(42, d + 6, 0); g.ellipse(b[0], b[1] - 4, 22, 6).fill(WOOD).stroke(S); g.ellipse(b[0], b[1] - 6, 16, 3).fill(WOOD_DARK); gable(g, w, d, h, 16, SAGE_DARK, 0x86ab95); return { c: g, w: w + d }; },
  stall: () => {
    const g = new Graphics(); const w = 70, d = 44, h = 34; const P = proj(w, d);
    for (const [i, j] of [[0, 0], [w, 0]] as const) post(g, P, i, j, h);
    // the counter, with goods on it
    poly(g, [P(0, d, 10), P(w, d, 10), P(w, d, 20), P(0, d, 20)], WOOD); poly(g, [P(w, d, 10), P(w, 0, 10), P(w, 0, 20), P(w, d, 20)], WOOD_DARK); poly(g, [P(0, 0, 20), P(w, 0, 20), P(w, d, 20), P(0, d, 20)], 0xd6c49e);
    for (const [i, j] of [[0, d], [w, d]] as const) post(g, P, i, j, h);
    // the canopy: a hipped roof whose front slope is striped, drawn stripe by stripe from eave to ridge
    const e = 8, rise = 12; const r1 = P(w * 0.3, d / 2, h + rise), r2 = P(w * 0.7, d / 2, h + rise);
    const n = 8; const ex0 = -e, ex1 = w + e;
    for (let k = 0; k < n; k++) {
      const a = ex0 + ((ex1 - ex0) * k) / n, b = ex0 + ((ex1 - ex0) * (k + 1)) / n;
      const ta = w * 0.3 + (w * 0.4) * Math.max(0, Math.min(1, (a - w * 0.3) / (w * 0.4))), tb = w * 0.3 + (w * 0.4) * Math.max(0, Math.min(1, (b - w * 0.3) / (w * 0.4)));
      poly(g, [P(a, d + e, h), P(b, d + e, h), P(tb, d / 2, h + rise), P(ta, d / 2, h + rise)], k % 2 ? CREAM : SAGE, false);
    }
    g.moveTo(P(ex0, d + e, h)[0], P(ex0, d + e, h)[1]).lineTo(P(ex1, d + e, h)[0], P(ex1, d + e, h)[1]).lineTo(r2[0], r2[1]).lineTo(r1[0], r1[1]).closePath().stroke(S);
    poly(g, [P(ex1, d + e, h), P(ex1, -e, h), r2], SAGE_DARK);
    // a scalloped fringe hanging from the front eave
    for (let k = 0; k < n; k++) { const a = P(ex0 + ((ex1 - ex0) * k) / n, d + e, h), b = P(ex0 + ((ex1 - ex0) * (k + 1)) / n, d + e, h); g.moveTo(a[0], a[1]).quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 6, b[0], b[1]).lineTo(b[0], b[1]).closePath().fill(k % 2 ? SAGE : CREAM).stroke({ width: 1, color: KELP }); }
    return { c: g, w: w + d };
  },
  well: () => { const g = new Graphics(); const w = 26, d = 26, h = 14; const P = box(g, w, d, h, STONE, STONE_DARK, DARK); post(g, P, 2, 2, 34); post(g, P, w - 2, w - 2, 34); poly(g, [P(-6, d + 6, 34), P(w + 6, d + 6, 34), P(w / 2, d / 2, 46)], TEAL); poly(g, [P(w + 6, d + 6, 34), P(w + 6, -6, 34), P(w / 2, d / 2, 46)], TEAL_DARK); return { c: g, w: 60 }; },
  sawpit: () => { const g = new Graphics(); const w = 80, d = 50, h = 34; const P = proj(w, d); for (const [i, j] of [[0, 0], [w, 0], [0, d], [w, d]] as const) post(g, P, i, j, h); const s = P(70, d - 4, 2); g.moveTo(s[0] - 12, s[1] - 2).lineTo(s[0] + 14, s[1] - 24).stroke({ width: 3, color: CORAL }); g.moveTo(s[0] - 12, s[1] - 2).lineTo(s[0] + 14, s[1] - 24).stroke({ width: 1, color: KELP }); hip(g, w, d, h, 10, TEAL, TEAL_DARK, 8); return { c: g, w: w + d }; },
  quarry: () => { const g = new Graphics(); const w = 110, d = 70; const P = proj(w, d); for (let k = 0; k < 3; k++) { const in_ = k * 18, hh = 14; poly(g, [P(in_, d - in_, k * hh), P(w - in_, d - in_, k * hh), P(w - in_, d - in_, (k + 1) * hh), P(in_, d - in_, (k + 1) * hh)], STONE); poly(g, [P(w - in_, d - in_, k * hh), P(w - in_, in_, k * hh), P(w - in_, in_, (k + 1) * hh), P(w - in_, d - in_, (k + 1) * hh)], STONE_DARK); poly(g, [P(in_, in_, (k + 1) * hh), P(w - in_, in_, (k + 1) * hh), P(w - in_, d - in_, (k + 1) * hh), P(in_, d - in_, (k + 1) * hh)], STONE); } const c = P(20, d + 14, 0); g.roundRect(c[0] - 12, c[1] - 12, 24, 10, 2).fill(WOOD).stroke(S); g.circle(c[0] - 8, c[1], 4).fill(KELP); g.circle(c[0] + 8, c[1], 4).fill(KELP); for (let i = 0; i < 3; i++) g.roundRect(c[0] + 20 + i * 9, c[1] - 8, 8, 8, 1.5).fill(STONE).stroke(S); return { c: g, w: w + d }; },
  lighthouse: () => { const g = new Graphics(); const w = 30, d = 30, h = 96; const P = proj(w, d); poly(g, [P(-10, d + 10, 0), P(w + 10, d + 10, 0), P(w + 10, d + 10, 10), P(-10, d + 10, 10)], STONE); poly(g, [P(w + 10, d + 10, 0), P(w + 10, -10, 0), P(w + 10, -10, 10), P(w + 10, d + 10, 10)], STONE_DARK); poly(g, [P(0, d, 10), P(w, d, 10), P(w - 6, d - 6, h), P(6, d - 6, h)], CREAM); poly(g, [P(w, d, 10), P(w, 0, 10), P(w - 6, 6, h), P(w - 6, d - 6, h)], CREAM_DARK); poly(g, [P(1, d - 1, 46), P(w - 1, d - 1, 46), P(w - 3, d - 3, 62), P(3, d - 3, 62)], TEAL); poly(g, [P(w - 1, d - 1, 46), P(w - 1, 1, 46), P(w - 3, 3, 62), P(w - 3, d - 3, 62)], TEAL_DARK); door(g, P, d, 9, 16, CORAL); const t = P(w / 2, d / 2, h); g.roundRect(t[0] - 12, t[1] - 3, 24, 5, 2).fill(KELP); g.roundRect(t[0] - 8, t[1] - 18, 16, 15, 3).fill(0xffe3a3).stroke(S); g.circle(t[0], t[1] - 10, 4).fill(CORAL); g.moveTo(t[0] - 10, t[1] - 18).lineTo(t[0], t[1] - 28).lineTo(t[0] + 10, t[1] - 18).closePath().fill(TEAL).stroke(S); return { c: g, w: 80 }; },
  orchard: () => { const g = new Graphics(); const w = 100, d = 70; const P = proj(w, d); poly(g, [P(0, 0, 0), P(w, 0, 0), P(w, d, 0), P(0, d, 0)], 0xcfe0c6, false); for (const [i, j] of [[18, 18], [50, 18], [82, 18], [18, 52], [50, 52], [82, 52]] as const) { const b = P(i, j, 0); g.moveTo(b[0], b[1]).lineTo(b[0], b[1] - 12).stroke({ width: 3, color: WOOD_DARK }); treeBall(g, b[0], b[1] - 20, 11, SAGE); for (let k = 0; k < 3; k++) g.circle(b[0] - 6 + k * 6, b[1] - 22 + (k % 2) * 5, 1.8).fill(CORAL); } for (let s = 0; s < 6; s++) { const a = P(s * 20, d, 0), b = P(s * 20 + 20, d, 0); g.moveTo(a[0], a[1] - 6).lineTo(b[0], b[1] - 6).stroke({ width: 2, color: WOOD }); g.moveTo(a[0], a[1]).lineTo(a[0], a[1] - 9).stroke({ width: 2, color: WOOD_DARK }); } return { c: g, w: w + d }; },
  field: () => { const g = new Graphics(); const w = 110, d = 70; const P = proj(w, d); poly(g, [P(0, 0, 0), P(w, 0, 0), P(w, d, 0), P(0, d, 0)], 0xcfe0c6); for (let j = 8; j < d; j += 10) { const a = P(4, j, 0), b = P(w - 4, j, 0); g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 3, color: SAGE_DARK }); for (let i = 10; i < w; i += 14) { const p = P(i, j, 0); g.circle(p[0], p[1] - 3, 2.2).fill(SAGE); } } return { c: g, w: w + d }; },
  // props
  "tree-large": () => { const g = new Graphics(); g.moveTo(0, 0).lineTo(0, -34).stroke({ width: 9, color: WOOD_DARK }); g.moveTo(0, 0).lineTo(0, -34).stroke({ width: 1.2, color: KELP, alpha: 0.5 }); crown(g, -24, -52, 26, "a"); crown(g, 24, -55, 25, "b"); crown(g, -6, -46, 18, "d"); crown(g, 0, -78, 30, "a"); crown(g, 14, -62, 16, "b"); return { c: g, w: 110 }; },
  "tree-small": () => { const g = new Graphics(); g.moveTo(0, 0).lineTo(0, -22).stroke({ width: 6, color: WOOD_DARK }); g.moveTo(0, 0).lineTo(0, -22).stroke({ width: 1.2, color: KELP, alpha: 0.5 }); crown(g, -13, -34, 16, "c"); crown(g, 13, -37, 15, "d"); crown(g, 0, -50, 18, "c"); return { c: g, w: 66 }; },
  bush: () => { const g = new Graphics(); treeBall(g, -7, -6, 8, SAGE); treeBall(g, 7, -7, 8, SAGE_DARK); treeBall(g, 0, -11, 9, SAGE); return { c: g, w: 34 }; },
  rock: () => { const g = new Graphics(); poly(g, [[-14, 0], [14, 0], [16, -8], [6, -18], [-8, -16], [-16, -6]], STONE); poly(g, [[-2, -18], [6, -18], [16, -8], [8, -6]], STONE_DARK, false); return { c: g, w: 34 }; },
  searocks: () => { const g = new Graphics(); poly(g, [[-30, 0], [-6, 0], [-4, -10], [-16, -16], [-30, -8]], STONE); poly(g, [[-8, 0], [26, 0], [28, -8], [14, -20], [0, -14]], STONE); poly(g, [[0, -14], [14, -20], [28, -8], [14, -6]], STONE_DARK, false); return { c: g, w: 60 }; },
  lamp: () => { const g = new Graphics(); g.moveTo(0, 0).lineTo(0, -34).stroke({ width: 3, color: KELP }); g.roundRect(-5, -44, 10, 12, 2).fill(0xffe3a3).stroke(S); g.moveTo(-6, -44).lineTo(0, -49).lineTo(6, -44).closePath().fill(KELP); g.roundRect(-5, -2, 10, 3, 1).fill(KELP); return { c: g, w: 14 }; },
  bench: () => { const g = new Graphics(); g.roundRect(-16, -12, 32, 5, 2).fill(WOOD).stroke(S); g.roundRect(-16, -20, 32, 4, 2).fill(WOOD).stroke(S); g.moveTo(-12, -7).lineTo(-12, 0).moveTo(12, -7).lineTo(12, 0).stroke({ width: 2, color: KELP }); return { c: g, w: 36 }; },
  "washing": () => { const g = new Graphics(); g.moveTo(-60, -60).lineTo(-60, 0).stroke({ width: 3, color: WOOD_DARK }); g.moveTo(60, -62).lineTo(60, 0).stroke({ width: 3, color: WOOD_DARK }); g.moveTo(-60, -60).quadraticCurveTo(0, -50, 60, -62).stroke({ width: 1.2, color: KELP }); const cloth = new Graphics(); cloth.label = "cloth"; for (const [x, wd, h, col] of [[-42, 14, 18, CREAM], [-18, 12, 22, CORAL], [8, 16, 16, SAGE], [34, 10, 20, CREAM]] as const) { cloth.roundRect(x, -56 + (x * x) / 900, wd, h, 2).fill(col).stroke({ width: 1, color: KELP }); } g.addChild(cloth); return { c: g, w: 130 }; },
  // dressing by district: low stone walls, cypresses on the hill, olive trees on the terraces, barrels and nets at the harbour
  wall: () => { const g = new Graphics(); const w = 110, d = 10, h = 12; const P = proj(w, d); poly(g, [P(0, d, 0), P(w, d, 0), P(w, d, h), P(0, d, h)], 0xdcd9cf); poly(g, [P(w, d, 0), P(w, 0, 0), P(w, 0, h), P(w, d, h)], 0xc9c4b6); poly(g, [P(0, 0, h), P(w, 0, h), P(w, d, h), P(0, d, h)], CREAM_DARK); for (let i = 8; i < w - 6; i += 14) { const a = P(i, d, 2 + (i % 3)), b = P(i + 7, d, 8 - (i % 2)); g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 1, color: KELP, alpha: 0.35 }); } return { c: g, w: w + d }; },
  cypress: () => { const g = new Graphics(); g.moveTo(0, 0).lineTo(0, -14).stroke({ width: 4, color: WOOD_DARK }); g.moveTo(-9, -14).quadraticCurveTo(-11, -50, 0, -78).quadraticCurveTo(11, -50, 9, -14).closePath().fill(TEAL_DARK).stroke(S); g.moveTo(-5, -20).quadraticCurveTo(-4, -50, 0, -70).stroke({ width: 1, color: KELP, alpha: 0.35 }); return { c: g, w: 24 }; },
  olive: () => { const g = new Graphics(); g.moveTo(0, 0).quadraticCurveTo(-3, -12, -8, -20).stroke({ width: 5, color: WOOD_DARK }); g.moveTo(0, 0).quadraticCurveTo(3, -12, 7, -22).stroke({ width: 4, color: WOOD_DARK }); treeBall(g, -12, -30, 12, SAGE_DARK); treeBall(g, 10, -32, 11, SAGE); treeBall(g, -1, -40, 13, SAGE_DARK); return { c: g, w: 50 }; },
  barrel: () => { const g = new Graphics(); g.roundRect(-9, -26, 18, 26, 5).fill(WOOD).stroke(S); g.rect(-9, -19, 18, 2).fill(KELP); g.rect(-9, -9, 18, 2).fill(KELP); g.ellipse(0, -26, 9, 3).fill(WOOD_DARK).stroke({ width: 1, color: KELP }); return { c: g, w: 22 }; },
  net: () => { const g = new Graphics(); g.moveTo(-40, 0).lineTo(-40, -44).stroke({ width: 3, color: WOOD_DARK }); g.moveTo(40, 0).lineTo(40, -46).stroke({ width: 3, color: WOOD_DARK }); g.moveTo(-40, -44).quadraticCurveTo(0, -30, 40, -46).stroke({ width: 1.2, color: KELP }); for (let x = -34; x <= 34; x += 8) g.moveTo(x, -42 + (x * x) / 400).lineTo(x, -10 + (x * x) / 600).stroke({ width: 1, color: SAGE_DARK, alpha: 0.9 }); for (let y = -38; y <= -12; y += 7) g.moveTo(-34, y + 2).quadraticCurveTo(0, y + 8, 34, y + 2).stroke({ width: 1, color: SAGE_DARK, alpha: 0.9 }); return { c: g, w: 84 }; },
  crates: () => { const g = new Graphics(); const P = proj(18, 18); box(g, 18, 18, 16, WOOD, WOOD_DARK, WOOD); const Q = proj(14, 14); const g2 = new Graphics(); box(g2, 14, 14, 12, WOOD, WOOD_DARK, WOOD); const a = P(18, 0, 16); g2.position.set(a[0] - 8, a[1] + 2); void Q; const c = new Container(); c.addChild(g, g2); return { c, w: 40 }; },
  fence: () => { const g = new Graphics(); for (let x = -50; x <= 50; x += 20) g.roundRect(x - 2, -18, 4, 18, 1).fill(WOOD).stroke({ width: 1, color: KELP }); g.roundRect(-52, -14, 104, 3, 1).fill(WOOD).stroke({ width: 1, color: KELP }); g.roundRect(-52, -7, 104, 3, 1).fill(WOOD).stroke({ width: 1, color: KELP }); return { c: g, w: 110 }; },
  pier: () => { const g = new Graphics(); for (let x = -120; x < 120; x += 12) g.rect(x, -10, 11, 20).fill(x % 24 ? WOOD : 0xd6c49e).stroke({ width: 1, color: KELP, alpha: 0.7 }); for (let x = -110; x <= 110; x += 44) { g.roundRect(x - 3, -18, 6, 10, 2).fill(WOOD_DARK).stroke({ width: 1, color: KELP }); g.roundRect(x - 3, 8, 6, 10, 2).fill(WOOD_DARK).stroke({ width: 1, color: KELP }); } return { c: g, w: 240 }; },
  rowboat: () => { const g = new Graphics(); g.moveTo(-22, -4).quadraticCurveTo(0, 8, 22, -4).lineTo(18, -10).quadraticCurveTo(0, -4, -18, -10).closePath().fill(WOOD).stroke(S); g.roundRect(-4, -12, 8, 3, 1).fill(WOOD_DARK); g.moveTo(-6, -8).lineTo(-26, -20).stroke({ width: 2, color: KELP }); return { c: g, w: 50 }; },
  ferry: () => { const g = new Graphics(); g.moveTo(-70, -10).lineTo(70, -10).lineTo(60, 8).quadraticCurveTo(0, 16, -62, 8).closePath().fill(CREAM).stroke(S); g.rect(-70, -10, 140, 5).fill(TEAL); g.roundRect(-34, -34, 62, 24, 4).fill(CREAM).stroke(S); for (let x = -26; x < 24; x += 12) g.roundRect(x, -30, 8, 8, 2).fill(GLASS).stroke({ width: 1, color: KELP }); g.roundRect(10, -48, 10, 16, 3).fill(CORAL).stroke(S); g.circle(-50, -4, 5).stroke({ width: 3, color: CORAL }); g.moveTo(-48, -34).lineTo(-48, -50).stroke({ width: 2, color: KELP }); g.moveTo(-48, -50).lineTo(-38, -46).lineTo(-48, -42).closePath().fill(TEAL); return { c: g, w: 150 }; },
};

/** A fresh drawing of the named thing, or null if the atlas still has to stand in. */
export function drawThing(name: string): Drawn | null { const f = D[name]; return f ? f() : null; }

/**
 * What is on the shelves, drawn onto the building: loaves, fish and apples on the market counter, the plank pile at the
 * sawpit, logs at the pinewood, sacks at the mill. Empty shelves draw nothing, and that is the point: the street shows the economy.
 */
export function drawStock(sprite: string, stock: Record<string, number>): Graphics | null {
  const g = new Graphics(); const n = (k: string, per: number, max: number) => Math.min(max, Math.ceil((stock[k] ?? 0) / per));
  if (sprite === "stall") {
    const w = 70, d = 44; const P = proj(w, d);
    const rows: [string, number, (q: Pt) => void][] = [
      ["bread", 3, (q) => { g.ellipse(q[0], q[1] - 3, 4.2, 2.6).fill(0xd9b26a).stroke({ width: 1, color: KELP }); }],
      ["fish", 3, (q) => { g.ellipse(q[0], q[1] - 3, 4.5, 2).fill(SAGE_DARK).stroke({ width: 1, color: KELP }); g.moveTo(q[0] + 4, q[1] - 3).lineTo(q[0] + 6.5, q[1] - 5).lineTo(q[0] + 6.5, q[1] - 1).closePath().fill(SAGE_DARK).stroke({ width: 1, color: KELP }); }],
      ["apples", 3, (q) => { g.circle(q[0], q[1] - 3, 3).fill(CORAL).stroke({ width: 1, color: KELP }); }],
    ];
    let any = false;
    rows.forEach(([item, per, draw], r) => { const k = n(item, per, 6); for (let i = 0; i < k; i++) { draw(P(8 + i * 10, d - 8 - r * 9, 20)); any = true; } });
    return any ? g : null;
  }
  if (sprite === "sawpit") {
    const w = 80, d = 50; const P = proj(w, d); const layers = n("planks", 4, 7); if (!layers) return null;
    for (let k = 0; k < layers; k++) poly(g, [P(10, d - 8 - k * 5, k * 4), P(60, d - 8 - k * 5, k * 4), P(60, d - 8 - k * 5, k * 4 + 4), P(10, d - 8 - k * 5, k * 4 + 4)], k % 2 ? WOOD : CREAM);
    return g;
  }
  if (sprite === "tree-large") { // the pinewood: a log pile at its foot
    const logs = n("timber", 3, 6); if (!logs) return null;
    for (let i = 0; i < logs; i++) { const row = i < 3 ? 0 : 1, col = i < 3 ? i : i - 3; const x = 40 + col * 14 - row * 7, y = 6 - row * 9; g.moveTo(x - 10, y).lineTo(x + 10, y).stroke({ width: 8, color: WOOD_DARK, cap: "round" }); g.circle(x + 10, y, 4).fill(WOOD).stroke({ width: 1, color: KELP }); }
    return g;
  }
  if (sprite === "mill") { const sacks = n("flour", 8, 5); if (!sacks) return null; for (let i = 0; i < sacks; i++) { const x = 30 + i * 11, y = 4 - (i % 2) * 2; g.ellipse(x, y - 6, 5, 7).fill(CREAM).stroke({ width: 1.2, color: KELP }); g.moveTo(x - 3, y - 12).lineTo(x + 3, y - 12).stroke({ width: 1.5, color: KELP }); } return g; }
  if (sprite === "fishhouse") { const crates = n("fish", 6, 3); if (!crates) return null; for (let i = 0; i < crates; i++) { const x = 44 + i * 16, y = 8; g.rect(x - 7, y - 8, 14, 8).fill(WOOD).stroke({ width: 1.2, color: KELP }); for (let f = 0; f < 3; f++) g.ellipse(x - 4 + f * 4, y - 9, 2.2, 1.2).fill(SAGE_DARK); } return g; }
  return null;
}
export const DRAWN = new Set(Object.keys(D));
