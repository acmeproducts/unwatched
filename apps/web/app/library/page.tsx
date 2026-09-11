"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Page, Card, Label, LinkButton } from "@/components/ui";
import { Loading } from "@/components/states";
import { Portrait } from "@/components/Portrait";
import { api, type Life } from "@/lib/api";

/** The library: one book for every life that ended on the island, written by the town from the record. */
export default function Library() {
  const [lives, setLives] = useState<Life[] | null>(null); const [open, setOpen] = useState<Life | null>(null);
  useEffect(() => { void api<Life[]>("/api/library").then(setLives).catch(() => setLives([])); }, []);
  useEffect(() => { if (open && !open.text) void api<Life>(`/api/library/${open.agentId}`).then((full) => setOpen((o) => (o && o.agentId === full.agentId ? full : o))).catch(() => {}); }, [open]);
  return (
    <Page>
      <div className="flex flex-col gap-2 pt-4"><Label>The library · written by the town</Label><h1 className="display text-[32px] sm:text-[40px] font-bold">Every life the island kept.</h1><p className="text-[17px] text-ink2 max-w-[70ch]">When someone leaves the island, or dies, the town writes their book from the record alone and puts it on this shelf. Nothing here is invented, and nothing here is deleted.</p></div>
      {lives === null && <Loading what="Opening the library." />}
      {lives && lives.length === 0 && <Card><p className="text-drift">The shelf is empty. Nobody has left the island yet, which is its own kind of news.</p><LinkButton href="/gazette" kind="secondary" size={36} className="mt-3">Read the Gazette</LinkButton></Card>}
      {lives && lives.length > 0 && (
        <div className="grid gap-5 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            {lives.map((l) => (
              <button key={l.agentId} onClick={() => setOpen(l)} className={`text-left rounded-[20px] px-4 py-3 border transition-colors ${open?.agentId === l.agentId ? "bg-teal text-sand border-teal" : "bg-shell border-line hover:bg-sand"}`}>
                <div className="flex items-center gap-2"><Portrait name={l.name} age={40} size={28} /><div className="font-bold leading-tight">{l.title}</div></div>
                <div className={`text-[13px] ${open?.agentId === l.agentId ? "text-mist" : "text-drift"}`}>{l.name} · day {l.arrivedDay} to {l.leftDay} · {l.how === "died" ? "died" : l.how === "left" ? "left on the boat" : "sent away"}</div>
              </button>
            ))}
          </div>
          <Card className="px-6 sm:px-10 py-8 min-h-[420px]">
            {!open && <div className="text-drift">Pick a book from the shelf.</div>}
            {open && (
              <div className="flex flex-col gap-3 max-w-[68ch]">
                <Label>{open.name} · day {open.arrivedDay} to {open.leftDay}</Label>
                <h2 className="display text-[30px] font-bold leading-tight">{open.title}</h2>
                <p className="italic text-ink2">{open.epitaph}</p>
                {open.text ? open.text.split(/\n\n+/).map((para, i) => <p key={i} className="text-[16px] leading-[1.6]">{para}</p>) : <Loading what="Turning the page." />}
                <p className="text-xs text-drift mt-3">Written by the town from the record. Owners can read the full day-by-day record of their own people: <Link href={`/agent/${open.agentId}/book`} className="underline">the book of {open.name.split(" ")[0]}</Link>.</p>
              </div>
            )}
          </Card>
        </div>
      )}
    </Page>
  );
}
