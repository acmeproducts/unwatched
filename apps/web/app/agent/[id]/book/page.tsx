"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Page, Card, Label, Bubble, LinkButton } from "@/components/ui";
import { Loading, Problem } from "@/components/states";
import { api, clock, dayOf, type TownEvent } from "@/lib/api";

type Book = { id: string; name: string; persona: Record<string, unknown>; arrivedT: number; leftT: number | null; events: TownEvent[]; memories: { t: number; kind: string; text: string; importance: number }[]; letters: { direction: string; text: string; t: number }[] };
export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<Book | null>(null); const [err, setErr] = useState<string | null>(null); const [day, setDay] = useState<number | null>(null);
  useEffect(() => { void api<Book>(`/api/agents/${id}/book`).then(setB).catch((e) => setErr((e as Error).message)); }, [id]);
  if (err) return <Page><Problem text={err} /></Page>;
  if (!b) return <Page><Loading what="Opening the book." /></Page>;
  const first = b.name.split(" ")[0];
  const days = [...new Set([...b.events.map((e) => dayOf(e.t)), ...b.memories.map((m) => dayOf(m.t))])].sort((x, y) => x - y);
  const cur = day ?? days[days.length - 1] ?? 1;
  const evs = b.events.filter((e) => dayOf(e.t) === cur && e.importance >= 0.25 && e.kind !== "agent.reflect");
  const refl = b.memories.filter((m) => dayOf(m.t) === cur && m.kind === "reflect");
  const lets = b.letters.filter((l) => dayOf(l.t) === cur);
  return (
    <Page>
      <div className="grid gap-5 grow grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <Card className="p-6"><div className="w-24 h-32 rounded-card bg-glass" /><div className="display text-2xl font-bold">The book of {first}</div><div className="text-[13px] text-drift">Day {dayOf(b.arrivedT)} to {b.leftT ? `day ${dayOf(b.leftT)}` : "today"} · {b.memories.length} memories · {b.letters.length} letters</div><div className="flex flex-col gap-0.5 mt-2 max-h-[400px] overflow-auto">{days.map((d) => <button key={d} onClick={() => setDay(d)} className={`text-left px-3 py-2 rounded-2xl text-sm ${d === cur ? "bg-glass font-bold" : "text-ink2"}`}>Day {d}</button>)}</div>{b.leftT === null && <LinkButton href="/digest" kind="secondary" size={36} className="mt-auto">Back to today</LinkButton>}</Card>
        <Card className="px-6 sm:px-10 py-8 min-h-0 overflow-auto"><Label>Day {cur}</Label><h1 className="text-[30px] font-bold">{refl[0]?.text.split(/[.!?]/)[0] ?? evs[0]?.text.split(/[.!?]/)[0] ?? "A quiet day"}.</h1>
          {refl.map((r, i) => <Bubble key={i} max={640}>“{r.text}”</Bubble>)}
          <div className="flex flex-col mt-2">{evs.map((e) => <div key={e.id} className="grid gap-x-3 py-2 border-b border-line last:border-0 text-[15px] grid-cols-[70px_minmax(0,1fr)]"><span className="text-[13px] text-drift tabular">{clock(e.t).slice(-5)}</span><span>{e.text.length > 260 ? e.text.slice(0, 258) + "…" : e.text}</span></div>)}</div>
          {evs.length === 0 && refl.length === 0 && <p className="text-drift text-sm">Nothing on the record for this day.</p>}
          <p className="text-xs text-drift mt-4">Written from the record. Nothing here is invented; every line is a memory, a letter, or something that happened on the street.</p></Card>
        <div className="flex flex-col gap-4">
          <Card><Label>Letters this day</Label>{lets.length === 0 && <p className="text-sm text-drift">None.</p>}{lets.map((l, i) => <Bubble key={i} mine={l.direction === "to_agent"} max={280}>{l.direction === "to_agent" ? l.text : `“${l.text}”`}</Bubble>)}</Card>
          <Card tone="glass"><Label tone="teal">The secret</Label><p className="text-sm">{String(b.persona.secret ?? "")}</p><p className="text-xs text-ink2">{b.leftT ? "It left with them." : "Still a secret, as far as the record shows."}</p></Card>
        </div>
      </div>
    </Page>
  );
}
