/**
 * The island's sound. Real recordings or generated clips when they exist under /sound, mixed and crossfaded by the
 * weather, the hour, and where the camera is; a synthesized stand-in for any layer that has no file yet, so the
 * world is never silent in a fresh clone. It starts muted, because browsers require a gesture, and a toggle turns it on.
 *
 * Files: /sound/manifest.json maps a layer, a one-shot, or a music bed (music-<scene>) to a file.
 * `scripts/gen-music.mjs` makes the beds with Lyria; effects can be recordings or generated any way, by the same names.
 */
export type Scene = { weather: string; hour: number; district: string; place: string; crowd: number; season: string };

export const LAYERS = ["sea", "rain", "wind", "murmur", "work", "forest", "night", "market"] as const;
export const ONESHOTS = ["gull", "bell", "horn", "creak", "thunder"] as const;
export const MUSIC = ["day", "rain", "night", "tavern", "storm", "fog", "winter"] as const;
export type MusicScene = (typeof MUSIC)[number];
export type LayerName = (typeof LAYERS)[number]; export type ShotName = (typeof ONESHOTS)[number];
type Manifest = Partial<Record<LayerName | ShotName | `music-${MusicScene}`, string>>;

function noiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate); const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12; }
  return buf;
}

/** One looping layer with a level that eases to its target. */
class Layer {
  gain: GainNode; private target = 0;
  constructor(readonly ctx: AudioContext, out: AudioNode) { this.gain = ctx.createGain(); this.gain.gain.value = 0; this.gain.connect(out); }
  set(v: number, seconds = 1.5) { if (Math.abs(v - this.target) < 0.005) return; this.target = v; this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, seconds); }
}

export class Ambience {
  private ctx: AudioContext | null = null; private master: GainNode | null = null;
  private layers = new Map<LayerName, Layer>();
  private beds = new Map<MusicScene, Layer>(); private bed: MusicScene | null = null;
  private files = new Map<string, AudioBuffer>(); private manifest: Manifest = {};
  private lastBellHour = -1; private lastGull = 0; private lastCreak = 0; private lastThunder = 0;
  muted = true;

  /** Must be called from a user gesture. Loads whatever files the manifest lists; synthesizes the rest. */
  async enable(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
      try { this.manifest = (await (await fetch("/sound/manifest.json", { cache: "no-store" })).json()) as Manifest; } catch { this.manifest = {}; }
      await Promise.all(Object.entries(this.manifest).map(async ([name, file]) => { try { const ab = await (await fetch(`/sound/${file}`)).arrayBuffer(); this.files.set(name, await this.ctx!.decodeAudioData(ab)); } catch { /* the stand-in plays */ } }));
      this.build();
    }
    await this.ctx.resume(); this.muted = false;
  }
  async disable(): Promise<void> { this.muted = true; await this.ctx?.suspend(); }
  /** Which layers play from files, for the ops room and the toggle's title. */
  sources(): Record<string, "file" | "synth" | "none"> { const out: Record<string, "file" | "synth" | "none"> = {}; for (const n of [...LAYERS, ...ONESHOTS]) out[n] = this.files.has(n) ? "file" : "synth"; for (const m of MUSIC) out[`music-${m}`] = this.files.has(`music-${m}`) ? "file" : "none"; return out; }

  private loopFile(name: string, dest: AudioNode): boolean {
    const buf = this.files.get(name); if (!buf || !this.ctx) return false;
    // two overlapping copies so the loop seam never clicks
    for (const offset of [0, buf.duration / 2]) { const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true; const g = this.ctx.createGain(); g.gain.value = 0.7; src.connect(g); g.connect(dest); src.start(this.ctx.currentTime + 0.01, offset % buf.duration); }
    return true;
  }
  private build(): void {
    const ctx = this.ctx!, out = this.master!; const noise = noiseBuffer(ctx);
    const looped = (dest: AudioNode, filter: (n: BiquadFilterNode) => void) => { const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true; const f = ctx.createBiquadFilter(); filter(f); src.connect(f); f.connect(dest); src.start(); return f; };
    const lfo = (target: AudioParam, hz: number, depth: number, type: OscillatorType = "sine") => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz; const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(target); o.start(); };
    const make = (name: LayerName, synth: (dest: AudioNode) => void) => { const L = new Layer(ctx, out); if (!this.loopFile(name, L.gain)) synth(L.gain); this.layers.set(name, L); };
    make("sea", (d) => { const f = looped(d, (n) => { n.type = "lowpass"; n.frequency.value = 380; }); lfo(f.frequency, 1 / 8, 200); const g = ctx.createGain(); g.gain.value = 0.6; lfo(g.gain, 1 / 8, 0.35); });
    make("rain", (d) => { looped(d, (n) => { n.type = "highpass"; n.frequency.value = 2200; n.Q.value = 0.5; }); const f = looped(d, (n) => { n.type = "bandpass"; n.frequency.value = 1100; n.Q.value = 0.8; }); lfo(f.frequency, 11, 400, "square"); });
    make("wind", (d) => { const f = looped(d, (n) => { n.type = "bandpass"; n.frequency.value = 480; n.Q.value = 3; }); lfo(f.frequency, 0.07, 320); });
    make("murmur", (d) => { const f = looped(d, (n) => { n.type = "bandpass"; n.frequency.value = 320; n.Q.value = 1.4; }); lfo(f.frequency, 2.1, 140); });
    make("market", (d) => { const f = looped(d, (n) => { n.type = "bandpass"; n.frequency.value = 600; n.Q.value = 1.1; }); lfo(f.frequency, 3.3, 220); });
    make("forest", (d) => { const f = looped(d, (n) => { n.type = "bandpass"; n.frequency.value = 900; n.Q.value = 4; }); lfo(f.frequency, 0.05, 500); });
    make("night", (d) => { const f = looped(d, (n) => { n.type = "bandpass"; n.frequency.value = 3800; n.Q.value = 12; }); lfo(f.frequency, 5.5, 60, "square"); });
    // music beds: only from files, one per scene, crossfaded in tick(); Lyria writes them, the world never synthesizes music
    for (const m of MUSIC) { if (!this.files.has(`music-${m}`)) continue; const L = new Layer(ctx, out); this.loopFile(`music-${m}`, L.gain); this.beds.set(m, L); }
    make("work", (d) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(d); looped(g, (n) => { n.type = "lowpass"; n.frequency.value = 240; }); const tick = () => { if (!this.ctx) return; const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.02, t + 0.18); setTimeout(tick, 900 + Math.random() * 500); }; tick(); });
  }

  /** Play a one-shot from its file, or return false so the synthesized one plays. */
  private shot(name: ShotName, level = 0.5): boolean { const buf = this.files.get(name); if (!buf || !this.ctx) return false; const src = this.ctx.createBufferSource(); src.buffer = buf; const g = this.ctx.createGain(); g.gain.value = level; src.connect(g); g.connect(this.master!); src.start(); return true; }
  private gull(): void { if (this.shot("gull", 0.35)) return; const c = this.ctx!, t = c.currentTime; const o = c.createOscillator(); o.type = "sine"; const g = c.createGain(); g.gain.value = 0; o.connect(g); g.connect(this.master!); o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(1600, t + 0.12); o.frequency.exponentialRampToValueAtTime(900, t + 0.42); g.gain.linearRampToValueAtTime(0.05, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.45); o.start(t); o.stop(t + 0.5); }
  private bell(n: number): void { if (this.shot("bell", 0.5)) return; const c = this.ctx!; for (let i = 0; i < Math.min(n, 12); i++) { const t = c.currentTime + i * 1.4; for (const [f, a] of [[520, 0.12], [1040, 0.05], [1560, 0.02]] as const) { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + 2.4); o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + 2.5); } } }
  horn(): void { if (!this.ctx || this.muted) return; if (this.shot("horn", 0.6)) return; const c = this.ctx, t = c.currentTime; for (const [f, s] of [[110, 0], [138, 1.1]] as const) { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; const fl = c.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 500; const g = c.createGain(); g.gain.setValueAtTime(0, t + s); g.gain.linearRampToValueAtTime(0.12, t + s + 0.15); g.gain.setValueAtTime(0.12, t + s + 0.8); g.gain.linearRampToValueAtTime(0, t + s + 1.05); o.connect(fl); fl.connect(g); g.connect(this.master!); o.start(t + s); o.stop(t + s + 1.1); } }
  private creak(): void { if (this.shot("creak", 0.3)) return; const c = this.ctx!, t = c.currentTime; const o = c.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(180, t); o.frequency.linearRampToValueAtTime(140, t + 0.3); const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.35); o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + 0.4); }
  private thunder(): void { if (this.shot("thunder", 0.7)) return; const c = this.ctx!, t = c.currentTime; const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 3); const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(80, t + 2.5); const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 2.8); src.connect(f); f.connect(g); g.connect(this.master!); src.start(t); src.stop(t + 3); }

  /** Called often; cheap. Sets every layer's level from the scene and fires the one-shots. */
  tick(s: Scene): void {
    if (!this.ctx || this.muted) return;
    const night = s.hour < 6 || s.hour >= 21;
    const rain = s.weather === "rain" ? 0.5 : s.weather === "storm" ? 0.85 : 0; // snow falls without a sound
    const coast = s.district === "harbor" || s.district === "north shore";
    const L = (n: LayerName) => this.layers.get(n)!;
    L("sea").set((coast ? 0.4 : s.district === "pinewood" ? 0.1 : 0.18) * (s.weather === "storm" ? 1.6 : 1));
    L("rain").set(rain);
    L("wind").set(s.weather === "storm" ? 0.5 : s.weather === "wind" ? 0.4 : s.weather === "snow" ? 0.2 : s.weather === "fog" ? 0.06 : s.district === "pinewood" || s.district === "hill" ? 0.16 : 0.06);
    L("forest").set(s.district === "pinewood" && !night ? 0.3 : 0);
    L("night").set(night && !rain && s.season !== "winter" ? 0.25 : 0);
    const social = s.place === "tavern" || s.place === "inn";
    L("murmur").set(social && s.crowd > 1 && !night ? Math.min(0.4, 0.1 + s.crowd * 0.05) : 0);
    L("market").set(s.place === "market" && s.crowd > 2 && s.hour >= 7 && s.hour < 19 ? Math.min(0.4, 0.1 + s.crowd * 0.04) : 0);
    L("work").set((s.place === "smithy" || s.place === "mill" || s.place === "sawpit" || s.place === "quarry") && s.hour >= 7 && s.hour < 17 ? 0.3 : 0);
    // the bed for this scene, crossfaded over a few seconds; a missing bed means silence under the effects, never a substitute
    const scene: MusicScene = s.weather === "storm" ? "storm" : s.weather === "fog" ? "fog" : (s.place === "tavern" || s.place === "inn") && s.hour >= 17 && s.crowd > 1 ? "tavern" : night ? "night" : rain > 0 ? "rain" : s.season === "winter" ? "winter" : "day";
    if (scene !== this.bed) { this.bed = scene; for (const [m, L] of this.beds) L.set(m === scene ? 0.32 : 0, 4); }
    const now = performance.now();
    if (!night && rain < 0.7 && coast && now - this.lastGull > 4000 + Math.random() * 9000) { this.lastGull = now; this.gull(); if (Math.random() < 0.4) setTimeout(() => !this.muted && this.gull(), 300 + Math.random() * 400); }
    if (s.district === "harbor" && now - this.lastCreak > 6000 + Math.random() * 8000) { this.lastCreak = now; this.creak(); }
    if (s.weather === "storm" && now - this.lastThunder > 12000 + Math.random() * 20000) { this.lastThunder = now; this.thunder(); }
    if (s.hour !== this.lastBellHour) { this.lastBellHour = s.hour; if (s.hour >= 7 && s.hour <= 20 && (s.district === "old town" || s.district === "hill")) this.bell(s.hour > 12 ? s.hour - 12 : s.hour); }
  }
}
