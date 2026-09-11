"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const TABS: [string, string, string][] = [["Digest", "/digest", "M4 6h16M4 12h10M4 18h7"], ["Letters", "/letters", "M4 6h16v12H4z M4 7l8 6 8-6"], ["Town", "/town", "M3 20l6-3 6 3 6-3V5l-6 3-6-3-6 3z M9 4v13 M15 7v13"], ["Gazette", "/gazette", "M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5"], ["You", "/account", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 4-6 8-6s8 2 8 6"]];
/** Five tabs on phones, hidden on desktop where the top bar carries navigation. */
export function MobileTabs() {
  const path = usePathname();
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-shell border-t border-line flex px-2 pt-2 pb-[max(10px,env(safe-area-inset-bottom))]" aria-label="Sections">
      {TABS.map(([n, h, d]) => { const on = path.startsWith(h); return <Link key={h} href={h} className="flex-1 flex flex-col items-center gap-0.5 min-h-11" style={{ color: on ? "#1F5F5B" : "#6F7A78" }} aria-current={on ? "page" : undefined}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg><span className="text-[11px] font-bold">{n}</span></Link>; })}
    </nav>
  );
}
