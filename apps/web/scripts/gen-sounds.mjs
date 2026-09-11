// Fill apps/web/public/sound with generated ambience and effects, and write the manifest the world reads.
//
//   ELEVENLABS_API_KEY=… node scripts/gen-sounds.mjs            generate everything missing
//   node scripts/gen-sounds.mjs --only sea,gull                  a few layers
//   node scripts/gen-sounds.mjs --force                          regenerate all
//
// Uses the ElevenLabs sound-generation endpoint. Loops are asked for as seamless; one-shots are short.
// Any other generator works too: drop files in public/sound and list them in manifest.json by the same names.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve("public/sound"); mkdirSync(OUT, { recursive: true });
const MANIFEST = resolve(OUT, "manifest.json");
const args = process.argv.slice(2); const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null; const force = args.includes("--force");

/** What each layer should sound like. Loops are ten to twelve seconds and must not have a beginning or an end. */
const SOUNDS = {
  sea:     { seconds: 12, loop: true,  prompt: "Gentle sea at a small stone harbor, slow waves lapping and receding against a quay, distant water, no music, no voices, seamless loop" },
  rain:    { seconds: 12, loop: true,  prompt: "Steady rain on clay roof tiles and a cobbled square, soft dripping from eaves, no thunder, no wind, seamless loop" },
  wind:    { seconds: 12, loop: true,  prompt: "Wind over an island hill, steady with slow gusts, grass and distant pine trees moving, no rain, seamless loop" },
  forest:  { seconds: 12, loop: true,  prompt: "Quiet pine wood by the sea, light breeze in needles, a few small birds far away, no footsteps, seamless loop" },
  night:   { seconds: 12, loop: true,  prompt: "Mediterranean island night, crickets, very distant calm sea, no music, seamless loop" },
  murmur:  { seconds: 12, loop: true,  prompt: "Interior of a small old inn in the evening, low murmur of a dozen people talking, occasional cup set down on wood, no music, no distinct words, seamless loop" },
  market:  { seconds: 12, loop: true,  prompt: "Small outdoor market square in the morning, a few voices bartering at a distance, a crate set down, gulls far off, no music, seamless loop" },
  work:    { seconds: 12, loop: true,  prompt: "Village smithy, unhurried hammer on anvil every second or so, bellows breathing, no voices, seamless loop" },
  gull:    { seconds: 2,  loop: false, prompt: "Two herring gulls calling once, mid distance, harbor, clean, no other sound" },
  bell:    { seconds: 3,  loop: false, prompt: "A single small chapel bell struck once, bronze, ringing out over a village and fading, no other sound" },
  horn:    { seconds: 3,  loop: false, prompt: "A small ferry boat sounds its horn twice, low and short, across a harbor, no other sound" },
  creak:   { seconds: 2,  loop: false, prompt: "A wooden pier creaks once under weight, ropes shifting, water underneath, no other sound" },
  thunder: { seconds: 4,  loop: false, prompt: "Distant thunder rolling over the sea, one long rumble, no rain in the foreground" },
};

const key = process.env.ELEVENLABS_API_KEY;
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
let made = 0;
for (const [name, spec] of Object.entries(SOUNDS)) {
  if (only && !only.includes(name)) continue;
  const file = `${name}.mp3`;
  if (!force && existsSync(resolve(OUT, file))) { manifest[name] = file; continue; }
  if (!key) { console.log(`missing ${file}: set ELEVENLABS_API_KEY to generate it, or make it another way and drop it in public/sound`); continue; }
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text: spec.prompt, duration_seconds: spec.seconds, prompt_influence: 0.4, ...(spec.loop ? { loop: true } : {}) }),
  });
  if (!res.ok) { console.error(`${name}: ${res.status} ${(await res.text()).slice(0, 200)}`); continue; }
  writeFileSync(resolve(OUT, file), Buffer.from(await res.arrayBuffer())); manifest[name] = file; made++;
  console.log(`made ${file}`);
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`${made} generated, ${Object.keys(manifest).length} in the manifest`);
