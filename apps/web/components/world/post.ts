/**
 * What happens to the picture after the world is drawn: the map as a miniature, the night's lights blooming,
 * and the cinema's grain, vignette and letterbox. Screen space, on the stage, switched by view and by the hour.
 */
import { Application, Container, FillGradient, Graphics, NoiseFilter, type Filter } from "pixi.js";
import { AdvancedBloomFilter, TiltShiftFilter } from "pixi-filters";

export type View = "street" | "map" | "cinema";

export class Post {
  private tilt = new TiltShiftFilter({ blur: 10, gradientBlur: 1000 });
  private bloom = new AdvancedBloomFilter({ threshold: 0.9, bloomScale: 0.55, brightness: 1, blur: 9, quality: 4 });
  private grain = new NoiseFilter({ noise: 0.045 });
  private frame = new Container();
  private vignette = new Graphics();
  private bars = new Graphics();
  private w = 0; private h = 0; private view: View = "street"; private nightNow = 0;
  constructor(private app: Application) {
    this.frame.eventMode = "none"; this.frame.addChild(this.vignette, this.bars); app.stage.addChild(this.frame);
  }
  private layout(w: number, h: number): void {
    this.w = w; this.h = h;
    // the vignette: a soft dark ring the light never quite reaches, drawn once per size
    const g = this.vignette; g.clear(); const r = Math.hypot(w, h) * 0.62;
    const grad = new FillGradient({ type: "radial", center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, colorStops: [{ offset: 0, color: "rgba(20,22,26,0)" }, { offset: 0.55, color: "rgba(20,22,26,0)" }, { offset: 1, color: "rgba(20,22,26,0.6)" }] });
    g.rect(w / 2 - r, h / 2 - r, r * 2, r * 2).fill(grad);
    const b = this.bars; b.clear(); const bar = Math.round(h * 0.09); b.rect(0, 0, w, bar).rect(0, h - bar, w, bar).fill(0x0b0c0e);
    this.tilt.start = { x: 0, y: h * 0.4 }; this.tilt.end = { x: w, y: h * 0.62 };
  }
  /** Called every tick with the view, how deep the night is (0..1) and whether effects are on. */
  update(view: View, night: number, effects: boolean, seed: number): void {
    const { width, height } = this.app.screen; if (width !== this.w || height !== this.h) this.layout(width, height);
    this.view = view; this.nightNow = night;
    const cinema = effects && view === "cinema"; const map = effects && view === "map"; const bloom = effects && night > 0.12 && view !== "map";
    this.vignette.visible = false; this.bars.visible = cinema;
    if (cinema && seed % 3 === 0) this.grain.seed = (seed % 997) / 997;
    this.bloom.bloomScale = 0.2 + Math.min(1, night) * 0.4;
    const filters: Filter[] = [];
    if (map) filters.push(this.tilt);
    if (bloom) filters.push(this.bloom);
    if (cinema) filters.push(this.grain);
    const cur = (this.app.stage.filters as Filter[] | null) ?? [];
    if (cur.length !== filters.length || cur.some((f, i) => f !== filters[i])) this.app.stage.filters = filters.length ? filters : null;
  }
  destroy(): void { this.app.stage.filters = null; this.frame.destroy({ children: true }); }
}
