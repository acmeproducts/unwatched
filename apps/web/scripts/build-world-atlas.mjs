// Rasterize the Tide world SVGs, crop to their content, and write PNGs plus a manifest the renderer reads.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
const src = "public/world", out = "public/world/png"; mkdirSync(out, { recursive: true });
const manifest = {};
for (const f of readdirSync(src).filter((x) => x.endsWith(".svg"))) {
  const name = f.replace(".svg", "");
  const r = new Resvg(readFileSync(`${src}/${f}`, "utf8"), { fitTo: { mode: "width", value: 1024 }, background: "rgba(0,0,0,0)" });
  const img = r.render(); const w = img.width, h = img.height; const px = img.pixels; // RGBA
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (px[(y * w + x) * 4 + 3] > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } }
  if (maxX < 0) { console.log("empty", name); continue; }
  const pad = 6; minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const cropped = r.render(); // render again with crop via a second pass: use resvg crop option
  const r2 = new Resvg(readFileSync(`${src}/${f}`, "utf8"), { fitTo: { mode: "width", value: 1024 }, background: "rgba(0,0,0,0)", crop: { left: minX, top: minY, right: maxX + 1, bottom: maxY + 1 } });
  const png = r2.render().asPng();
  writeFileSync(`${out}/${name}.png`, png);
  manifest[name] = { w: cw, h: ch };
  void cropped;
}
writeFileSync(`${src}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(Object.keys(manifest).length, "sprites written");
