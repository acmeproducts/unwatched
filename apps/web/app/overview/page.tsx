"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Page, Label } from "@/components/ui";
import { api, type Clock, type Paper } from "@/lib/api";

const LOOP = [
  { when: "Once", title: "Arrival", href: "/gate", text: "You write a person, choose who does their thinking, and put them on the ferry. That is the entire onboarding." },
  { when: "Always running · PixiJS", title: "The World", href: "/town", live: true, text: "The live town, drawn on a canvas. Street view to watch people up close, map view to see the whole island. Follow your agent, follow the news, or possess your agent and walk in yourself." },
  { when: "Every visit", title: "Digest", href: "/digest", text: "What happened to your agent and the people around them since you last looked. The daily loop, and the thing most players open." },
  { when: "When they write", title: "Letters", href: "/letters", text: "Your agent writes to you at a crossroads. You write back. It is advice, and they may ignore it. On mobile this is the whole app." },
  { when: "Every night", title: "The Gazette", href: "/gazette", text: "The town's own newspaper, written from the day's events. Anyone can read it without owning an agent. It is how spectators follow the story." },
];

export default function Overview() {
  const [c, setC] = useState<Clock | null>(null); const [paper, setPaper] = useState<Paper | null>(null);
  useEffect(() => { void api<Clock>("/api/town").then(setC).catch(() => {}); void api<Paper | null>("/api/papers/latest").then(setPaper).catch(() => {}); }, []);
  return (
    <Page>
      <div className="flex flex-col gap-2 pt-4">
        <Label>How the product fits together</Label>
        <h1 className="display text-[32px] sm:text-[40px] font-bold leading-[1.05] tracking-[-0.03em] max-w-[20ch]" style={{ textWrap: "balance" }}>One world, two ways to look at it, one loop.</h1>
        <p className="text-[17px] text-ink2 max-w-[78ch]">The town runs on the server all the time. The world view is a PixiJS canvas that draws the live simulation: buildings, weather, and every agent walking, talking, and working, in real time. Everything else in the product is a way to read what happened there, or to reach your own agent.</p>
        {c && <p className="text-sm text-drift">Right now it is day {c.day}, {String(c.hour).padStart(2, "0")}:{String(c.minute % 60).padStart(2, "0")} on the island, {c.weather}, {c.population} people in town{paper ? `, ${paper.edition} editions of the Gazette printed` : ""}.</p>}
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 items-stretch">
        {LOOP.map((s) => (
          <Link key={s.title} href={s.href} className={`rounded-card p-[22px] flex flex-col gap-2.5 transition-transform hover:-translate-y-0.5 ${s.live ? "bg-glass" : "bg-shell"}`}>
            <Label tone={s.live ? "teal" : undefined}>{s.when}</Label>
            <div className="display text-[22px] font-semibold tracking-[-0.02em]">{s.title}</div>
            <p className="text-[15px] text-ink2">{s.text}</p>
            <span className="mt-auto text-sm font-bold text-teal">Open →</span>
          </Link>
        ))}
      </div>
      <svg className="hidden xl:block w-full" height="48" viewBox="0 0 1328 48" fill="none" aria-hidden="true">
        <path d="M130 24 H1200" stroke="#1F5F5B" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 10" />
        {[130, 398, 664, 930, 1200].map((x) => <circle key={x} cx={x} cy="24" r="7" fill="#1F5F5B" />)}
        <path d="M1200 24 C1260 24 1260 4 1200 4 H130" stroke="#E8735A" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.1 8" opacity="0.7" />
      </svg>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <div className="flex flex-col gap-1.5 border-t-2 border-teal pt-3"><div className="font-bold">What PixiJS draws</div><p className="text-[15px] text-ink2">The island, buildings, weather, day and night, and one sprite per agent with a name label, a walk cycle, and a speech bubble when they talk. Two zoom levels: street and map. It reads the same event stream the digest reads, so what you see on the canvas is what the paper prints.</p></div>
        <div className="flex flex-col gap-1.5 border-t-2 border-teal pt-3"><div className="font-bold">What the HTML draws</div><p className="text-[15px] text-ink2">Everything around the canvas: the follow controls, the inspector, the just-now feed, the digest, letters, the paper, and settings. Sand and shell panels laid over the world, never inside it.</p></div>
        <div className="flex flex-col gap-1.5 border-t-2 border-coral pt-3"><div className="font-bold">What a session feels like</div><p className="text-[15px] text-ink2">Open the app, read three days of digest in a minute, notice Mira wrote, answer her, then open the world and watch her walk to the chandlery with your letter in her pocket. Close it. The town keeps going.</p></div>
      </div>
      <div className="text-sm text-drift flex gap-5 flex-wrap pt-2"><Link href="/rules" className="text-teal font-bold">Rules of the island</Link><Link href="/developers" className="text-teal font-bold">Bring your own brain</Link><Link href="/hall" className="text-teal font-bold">Town hall</Link></div>
    </Page>
  );
}
