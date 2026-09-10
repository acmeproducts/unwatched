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

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.PORT ?? 4000);
const SEED = Number(process.env.FT_SEED ?? 42);
const MS_PER_SIM_MINUTE = Number(process.env.FT_MS_PER_SIM_MINUTE ?? 1000); // 60000 is real time
const BRAIN = process.env.FT_BRAIN ?? "mock";
const CITIZENS = Number(process.env.FT_CITIZENS ?? 20);
const log = (l: string) => console.log(`[town] ${l}`);

const brain: Brain = BRAIN === "openrouter" ? new OpenRouterBrain({ log }) : BRAIN === "anthropic" ? new AnthropicBrain({ log }) : new MockBrain(SEED);
const store = TownStore.fromEnv("island");
const clients = new Set<WebSocket>();
function broadcast(msg: unknown) { const s = JSON.stringify(msg); for (const c of clients) if (c.readyState === 1) c.send(s); }

const town = new Town({ seed: SEED, brain, log, onEvent: (e) => { store?.sink(e); broadcast({ type: "event", event: e }); } });
for (const p of seedPersonas(new Rng(SEED), CITIZENS)) town.addAgent({ persona: p, owner: null });
if (store) await store.ensureTown("The island", SEED);
log(`${town.agents.size} citizens · brain ${brain.name} · ${MS_PER_SIM_MINUTE} ms per sim minute · store ${store ? "supabase" : "memory only"}`);

// ---- the clock ----
let running = true; let ticking = false; let lastHour = town.hour; let memoryMark = town.t;
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

const sb = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
/** Who is asking. A Supabase JWT when the store exists; the X-Owner header in memory-only dev mode. */
async function ownerOf(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (sb && auth?.startsWith("Bearer ")) { const { data } = await sb.auth.getUser(auth.slice(7)); return data.user?.id ?? null; }
  if (!sb) return req.headers.get("x-owner");
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
const wss = new WebSocketServer({ server: server as unknown as import("node:http").Server, path: "/stream" });
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "hello", clock: clockOf(town), agents: [...town.agents.values()].map((a) => publicAgent(town, a)), recent: town.events.slice(-80) }));
  ws.on("close", () => clients.delete(ws));
});

process.on("SIGINT", async () => { running = false; log("snapshotting before exit"); await store?.snapshot(town); process.exit(0); });
