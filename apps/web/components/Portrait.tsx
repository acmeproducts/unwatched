"use client";
import { useEffect, useState } from "react";
import { Application, Container, Graphics } from "pixi.js";
import { Citizen, lookFor, aged, type Look } from "@/components/world/citizen";
import { SAND, CREAM_DARK } from "@/components/world/palette";

/**
 * A portrait: head and shoulders from the same rig that walks the street, drawn once per person and kept, so a face
 * becomes familiar across the digest, the book, the paper and the library. One hidden renderer serves every portrait.
 */
const cache = new Map<string, Promise<string>>();
let app: Promise<Application> | null = null;
function renderer(): Promise<Application> {
  if (!app) app = (async () => { const a = new Application(); await a.init({ width: 96, height: 96, backgroundAlpha: 0, antialias: true, resolution: 2, autoDensity: true }); a.ticker.stop(); return a; })();
  return app;
}
export function portraitFor(name: string, appearance: Partial<Look> | null | undefined, age: number): Promise<string> {
  const key = `${name}|${age >= 60 ? "old" : age < 16 ? "young" : "grown"}|${JSON.stringify(appearance ?? null)}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const a = await renderer(); const stage = new Container();
      const bg = new Graphics(); bg.circle(48, 48, 46).fill(CREAM_DARK).stroke({ width: 1.5, color: SAND }); stage.addChild(bg);
      const c = new Citizen(aged(lookFor(name, appearance), age)); c.age(age); c.setPose("idle"); c.scale.set(2.6); c.position.set(48, 186); c.update(0.4); stage.addChild(c);
      const mask = new Graphics(); mask.circle(48, 48, 46).fill(0xffffff); stage.addChild(mask); stage.mask = mask;
      const canvas = a.renderer.extract.canvas(stage) as HTMLCanvasElement; const url = canvas.toDataURL("image/png"); stage.destroy({ children: true }); return url;
    })();
    cache.set(key, p);
  }
  return p;
}
export function Portrait({ name, appearance, age, size = 48, className = "" }: { name: string; appearance?: Partial<Look> | Record<string, unknown> | null; age: number; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let alive = true; void portraitFor(name, (appearance ?? null) as Partial<Look> | null, age).then((u) => { if (alive) setSrc(u); }).catch(() => {}); return () => { alive = false; }; }, [name, appearance, age]);
  return <span className={`inline-block rounded-full overflow-hidden bg-glass shrink-0 ${className}`} style={{ width: size, height: size }}>{src ? <img src={src} alt="" width={size} height={size} style={{ display: "block", width: size, height: size }} /> : null}</span>;
}
