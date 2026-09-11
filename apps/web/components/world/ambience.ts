/**
 * The island's sound, made in the browser from noise and sine waves. No files, no licenses, nothing to download.
 * Layers are mixed by the weather, the hour, and where the camera is: sea and gulls near the harbor, rain and wind
 * when it rains, a murmur in the tavern after work, the chapel bell on the hour, the ferry horn at the pier.
 * It starts silent, because browsers require a gesture, and a toggle in the world turns it on.
 */
export type Scene = { weather: string; hour: number; district: string; place: string; crowd: number; season: string };

function noiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate); const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0; // pink-ish noise
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12; }
  return buf;
}

class Layer {
  gain: GainNode; private target = 0;
  constructor(readonly ctx: AudioContext, out: AudioNode, build: (ctx: AudioContext, dest: AudioNode) => void) { this.gain = ctx.createGain(); this.gain.gain.value = 0; this.gain.connect(out); build(ctx, this.gain); }
  set(v: number) { if (Math.abs(v - this.target) < 0.005) return; this.target = v; this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 1.2); }
}

export class Ambience {
  private ctx: AudioContext | null = null; private master: GainNode | null = null;
  private layers = new Map<string, Layer>();
  private lastBellHour = -1; private lastGull = 0; private lastCreak = 0;
  muted = true;

  /** Must be called from a user gesture. */
  async enable(): Promise<void> {
    if (!this.ctx) { this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination); this.build(); }
    await this.ctx.resume(); this.muted = false;
  }
  async disable(): Promise<void> { this.muted = true; await this.ctx?.suspend(); }

  private build(): void {
    const ctx = this.ctx!, out = this.master!; const noise = noiseBuffer(ctx);
    const looped = (dest: AudioNode, filter: (n: BiquadFilterNode) => void) => { const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true; const f = ctx.createBiquadFilter(); filter(f); src.connect(f); f.connect(dest); src.start(); return f; };
    // the sea: low noise swelling every seven seconds
    this.layers.set("sea", new Layer(ctx, out, (c, dest) => { const f = looped(dest, (n) => { n.type = "lowpass"; n.frequency.value = 420; }); const lfo = c.createOscillator(); lfo.frequency.value = 1 / 7; const depth = c.createGain(); depth.gain.value = 180; lfo.connect(depth); depth.connect(f.frequency); lfo.start(); }));
    // rain: bright hiss with a little patter
    this.layers.set("rain", new Layer(ctx, out, (c, dest) => { looped(dest, (n) => { n.type = "highpass"; n.frequency.value = 1800; }); const f = looped(dest, (n) => { n.type = "bandpass"; n.frequency.value = 900; n.Q.value = 0.7; }); const lfo = c.createOscillator(); lfo.type = "square"; lfo.frequency.value = 9; const depth = c.createGain(); depth.gain.value = 300; lfo.connect(depth); depth.connect(f.frequency); lfo.start(); }));
    // wind: slow band sweeps
    this.layers.set("wind", new Layer(ctx, out, (c, dest) => { const f = looped(dest, (n) => { n.type = "bandpass"; n.frequency.value = 500; n.Q.value = 2.5; }); const lfo = c.createOscillator(); lfo.frequency.value = 0.09; const depth = c.createGain(); depth.gain.value = 350; lfo.connect(depth); depth.connect(f.frequency); lfo.start(); }));
    // the tavern and the inn: a murmur of voices, low and busy
    this.layers.set("murmur", new Layer(ctx, out, (c, dest) => { const f = looped(dest, (n) => { n.type = "bandpass"; n.frequency.value = 300; n.Q.value = 1.2; }); const lfo = c.createOscillator(); lfo.frequency.value = 2.3; const depth = c.createGain(); depth.gain.value = 120; lfo.connect(depth); depth.connect(f.frequency); lfo.start(); }));
    // the mill and the smithy and a site: a beat of work
    this.layers.set("work", new Layer(ctx, out, (c, dest) => { const g = c.createGain(); g.gain.value = 0; g.connect(dest); const src = c.createBufferSource(); src.buffer = noise; src.loop = true; const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 260; src.connect(f); f.connect(g); src.start(); const tick = () => { if (!this.ctx) return; const t = c.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.02, t + 0.18); setTimeout(tick, 900 + Math.random() * 500); }; tick(); }));
    // birds and creaks are one-shots, played from tick()
  }

  private gull(): void { const c = this.ctx!, t = c.currentTime; const o = c.createOscillator(); o.type = "sine"; const g = c.createGain(); g.gain.value = 0; o.connect(g); g.connect(this.master!); o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(1600, t + 0.12); o.frequency.exponentialRampToValueAtTime(900, t + 0.42); g.gain.linearRampToValueAtTime(0.05, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.45); o.start(t); o.stop(t + 0.5); }
  private bell(n: number): void { const c = this.ctx!; for (let i = 0; i < Math.min(n, 12); i++) { const t = c.currentTime + i * 1.4; for (const [f, a] of [[520, 0.12], [1040, 0.05], [1560, 0.02]] as const) { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + 2.4); o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + 2.5); } } }
  /** The ferry's horn: two low notes. */
  horn(): void { if (!this.ctx || this.muted) return; const c = this.ctx, t = c.currentTime; for (const [f, s] of [[110, 0], [138, 1.1]] as const) { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; const fl = c.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 500; const g = c.createGain(); g.gain.setValueAtTime(0, t + s); g.gain.linearRampToValueAtTime(0.12, t + s + 0.15); g.gain.setValueAtTime(0.12, t + s + 0.8); g.gain.linearRampToValueAtTime(0, t + s + 1.05); o.connect(fl); fl.connect(g); g.connect(this.master!); o.start(t + s); o.stop(t + s + 1.1); } }
  private creak(): void { const c = this.ctx!, t = c.currentTime; const o = c.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(180, t); o.frequency.linearRampToValueAtTime(140, t + 0.3); const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.35); o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + 0.4); }

  /** Called often; cheap. Sets every layer's level from the scene and fires the one-shots. */
  tick(s: Scene): void {
    if (!this.ctx || this.muted) return;
    const night = s.hour < 6 || s.hour >= 21;
    const rain = s.weather === "rain" ? 0.5 : s.weather === "storm" ? 0.85 : 0;
    const sea = s.district === "harbor" || s.district === "north shore" ? 0.35 : s.district === "pinewood" ? 0.12 : 0.2;
    this.layers.get("sea")!.set(sea * (s.weather === "storm" ? 1.6 : 1));
    this.layers.get("rain")!.set(rain);
    this.layers.get("wind")!.set(s.weather === "storm" ? 0.5 : s.weather === "wind" ? 0.4 : s.weather === "fog" ? 0.08 : s.district === "pinewood" || s.district === "hill" ? 0.18 : 0.08);
    const social = s.place === "tavern" || s.place === "inn" || s.place === "market";
    this.layers.get("murmur")!.set(social && s.crowd > 1 && !night ? Math.min(0.35, 0.08 + s.crowd * 0.05) : 0);
    this.layers.get("work")!.set((s.place === "smithy" || s.place === "mill" || s.place === "sawpit" || s.place === "quarry") && s.hour >= 7 && s.hour < 17 ? 0.25 : 0);
    const now = performance.now();
    if (!night && rain < 0.7 && sea > 0.3 && now - this.lastGull > 4000 + Math.random() * 9000) { this.lastGull = now; this.gull(); if (Math.random() < 0.4) setTimeout(() => !this.muted && this.gull(), 300 + Math.random() * 400); }
    if ((s.district === "harbor") && now - this.lastCreak > 6000 + Math.random() * 8000) { this.lastCreak = now; this.creak(); }
    if (s.hour !== this.lastBellHour) { this.lastBellHour = s.hour; if (s.hour >= 7 && s.hour <= 20 && (s.district === "old town" || s.district === "hill")) this.bell(s.hour > 12 ? s.hour - 12 : s.hour); }
  }
}
