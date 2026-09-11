"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Wordmark, Card, Label, LinkButton, Bubble, Chip } from "@/components/ui";
import { Loading } from "@/components/states";
import { api, clock, hhmm, type TownEvent } from "@/lib/api";

type Moment = { moment: TownEvent; around: TownEvent[]; place: string | null; people: { id: string; name: string }[] };
export default function MomentPage() {
  const { id } = useParams<{ id: string }>();
  const [m, setM] = useState<Moment | null>(null); const [err, setErr] = useState<string | null>(null); const [copied, setCopied] = useState(false);
  useEffect(() => { void api<Moment>(`/api/moments/${id}`).then(setM).catch((e) => setErr((e as Error).message)); }, [id]);
  const lines = (m?.moment.payload?.lines as { speaker: string; text: string }[] | undefined) ?? [];
  const nameOf = (sid: string) => m?.people.find((p) => p.id === sid)?.name.split(" ")[0] ?? sid;
  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-5 flex flex-col gap-5">
      <div className="flex items-center justify-between"><Wordmark /><LinkButton href="/town" kind="secondary" size={36}>Watch the town live</LinkButton></div>
      {err && <Card className="max-w-[560px]"><Label>A moment</Label><h1 className="text-[26px] font-bold">That moment is not on the street anymore.</h1><p className="text-ink2">{err}</p></Card>}
      {!m && !err && <Loading what="Finding the moment." />}
      {m && (
        <div className="grid gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-[28px] overflow-hidden relative bg-glass min-h-[420px]"><img src="/world-street.jpg" alt="" className="w-full h-full object-cover absolute inset-0" style={{ objectPosition: "center 40%" }} /><div className="absolute left-6 top-6 bg-shell rounded-full px-4 py-2 text-[13px] text-drift">A moment · {clock(m.moment.t)}{m.place ? ` · ${m.place}` : ""}</div>
            <div className="absolute inset-x-6 bottom-6 flex flex-col gap-2">{lines.length ? lines.map((l, i) => <div key={i} className="flex flex-col gap-0.5 items-start"><span className="text-xs font-bold text-teal bg-shell rounded-lg px-2">{nameOf(l.speaker)}</span><Bubble max={520}>“{l.text}”</Bubble></div>) : <Bubble max={560}>{m.moment.text}</Bubble>}</div></div>
          <div className="flex flex-col gap-4">
            <Card><Label>What happened</Label><h1 className="text-[24px] font-bold leading-tight">{m.moment.text.split(/[.!?]/)[0]}.</h1><p className="text-sm text-ink2">With {m.people.map((p) => p.name).join(" and ")}{m.place ? ` at ${m.place}` : ""}, day {m.moment.day} at {hhmm(m.moment.t)}.</p><div className="flex gap-2 flex-wrap">{m.people.map((p) => <Link key={p.id} href={`/agent/${p.id}`} className="h-9 px-3.5 rounded-full bg-glass text-teal text-[13px] font-bold inline-flex items-center">{p.name}</Link>)}</div></Card>
            <Card><Label>Share</Label><div className="h-11 rounded-full bg-sand px-4 flex items-center justify-between text-sm"><span className="text-ink2 truncate">{typeof location !== "undefined" ? location.href : ""}</span><button onClick={() => { void navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="font-bold text-teal">{copied ? "Copied" : "Copy"}</button></div><p className="text-xs text-drift">Shares show only what was public on the street. Nothing from letters or memories.</p></Card>
            <Card><Label>Around the same time</Label><div className="flex flex-col gap-1.5 text-sm">{m.around.filter((e) => e.id !== m.moment.id).slice(0, 6).map((e) => <div key={e.id}><span className="text-drift tabular">{hhmm(e.t)}</span> · {e.text.slice(0, 120)}</div>)}</div></Card>
          </div>
        </div>
      )}
    </main>
  );
}
