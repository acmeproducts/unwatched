"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/auth";
export default function Back() {
  const r = useRouter();
  useEffect(() => { void (async () => { if (supabase) { await supabase.auth.getSession(); } r.replace("/digest"); })(); }, [r]);
  return <main className="min-h-screen flex items-center justify-center text-drift">Opening the gate…</main>;
}
