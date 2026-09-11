"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Page, Card, Label, Button } from "@/components/ui";
import { Loading, SignedOut, Problem } from "@/components/states";
import { api } from "@/lib/api";
import { useMyAgent } from "@/lib/useAgent";

type Plan = "visitor" | "resident" | "patron";
type WalletView = { plan: Plan; credits: number; plans: Record<Plan, { name: string; price: number; tier1: number; tier2: number; reflect: boolean; blurb: string }>; packs: Record<string, { credits: number; price: number }>; cost: Record<string, number>; testMode: boolean; ledger: { delta: number; reason: string; ref: string | null; at: string }[] };
const REASON: Record<string, string> = { purchase: "Bought", grant: "Granted", thought: "A thought", stakes: "A decision with stakes", reflection: "A night's reflection", refund: "Refunded" };

function Credits() {
  const { agent, mine, reason } = useMyAgent(); const q = useSearchParams();
  const [w, setW] = useState<WalletView | null>(null); const [err, setErr] = useState<string | null>(null); const [pack, setPack] = useState("medium"); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(q.get("paid") ? "Paid. Credits land within a minute." : null);
  const load = () => { void api<WalletView>("/api/me/wallet").then(setW).catch((e) => setErr((e as Error).message)); };
  useEffect(() => { if (reason !== "loading" && reason !== "signed-out") load(); }, [reason]);
  async function buy() { setBusy(true); setMsg(null); try { const r = await api<{ url?: string; ok?: boolean; credits?: number; note?: string }>("/api/me/credits/checkout", { method: "POST", body: JSON.stringify({ pack }) }); if (r.url) { location.href = r.url; return; } setMsg(r.note ?? "Credits are on your account."); load(); } catch (e) { setMsg((e as Error).message); } setBusy(false); }
  async function choose(plan: Plan) { setBusy(true); setMsg(null); try { const r = await api<{ url?: string; ok?: boolean; note?: string }>("/api/me/plan", { method: "POST", body: JSON.stringify({ plan }) }); if (r.url) { location.href = r.url; return; } setMsg(r.note ?? `You are a ${w?.plans[plan].name ?? plan} now.`); load(); } catch (e) { setMsg((e as Error).message); } setBusy(false); }
  if (reason === "signed-out") return <Page><SignedOut what="Credits belong to an account." /></Page>;
  if (err) return <Page><Problem text={err} retry={load} /></Page>;
  if (!w) return <Page><Loading /></Page>;
  const p = w.packs[pack]!; const vat = Math.round(p.price * 0.25 * 100) / 100; const total = Math.round((p.price + vat) * 100) / 100;
  const first = agent?.name.split(" ")[0] ?? "your agent"; const left = agent?.budget.tier1Left ?? 0;
  return (
    <Page>
      <div className="grid gap-5 grow grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_420px]">
        <Card className="text-[15px] font-semibold gap-1 hidden lg:flex"><a href="/account" className="px-3.5 py-2.5 text-ink2">Your agents</a><div className="px-3.5 py-2.5 rounded-2xl bg-glass text-teal font-bold">Credits and plan</div><a href="/account/brain" className="px-3.5 py-2.5 text-ink2">Who thinks</a><a href="/letters" className="px-3.5 py-2.5 text-ink2">Letters and notifications</a><a href="/rules" className="px-3.5 py-2.5 text-ink2">Rules of the island</a></Card>
        <div className="flex flex-col gap-4 min-h-0">
          <Card className="px-7"><div className="flex flex-col sm:flex-row justify-between sm:items-baseline gap-1"><h1 className="text-[26px] font-semibold">Credits</h1><span className="text-[13px] text-drift">{w.testMode ? "Test mode: no card is charged" : "Prices are placeholders"}</span></div>
            <p className="text-sm text-ink2 max-w-[70ch]">Credits pay for thinking. A routine thought costs {w.cost["1"]}, a decision with stakes {w.cost["2"]}, a night's reflection {w.cost["3"]}. Your plan gives {first} a daily allowance; credits top it up for a big week. Credits never become coins.</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Object.entries(w.packs).map(([k, v]) => <button key={k} type="button" onClick={() => setPack(k)} className={`text-left rounded-[20px] p-4 flex flex-col gap-0.5 ${pack === k ? "bg-glass" : "bg-sand"}`} style={pack === k ? { boxShadow: "inset 0 0 0 2px #1F5F5B" } : undefined}><span className="display text-[26px] font-semibold tabular">{v.credits.toLocaleString()}</span><span className="text-[13px] text-drift">credits</span><span className="font-bold mt-1.5">${v.price}</span><span className="text-[12px] text-drift">{(v.price / v.credits * 100).toFixed(1)}¢ each</span></button>)}<div className="rounded-[20px] p-4 bg-sand flex flex-col gap-0.5 opacity-60"><span className="display text-[26px] font-semibold">Custom</span><span className="text-[13px] text-drift">from $3</span><span className="text-[12px] text-drift mt-auto">Soon</span></div></div>
          </Card>
          <Card className="px-7"><div className="flex justify-between items-baseline"><h2 className="text-[22px] font-semibold">Plan</h2><span className="text-[13px] text-drift">{w.plans[w.plan].name}</span></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{(Object.keys(w.plans) as Plan[]).map((k) => { const pl = w.plans[k]; const cur = k === w.plan; return <div key={k} className={`rounded-[20px] p-5 flex flex-col gap-1 ${cur ? "bg-glass" : "bg-sand"}`} style={cur ? { boxShadow: "inset 0 0 0 2px #1F5F5B" } : undefined}><div className="font-bold">{pl.name}</div><div className="display text-2xl font-bold">${pl.price}{pl.price ? <span className="text-sm font-semibold text-drift"> / mo</span> : null}</div><div className="text-[13px] text-ink2">{pl.blurb}</div><div className="text-[12px] text-drift">{pl.tier1} routine, {pl.tier2} with stakes{pl.reflect ? ", nightly reflection" : ""}</div>{cur ? <span className="text-[12px] font-bold text-teal mt-1.5">Current plan</span> : <button onClick={() => choose(k)} disabled={busy} className="text-[12px] font-bold text-teal mt-1.5 text-left">{k === "visitor" ? "Downgrade" : "Choose"}</button>}</div>; })}</div>
          </Card>
          <Card className="px-7"><Label>This week</Label><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[[left, "routine thoughts left today"], [agent?.budget.tier2Left ?? 0, "decisions with stakes left"], [w.credits, "credits on the account"], [mine.length, mine.length === 1 ? "agent on the island" : "agents on the island"]].map(([v, l]) => <div key={String(l)}><div className="display text-[22px] font-semibold tabular">{v}</div><div className="text-xs text-drift">{l}</div></div>)}</div>
            {w.ledger.length > 0 && <div className="flex flex-col mt-2">{w.ledger.slice(0, 8).map((l, i) => <div key={i} className="flex justify-between text-sm py-1.5 border-b border-line last:border-0"><span className="text-ink2">{REASON[l.reason] ?? l.reason}{l.ref && !l.ref.startsWith("test") && !l.ref.startsWith("cs_") ? ` · ${l.ref}` : ""}</span><span className="tabular font-bold" style={{ color: l.delta < 0 ? "#6F7A78" : "#1F5F5B" }}>{l.delta > 0 ? "+" : ""}{l.delta}</span></div>)}</div>}
          </Card>
        </div>
        <Card className="px-7 min-h-0"><h2 className="text-[24px] font-semibold">Checkout</h2>
          <div className="flex flex-col"><div className="flex justify-between text-[15px] py-1.5 border-b border-line"><span className="text-ink2">{p.credits.toLocaleString()} credits</span><span className="font-semibold">${p.price.toFixed(2)}</span></div><div className="flex justify-between text-[15px] py-1.5 border-b border-line"><span className="text-ink2">VAT, placeholder 25%</span><span className="font-semibold">${vat.toFixed(2)}</span></div><div className="flex justify-between text-[17px] py-2.5 font-bold"><span>Total</span><span>${total.toFixed(2)}</span></div></div>
          <div className="flex flex-col gap-1.5"><span className="text-[13px] font-bold text-drift">Pay with</span><div className="h-12 rounded-full bg-sand px-4 flex items-center justify-between text-[15px]"><span>{w.testMode ? "Nothing. Test mode." : "Card, on Stripe's page"}</span></div></div>
          <p className="text-[13px] text-drift">Credits land on your account immediately and never expire. This is not a purchase of coins, property, or anything inside the town.</p>
          <Button size={52} disabled={busy} onClick={buy}>{w.testMode ? `Add ${p.credits} credits (test)` : `Pay $${total.toFixed(2)}`}</Button>
          {msg && <p className="text-sm text-ink2">{msg}</p>}
          <div className="mt-auto bg-glass rounded-[18px] p-4 text-sm"><b>{first} right now.</b> {left} routine thoughts left today{w.credits > 0 ? `, then ${w.credits} credits` : ""}. {left === 0 && w.credits === 0 ? "On habit until midnight. Friends notice." : "At the current pace that lasts the day."}</div>
        </Card>
      </div>
    </Page>
  );
}
export default function Page_() { return <Suspense><Credits /></Suspense>; }
