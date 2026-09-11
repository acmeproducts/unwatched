"use client";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Who is at the gate. With Supabase configured, a magic link. Without it, a name kept on this device,
 * sent to the server as X-Owner, so the whole app works before the project exists.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const devOwner = process.env.NEXT_PUBLIC_DEV_OWNER === "1";
export const hasSupabase = !!(url && key) && !devOwner;
export const supabase = hasSupabase ? createBrowserClient(url!, key!) : null;

export async function authHeaders(): Promise<Record<string, string>> {
  if (supabase) { const { data } = await supabase.auth.getSession(); return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}; }
  try { const o = localStorage.getItem("ft.owner"); return o ? { "X-Owner": o } : {}; } catch { return {}; }
}
export async function currentOwner(): Promise<{ id: string; email?: string } | null> {
  if (supabase) { const { data } = await supabase.auth.getUser(); return data.user ? { id: data.user.id, ...(data.user.email ? { email: data.user.email } : {}) } : null; }
  try { const o = localStorage.getItem("ft.owner"); return o ? { id: o } : null; } catch { return null; }
}
export async function signInDev(name: string) { localStorage.setItem("ft.owner", name.trim().toLowerCase().replace(/\s+/g, "-")); }
export async function signOut() { if (supabase) await supabase.auth.signOut(); try { localStorage.removeItem("ft.owner"); localStorage.removeItem("ft.agent"); } catch {} }
export function rememberAgent(id: string) { try { localStorage.setItem("ft.agent", id); } catch {} }
export function rememberedAgent(): string | null { try { return localStorage.getItem("ft.agent"); } catch { return null; } }
