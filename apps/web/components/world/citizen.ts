import { Container, Graphics } from "pixi.js";

/**
 * A citizen, drawn from parts. Rounded flat shapes with a thin kelp outline, the Tide style, built in code so that
 * every choice made at boarding is a real part and a real colour, every person looks different, and the rig can walk,
 * sit, sleep, talk and swing a hammer instead of bobbing a picture up and down.
 *
 * Proportions are in "units"; a citizen stands about 72 units tall. The origin is between the feet.
 */
export type Pose = "idle" | "walk" | "sleep" | "sit" | "talk" | "work";
export interface Look {
  build: "Slight" | "Average" | "Sturdy" | "Tall";
  hair: "Short dark" | "Bob" | "Curls" | "Bun" | "Grey" | "Under a hat";
  hat: "None" | "Knit cap" | "Wide brim" | "Baker's cap" | "Headscarf";
  carrying: "Nothing" | "Suitcase" | "Satchel" | "Basket" | "Tool bag";
  top: "Teal" | "Sage" | "Cream" | "Sand" | "Kelp";
  bottom: "Teal" | "Sage" | "Cream" | "Sand" | "Kelp";
  coral: "None" | "Suitcase" | "Scarf" | "Buttons" | "Hat band";
  skin?: number;
}

import { KELP, CORAL, TEAL, SAGE, CREAM, SAND } from "./palette";
const PALETTE: Record<Look["top"], number> = { Teal: TEAL, Sage: SAGE, Cream: CREAM, Sand: SAND, Kelp: KELP };
const HAIR = 0x2b2f30, GREY = 0xb9c4bf, STRAW = 0xe3d3a2, LEATHER = 0x8e6a4b;
const SKINS = [0xf1d6c0, 0xe7c3a5, 0xd2a682, 0xb98460, 0x8f5f42, 0x6b4630];
const STROKE = { width: 1.6, color: KELP, join: "round" as const, cap: "round" as const };

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick<T>(arr: readonly T[], h: number, salt: number): T { return arr[(h >>> (salt % 24)) % arr.length]!; }

/** A look for someone who never chose one: house-funded citizens get a deterministic one from their name. */
export function lookFor(name: string, chosen: Partial<Look> | null | undefined): Look {
  const h = hash(name);
  const base: Look = {
    build: pick(["Slight", "Average", "Average", "Sturdy", "Tall"] as const, h, 1),
    hair: pick(["Short dark", "Bob", "Curls", "Bun", "Grey", "Short dark"] as const, h, 4),
    hat: pick(["None", "None", "None", "Knit cap", "Wide brim", "Headscarf"] as const, h, 7),
    carrying: pick(["Nothing", "Nothing", "Basket", "Satchel", "Tool bag", "Nothing"] as const, h, 10),
    top: pick(["Teal", "Sage", "Cream", "Sand", "Kelp"] as const, h, 13),
    bottom: pick(["Kelp", "Sage", "Sand", "Teal", "Cream"] as const, h, 16),
    coral: pick(["None", "None", "Scarf", "Buttons", "Hat band", "None"] as const, h, 19),
    skin: SKINS[(h >>> 3) % SKINS.length]!,
  };
  const c = chosen ?? {};
  const has = (k: keyof Look) => typeof c[k] === "string" && (c[k] as string).length > 0;
  return { ...base, ...(has("build") ? { build: c.build! } : {}), ...(has("hair") ? { hair: c.hair! } : {}), ...(has("hat") ? { hat: c.hat! } : {}), ...(has("carrying") ? { carrying: c.carrying! } : {}), ...(has("top") ? { top: c.top! } : {}), ...(has("bottom") ? { bottom: c.bottom! } : {}), ...(has("coral") ? { coral: c.coral! } : {}), ...(typeof c.skin === "number" ? { skin: c.skin } : {}) };
}

const rrect = (g: Graphics, x: number, y: number, w: number, h: number, r: number, fill: number) => g.roundRect(x, y, w, h, r).fill(fill).stroke(STROKE);
const ellipse = (g: Graphics, x: number, y: number, rx: number, ry: number, fill: number) => g.ellipse(x, y, rx, ry).fill(fill).stroke(STROKE);

export class Citizen extends Container {
  readonly look: Look;
  private body = new Container();
  private legL = new Graphics(); private legR = new Graphics();
  private armL = new Graphics(); private armR = new Graphics();
  private torso = new Graphics(); private head = new Container();
  private carry = new Graphics(); private tool = new Graphics();
  private facing = 1;
  private pose: Pose = "idle";
  private phase = Math.random() * 10;
  private torsoW: number; private torsoH: number; private legH: number;

  constructor(look: Look) {
    super();
    this.look = look;
    const wide = { Slight: 0.82, Average: 1, Sturdy: 1.22, Tall: 0.95 }[look.build];
    const tall = { Slight: 1, Average: 1, Sturdy: 1, Tall: 1.14 }[look.build];
    this.torsoW = 20 * wide; this.torsoH = 26 * tall; this.legH = 20 * tall;
    const skin = look.skin ?? SKINS[1]!;
    const top = PALETTE[look.top], bottom = PALETTE[look.bottom];

    // legs pivot at the hip, drawn hanging down
    for (const [g, side] of [[this.legL, -1], [this.legR, 1]] as const) {
      rrect(g, -4, 0, 8, this.legH, 4, bottom);
      ellipse(g, 0, this.legH, 5.5, 3, KELP);
      g.position.set(side * (this.torsoW * 0.28), -this.legH);
      this.body.addChild(g);
    }
    // torso above the hips
    rrect(this.torso, -this.torsoW / 2, -this.legH - this.torsoH, this.torsoW, this.torsoH + 4, 8, top);
    if (look.coral === "Buttons") for (let i = 0; i < 3; i++) this.torso.circle(0, -this.legH - this.torsoH + 7 + i * 7, 1.8).fill(CORAL);
    if (look.coral === "Scarf") this.torso.roundRect(-this.torsoW / 2 - 1, -this.legH - this.torsoH - 3, this.torsoW + 2, 7, 3).fill(CORAL).stroke(STROKE);
    this.body.addChild(this.torso);
    // arms pivot at the shoulder
    for (const [g, side] of [[this.armL, -1], [this.armR, 1]] as const) {
      rrect(g, -3.5, 0, 7, this.torsoH * 0.78, 3.5, top);
      ellipse(g, 0, this.torsoH * 0.78 + 1, 4, 4, skin);
      g.position.set(side * (this.torsoW / 2 + 1), -this.legH - this.torsoH + 5);
      this.body.addChild(g);
    }
    // what they carry, in the front hand or on the hip
    this.drawCarry(look);
    this.armR.addChild(this.carry);
    this.tool.roundRect(-2, -6, 4, 18, 2).fill(LEATHER).stroke(STROKE).roundRect(-7, -9, 14, 6, 2).fill(KELP);
    this.tool.position.set(0, this.torsoH * 0.78); this.tool.visible = false; this.armR.addChild(this.tool);
    // head, hair, hat
    const headR = 11 * (look.build === "Sturdy" ? 1.05 : 1);
    const face = new Graphics(); face.circle(0, 0, headR).fill(skin).stroke(STROKE);
    face.circle(-4, -1, 1.4).fill(KELP).circle(4, -1, 1.4).fill(KELP);
    this.head.addChild(face);
    this.head.addChild(this.drawHair(look, headR));
    this.head.addChild(this.drawHat(look, headR));
    this.head.position.set(0, -this.legH - this.torsoH - headR + 3);
    this.body.addChild(this.head);
    this.addChild(this.body);
  }

  private drawHair(look: Look, r: number): Graphics {
    const g = new Graphics(); const col = look.hair === "Grey" ? GREY : HAIR;
    if (look.hat === "Headscarf" || look.hair === "Under a hat") return g;
    switch (look.hair) {
      case "Short dark": case "Grey": g.moveTo(-r, -1).arc(0, 0, r, Math.PI, 0).lineTo(r, -1).quadraticCurveTo(0, -r * 0.55, -r, -1).closePath().fill(col).stroke(STROKE); break;
      case "Bob": g.moveTo(-r - 1, 6).lineTo(-r - 1, -2).arc(0, 0, r + 1, Math.PI, 0).lineTo(r + 1, 6).quadraticCurveTo(r, 8, r - 3, 8).lineTo(r - 3, -1).quadraticCurveTo(0, -r * 0.5, -r + 3, -1).lineTo(-r + 3, 8).quadraticCurveTo(-r, 8, -r - 1, 6).closePath().fill(col).stroke(STROKE); break;
      case "Curls": for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; g.circle(Math.cos(a) * r, Math.sin(a) * r - 1, 4.5).fill(col).stroke(STROKE); } break;
      case "Bun": g.moveTo(-r, -1).arc(0, 0, r, Math.PI, 0).lineTo(r, -1).quadraticCurveTo(0, -r * 0.55, -r, -1).closePath().fill(col).stroke(STROKE); g.circle(-r * 0.55, -r * 0.7, 4.5).fill(col).stroke(STROKE); break;
    }
    return g;
  }
  private drawHat(look: Look, r: number): Graphics {
    const g = new Graphics(); const band = look.coral === "Hat band";
    switch (look.hat) {
      case "None": break;
      case "Knit cap": g.moveTo(-r - 1, -2).arc(0, -1, r + 1, Math.PI, 0).closePath().fill(0x8e6a4b).stroke(STROKE); g.roundRect(-r - 1, -4, 2 * r + 2, 5, 2).fill(band ? CORAL : 0x7a5a3f).stroke(STROKE); break;
      case "Wide brim": g.ellipse(0, -3, r + 9, 4.5).fill(STRAW).stroke(STROKE); g.moveTo(-r + 2, -3).arc(0, -3, r - 2, Math.PI, 0).closePath().fill(STRAW).stroke(STROKE); if (band) g.roundRect(-r + 2, -6, 2 * r - 4, 3, 1).fill(CORAL); break;
      case "Baker's cap": g.roundRect(-r - 1, -6, 2 * r + 2, 6, 2).fill(0xf7f5ee).stroke(STROKE); g.ellipse(0, -9, r + 2, 7).fill(0xf7f5ee).stroke(STROKE); if (band) g.roundRect(-r - 1, -5, 2 * r + 2, 2.5, 1).fill(CORAL); break;
      case "Headscarf": g.moveTo(-r - 2, 4).arc(0, 0, r + 2, Math.PI, 0).lineTo(r + 2, 4).lineTo(r - 4, 9).lineTo(-r - 2, 4).closePath().fill(band ? CORAL : 0xb9d9c6).stroke(STROKE); break;
    }
    return g;
  }
  private drawCarry(look: Look): void {
    const g = this.carry; const handY = this.torsoH * 0.78 + 1; const coral = look.coral === "Suitcase" && look.carrying === "Suitcase";
    switch (look.carrying) {
      case "Nothing": break;
      case "Suitcase": g.roundRect(-9, handY + 2, 18, 13, 2).fill(coral ? CORAL : 0xc9b58f).stroke(STROKE); g.roundRect(-3, handY - 1, 6, 4, 1).fill(KELP); break;
      case "Tool bag": g.roundRect(-8, handY + 2, 16, 11, 4).fill(LEATHER).stroke(STROKE); g.roundRect(-2, handY - 2, 4, 5, 1).fill(KELP); break;
      case "Basket": g.roundRect(-8, handY + 1, 16, 10, 5).fill(STRAW).stroke(STROKE); g.moveTo(-6, handY + 1).quadraticCurveTo(0, handY - 8, 6, handY + 1).stroke(STROKE); break;
      case "Satchel": g.moveTo(-2, -4).lineTo(6, handY - 2).stroke({ ...STROKE, width: 2.2 }); g.roundRect(0, handY - 4, 13, 10, 3).fill(LEATHER).stroke(STROKE); break;
    }
  }

  setPose(p: Pose): void { if (this.pose === p) return; this.pose = p; this.tool.visible = p === "work" && this.look.carrying !== "Suitcase"; }
  face(dir: -1 | 1): void { this.facing = dir; }

  /** Advance the animation. `t` is seconds. */
  update(t: number): void {
    const k = t * 2 * Math.PI + this.phase;
    this.body.scale.x = this.facing; this.body.rotation = 0; this.body.position.set(0, 0); this.body.alpha = 1;
    let legL = 0, legR = 0, armL = 0, armR = 0, bob = 0, headTilt = 0;
    switch (this.pose) {
      case "walk": { const s = Math.sin(k * 1.6); legL = s * 0.55; legR = -s * 0.55; armL = -s * 0.45; armR = s * 0.45; bob = Math.abs(Math.cos(k * 1.6)) * -2.2; break; }
      case "idle": { bob = Math.sin(k * 0.35) * 0.8; armL = 0.06; armR = -0.06; break; }
      case "talk": { armR = -0.9 + Math.sin(k * 1.2) * 0.25; armL = 0.1; headTilt = Math.sin(k * 0.6) * 0.06; bob = Math.sin(k * 0.5) * 0.6; break; }
      case "work": { const s = Math.sin(k * 1.4); armR = -1.6 + Math.max(0, s) * 1.3; armL = 0.15; bob = Math.max(0, -s) * -1.5; break; }
      case "sit": { legL = -1.45; legR = -1.45; armL = 0.5; armR = 0.5; this.body.position.y = 8; bob = Math.sin(k * 0.3) * 0.5; break; }
      case "sleep": { this.body.rotation = (Math.PI / 2) * this.facing; this.body.position.set(0, -6); legL = -0.15; legR = 0.1; armL = 0.3; armR = 0.35; this.body.alpha = 0.92; break; }
    }
    this.legL.rotation = legL; this.legR.rotation = legR; this.armL.rotation = armL; this.armR.rotation = armR;
    this.head.rotation = headTilt; this.body.position.y += bob;
  }
}
