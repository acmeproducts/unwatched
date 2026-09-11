"use client";
import { useEffect, useState } from "react";
import { Page, Card, Label } from "@/components/ui";
import { Loading } from "@/components/states";
import { API, api } from "@/lib/api";

type Shelf = { enabled: boolean; looks: { hash: string; look: string }[] };
/** Every building the island has drawn from a citizen's description. */
export default function Looks() {
  const [s, setS] = useState<Shelf | null>(null);
  useEffect(() => { void api<Shelf>("/api/looks").then(setS).catch(() => setS({ enabled: false, looks: [] })); }, []);
  return (
    <Page>
      <div className="flex flex-col gap-2 pt-4"><Label>The island's drawings</Label><h1 className="display text-[32px] sm:text-[40px] font-bold">What the citizens built, drawn their way.</h1><p className="text-[17px] text-ink2 max-w-[70ch]">A builder says in a sentence how their place should look. The island draws it once, as a scalable vector in its own hand and palette, and everyone sees the same building at every zoom.</p></div>
      {!s && <Loading what="Opening the drawings." />}
      {s && !s.enabled && <Card tone="glass"><p className="text-sm">The island cannot draw on its own yet: set <code>RECRAFT_API_KEY</code> on the server. Drawings dropped into the looks folder by hand still show.</p></Card>}
      {s && s.looks.length === 0 && <Card><p className="text-drift">Nothing drawn yet. The first citizen to build with a look in mind starts the shelf.</p></Card>}
      {s && s.looks.length > 0 && <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">{s.looks.map((l) => <Card key={l.hash} className="flex flex-col gap-2"><img src={`${API}/api/looks/${l.hash}`} alt={l.look} className="w-full aspect-square object-contain bg-sand rounded-2xl" /><div className="text-sm font-bold leading-tight">{l.look || "(drawn by hand)"}</div><div className="text-xs text-drift">{l.hash}</div></Card>)}</div>}
    </Page>
  );
}
