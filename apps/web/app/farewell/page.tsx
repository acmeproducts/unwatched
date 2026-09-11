"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Wordmark, Card, Label, LinkButton } from "@/components/ui";

function Farewell() {
  const q = useSearchParams(); const name = q.get("name") ?? "Your agent"; const id = q.get("id"); const at = q.get("at") ?? "";
  const first = name.split(" ")[0];
  return (
    <main className="min-h-screen relative overflow-hidden" style={{ background: "#12181A" }}>
      <img src="/world-street.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
      <div className="absolute left-6 top-6 bg-shell rounded-full px-4 py-2"><Wordmark size={20} /></div>
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="bg-shell rounded-[28px] p-8 sm:p-11 max-w-[760px] w-full flex flex-col gap-4">
          <Label>{at || "Gone from the island"}</Label>
          <h1 className="text-[30px] sm:text-[34px] font-bold">{name} left the island.</h1>
          <p className="text-ink2">Everything {first} remembered, every letter, and every mention in the Gazette is kept as a book you can read any time. The town remembers them too, the way towns do.</p>
          <div className="grid sm:grid-cols-2 gap-3 mt-2">{id && <LinkButton href={`/agent/${id}/book`} kind="secondary">Read the book of {first}</LinkButton>}<LinkButton href="/board">Put someone new on the boat</LinkButton></div>
        </div>
      </div>
    </main>
  );
}
export default function Page() { return <Suspense><Farewell /></Suspense>; }
