// The island's music, generated with Lyria RealTime through the Gemini API, one bed per scene.
//
//   GEMINI_API_KEY=… node scripts/gen-music.mjs            make every bed that is missing
//   node scripts/gen-music.mjs --only night,storm          a few
//   node scripts/gen-music.mjs --force --seconds 60        regenerate all, longer
//
// Each bed is streamed from Lyria for a while, trimmed of its first bars so it starts mid-flow, and written as a
// 48 kHz stereo WAV under public/sound, compressed to music-<scene>.m4a for the web. The manifest gains the entries the world reads.
// The key comes from GEMINI_API_KEY or GOOGLE_API_KEY in the environment; the repo's .env is loaded if present.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenAI } from "@google/genai";

for (const f of ["../../.env", ".env"]) { const p = resolve(f); if (existsSync(p)) for (const line of readFileSync(p, "utf8").split("\n")) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } }
const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
if (!key) { console.error("set GEMINI_API_KEY in .env (an AI Studio key with Lyria RealTime access)"); process.exit(1); }

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const force = args.includes("--force");
const SECONDS = args.includes("--seconds") ? Number(args[args.indexOf("--seconds") + 1]) : 48;
const OUT = resolve("public/sound"); mkdirSync(OUT, { recursive: true });
const MANIFEST = resolve(OUT, "manifest.json");

/** What each bed should be. Quiet, instrumental, unhurried: it sits under gulls and rain, never over them. */
const SCENES = {
  day:    { bpm: 76,  prompts: [["gentle acoustic folk, nylon guitar and soft accordion, seaside village morning, warm, unhurried, sparse", 1], ["instrumental, no drums, no vocals", 0.8]] },
  rain:   { bpm: 64,  prompts: [["slow solo piano with soft low strings, rain on a window, patient, tender, minor key", 1], ["instrumental, sparse, no percussion", 0.8]] },
  night:  { bpm: 56,  prompts: [["very sparse ambient, warm pads, a distant music box, calm sea at night, hushed", 1], ["instrumental, almost still, no drums", 0.9]] },
  tavern: { bpm: 104, prompts: [["warm folk in a small tavern, fiddle and guitar and light hand percussion, convivial, mid tempo, not loud", 1], ["instrumental, acoustic", 0.7]] },
  storm:  { bpm: 60,  prompts: [["low cello drones and slow timpani, wind and sea in a storm, tense but restrained, dark", 1], ["instrumental, no melody, ominous ambient", 0.8]] },
  fog:    { bpm: 58,  prompts: [["airy glassy pads and a lone clarinet, fog over a harbor, slow, weightless, mysterious", 1], ["instrumental, ambient, very sparse", 0.9]] },
  winter: { bpm: 66,  prompts: [["sparse winter folk, soft bells and muted strings, cold morning, quiet, gentle", 1], ["instrumental, no drums", 0.8]] },
};

const ai = new GoogleGenAI({ apiKey: key, apiVersion: "v1alpha" });

function wav(pcm, sampleRate = 48000, channels = 2) {
  const header = Buffer.alloc(44); const dataLen = pcm.length;
  header.write("RIFF", 0); header.writeUInt32LE(36 + dataLen, 4); header.write("WAVE", 8); header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, pcm]);
}

async function record(scene, spec) {
  const chunks = []; let bytes = 0; const want = SECONDS * 48000 * 2 * 2; const skip = 4 * 48000 * 2 * 2; // drop the first four seconds while the piece settles
  let done; const finished = new Promise((r) => { done = r; }); let closed = false;
  const session = await ai.live.music.connect({
    model: "models/lyria-realtime-exp",
    callbacks: {
      onmessage: (m) => { for (const c of m.serverContent?.audioChunks ?? []) { const b = Buffer.from(c.data, "base64"); chunks.push(b); bytes += b.length; } if (bytes >= want + skip) done(); },
      onerror: (e) => { console.error(`${scene}: ${e?.message ?? e}`); done(); },
      onclose: () => { closed = true; done(); },
    },
  });
  await session.setWeightedPrompts({ weightedPrompts: spec.prompts.map(([text, weight]) => ({ text, weight })) });
  await session.setMusicGenerationConfig({ musicGenerationConfig: { bpm: spec.bpm, temperature: 1.0, density: 0.35, brightness: 0.45 } });
  await session.play();
  const timer = setTimeout(done, (SECONDS + 30) * 1000);
  await finished; clearTimeout(timer);
  try { await session.stop(); } catch {}
  if (!closed) { try { session.close(); } catch {} }
  const all = Buffer.concat(chunks); if (all.length <= skip) throw new Error(`${scene}: no audio came back`);
  const pcm = all.subarray(skip, Math.min(all.length, skip + want));
  return wav(pcm);
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
let made = 0;
for (const [scene, spec] of Object.entries(SCENES)) {
  if (only && !only.includes(scene)) continue;
  const file = `music-${scene}.wav`; const name = `music-${scene}`;
  if (!force && existsSync(resolve(OUT, file))) { manifest[name] = file; continue; }
  process.stdout.write(`${scene}: streaming ${SECONDS}s from Lyria… `);
  try {
    const buf = await record(scene, spec); writeFileSync(resolve(OUT, file), buf); made++;
    // the web gets a small AAC file when ffmpeg is on the machine (its built-in encoder, no extra libraries); the WAV stays out of git either way
    const m4a = `music-${scene}.m4a`; const { spawnSync } = await import("node:child_process");
    const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", resolve(OUT, file), "-c:a", "aac", "-b:a", "128k", resolve(OUT, m4a)]);
    manifest[name] = r.status === 0 ? m4a : file;
    console.log(`wrote ${r.status === 0 ? m4a : file} (${(buf.length / 1048576).toFixed(1)} MB of PCM${r.status === 0 ? ", compressed" : ", no ffmpeg found"})`);
  }
  catch (e) { console.log(`failed: ${e.message}`); }
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`${made} beds generated, ${Object.keys(manifest).length} entries in the manifest`);
