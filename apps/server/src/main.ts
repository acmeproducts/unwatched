import type { AgentState } from "@ferrytown/engine";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { Town, Rng, MINUTES_PER_DAY } from "@ferrytown/engine";
import type { Brain } from "@ferrytown/engine";
import { Action, Persona, type TownEvent, Passenger } from "@ferrytown/protocol";
import { MockBrain, AnthropicBrain, OpenRouterBrain, seedPersonas } from "@ferrytown/cognition";
import { TownStore, FileStore } from "@ferrytown/store";
import { publicAgent, ownerAgent, clockOf, realClock } from "./views.ts";
import { BrainRouter, newToken, OwnBrain, OwnKeyBrain } from "./brains.ts";
import type { BrainRow, Plan, Store } from "@ferrytown/store";
import { Billing, PLANS, PACKS, COST } from "./billing.ts";
import { Metrics } from "./ops.ts";
import { RealWorld, PLACES } from "./realworld.ts";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.PORT ?? 4000);
const SEED = Number(process.env.FT_SEED ?? 42);
const MS_PER_SIM_MINUTE = Number(process.env.FT_MS_PER_SIM_MINUTE ?? 1000); // 60000 is real time
const BRAIN = process.env.FT_BRAIN ?? "mock";
const CITIZENS = Number(process.env.FT_CITIZENS ?? 20);
const log = (l: string) => console.log(`[town] ${l}`);

const townBrain: Brain = BRAIN === "openrouter" ? new OpenRouterBrain({ log }) : BRAIN === "anthropic" ? new AnthropicBrain({ log }) : new MockBrain(SEED);
const router = new BrainRouter(townBrain, log);
const MODELS = { routine: process.env.FT_OR_MODEL_ROUTINE ?? "anthropic/claude-haiku-4.5", stakes: process.env.FT_OR_MODEL_STAKES ?? "anthropic/claude-sonnet-5", reflect: process.env.FT_OR_MODEL_REFLECT ?? "anthropic/claude-opus-5" };
let clockRef = () => ({ day: 1, hour: 6, t: 0 });
const metrics = new Metrics(router, townBrain, () => clockRef(), MODELS);
const brain = router; // endpoints keep talking to the router; the engine talks to the metrics wrapper
router.onBad = (text) => metrics.hold("watch", text, "own brains");
if (townBrain instanceof OpenRouterBrain) townBrain.onFallback = (f) => metrics.fallback(f);
const TOWN_ID = process.env.FT_TOWN_ID ?? "island";
const TOWN_NAME = process.env.FT_TOWN_NAME ?? "The island";
/** Other islands a ferry runs to: FT_HARBORS="north=https://north.example/engine,west=http://localhost:4011". Names are fetched from them. */
const HARBORS: { id: string; url: string; name: string }[] = (process.env.FT_HARBORS ?? "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const [id, url] = x.split("="); return { id: id!.trim(), url: (url ?? "").trim().replace(/\/$/, ""), name: id!.trim() }; }).filter((h) => h.url);
const FERRY_SECRET = process.env.FT_FERRY_SECRET ?? "";
const harborStats = new Map<string, { at: number; data: Record<string, unknown> | null }>();
async function harborTown(h: { id: string; url: string }): Promise<Record<string, unknown> | null> {
  const hit = harborStats.get(h.id); if (hit && Date.now() - hit.at < 60000) return hit.data;
  try { const res = await fetch(`${h.url}/api/town`, { signal: AbortSignal.timeout(4000) }); const data = res.ok ? (await res.json()) as Record<string, unknown> : null; harborStats.set(h.id, { at: Date.now(), data }); return data; }
  catch { harborStats.set(h.id, { at: Date.now(), data: null }); return null; }
}
/** Put a passenger on the boat to another island. True when the far harbor took them in. */
async function ferryTo(passenger: Passenger, to: string): Promise<boolean> {
  const h = HARBORS.find((x) => x.id === to); if (!h) return false;
  try {
    const res = await fetch(`${h.url}/api/ferry/arrive`, { method: "POST", headers: { "Content-Type": "application/json", "X-Ferry": FERRY_SECRET }, body: JSON.stringify(passenger), signal: AbortSignal.timeout(10000) });
    if (!res.ok) { log(`ferry to ${h.id}: ${res.status} ${(await res.text()).slice(0, 120)}`); return false; }
    return true;
  } catch (err) { log(`ferry to ${h.id}: ${(err as Error).message}`); return false; }
}
let store: Store | null = TownStore.fromEnv(TOWN_ID);
if (store) { const bad = await store.probe(); if (bad) { log(`store disabled: ${bad}`); store = null; } }
if (!store && process.env.FT_STORE !== "none") { store = FileStore.fromEnv(TOWN_ID); log(`record kept in ${process.env.FT_DATA_DIR ?? "out/town"}/${TOWN_ID}.json (set SUPABASE_URL for the shared record, FT_STORE=none for none)`); }
const clients = new Set<WebSocket>();
function broadcast(msg: unknown) { const s = JSON.stringify(msg); for (const c of clients) if (c.readyState === 1) c.send(s); }

const billing = new Billing(store, log); await billing.load();
const town = new Town({ seed: SEED, brain: metrics, log, creditBank: billing.bank, idPrefix: TOWN_ID === "island" ? "" : TOWN_ID, name: TOWN_NAME, harbors: HARBORS.map((h) => ({ id: h.id, name: h.name })), onDepart: ferryTo, onEvent: (e) => { store?.sink(e); broadcast({ type: "event", event: publicEvent(e) }); } });
const saved = store ? await store.loadSnapshot() : null;
if (saved && saved.agents.length > 0) {
  town.restore(saved);
  town.events.push(...(await store!.recentEvents(300)));
  for (const row of await store!.loadBrains()) { const a = town.agents.get(row.agent_id); if (!a) continue; brain.set(row.agent_id, row); a.brainKind = row.kind; a.thinkEvery = row.kind === "own_key" ? row.think_every : null; }
  for (const a of town.agents.values()) billing.applyPlan(a);
  log(`restored the island from its record: ${town.clock()}, ${town.agents.size} citizens, ${saved.papers.length} editions`);
} else {
  for (const p of seedPersonas(new Rng(SEED), CITIZENS)) town.addAgent({ persona: p, owner: null });
  if (store) { await store.ensureTown("The island", SEED); await store.snapshot(town); }
  log("a new island: seeded the first citizens");
}
clockRef = () => ({ day: town.day, hour: town.hour, t: town.t });
// the island keeps our time: a real Adriatic island's sky, calendar, clock and timetable
const REAL = process.env.FT_REAL_WORLD ? (PLACES[process.env.FT_REAL_WORLD] ?? PLACES.hvar!) : null;
const real = REAL ? new RealWorld(town, REAL, log) : null;
if (real) {
  const jumped = real.alignClock();
  real.start(); realClock.place = REAL!.name;
  log(`the island keeps ${REAL!.name}'s time${jumped ? ` (moved the clock ${jumped} minutes forward to ${town.clock()})` : ""}; the sky is ${REAL!.name}'s, the ferry keeps the ${town.season} timetable`);
}
for (const h of HARBORS) void harborTown(h).then((d) => { const n = (d as { name?: string } | null)?.name; if (n) { h.name = n; const th = town.harbors.find((x) => x.id === h.id); if (th) th.name = n; } });
if (HARBORS.length) log(`ferries run to ${HARBORS.map((h) => h.id).join(", ")}${FERRY_SECRET ? "" : " (no FT_FERRY_SECRET: arrivals from other islands are refused)"}`);
log(`${town.agents.size} citizens · brain ${brain.name} · ${MS_PER_SIM_MINUTE} ms per sim minute · store ${store ? (store instanceof FileStore ? "file" : "supabase") : "memory only"} · sign-in ${process.env.SUPABASE_URL ? "supabase" : "dev names"}`);

// ---- the clock ----
let running = true; let ticking = false; let lastHour = town.hour; let memoryMark = town.t + 1;
async function loop() {
  while (running) {
    const started = Date.now();
    if (!ticking) {
      ticking = true;
      try {
        const plannedBefore = [...town.agents.values()].filter((a) => a.plan?.day === town.day).length;
        const t0 = Date.now(); await town.tick(); metrics.tickMs.push(Date.now() - t0); if (metrics.tickMs.length > 200) metrics.tickMs.shift();
        // morning plans are worth a thought each; write them down as soon as they exist so a restart does not ask twice
        const plannedAfter = [...town.agents.values()].filter((a) => a.plan?.day === town.day).length;
        if (store && plannedAfter > plannedBefore) void store.snapshot(town).catch((e: Error) => log(`plan snapshot failed: ${e.message}`));
        if (real) { const lag = real.lag(); if (lag > 3) { town.skip(lag); log(`caught up ${lag} minutes with ${real.place.name}`); } realClock.temperatureC = real.state.temperatureC; realClock.sunrise = real.state.sunrise; realClock.sunset = real.state.sunset; }
        if (town.hour !== lastHour) { lastHour = town.hour; broadcast({ type: "clock", clock: clockOf(town) }); await hourly(); }
      } catch (err) { log(`tick failed: ${(err as Error).message}`); }
      ticking = false;
    }
    const wait = Math.max(0, MS_PER_SIM_MINUTE - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
  }
}
async function hourly() {
  if (!store) return;
  await store.snapshot(town);
  for (const a of town.agents.values()) await store.appendMemories(a, memoryMark);
  memoryMark = town.t;
  const paper = town.papers[town.papers.length - 1]; if (paper) await store.savePaper(paper);
  for (const l of await store.undeliveredLetters()) { town.sendLetter(l.agent_id, l.text); }
  await store.markDelivered((await store.undeliveredLetters()).map((l) => l.id), town.t);
  for (const p of await store.pendingArrivals()) {
    const persona = Persona.safeParse(p.persona); if (!persona.success) continue;
    const a = town.addAgent({ persona: persona.data, owner: p.owner_id, funded: true }, p.id);
    a.appearance = (p.appearance as Record<string, unknown>) ?? null;
    log(`${a.persona.name} stepped off the ferry for ${p.owner_id ?? "nobody"}`);
  }
}
void loop();

// ---- HTTP ----
const app = new Hono();
app.use("/api/*", cors());

// Sign-ins are verified with whichever key exists. The service role is needed only to write the record.
const authKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = process.env.SUPABASE_URL && authKey ? createClient(process.env.SUPABASE_URL, authKey, { auth: { persistSession: false } }) : null;
/** Who is asking. A Supabase JWT when the store exists; the X-Owner header in memory-only dev mode. */
async function ownerOf(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (sb && auth?.startsWith("Bearer ")) { const { data } = await sb.auth.getUser(auth.slice(7)); return data.user?.id ?? null; }
  // Local development only: a name in X-Owner counts as a person. Never set FT_DEV_OWNER where strangers can reach the server.
  if (!sb || process.env.FT_DEV_OWNER === "1") return req.headers.get("x-owner");
  return null;
}
const owns = (a: { owner: string | null }, owner: string | null) => !!owner && a.owner === owner;

const placeView = (p: import("@ferrytown/engine").Place) => ({ id: p.id, name: p.name, kind: p.kind, exits: p.exits, crowd: town.crowd(p.id), x: p.x, y: p.y, district: p.district, sprite: p.sprite, owner: p.owner ? (town.agents.get(p.owner)?.persona.name ?? null) : null, site: p.site ? { what: p.site.what, name: p.site.name, by: town.agents.get(p.site.by)?.persona.name ?? p.site.by, done: p.site.labor, of: p.site.laborNeeded } : null, beds: p.beds ? { price: p.beds.price, free: p.freeBeds ?? 0 } : null });
const childView = (ch: import("@ferrytown/protocol").Child) => ({ id: ch.id, name: ch.name, days: town.day - ch.bornDay, ofAgeIn: Math.max(0, town.ageOfMajority - (town.day - ch.bornDay)), parents: ch.parentNames, home: town.places.get(ch.home)?.name ?? ch.home, orphan: ch.orphan, adopted: !!ch.adoptedBy });
/** The far end of the ferry. Another island puts a passenger here; they step off at our harbor with what they carry and what they remember. */
app.post("/api/ferry/arrive", async (c) => {
  if (!FERRY_SECRET || c.req.header("x-ferry") !== FERRY_SECRET) return c.json({ error: "this harbor takes no ferries from there" }, 403);
  if (!town.ferryRunning) return c.json({ error: town.ferryHeld ? "the ferry is held" : "no crossing in this storm" }, 503);
  const body = Passenger.safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "bad manifest" }, 400);
  const a = town.arrive(body.data); billing.applyPlan(a);
  if (store) await store.snapshot(town);
  return c.json({ ok: true, id: a.id, island: TOWN_NAME });
});
app.get("/api/town", (c) => c.json({ ...clockOf(town), name: TOWN_NAME, id: TOWN_ID, size: town.pack.size, places: [...town.places.values()].map(placeView), laws: town.laws, children: town.children.map(childView) }));
/** Children of the island who could be adopted: unowned, growing up or already grown. Adopting means writing to them; nothing more. */
app.get("/api/children", (c) => c.json({
  growing: town.children.filter((ch) => !ch.adoptedBy).map(childView),
  grown: [...town.agents.values()].filter((a) => !a.owner && a.persona.origin.startsWith("born on the island")).map((a) => publicAgent(town, a)),
}));
const FERRY_SPACES = Number(process.env.FT_FERRY_SPACES ?? 8);
const nextFerry = () => { const n = town.nextFerry(); return `${String(n.hour).padStart(2, "0")}:00${n.tomorrow ? " tomorrow" : ""}`; };
const liveTown = () => ({ id: store?.townId ?? "island", name: TOWN_NAME, live: true, day: town.day, weather: town.weather, population: town.agents.size, flourShortage: town.flourShortage, laws: town.laws.length, openLaws: town.laws.filter((l) => l.open).length, ferries: town.ferryHeld ? "The ferry is held at the mainland" : town.weather === "storm" ? "No crossing in this storm" : real ? `${town.ferryTimes.length} crossings a day, the ${town.season} timetable` : "Ferries hourly, 06:00 to 20:00", next: town.ferryRunning ? nextFerry() : null, spaces: town.ferryRunning ? Math.max(0, FERRY_SPACES - town.pendingArrivals()) : 0 });
app.get("/api/towns", async (c) => {
  const rows = store ? await store.towns().catch(() => []) : [];
  const live = liveTown();
  const others = rows.filter((r) => r.id !== live.id && !HARBORS.some((h) => h.id === r.id)).map((r) => ({ id: r.id, name: r.name, live: false, day: r.day, weather: r.weather, population: r.population, flourShortage: r.flour_shortage, laws: 0, openLaws: 0, ferries: "No ferry runs there from here yet", next: null, spaces: 0 }));
  const far = await Promise.all(HARBORS.map(async (h) => { const d = await harborTown(h) as { name?: string; day?: number; weather?: string; population?: number; flourShortage?: boolean } | null; return { id: h.id, name: d?.name ?? h.name, live: !!d, day: d?.day ?? 0, weather: d?.weather ?? "unknown", population: d?.population ?? 0, flourShortage: !!d?.flourShortage, laws: 0, openLaws: 0, ferries: d ? `A ferry crosses from ${TOWN_NAME}` : "No word from that island today", next: d && town.ferryRunning ? nextFerry() : null, spaces: d && town.ferryRunning ? FERRY_SPACES : 0, far: true }; }));
  return c.json([live, ...far, ...others]);
});
app.get("/api/agents", (c) => c.json([...town.agents.values()].map((a) => publicAgent(town, a))));
app.get("/api/agents/:id", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person on the island" }, 404);
  const owner = await ownerOf(c.req.raw);
  return c.json(owns(a, owner) ? ownerAgent(town, a) : publicAgent(town, a));
});
/** The written digest is one model call; it is remembered for the sim hour so a page refresh costs nothing. */
const digestCache = new Map<string, { key: string; text: string; headline: string }>();
async function writtenDigest(a: AgentState, since: number): Promise<{ text: string; headline: string } | null> {
  const key = `${town.day}:${town.hour}:${since}`;
  const hit = digestCache.get(a.id); if (hit && hit.key === key) return hit;
  const ctx = town.digestContext(a.id, since); if (!ctx) return null;
  try { const w = await brain.digest(ctx); const v = { key, ...w }; digestCache.set(a.id, v); return v; }
  catch (err) { log(`digest failed for ${a.persona.name}: ${(err as Error).message}`); return null; }
}
/** An intent is the owner's to read, not the town's. Public streams carry the deed, never the why. */
function publicEvent(e: TownEvent): TownEvent { if (!e.payload || !("because" in e.payload)) return e; const { because: _b, ...rest } = e.payload; return { ...e, ...(Object.keys(rest).length ? { payload: rest } : {}) } as TownEvent; }
app.get("/api/agents/:id/digest", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person" }, 404);
  const since = Math.max(Number(c.req.query("since") ?? town.t - 3 * MINUTES_PER_DAY), a.arrivedAt); // nothing before the ferry counts as "away"
  const d = town.digest(a.id, since);
  const owner = await ownerOf(c.req.raw);
  const mine = owns(a, owner);
  const written = mine ? await writtenDigest(a, since) : null;
  if (!mine) d.items = d.items.map(publicEvent);
  return c.json({ ...d, written, since, now: town.t, agent: owns(a, owner) ? ownerAgent(town, a) : publicAgent(town, a), letters: owns(a, owner) ? town.events.filter((e) => e.kind === "agent.letter" && e.actors[0] === a.id && e.t >= since).map((e) => ({ t: e.t, text: String(e.payload?.text ?? e.text) })) : [] });
});
app.get("/api/agents/:id/events", (c) => {
  const id = c.req.param("id"); const since = Number(c.req.query("since") ?? 0);
  return c.json(town.events.filter((e) => e.actors.includes(id) && e.t >= since).slice(-300));
});
app.post("/api/agents/:id/letters", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person" }, 404);
  const owner = await ownerOf(c.req.raw); if (!owns(a, owner)) return c.json({ error: "not your agent" }, 403);
  const body = z.object({ text: z.string().min(1).max(1200) }).safeParse(await c.req.json()); if (!body.success) return c.json({ error: "a letter needs words" }, 400);
  if (/https?:\/\/|www\.|@[a-z0-9.-]+\.[a-z]{2,}/i.test(body.data.text)) metrics.hold("watch", `A letter to ${a.persona.name} carries a link or an address. Delivered; worth a look.`, "letters");
  town.sendLetter(a.id, body.data.text);
  if (store) await store.saveLetter(a.id, owner, "to_agent", body.data.text, town.t);
  return c.json({ ok: true, readsAt: "tomorrow morning" });
});
app.post("/api/agents/:id/possess", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person" }, 404);
  const owner = await ownerOf(c.req.raw); if (!owns(a, owner)) return c.json({ error: "not your agent" }, 403);
  if (a.asleep) return c.json({ error: `${a.persona.name} is asleep.` }, 409);
  const body = Action.safeParse(await c.req.json()); if (!body.success) return c.json({ error: "not an action the town knows" }, 400);
  const ok = town.apply(a, body.data, "possessed");
  return c.json({ ok, perception: town.perceive(a) });
});
app.get("/api/agents/:id/perception", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person" }, 404);
  const owner = await ownerOf(c.req.raw); if (!owns(a, owner)) return c.json({ error: "not your agent" }, 403);
  return c.json(town.perceive(a));
});
app.put("/api/agents/:id/instructions", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person" }, 404);
  const owner = await ownerOf(c.req.raw); if (!owns(a, owner)) return c.json({ error: "not your agent" }, 403);
  const body = z.object({ text: z.string().max(1200) }).safeParse(await c.req.json()); if (!body.success) return c.json({ error: "too long for a note on the door" }, 400);
  a.instructions = body.data.text.trim();
  if (store) await store.saveInstructions(a.id, a.instructions);
  return c.json({ ok: true, readsAt: "tomorrow morning" });
});
app.post("/api/agents/:id/leave", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person" }, 404);
  const owner = await ownerOf(c.req.raw); if (!owns(a, owner)) return c.json({ error: "not your agent" }, 403);
  const body = z.object({ note: z.string().max(300).optional() }).safeParse(await c.req.json().catch(() => ({})));
  const gone = town.removeAgent(a.id, "left", body.success ? body.data.note ?? "" : "");
  if (store) { await store.snapshot(town); await store.markLeft(a.id, town.t); }
  broadcast({ type: "left", id: a.id });
  return c.json({ ok: true, name: gone?.persona.name, at: town.clock() });
});
app.get("/api/agents/:id/book", async (c) => {
  const id = c.req.param("id");
  const owner = await ownerOf(c.req.raw); if (!owner) return c.json({ error: "sign in first" }, 401);
  const live = town.agents.get(id);
  if (live && !owns(live, owner)) return c.json({ error: "not your agent" }, 403);
  if (!live && store) { const { data } = await (await import("@supabase/supabase-js")).createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).from("agents").select("owner_id, name, persona, arrived_t, left_t").eq("id", id).maybeSingle(); if (!data || data.owner_id !== owner) return c.json({ error: "not your agent" }, 403);
    const life = await store.lifeOf(id); return c.json({ id, name: data.name, persona: data.persona, arrivedT: Number(data.arrived_t), leftT: data.left_t ? Number(data.left_t) : null, ...life }); }
  if (!live) return c.json({ error: "nobody by that name" }, 404);
  const life = store ? await store.lifeOf(id) : { events: town.events.filter((e) => e.actors.includes(id)), memories: live.memory, letters: [] };
  return c.json({ id, name: live.persona.name, persona: live.persona, arrivedT: live.arrivedAt, leftT: null, ...life });
});
app.get("/api/moments/:id", (c) => {
  const id = Number(c.req.param("id")); const e = town.events.find((x) => x.id === id);
  if (!e) return c.json({ error: "that moment is not in the street's memory anymore" }, 404);
  const around = town.events.filter((x) => x.place === e.place && Math.abs(x.t - e.t) <= 15 && x.kind !== "agent.move").slice(0, 20);
  return c.json({ moment: e, around, place: town.places.get(e.place ?? "")?.name ?? null, people: e.actors.map((id2) => ({ id: id2, name: town.agents.get(id2)?.persona.name ?? id2 })) });
});
app.get("/api/hall", (c) => c.json({ laws: town.laws, council: { mayor: null, members: [], nextSession: "when the first proposal is made" }, population: town.agents.size, day: town.day }));
app.post("/api/me/delete", async (c) => {
  const owner = await ownerOf(c.req.raw); if (!owner) return c.json({ error: "sign in first" }, 401);
  for (const a of [...town.agents.values()]) if (a.owner === owner) { town.removeAgent(a.id, "left", "Their owner closed the account."); if (store) await store.markLeft(a.id, town.t); }
  if (store) { await store.snapshot(town); await store.deleteOwner(owner); }
  return c.json({ ok: true });
});
// ---- who thinks: own key, own brain ----
const brainView = (a: { id: string; brainKind: string }, row: BrainRow | undefined) => {
  const b = brain.perAgent.get(a.id);
  return {
    kind: a.brainKind, provider: row?.provider ?? "openrouter", models: row?.models ?? { routine: "anthropic/claude-haiku-4.5", stakes: "anthropic/claude-sonnet-5", reflect: "anthropic/claude-opus-5" },
    keyMasked: row?.api_key ? `${row.api_key.slice(0, 10)}…${row.api_key.slice(-4)}` : null, thinkEvery: row?.think_every ?? 5, dailyCapUsd: row?.daily_cap_usd ?? 2, memory: row?.memory ?? "lease",
    tokenMasked: row?.token ? `${row.token.slice(0, 12)}…` : null,
    status: b instanceof OwnBrain ? b.status() : b instanceof OwnKeyBrain ? b.status() : null,
    streamUrl: `ws://localhost:${PORT}/agent-stream`,
  };
};
const brainRows = new Map<string, BrainRow>();
if (store) for (const row of await store.loadBrains()) brainRows.set(row.agent_id, row);
app.get("/api/agents/:id/brain", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person" }, 404);
  const owner = await ownerOf(c.req.raw); if (!owns(a, owner)) return c.json({ error: "not your agent" }, 403);
  return c.json(brainView(a, brainRows.get(a.id)));
});
app.put("/api/agents/:id/brain", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person" }, 404);
  const owner = await ownerOf(c.req.raw); if (!owns(a, owner)) return c.json({ error: "not your agent" }, 403);
  const body = z.object({ kind: z.enum(["hosted", "own_key", "own_brain"]), apiKey: z.string().min(8).optional(), models: z.object({ routine: z.string(), stakes: z.string(), reflect: z.string() }).optional(), thinkEvery: z.number().int().min(1).max(240).optional(), dailyCapUsd: z.number().min(0).max(100).optional(), memory: z.enum(["lease", "own"]).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "that setting does not exist" }, 400);
  const prev = brainRows.get(a.id);
  const row: BrainRow = { agent_id: a.id, kind: body.data.kind, provider: "openrouter", api_key: body.data.apiKey ?? prev?.api_key ?? null, models: body.data.models ?? prev?.models ?? null, think_every: body.data.thinkEvery ?? prev?.think_every ?? 5, daily_cap_usd: body.data.dailyCapUsd ?? prev?.daily_cap_usd ?? 2, token: body.data.kind === "own_brain" ? (prev?.token ?? newToken()) : (prev?.token ?? null), memory: body.data.memory ?? prev?.memory ?? "lease" };
  if (row.kind === "own_key") {
    if (!row.api_key) return c.json({ error: "an own key needs a key" }, 400);
    // one cheap test call before we keep it
    const test = await fetch("https://openrouter.ai/api/v1/auth/key", { headers: { Authorization: `Bearer ${row.api_key}` } });
    if (!test.ok) return c.json({ error: "OpenRouter says this key is not valid. Nothing was saved." }, 400);
  }
  brainRows.set(a.id, row); brain.set(a.id, row);
  a.brainKind = row.kind; a.thinkEvery = row.kind === "own_key" ? row.think_every : null;
  if (store) await store.saveBrain(row);
  return c.json({ ...brainView(a, row), ...(body.data.kind === "own_brain" && !prev?.token ? { token: row.token } : {}) });
});
app.post("/api/agents/:id/brain/token", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person" }, 404);
  const owner = await ownerOf(c.req.raw); if (!owns(a, owner)) return c.json({ error: "not your agent" }, 403);
  const prev = brainRows.get(a.id); if (!prev || prev.kind !== "own_brain") return c.json({ error: "this agent is not on an own brain" }, 400);
  const row = { ...prev, token: newToken() }; brainRows.set(a.id, row); brain.set(a.id, row); if (store) await store.saveBrain(row);
  return c.json({ token: row.token });
});
// ---- credits and plan ----
app.get("/api/me/wallet", async (c) => {
  const owner = await ownerOf(c.req.raw); if (!owner) return c.json({ error: "sign in first" }, 401);
  const w = billing.wallet(owner);
  return c.json({ plan: w.plan, credits: w.credits, plans: PLANS, packs: PACKS, cost: COST, testMode: billing.testMode, ledger: store ? await store.ledger(owner) : [] });
});
app.post("/api/me/plan", async (c) => {
  const owner = await ownerOf(c.req.raw); if (!owner) return c.json({ error: "sign in first" }, 401);
  const body = z.object({ plan: z.enum(["visitor", "resident", "patron"]) }).safeParse(await c.req.json()); if (!body.success) return c.json({ error: "no such plan" }, 400);
  const plan = body.data.plan as Plan;
  if (plan === "visitor" || billing.testMode) { await billing.setPlan(owner, plan); for (const a of town.agents.values()) if (a.owner === owner) billing.applyPlan(a); return c.json({ ok: true, plan, note: billing.testMode && plan !== "visitor" ? "Test mode: no card was charged." : undefined }); }
  const r = await billing.checkoutPlan(owner, plan, c.req.header("origin") ?? "http://localhost:3000"); return "url" in r ? c.json(r) : c.json({ error: r.error }, 400);
});
app.post("/api/me/credits/checkout", async (c) => {
  const owner = await ownerOf(c.req.raw); if (!owner) return c.json({ error: "sign in first" }, 401);
  const body = z.object({ pack: z.enum(["small", "medium", "large"]) }).safeParse(await c.req.json()); if (!body.success) return c.json({ error: "no such pack" }, 400);
  if (billing.testMode) { const w = await billing.grant(owner, PACKS[body.data.pack]!.credits, "grant", "test-mode"); return c.json({ ok: true, credits: w.credits, note: "Test mode: credits were granted, no card was charged." }); }
  const r = await billing.checkoutPack(owner, body.data.pack, c.req.header("origin") ?? "http://localhost:3000"); return "url" in r ? c.json(r) : c.json({ error: r.error }, 400);
});
app.post("/api/stripe/webhook", async (c) => { const r = await billing.webhook(await c.req.text(), c.req.header("stripe-signature")); return c.json(r, r.ok ? 200 : 400); });
// ---- ops, behind a token ----
const opsOk = (req: Request) => !!process.env.FT_OPS_TOKEN && req.headers.get("x-ops") === process.env.FT_OPS_TOKEN;
app.get("/api/ops", (c) => {
  if (!opsOk(c.req.raw)) return c.json({ error: process.env.FT_OPS_TOKEN ? "ops token required" : "set FT_OPS_TOKEN to open the ops room" }, 401);
  const agents = [...town.agents.values()]; const funded = agents.filter((a) => a.funded && (a.owner || a.brainKind === "hosted"));
  const hosted = agents.filter((a) => a.brainKind === "hosted"), ownKey = agents.filter((a) => a.brainKind === "own_key"), ownBrain = agents.filter((a) => a.brainKind === "own_brain");
  const today = metrics.today(town.day);
  const since = town.t - 3 * MINUTES_PER_DAY;
  const bored = agents.filter((a) => a.funded && !town.events.some((e) => e.t >= since && e.importance >= 0.45 && e.actors.includes(a.id))).length;
  const coins = agents.reduce((s, a) => s + a.coins, 0);
  const jobs = [...town.jobs.values()]; const employed = agents.filter((a) => a.job).length;
  const brains = ownBrain.map((a) => { const b = brain.perAgent.get(a.id); const st = b && "status" in b ? (b as { status: () => Record<string, unknown> }).status() : null; return { id: a.id, name: a.persona.name, ...st }; });
  const ticks = [...metrics.tickMs].sort((x, y) => x - y);
  return c.json({
    clock: clockOf(town), switches: { paused: town.paused, economyFrozen: town.economyFrozen, ferryHeld: town.ferryHeld },
    stats: { agents: agents.length, funded: funded.length, hosted: hosted.length, ownKey: ownKey.length, ownBrain: ownBrain.length, costToday: Math.round(today.cost * 100) / 100, costPerFunded: hosted.length ? Math.round(today.cost / hosted.length * 100) / 100 : 0, p50: today.p50, p95: today.p95, holds: metrics.holds.filter((h) => !h.done && h.level === "hold").length, fallbacksToday: metrics.fallbacks.filter((f) => Date.now() - f.at < 86400000).length, cachedTokens: townBrain instanceof OpenRouterBrain ? townBrain.cachedTokens() : 0, ceiling: Number(process.env.FT_DAILY_CEILING_USD ?? 120) },
    hours: metrics.hours.filter((h) => h.day === town.day).map((h) => ({ hour: h.hour, calls: h.t1 + h.t2 + h.t3 + h.converse, t1: h.t1, t2: h.t2, t3: h.t3, converse: h.converse, cost: Math.round(h.cost * 100) / 100 })),
    byTier: [{ tier: "Tier 1 · routine", model: MODELS.routine, calls: today.t1 + today.converse }, { tier: "Tier 2 · stakes", model: MODELS.stakes, calls: today.t2 }, { tier: "Tier 3 · reflection and the paper", model: MODELS.reflect, calls: today.t3 }],
    real: real ? { ...real.state, season: town.season, timetable: town.ferryTimes } : null,
    health: { coins, tills: [...town.places.values()].reduce((s, p) => s + p.treasury, 0), council: town.places.get("council")?.treasury ?? 0, employed, jobs: jobs.reduce((s, j) => s + j.slots, 0), flourShortage: town.flourShortage, laws: town.laws.length, openLaws: town.laws.filter((l) => l.open).length, boredomPct: funded.length ? Math.round(bored / funded.length * 100) : 0, events: town.events.length, tickP50: ticks.length ? ticks[Math.floor(ticks.length / 2)] : 0, tickMax: ticks.length ? ticks[ticks.length - 1] : 0, store: !!store, brain: townBrain.name, msPerMinute: MS_PER_SIM_MINUTE },
    holds: metrics.holds.slice(0, 20), ownBrains: brains,
  });
});
app.post("/api/ops/switch", async (c) => {
  if (!opsOk(c.req.raw)) return c.json({ error: "ops token required" }, 401);
  const body = z.object({ which: z.enum(["pause", "economy", "ferry", "snapshot"]), on: z.boolean().optional() }).safeParse(await c.req.json()); if (!body.success) return c.json({ error: "no such switch" }, 400);
  const { which } = body.data;
  if (which === "snapshot") { if (store) await store.snapshot(town); town.actOfGod("The island's record was written down in full."); return c.json({ ok: true }); }
  const on = body.data.on ?? !(which === "pause" ? town.paused : which === "economy" ? town.economyFrozen : town.ferryHeld);
  if (which === "pause") { town.paused = on; town.actOfGod(on ? "Time stood still on the island. Nobody aged, nothing happened, no credits were spent." : "Time began again on the island."); }
  if (which === "economy") { town.economyFrozen = on; town.actOfGod(on ? "No wages were paid and no rent was due. The coins on the island stayed where they were." : "Wages and rent resumed."); }
  if (which === "ferry") { town.ferryHeld = on; town.actOfGod(on ? "The ferry was held at the mainland. Nobody arrived, nobody left." : "The ferry runs again."); }
  log(`act of God: ${which} ${on ? "on" : "off"}`); broadcast({ type: "clock", clock: clockOf(town) });
  return c.json({ ok: true, switches: { paused: town.paused, economyFrozen: town.economyFrozen, ferryHeld: town.ferryHeld } });
});
app.post("/api/ops/hold/:id", (c) => { if (!opsOk(c.req.raw)) return c.json({ error: "ops token required" }, 401); const h = metrics.holds.find((x) => x.id === Number(c.req.param("id"))); if (h) h.done = true; return c.json({ ok: !!h }); });
app.get("/api/papers", (c) => c.json(town.papers.slice(-14).reverse()));
app.get("/api/papers/latest", (c) => { const p = town.papers[town.papers.length - 1]; return p ? c.json(p) : c.json({ error: "the first edition prints at midnight" }, 404); });
app.get("/api/events", (c) => {
  const since = Number(c.req.query("since") ?? town.t - 120); const place = c.req.query("place"); const min = Number(c.req.query("min") ?? 0);
  return c.json(town.events.filter((e) => e.t >= since && (!place || e.place === place) && e.importance >= min).slice(-500).map(publicEvent));
});
app.post("/api/board", async (c) => {
  const owner = await ownerOf(c.req.raw); if (!owner) return c.json({ error: "sign in at the ferry office first" }, 401);
  const raw = await c.req.json().catch(() => ({}));
  const adopt = z.object({ adopt: z.string() }).safeParse(raw);
  if (adopt.success) {
    // adopting a child of the island: a grown one becomes yours now; a growing one becomes yours when they come of age
    const grown = town.agents.get(adopt.data.adopt);
    if (grown && !grown.owner && grown.persona.origin.startsWith("born on the island")) { grown.owner = owner; billing.applyPlan(grown); if (store) await store.snapshot(town); town.emit("town.notice", [grown.id], grown.location, `Someone on the mainland has taken an interest in ${grown.persona.name}, and will write.`, 0.4); return c.json({ id: grown.id, arrived: town.clock(), adopted: true }); }
    const ch = town.children.find((x) => x.id === adopt.data.adopt && !x.adoptedBy);
    if (!ch) return c.json({ error: "no such child of the island, or someone already writes to them" }, 404);
    ch.adoptedBy = owner; if (store) await store.snapshot(town);
    return c.json({ id: ch.id, child: true, ofAgeIn: Math.max(0, town.ageOfMajority - (town.day - ch.bornDay)) });
  }
  const body = z.object({ persona: Persona, appearance: z.record(z.string(), z.unknown()).optional(), brain: z.enum(["hosted", "own_key", "own_brain"]).default("hosted"), town: z.string().optional() }).safeParse(raw);
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "the manifest is incomplete" }, 400);
  const harbor = body.data.town ? HARBORS.find((h) => h.id === body.data.town) : null;
  if (harbor) {
    // a ticket for another island: the passenger crosses from here with a suitcase, forty coins and no memories yet
    const passenger: Passenger = { from: { id: TOWN_ID, name: TOWN_NAME }, persona: body.data.persona, appearance: body.data.appearance ?? null, owner, coins: 40, inventory: [], memories: [], opinions: [], instructions: "", why: null, news: [] };
    const ok = await ferryTo(passenger, harbor.id);
    if (!ok) return c.json({ error: `the ferry to ${harbor.name} did not sail; try again later` }, 503);
    return c.json({ away: true, island: harbor.name, url: harbor.url });
  }
  if (body.data.town && body.data.town !== (store?.townId ?? "island")) {
    const known = store ? (await store.towns().catch(() => [])).some((t) => t.id === body.data.town) : false;
    if (known) return c.json({ error: "no ferry runs to that island from here yet" }, 400); // a real island this office does not serve; an unknown id just boards here
  }
  if (!town.ferryRunning) return c.json({ error: town.ferryHeld ? "the ferry is held at the mainland; try again later" : "no ferry crosses in a storm; try again when it clears" }, 503);
  const a = town.addAgent({ persona: body.data.persona, owner, funded: true });
  a.appearance = body.data.appearance ?? null; billing.applyPlan(a);
  if (store) await store.snapshot(town);
  return c.json({ id: a.id, arrived: town.clock() });
});
app.get("/api/me/agents", async (c) => {
  const owner = await ownerOf(c.req.raw); if (!owner) return c.json([]);
  return c.json([...town.agents.values()].filter((a) => a.owner === owner).map((a) => ownerAgent(town, a)));
});
app.get("/api/health", (c) => c.json({ ok: true, clock: clockOf(town), brain: brain.name }));

// ---- WebSocket stream ----
const server = serve({ fetch: app.fetch, port: PORT, createServer }, () => log(`listening on http://localhost:${PORT}`));
const wss = new WebSocketServer({ noServer: true });
const agentWss = new WebSocketServer({ noServer: true });
(server as unknown as import("node:http").Server).on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/stream") wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  else if (url.pathname === "/agent-stream") {
    const b = brain.ownBrainByToken(url.searchParams.get("token") ?? "");
    if (!b) { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); return; }
    agentWss.handleUpgrade(req, socket, head, (ws) => { b.attach(ws); const a = town.agents.get(b.row.agent_id); log(`own brain connected for ${a?.persona.name ?? b.row.agent_id}`); ws.send(JSON.stringify({ type: "hello", agent_id: b.row.agent_id, name: a?.persona.name, clock: clockOf(town), rules: "One action per sim minute. Answer each perceive within deadline_ms with {type:'act', action, intent?, remember?}. Answer reflect within 30 s or the town reflects for you." })); });
  } else socket.destroy();
});
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "hello", clock: clockOf(town), agents: [...town.agents.values()].map((a) => publicAgent(town, a)), recent: town.events.slice(-80).map(publicEvent) }));
  ws.on("close", () => clients.delete(ws));
});

async function shutdown() { running = false; log("snapshotting before exit"); if (store) { await store.snapshot(town); for (const a of town.agents.values()) await store.appendMemories(a, memoryMark); } process.exit(0); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
