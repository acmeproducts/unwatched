/**
 * Things in the air that the drawings cannot carry: embers over a lit hearth, sparks off the forge, dust behind the cart,
 * pollen over the meadows in the warm months. Plain sprites of one soft disc, so a few hundred cost nothing.
 * The embers and sparks live on a layer above the night, so the dark cannot dim them.
 */
import { Container, Sprite, Texture, Graphics, RenderTexture, type Renderer } from "pixi.js";

type Pt = { x: number; y: number };
type Mote = { s: Sprite; x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; kind: "ember" | "spark" | "dust" | "pollen" };

const rnd = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export class Particles {
  /** dust and pollen: in the scene, under the night */
  readonly air = new Container();
  /** embers and sparks: above the night, additive */
  readonly glow = new Container();
  private motes: Mote[] = [];
  private pool: Sprite[] = [];
  private tex: Texture | null = null;
  private r = rnd(99);
  constructor(scene: Container) { this.air.zIndex = 186000; scene.addChild(this.air); this.glow.blendMode = "add"; }
  private texture(renderer: Renderer): Texture {
    if (this.tex) return this.tex;
    const g = new Graphics(); const R = 16; for (let i = R; i > 0; i--) g.circle(R, R, i).fill({ color: 0xffffff, alpha: (1 - i / R) * 0.28 });
    const rt = RenderTexture.create({ width: R * 2, height: R * 2, resolution: 2 }); renderer.render({ container: g, target: rt }); g.destroy(); this.tex = rt; return rt;
  }
  private spawn(renderer: Renderer, kind: Mote["kind"], x: number, y: number, vx: number, vy: number, life: number, size: number, tint: number, alphaLayer: "air" | "glow"): void {
    if (this.motes.length > 900) return;
    const s = this.pool.pop() ?? new Sprite(this.texture(renderer)); s.anchor.set(0.5); s.tint = tint; s.alpha = 0; s.visible = true;
    (alphaLayer === "glow" ? this.glow : this.air).addChild(s);
    this.motes.push({ s, x, y, vx, vy, life, age: 0, size, kind });
  }
  update(o: {
    renderer: Renderer; tick: number; wind: number; night: number; hour: number; season: string; weather: string;
    hearths: Pt[]; forge: { x: number; y: number; on: boolean }; cart: { x: number; y: number; moving: boolean }; meadows: (Pt & { r: number })[]; effects: boolean;
  }): void {
    const { renderer, tick, wind } = o; const r = this.r;
    if (!o.effects) { for (const m of this.motes) m.s.visible = false; return; }
    const wet = o.weather === "rain" || o.weather === "storm" || o.weather === "snow";
    // embers: a few a second over each lit hearth, more at night when they show
    if (o.night > 0.05 || o.hour < 8 || o.hour > 17) for (const h of o.hearths) if (tick % 3 === 0 && r() < 0.6) this.spawn(renderer, "ember", h.x + (r() - 0.5) * 12, h.y, (r() - 0.5) * 0.3 + wind * 0.25, -0.6 - r() * 0.6, 90 + r() * 80, 0.26 + r() * 0.16, r() < 0.7 ? 0xffb257 : 0xff6a3a, "glow");
    // sparks: bursts off the anvil while the smith works, in daylight hours
    if (o.forge.on && tick % 36 < 8 && tick % 2 === 0) for (let i = 0; i < 6; i++) this.spawn(renderer, "spark", o.forge.x + (r() - 0.5) * 6, o.forge.y, (r() - 0.5) * 3.2 + 0.6, -2.2 - r() * 2.4, 20 + r() * 16, 0.09 + r() * 0.07, r() < 0.5 ? 0xffb347 : 0xff7a2f, "air");
    // dust: a puff at each wheel while the cart rolls, in dry weather
    if (o.cart.moving && !wet && tick % 4 === 0) this.spawn(renderer, "dust", o.cart.x - 14 + (r() - 0.5) * 12, o.cart.y + 2, (r() - 0.5) * 0.4 + wind * 0.3, -0.25 - r() * 0.25, 50 + r() * 40, 0.5 + r() * 0.5, 0xe9e2d2, "air");
    // pollen: slow motes over the meadows in spring and summer, by day, when it is dry
    const warm = o.season === "spring" || o.season === "summer";
    if (warm && !wet && o.night < 0.2 && tick % 5 === 0) for (const m of o.meadows) if (r() < 0.5) { const a = r() * Math.PI * 2, d = r() * m.r; this.spawn(renderer, "pollen", m.x + Math.cos(a) * d, m.y + Math.sin(a) * d * 0.55, (r() - 0.5) * 0.2 + wind * 0.2, -0.08 - r() * 0.1, 180 + r() * 120, 0.17 + r() * 0.1, 0xfff4c4, "air"); }
    // move and age everything
    const keep: Mote[] = [];
    for (const m of this.motes) {
      m.age++; const t = m.age / m.life;
      if (t >= 1) { m.s.visible = false; m.s.removeFromParent(); this.pool.push(m.s); continue; }
      if (m.kind === "ember") { m.vx += (r() - 0.5) * 0.06; m.vy -= 0.004; m.x += m.vx + Math.sin(m.age / 9 + m.life) * 0.25; m.y += m.vy; m.s.alpha = Math.min(1, t * 6) * (1 - t) * (0.7 + 0.3 * Math.sin(m.age / 3)); m.s.scale.set(m.size * (1 - t * 0.5)); }
      else if (m.kind === "spark") { m.vy += 0.16; m.x += m.vx; m.y += m.vy; m.s.alpha = 1 - t * 0.6; m.s.rotation = Math.atan2(m.vy, m.vx); m.s.scale.set(m.size * 2.6, m.size * 0.8); }
      else if (m.kind === "dust") { m.x += m.vx; m.y += m.vy; m.s.alpha = 0.35 * Math.min(1, t * 4) * (1 - t); m.s.scale.set(m.size * (1 + t * 1.6)); }
      else { m.x += m.vx + Math.sin(m.age / 25 + m.life) * 0.18; m.y += m.vy + Math.cos(m.age / 31 + m.life) * 0.08; m.s.alpha = 0.55 * Math.min(1, t * 5) * (1 - t); m.s.scale.set(m.size); }
      m.s.position.set(m.x, m.y); keep.push(m);
    }
    this.motes = keep;
  }
}
