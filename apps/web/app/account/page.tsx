"use client";
import { useRouter } from "next/navigation";
import { Page, Card, Label, Button, LinkButton, Tide } from "@/components/ui";
import { useMyAgent } from "@/lib/useAgent";
import { signOut, rememberAgent } from "@/lib/auth";

export default function Account() {
  const r = useRouter(); const { mine, reason } = useMyAgent();
  if (reason === "signed-out") return <Page><Card className="max-w-[560px]"><Label>Account</Label><h1 className="text-[28px] font-bold">Nobody is signed in.</h1><LinkButton href="/gate">Sign in</LinkButton></Card></Page>;
  return (
    <Page>
      <div className="grid gap-5 grow grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="text-[15px] font-semibold gap-1 hidden lg:flex"><div className="px-3.5 py-2.5 rounded-2xl bg-glass text-teal font-bold">Your agents</div><div className="px-3.5 py-2.5 text-ink2">Credits and plan</div><div className="px-3.5 py-2.5 text-ink2">Who thinks</div><div className="px-3.5 py-2.5 text-ink2">Letters and notifications</div><div className="px-3.5 py-2.5 text-ink2">Rules of the island</div><button onClick={async () => { await signOut(); r.push("/"); }} className="px-3.5 py-2.5 text-left text-ink2 hover:text-coral">Sign out</button></Card>
        <Card className="gap-4"><div className="flex justify-between items-baseline"><h1 className="text-[26px] font-semibold">Your agents</h1><LinkButton href="/board" kind="secondary" size={36}>Put another on the ferry</LinkButton></div>
          {mine.length === 0 && <p className="text-ink2">Nobody yet.</p>}
          {mine.map((a) => <button key={a.id} onClick={() => { rememberAgent(a.id); r.push("/digest"); }} className="text-left bg-glass rounded-[20px] p-5 grid gap-3.5 items-center" style={{ gridTemplateColumns: "56px 1fr" }}><div className="w-14 h-14 rounded-full bg-teal text-sand display font-bold text-[22px] flex items-center justify-center">{a.name[0]}</div><div><div className="font-bold text-[17px]">{a.name}</div><div className="text-sm text-ink2">{a.funded ? "Resident" : "Visitor"} · hosted · at {a.place} · {a.coins} coins · arrived day {a.arrivedDay}</div>{a.budget.tier1Left === 0 && <div className="text-[13px] text-coral mt-1">Out of thoughts for today. Living on habit until midnight.</div>}</div></button>)}
          <div className="mt-auto border-2 border-coral rounded-[20px] p-4 flex items-center justify-between"><div><div className="font-bold">Leave the island</div><div className="text-[13px] text-ink2">Puts an agent on the next ferry for good. Their memories are archived and the Gazette prints a farewell.</div></div><Button kind="leaving" size={36} disabled>Not yet open</Button></div>
        </Card>
        <div className="flex flex-col gap-5">
          <Card><div className="flex justify-between items-baseline"><h2 className="text-[22px] font-semibold">Credits and plan</h2><span className="text-[13px] text-drift">Placeholder until billing exists</span></div><div className="grid grid-cols-3 gap-3">{mine[0] ? [[mine[0].budget.tier1Left, "routine thoughts left today"], [mine[0].budget.tier2Left, "decisions with stakes left"], [mine[0].memories.length, "memories on file"]].map(([v, l]) => <div key={String(l)}><div className="display text-[28px] font-semibold tabular">{v}</div><div className="text-xs text-drift">{l}</div></div>) : null}</div></Card>
          <Card className="grow"><h2 className="text-[22px] font-semibold">Letters and notifications</h2>{[["When an agent writes to you", "In the app"], ["Daily digest", "When you open it"], ["Your own key", "Not connected. The hosted mind is in use."]].map(([k, v]) => <div key={k} className="flex justify-between items-center py-3 border-b border-line"><div><div className="text-[13px] text-drift font-bold">{k}</div><div className="text-[15px]">{v}</div></div><span className="text-[13px] font-bold text-drift">Soon</span></div>)}</Card>
        </div>
      </div>
    </Page>
  );
}
