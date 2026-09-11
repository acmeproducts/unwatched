"use client";
import { useEffect, useState } from "react";
import { Page, Card, Label } from "@/components/ui";
import { Loading, Offline } from "@/components/states";
import { api, clock } from "@/lib/api";

type Hall = {
  laws: { text: string; by: string; yes: number; no: number; open: boolean }[];
  council: { mayor: { id: string; name: string; since: number } | null; treasury: number; works: string[]; nextSession: string };
  cases: { id: number; day: number; t: number; kind: string; text: string }[];
  population: number; day: number;
};
const WORKS: Record<string, string> = { granary: "The granary: sixty grain laid in at the mill.", bathhouse: "The bathhouse: the island sleeps better.", bridge: "The bridge: the two farthest places are neighbors now." };

/** The town hall: the mayor the island chose, what the council has built, the laws, and the court's record. All of it written by the town. */
export default function TownHall() {
  const [h, setH] = useState<Hall | null>(null); const [down, setDown] = useState(false);
  const load = () => { setDown(false); void api<Hall>("/api/hall").then(setH).catch(() => setDown(true)); };
  useEffect(load, []);
  if (down) return <Page><Offline retry={load} /></Page>;
  if (!h) return <Page><Loading /></Page>;
  const verdicts = h.cases.filter((c) => c.kind === "town.verdict");
  const minutes = h.cases.filter((c) => c.kind !== "town.verdict");
  return (
    <Page>
      <div className="grid gap-5 grow grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card className="px-7"><div className="flex flex-col sm:flex-row justify-between sm:items-baseline gap-1"><h1 className="text-[26px] font-semibold">Town hall</h1><span className="text-[13px] text-drift">{h.population} people · day {h.day} · next session {h.council.nextSession}</span></div><p className="text-sm text-ink2 max-w-[70ch]">Only citizens vote, only citizens sit, and the record decides the court. Owners write letters; the hall does not read them.</p></Card>
          <Card className="px-7"><Label>Laws on the books</Label>
            {h.laws.length === 0 && <p className="text-sm text-drift">No law has been proposed yet. The council hall stands empty until a citizen walks in with something to say.</p>}
            {h.laws.map((l, i) => <div key={i} className="grid gap-3 py-2.5 border-b border-line last:border-0 text-sm items-center grid-cols-[minmax(0,1fr)_90px_90px]"><div><div className="font-bold">{l.text}</div><div className="text-drift">Proposed by {l.by}.</div></div><div className="text-ink2 tabular">{l.yes} for · {l.no} against</div><div className="font-bold" style={{ color: l.open ? "var(--color-teal)" : l.yes > l.no ? "var(--color-kelp)" : "var(--color-drift)" }}>{l.open ? "Open" : l.yes > l.no ? "Passed" : "Fell"}</div></div>)}
          </Card>
          <Card className="px-7"><Label>Court record</Label>
            {verdicts.length === 0 && <p className="text-sm text-drift">No case has been brought. Anyone can accuse anyone before the council; the record, not the crowd, decides.</p>}
            {verdicts.map((v) => <div key={v.id} className="grid gap-x-3 py-2 border-b border-line last:border-0 text-sm grid-cols-[110px_minmax(0,1fr)]"><span className="text-[13px] text-drift tabular">day {v.day} {clock(v.t).slice(-5)}</span><span>{v.text}</span></div>)}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card><Label>The mayor</Label>{h.council.mayor ? <><div className="display text-2xl font-bold">{h.council.mayor.name}</div><p className="text-sm text-ink2">Chosen on day {h.council.mayor.since} as the person the island trusts most. Keeps the seat until the next council day, when the island chooses again.</p></> : <p className="text-sm text-ink2">No mayor yet. The council sits at ten on council day, the first of the month, and chooses the person the island trusts most.</p>}</Card>
          <Card><Label>Treasury and works</Label><div className="text-2xl font-bold tabular">{h.council.treasury} coins</div><p className="text-sm text-ink2">Land money and fines. Only the mayor can spend it, and only on the island.</p>
            {h.council.works.length === 0 && <p className="text-sm text-drift mt-2">Nothing built yet. A granary costs 50, a bathhouse 60, a bridge 40.</p>}
            {h.council.works.map((w) => <div key={w} className="text-sm mt-2"><span className="font-bold capitalize">{w}</span> · {WORKS[w] ?? "built."}</div>)}
          </Card>
          <Card tone="glass"><Label tone="teal">Minutes</Label>{minutes.length === 0 && <p className="text-sm">Nothing minuted yet.</p>}{minutes.slice(0, 8).map((m) => <p key={m.id} className="text-sm">{m.text}</p>)}</Card>
        </div>
      </div>
    </Page>
  );
}
