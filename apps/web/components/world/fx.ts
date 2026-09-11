/**
 * The GPU's share of the world: light that the night does not reach, and water that moves.
 * Both sit on top of the drawn island without changing a line of it, so the old and the new can be compared on the same street.
 */
import { AlphaFilter, Container, Filter, GlProgram, Graphics, Sprite, Texture } from "pixi.js";
import { LIGHT } from "./palette";

/** A soft disc, white at the centre and gone at the edge, drawn once; every light is this texture scaled and tinted. */
function softDisc(size = 256): Texture {
  const c = document.createElement("canvas"); c.width = size; c.height = size;
  const ctx = c.getContext("2d")!; const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,0.72)"); g.addColorStop(0.7, "rgba(255,255,255,0.22)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}

export type LightSource = { x: number; y: number; r: number; color: number; strength: number; flicker?: number };

/**
 * Night as a shade that the lights cut through. The dark layer is one rectangle over the world; each light erases a soft hole in it,
 * and a second, additive layer lays warm colour where the light falls. The dark layer carries a filter so the erasing stays inside it.
 */
export class Lighting {
  readonly dark = new Container();
  readonly glow = new Container();
  private shade = new Graphics();
  private holes: Sprite[] = [];
  private warms: Sprite[] = [];
  private disc = softDisc();
  constructor(world: Container, W: number, H: number) {
    this.shade.rect(-3000, -3000, W + 6000, H + 6000).fill(0xffffff); this.dark.addChild(this.shade);
    this.dark.filters = [new AlphaFilter({ alpha: 1 })]; // renders the layer on its own, so 'erase' only ever cuts the shade
    world.addChild(this.glow); world.addChild(this.dark);
    this.dark.visible = false; this.glow.visible = false;
  }
  /** amount is the night as the island reckons it, 0 by day to 0.42 in the dark; the shade goes deeper than the old flat one because the lights answer it. */
  update(amount: number, sources: LightSource[], tick: number): void {
    const k = Math.min(1, amount / 0.42);
    this.dark.visible = this.glow.visible = k > 0.02;
    if (!this.dark.visible) return;
    this.shade.tint = LIGHT.night; this.shade.alpha = 0.64 * k;
    while (this.holes.length < sources.length) { const h = new Sprite(this.disc); h.anchor.set(0.5); h.blendMode = "erase"; this.dark.addChild(h); this.holes.push(h); const w = new Sprite(this.disc); w.anchor.set(0.5); w.blendMode = "add"; this.glow.addChild(w); this.warms.push(w); }
    for (let i = 0; i < this.holes.length; i++) {
      const s = sources[i]; const h = this.holes[i]!, w = this.warms[i]!;
      if (!s) { h.visible = w.visible = false; continue; }
      const fl = s.flicker ? 1 + Math.sin(tick / 3.7 + i * 1.9) * s.flicker * 0.5 + Math.sin(tick / 1.3 + i) * s.flicker * 0.25 : 1;
      const r = s.r * fl;
      h.visible = w.visible = true;
      h.position.set(s.x, s.y); h.width = h.height = r * 2.2; h.alpha = Math.min(1, s.strength) * k;
      w.position.set(s.x, s.y); w.width = w.height = r * 1.4; w.tint = s.color; w.alpha = 0.22 * s.strength * k;
    }
  }
}

const VERT = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vWorld;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform vec3 uCam;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
  vWorld = (aPosition * uOutputFrame.zw + uOutputFrame.xy - uCam.xy) / uCam.z;
}`;

const FRAG = /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
in vec2 vWorld;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uTime;
uniform vec3 uSun;      // where the light in the sky is, in world units, and how strong
uniform vec3 uColor;    // the water by day
uniform vec3 uDeep;     // the trough of a wave
uniform vec3 uGlint;    // the colour the light leaves on the water
uniform float uRough;   // 0 calm, 1 storm
uniform float uNight;   // 0 day, 1 full night
uniform float uZoom;    // the camera's zoom, so fine detail fades on the map
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  if (src.a < 0.01) { finalColor = src; return; }
  vec2 p = vWorld * 0.011;
  float t = uTime;
  float w = sin(p.x * 3.1 + t * 0.9 + sin(p.y * 2.0 + t * 0.5)) * 0.45
          + sin(p.y * 4.3 - t * 0.7 + p.x * 1.3) * 0.3
          + (noise(p * 6.0 + vec2(t * 0.25, -t * 0.18)) - 0.5) * 1.1
          + (noise(p * 15.0 - vec2(t * 0.45, t * 0.3)) - 0.5) * (0.5 + uRough * 1.2) * clamp(uZoom - 0.2, 0.0, 1.0);
  float h = clamp(w * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uDeep, uColor, smoothstep(0.15, 0.9, h));
  float crest = smoothstep(0.80, 0.97, h) * (0.25 + uRough * 1.1);
  col += vec3(crest) * 0.5;
  vec2 d = vWorld - uSun.xy;
  float below = step(0.0, d.y);
  float streak = exp(-abs(d.x) * 0.0045) * exp(-d.y * 0.0007) * below;
  float sparkle = pow(noise(p * 24.0 + vec2(t * 1.4, -t * 0.9)), 7.0) * clamp(uZoom, 0.15, 1.0);
  col += uGlint * streak * uSun.z * (0.3 + sparkle * 3.0);
  col = mix(col, col * vec3(0.30, 0.36, 0.50) + uGlint * streak * uSun.z * 0.15, uNight);
  finalColor = vec4(col, 1.0) * src.a;
}`;

/** The sea as a shader: waves that move with the clock, crests in a blow, and the sun or the moon lying on the water. */
export class WaterFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({ vertex: VERT, fragment: FRAG, name: "water" }),
      resources: {
        waterUniforms: {
          uTime: { value: 0, type: "f32" },
          uCam: { value: new Float32Array([0, 0, 1]), type: "vec3<f32>" },
          uSun: { value: new Float32Array([0, 0, 0]), type: "vec3<f32>" },
          uColor: { value: new Float32Array([0.56, 0.75, 0.76]), type: "vec3<f32>" },
          uDeep: { value: new Float32Array([0.36, 0.58, 0.62]), type: "vec3<f32>" },
          uGlint: { value: new Float32Array([1.0, 0.93, 0.72]), type: "vec3<f32>" },
          uRough: { value: 0, type: "f32" },
          uNight: { value: 0, type: "f32" },
          uZoom: { value: 1, type: "f32" },
        },
      },
    });
  }
  private set(name: string, v: number | number[]): void {
    const u = (this.resources as { waterUniforms: { uniforms: Record<string, number | Float32Array> } }).waterUniforms.uniforms;
    if (typeof v === "number") u[name] = v; else (u[name] as Float32Array).set(v);
  }
  update(o: { time: number; cam: { x: number; y: number; zoom: number }; sun: { x: number; y: number; strength: number }; color: number; deep: number; glint: number; rough: number; night: number }): void {
    this.set("uTime", o.time); this.set("uCam", [o.cam.x, o.cam.y, o.cam.zoom]); this.set("uSun", [o.sun.x, o.sun.y, o.sun.strength]);
    this.set("uColor", rgb(o.color)); this.set("uDeep", rgb(o.deep)); this.set("uGlint", rgb(o.glint)); this.set("uRough", o.rough); this.set("uNight", o.night); this.set("uZoom", o.cam.zoom);
  }
}
const rgb = (hex: number): number[] => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
