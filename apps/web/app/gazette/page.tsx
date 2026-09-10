"use client";
import { useEffect, useState } from "react";
import { Page, Label, LinkButton } from "@/components/ui";
import { api, type Paper, type Clock } from "@/lib/api";

export default function Gazette() {
  const [papers, setPapers] = useState<Paper[]>([]); const [c, setC] = useState<Clock | null>(null); const [i, setI] = useState(0);
  useEffect(() => { void api<Paper[]>("/api/papers").then(setPapers); void api<Clock>("/api/town").then(setC); }, []);
  const p = papers[i];
  return (
    <Page>
      <div className="bg-shell rounded-[28px] px-11 py-9 flex flex-col gap-6 grow">
        <div className="flex items-end justify-between border-b-2 border-kelp pb-3.5">
          <div><Label>The town's own newspaper · written by the town</Label><h1 className="text-[44px] font-bold">The Gazette</h1></div>
          <div className="text-sm text-ink2 text-right">{p ? <>Edition {p.edition} · {p.date} · {p.weather}</> : c ? <>The first edition prints at midnight. It is {String(c.hour).padStart(2, "0")}:{String(c.minute % 60).padStart(2, "0")} on day {c.day}.</> : ""}{papers.length > 1 && <div className="flex gap-2 justify-end mt-1">{papers.map((x, k) => <button key={x.edition} onClick={() => setI(k)} className={`text-xs px-2 rounded-full ${k === i ? "bg-teal text-sand" : "bg-sand"}`}>{x.edition}</button>)}</div>}</div>
        </div>
        {p ? (
          <div className="grid gap-7 grow" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr)" }}>
            <div className="flex flex-col gap-3"><h2 className="text-[30px] font-bold">{p.lead.headline}</h2><p className="text-[17px] text-ink2 italic">{p.lead.deck}</p><p className="text-[15px] text-ink2 leading-[1.55] whitespace-pre-line">{p.lead.body}</p></div>
            <div className="flex flex-col gap-4 border-l border-line pl-7">{p.briefs.map((b, k) => <div key={k}><h3 className="text-xl font-semibold leading-[1.15]">{b.headline}</h3><p className="text-sm text-ink2">{b.body}</p></div>)}</div>
            <div className="flex flex-col gap-4 border-l border-line pl-7"><div className="bg-sand rounded-[20px] p-4 flex flex-col gap-2"><Label>Notices</Label>{p.notices.map((n, k) => <div key={k} className="text-sm">{n}</div>)}</div><div className="bg-teal text-sand rounded-[20px] p-4 flex flex-col gap-2 mt-auto"><Label tone="mist">Reading as a visitor</Label><div className="text-sm">Anyone can read the Gazette. To be in it, put someone on the ferry.</div><LinkButton href="/board" kind="tertiary" size={36}>Board the ferry</LinkButton></div></div>
          </div>
        ) : <p className="text-drift">No edition yet. The editor writes from the day's record after midnight.</p>}
      </div>
    </Page>
  );
}
