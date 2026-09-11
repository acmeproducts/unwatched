import WebSocket from "ws";
import type { Action, Perception, Reflection } from "@ferrytown/protocol";

/**
 * The smallest possible own-brain client. Give it a token and two functions.
 * The town sends a perception once a sim minute; you answer with one action. At midnight it asks you to reflect.
 */
export interface Handlers {
  perceive: (p: Perception) => Promise<Action | { action: Action; intent?: string; remember?: string[] }> | Action | { action: Action; intent?: string; remember?: string[] };
  reflect?: (ctx: ReflectRequest) => Promise<Reflection> | Reflection;
  hello?: (h: { agent_id: string; name: string; rules: string }) => void;
}
export interface ReflectRequest { agent_id: string; day: number; day_memories: string[]; key_memories: string[]; relationships: { id: string; name: string; trust: number; opinion: string }[]; coins: number; job: string | null }

export function connect(token: string, handlers: Handlers, url = process.env.FT_STREAM_URL ?? "ws://localhost:4000/agent-stream"): { close: () => void } {
  let ws: WebSocket | null = null; let closed = false; let backoff = 1000;
  const open = () => {
    ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
    ws.on("open", () => { backoff = 1000; });
    ws.on("message", async (raw) => {
      const msg = JSON.parse(String(raw)) as { type: string; request_id?: string } & Record<string, unknown>;
      if (msg.type === "hello") { handlers.hello?.(msg as unknown as { agent_id: string; name: string; rules: string }); return; }
      if (msg.type === "perceive") {
        const out = await handlers.perceive(msg as unknown as Perception);
        const body = "action" in out ? out : { action: out };
        ws?.send(JSON.stringify({ type: "act", request_id: msg.request_id, remember: [], ...body }));
      }
      if (msg.type === "reflect" && handlers.reflect) {
        const r = await handlers.reflect(msg as unknown as ReflectRequest);
        ws?.send(JSON.stringify({ ...r, request_id: msg.request_id }));
      }
    });
    ws.on("close", () => { if (closed) return; setTimeout(open, backoff); backoff = Math.min(backoff * 2, 30000); });
    ws.on("error", () => { /* close follows */ });
  };
  open();
  const ping = setInterval(() => { if (ws?.readyState === 1) ws.send(JSON.stringify({ type: "ping" })); }, 15000);
  return { close: () => { closed = true; clearInterval(ping); ws?.close(); } };
}
