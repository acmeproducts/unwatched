import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TownEvent, Paper } from "@ferrytown/protocol";
import type { Town, AgentState } from "@ferrytown/engine";

/**
 * The town's record on Supabase. The engine writes with the service role; owners and visitors read through RLS.
 * Writes are batched so a busy tick does not become a thousand round trips.
 */
export class TownStore {
  private sb: SupabaseClient;
  private eventQueue: TownEvent[] = [];
  private flushing = false;
  private timer: NodeJS.Timeout | null = null;
  constructor(url: string, serviceKey: string, readonly townId: string) {
    this.sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  static fromEnv(townId = "island"): TownStore | null {
    const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return new TownStore(url, key, townId);
  }

  /** One cheap read at startup. Returns a reason when the key or the project is wrong. */
  async probe(): Promise<string | null> {
    const { error } = await this.sb.from("towns").select("id").limit(1);
    if (!error) return null;
    if (/invalid api key|jwt/i.test(error.message)) return "the service role key is not valid for this project; re-copy it from Settings, then API";
    return error.message;
  }

  async ensureTown(name: string, seed: number): Promise<void> {
    await this.sb.from("towns").upsert({ id: this.townId, name, seed }, { onConflict: "id", ignoreDuplicates: true });
  }

  /** Event sink for the engine. Queues and flushes every 500 ms or 200 events. */
  sink = (e: TownEvent): void => {
    this.eventQueue.push(e);
    if (this.eventQueue.length >= 200) void this.flush();
    else if (!this.timer) this.timer = setTimeout(() => void this.flush(), 500);
  };

  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.flushing || this.eventQueue.length === 0) return;
    this.flushing = true;
    const batch = this.eventQueue.splice(0, this.eventQueue.length);
    try {
      const { error } = await this.sb.from("events").insert(batch.map((e) => ({ town_id: this.townId, t: e.t, day: e.day, kind: e.kind, actors: e.actors, place: e.place ?? null, text: e.text, importance: e.importance, payload: e.payload ?? null })));
      if (error) console.error("events insert failed:", error.message);
    } finally { this.flushing = false; }
    if (this.eventQueue.length) void this.flush();
  }

  /** Snapshot every agent and the clock. Called at the end of each sim hour and on shutdown. */
  async snapshot(town: Town): Promise<void> {
    await this.flush();
    const agents = [...town.agents.values()].map((a) => this.agentRow(a));
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      this.sb.from("agents").upsert(agents, { onConflict: "id" }),
      this.sb.from("towns").update({ sim_t: town.t, day: town.day, weather: town.weather, flour_shortage: town.flourShortage }).eq("id", this.townId),
    ]);
    if (e1) console.error("agents upsert failed:", e1.message);
    if (e2) console.error("town update failed:", e2.message);
    const rels: { agent_id: string; other_id: string; trust: number; affection: number; last_seen: number; opinion: string }[] = [];
    for (const a of town.agents.values()) for (const [other, r] of a.relationships) rels.push({ agent_id: a.id, other_id: other, trust: r.trust, affection: r.affection, last_seen: r.lastSeen, opinion: r.opinion });
    if (rels.length) { const { error } = await this.sb.from("relationships").upsert(rels, { onConflict: "agent_id,other_id" }); if (error) console.error("relationships upsert failed:", error.message); }
  }

  /** Memories are appended, never rewritten. Pass only the ones written since the last call. */
  async appendMemories(a: AgentState, sinceT: number): Promise<void> {
    const rows = a.memory.filter((m) => m.t >= sinceT).map((m) => ({ agent_id: a.id, t: m.t, kind: m.kind, text: m.text, importance: m.importance }));
    if (!rows.length) return;
    const { error } = await this.sb.from("memories").insert(rows);
    if (error) console.error("memories insert failed:", error.message);
  }

  async savePaper(paper: Paper): Promise<void> {
    const { error } = await this.sb.from("papers").upsert({ town_id: this.townId, edition: paper.edition, paper }, { onConflict: "town_id,edition" });
    if (error) console.error("paper upsert failed:", error.message);
  }

  async saveLetter(agentId: string, ownerId: string | null, direction: "to_agent" | "to_owner", text: string, t: number): Promise<void> {
    const { error } = await this.sb.from("letters").insert({ agent_id: agentId, owner_id: ownerId, direction, text, t });
    if (error) console.error("letter insert failed:", error.message);
  }

  /** Letters owners wrote through the web app that the engine has not delivered yet. */
  async undeliveredLetters(): Promise<{ id: number; agent_id: string; text: string }[]> {
    const { data, error } = await this.sb.from("letters").select("id, agent_id, text").eq("direction", "to_agent").is("read_at", null);
    if (error) { console.error("letters read failed:", error.message); return []; }
    return data ?? [];
  }
  async markDelivered(ids: number[], t: number): Promise<void> {
    if (!ids.length) return;
    await this.sb.from("letters").update({ read_at: t }).in("id", ids);
  }

  /** Agents boarded through the web app that the engine has not admitted yet: state is null until the ferry docks. */
  async pendingArrivals(): Promise<{ id: string; owner_id: string | null; name: string; persona: unknown; appearance: unknown; brain: string }[]> {
    const { data, error } = await this.sb.from("agents").select("id, owner_id, name, persona, appearance, brain").eq("town_id", this.townId).is("arrived_t", null);
    if (error) { console.error("arrivals read failed:", error.message); return []; }
    return data ?? [];
  }

  private agentRow(a: AgentState) {
    return {
      id: a.id, town_id: this.townId, owner_id: a.owner && /^[0-9a-f-]{36}$/.test(a.owner) ? a.owner : null, name: a.persona.name, persona: a.persona,
      brain: "hosted", funded: a.funded, arrived_t: a.arrivedAt,
      state: { needs: a.needs, location: a.location, coins: a.coins, inventory: a.inventory, job: a.job, home: a.home, asleep: a.asleep, budget: a.budget, intentions: a.intentions, rumors: a.rumors.slice(-5) },
    };
  }
}
