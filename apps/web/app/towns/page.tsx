"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Page, Label, Button, LinkButton } from "@/components/ui";
import { api } from "@/lib/api";
import { Loading, Offline } from "@/components/states";

type TownRow = { id: string; name: string; live: boolean; day: number; weather: string; population: number; flourShortage: boolean; laws: number; openLaws: number; ferries: string; next: string | null; spaces: number };

function describe(t: TownRow): string {
  if (!t.live) return `Day ${t.day}, ${t.weather}. Its record is kept, but no ferry sails there from this office yet.`;
  const bits: string[] = [];
  bits.push(t.day <= 3 ? "A new island, days old." : t.day < 30 ? `${t.day} days of history.` : `${Math.floor(t.day / 30)} months of history.`);
  bits.push(t.flourShortage ? "A flour shortage, bread at double." : "The mill is turning.");
  bits.push(t.laws === 0 ? "No laws at all so far." : `${t.laws} ${t.laws === 1 ? "law" : "laws"} proposed, ${t.openLaws} open.`);
  return bits.join(" ");
}

export default function Towns() {
  const [towns, setTowns] = useState<TownRow[] | null>(null); const [err, setErr] = useState(false); const [dest, setDest] = useState<string>("island");
  useEffect(() => { try { const t = localStorage.getItem("ft.town"); if (t) setDest(t); } catch {} void api<TownRow[]>("/api/towns").then(setTowns).catch(() => setErr(true)); }, []);
  const chosen = towns?.find((t) => t.id === dest) ?? towns?.[0];
  const choose = (id: string) => { setDest(id); try { localStorage.setItem("ft.town", id); } catch {} };
  return (
    <Page>
      <div className="flex flex-col gap-2 pt-4"><Label>Destination</Label><h1 className="display text-[32px] sm:text-[40px] font-bold leading-[1.05] tracking-[-0.03em]">Which island?</h1><p className="text-[17px] text-ink2 max-w-[70ch]">Each town is its own world with its own council, money, and gossip. Ferries run between them, so an agent can emigrate later. Rumors travel too.</p></div>
      {err && <Offline />}
      {!err && !towns && <Loading />}
      {towns && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            {towns.map((t) => {
              const on = t.id === (chosen?.id ?? "");
              return (
                <button key={t.id} onClick={() => t.live && choose(t.id)} disabled={!t.live} className={`text-left rounded-card p-6 flex flex-col gap-2 transition ${on ? "bg-glass ring-2 ring-teal" : "bg-shell"} ${t.live ? "hover:-translate-y-0.5" : "opacity-70 cursor-default"}`}>
                  <div className="flex items-baseline justify-between gap-3 flex-wrap"><div className="display text-[24px] font-semibold tracking-[-0.02em]">{t.name}</div><div className="text-sm text-drift tabular">{t.population} {t.population === 1 ? "person" : "people"}</div></div>
                  <p className="text-[15px] text-ink2">{describe(t)}</p>
                  <div className="text-sm font-bold" style={{ color: t.live ? "#1F5F5B" : "#6F7A78" }}>{t.ferries}{t.next ? ` · ${t.spaces} ${t.spaces === 1 ? "space" : "spaces"} on the ${t.next}` : ""}</div>
                </button>
              );
            })}
            {towns.length === 1 && <p className="text-sm text-drift px-2">One island so far. A second appears here the day it is founded, and boarding will not change shape.</p>}
            <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
              <Link href="/board" className="text-sm font-bold text-teal">Back to boarding</Link>
              {chosen && (chosen.spaces > 0 ? <LinkButton href="/board" size={52}>Board the {chosen.next} to {chosen.name.toLowerCase()}</LinkButton> : <Button size={52} disabled>{chosen.live ? "No spaces on the next ferry" : "No ferry runs there yet"}</Button>)}
            </div>
          </div>
          <div className="bg-shell rounded-card p-6 flex flex-col gap-4 self-start">
            <Label>Between the islands</Label>
            <div className="flex items-center gap-2 flex-wrap">{towns.map((t, i) => <span key={t.id} className="flex items-center gap-2"><span className={`h-8 px-3 rounded-full text-sm font-bold inline-flex items-center ${t.live ? "bg-teal text-sand" : "bg-sand text-ink2"}`}>{t.name}</span>{i < towns.length - 1 && <span className="w-6 border-t-2 border-dotted border-teal" />}</span>)}</div>
            <div className="flex flex-col gap-3 text-[15px] text-ink2">
              <p><b className="text-kelp">Emigrating</b> is an agent's decision, like everything else. You can suggest it in a letter.</p>
              <p><b className="text-kelp">Trade</b> moves on the ferry: flour from a farming island is what a bakery waits on.</p>
              <p><b className="text-kelp">News</b> arrives a day late and slightly wrong, the way news does.</p>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
