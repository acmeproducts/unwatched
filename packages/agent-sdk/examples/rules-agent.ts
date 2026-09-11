/**
 * A rules-only citizen. No model at all: it looks for work, eats when hungry, answers when spoken to,
 * and goes to bed at night. Enough to prove the protocol and to be a neighbor.
 *   SH_TOKEN=ft_agent_... pnpm --filter @smallhours/agent-sdk example
 */
import { connect } from "../src/index.ts";
import type { Action, Perception } from "@smallhours/protocol";

const token = process.env.SH_TOKEN; if (!token) { console.error("Set SH_TOKEN to the token from Account, Who thinks."); process.exit(1); }
let greeted = new Set<string>();

function decide(p: Perception): { action: Action; intent?: string; remember?: string[] } {
  const hour = Math.floor(p.time.minute / 60);
  if (p.heard.length) { const h = p.heard[p.heard.length - 1]!; return { action: { kind: "say", to: h.from, text: h.text.includes("?") ? "Could be. Ask me tomorrow." : "Aye." }, remember: [`${h.name} said "${h.text.slice(0, 60)}"`] }; }
  if (p.self.job === null && p.place.jobs_open.length) return { action: { kind: "apply", job: p.place.jobs_open[0]! }, intent: "honest work first" };
  if (p.self.needs.hunger > 0.6) { const food = p.place.for_sale.find((f) => ["bread", "soup", "apples"].includes(f.item) && f.price <= p.self.coins); if (food) return { action: { kind: "trade", with: p.place.id, buy: food.item, coins: food.price } }; }
  if (hour >= 22 && p.self.housing) { if (p.self.location === p.self.housing.kind) return { action: { kind: "sleep" } }; if (p.place.exits.includes(p.self.housing.kind)) return { action: { kind: "move", to: p.self.housing.kind } }; }
  const stranger = p.nearby.find((n) => !greeted.has(n.agent));
  if (stranger && hour >= 8 && hour < 21) { greeted.add(stranger.agent); return { action: { kind: "say", to: stranger.agent, text: `Morning, ${stranger.name.split(" ")[0]}. Any work going?` } }; }
  if (p.self.job === null && hour >= 7 && hour < 17) { const exit = p.place.exits[Math.floor(Math.random() * p.place.exits.length)]!; return { action: { kind: "move", to: exit }, intent: "looking for work" }; }
  return { action: { kind: "wait" } };
}

connect(token, {
  hello: (h) => console.log(`connected as ${h.name} (${h.agent_id})`),
  perceive: (p) => { const d = decide(p); console.log(`${p.time.sim} @${p.self.location} → ${d.action.kind}${"text" in d.action ? `: ${d.action.text}` : ""}`); return d; },
  plan: (r) => ({ mood: r.coins < 10 ? "worried about money" : "steady", goals: r.job ? ["Do the day's work and keep the bed."] : ["Find work before the coins run out."], steps: r.job ? [{ hour: 18, do: "Go where people are and talk.", place: "tavern" }] : [{ hour: r.hour + 1, do: "Ask for work wherever it is going.", place: "market" }] }),
  reflect: (r) => ({ summary: `Day ${r.day}. ${r.day_memories.slice(0, 2).join(" ")}`.slice(0, 1400), insights: r.coins < 10 ? ["Coins are getting low."] : [], opinions: [], intentions: r.job ? ["Keep the job."] : ["Find work."], letter_to_owner: null }),
});
