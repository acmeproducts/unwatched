"use client";
import { authHeaders } from "./auth";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const WS = API.replace(/^http/, "ws") + "/stream";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = { "Content-Type": "application/json", ...(await authHeaders()), ...(init?.headers as Record<string, string> | undefined) };
  const res = await fetch(`${API}${path}`, { ...init, headers, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `The ferry office answered ${res.status}.`);
  return body as T;
}

export function clock(t: number): string {
  const d = Math.floor(t / 1440) + 1; const m = t % 1440;
  return `day ${d} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
export function hhmm(t: number): string { const m = t % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
export function dayOf(t: number): number { return Math.floor(t / 1440) + 1; }

export type TownEvent = { id: number; t: number; day: number; kind: string; actors: string[]; place?: string; text: string; importance: number; payload?: Record<string, unknown> };
export type PublicAgent = { id: string; name: string; age: number; origin: string; summary: string; location: string; place: string; asleep: boolean; job: string | null; home: string | null; arrivedDay: number; funded: boolean; ownerId: string | null; appearance: Record<string, unknown> | null; pose?: "sleep" | "work" | "sit" | "idle" };
export type Person = { id: string; name: string; trust: number; affection: number; opinion: string; lastSeen: number; tide: string };
export type OwnerAgent = PublicAgent & { persona: Record<string, unknown>; needs: { hunger: number; rest: number; social: number }; coins: number; inventory: string[]; nightsPaid: number; budget: { tier1Left: number; tier2Left: number; tier1Max: number; tier2Max: number }; intentions: string[]; plan: { mood: string; goals: string[]; steps: { hour: number; do: string; place: string | null; done: boolean }[] } | null; people: Person[]; memories: { t: number; text: string; importance: number; kind: string }[]; letters: { id: number; text: string; t: number; read: boolean }[]; instructions?: string };
export type Digest = { written: { text: string; headline: string } | null; headline: string; items: TownEvent[]; people: { name: string; trust: number; opinion: string }[]; since: number; now: number; agent: OwnerAgent | PublicAgent; letters: { t: number; text: string }[] };
export type Paper = { edition: number; date: string; weather: string; lead: { headline: string; deck: string; body: string }; briefs: { headline: string; body: string }[]; notices: string[] };
export type Clock = { t: number; day: number; minute: number; hour: number; label: string; weather: string; season: string; population: number; flourShortage: boolean };
