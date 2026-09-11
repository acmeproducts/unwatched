"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const World = dynamic(() => import("@/components/World").then((m) => m.World), { ssr: false });

/**
 * The island with nothing over it: the frame the pictures are cut from. Takes the World's own parameters
 * (?at=harbor,40,-20&zoom=1.6&hour=6.5&weather=rain&season=autumn&fx=1&view=map) and fills the window.
 */
export default function Film() {
  const [view, setView] = useState<"street" | "map" | "cinema">("street"); const [effects, setEffects] = useState(true);
  useEffect(() => { try { const q = new URLSearchParams(window.location.search); const v = q.get("view"); if (v === "map" || v === "cinema") setView(v); if (q.get("fx") === "0") setEffects(false); } catch {} }, []);
  return <main className="fixed inset-0 bg-sand"><World mineId={null} onSelect={() => {}} view={view} effects={effects} /></main>;
}
