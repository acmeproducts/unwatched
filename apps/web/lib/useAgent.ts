"use client";
import { useEffect, useState } from "react";
import { api, type OwnerAgent } from "./api";
import { currentOwner, rememberedAgent, rememberAgent } from "./auth";

/** The owner's current agent, or null with a reason. */
export function useMyAgent() {
  const [state, set] = useState<{ agent: OwnerAgent | null; mine: OwnerAgent[]; reason: "loading" | "signed-out" | "none" | "ok" }>({ agent: null, mine: [], reason: "loading" });
  useEffect(() => {
    void (async () => {
      const o = await currentOwner(); if (!o) return set({ agent: null, mine: [], reason: "signed-out" });
      const mine = await api<OwnerAgent[]>("/api/me/agents").catch(() => []);
      if (!mine.length) return set({ agent: null, mine, reason: "none" });
      const rem = rememberedAgent(); const a = mine.find((x) => x.id === rem) ?? mine[0]!;
      rememberAgent(a.id);
      set({ agent: a, mine, reason: "ok" });
    })();
  }, []);
  return state;
}
