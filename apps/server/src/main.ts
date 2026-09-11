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
import { Action, Persona, type TownEvent } from "@ferrytown/protocol";
import { MockBrain, AnthropicBrain, OpenRouterBrain, seedPersonas } from "@ferrytown/cognition";
import { TownStore } from "@ferrytown/store";
import { publicAgent, ownerAgent, clockOf } from "./views.ts";
import { BrainRouter, newToken, OwnBrain, OwnKeyBrain } from "./brains.ts";
import type { BrainRow } from "@ferrytown/store";

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
const brain = new BrainRouter(townBrain, log);
let store = TownStore.fromEnv("island");
if (store) { const bad = await store.probe(); if (bad) { log(`store disabled: ${bad}`); store = null; } }
const clients = new Set<WebSocket>();
function broadcast(msg: unknown) { const s = JSON.stringify(msg); for (const c of clients) if (c.readyState === 1) c.send(s); }

const town = new Town({ seed: SEED, brain, log, onEvent: (e) => { store?.sink(e); broadcast({ type: "event", event: e }); } });
const saved = store ? await store.loadSnapshot() : null;
if (saved) {
  town.restore(saved);
  town.events.push(...(await store!.recentEvents(300)));
  for (const row of await store!.loadBrains()) { const a = town.agents.get(row.agent_id); if (!a) continue; brain.set(row.agent_id, row); a.brainKind = row.kind; a.thinkEvery = row.kind === "own_key" ? row.think_every : null; }
  log(`restored the island from its record: ${town.clock()}, ${town.agents.size} citizens, ${saved.papers.length} editions`);
} else {
  for (const p of seedPersonas(new Rng(SEED), CITIZENS)) town.addAgent({ persona: p, owner: null });
  if (store) { await store.ensureTown("The island", SEED); await store.snapshot(town); }
  log("a new island: seeded the first citizens");
}
log(`${town.agents.size} citizens · brain ${brain.name} · ${MS_PER_SIM_MINUTE} ms per sim minute · store ${store ? "supabase" : "memory only"} · sign-in ${process.env.SUPABASE_URL ? "supabase" : "dev names"}`);

// ---- the clock ----
let running = true; let ticking = false; let lastHour = town.hour; let memoryMark = town.t + 1;
async function loop() {
  while (running) {
    const started = Date.now();
    if (!ticking) {
      ticking = true;
      try {
        await town.tick();
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

app.get("/api/town", (c) => c.json({ ...clockOf(town), places: [...town.places.values()].map((p) => ({ id: p.id, name: p.name, kind: p.kind, exits: p.exits, crowd: town.crowd(p.id) })), laws: town.laws }));
app.get("/api/agents", (c) => c.json([...town.agents.values()].map((a) => publicAgent(town, a))));
app.get("/api/agents/:id", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person on the island" }, 404);
  const owner = await ownerOf(c.req.raw);
  return c.json(owns(a, owner) ? ownerAgent(town, a) : publicAgent(town, a));
});
app.get("/api/agents/:id/digest", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person" }, 404);
  const since = Number(c.req.query("since") ?? town.t - 3 * MINUTES_PER_DAY);
  const d = town.digest(a.id, since);
  const owner = await ownerOf(c.req.raw);
  return c.json({ ...d, since, now: town.t, agent: owns(a, owner) ? ownerAgent(town, a) : publicAgent(town, a), letters: owns(a, owner) ? town.events.filter((e) => e.kind === "agent.letter" && e.actors[0] === a.id && e.t >= since).map((e) => ({ t: e.t, text: String(e.payload?.text ?? e.text) })) : [] });
});
app.get("/api/agents/:id/events", (c) => {
  const id = c.req.param("id"); const since = Number(c.req.query("since") ?? 0);
  return c.json(town.events.filter((e) => e.actors.includes(id) && e.t >= since).slice(-300));
});
app.post("/api/agents/:id/letters", async (c) => {
  const a = town.agents.get(c.req.param("id")); if (!a) return c.json({ error: "no such person" }, 404);
  const owner = await ownerOf(c.req.raw); if (!owns(a, owner)) return c.json({ error: "not your agent" }, 403);
  const body = z.object({ text: z.string().min(1).max(1200) }).safeParse(await c.req.json()); if (!body.success) return c.json({ error: "a letter needs words" }, 400);
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
app.get("/api/papers", (c) => c.json(town.papers.slice(-14).reverse()));
app.get("/api/papers/latest", (c) => { const p = town.papers[town.papers.length - 1]; return p ? c.json(p) : c.json({ error: "the first edition prints at midnight" }, 404); });
app.get("/api/events", (c) => {
  const since = Number(c.req.query("since") ?? town.t - 120); const place = c.req.query("place"); const min = Number(c.req.query("min") ?? 0);
  return c.json(town.events.filter((e) => e.t >= since && (!place || e.place === place) && e.importance >= min).slice(-500));
});
app.post("/api/board", async (c) => {
  const owner = await ownerOf(c.req.raw); if (!owner) return c.json({ error: "sign in at the ferry office first" }, 401);
  const body = z.object({ persona: Persona, appearance: z.record(z.string(), z.unknown()).optional(), brain: z.enum(["hosted", "own_key", "own_brain"]).default("hosted") }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "the manifest is incomplete" }, 400);
  const a = town.addAgent({ persona: body.data.persona, owner, funded: true });
  a.appearance = body.data.appearance ?? null;
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
  ws.send(JSON.stringify({ type: "hello", clock: clockOf(town), agents: [...town.agents.values()].map((a) => publicAgent(town, a)), recent: town.events.slice(-80) }));
  ws.on("close", () => clients.delete(ws));
});

async function shutdown() { running = false; log("snapshotting before exit"); if (store) { await store.snapshot(town); for (const a of town.agents.values()) await store.appendMemories(a, memoryMark); } process.exit(0); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
