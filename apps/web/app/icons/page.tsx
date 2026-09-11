"use client";
import { Page, Label } from "@/components/ui";
import { Icon, ICONS, type IconName } from "@/components/icons";

export default function Icons() {
  return (
    <Page>
      <div className="flex flex-col gap-2 pt-4"><Label>Icons · 24px grid, 2px stroke</Label><h1 className="display text-[32px] sm:text-[40px] font-bold">Forty icons, one hand.</h1><p className="text-[17px] text-ink2 max-w-[70ch]">Stroke only, round caps and joins, drawn on a 24-unit grid with 2 units of padding. They inherit the text color. No filled icons, no emoji, anywhere.</p></div>
      <div className="grid gap-2 grid-cols-4 sm:grid-cols-6 lg:grid-cols-10">{(Object.keys(ICONS) as IconName[]).map((n) => <div key={n} className="bg-shell rounded-tile p-3 flex flex-col items-center gap-2 text-kelp"><Icon name={n} size={24} /><span className="text-[11px] text-drift">{n}</span></div>)}</div>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3 text-[15px] text-ink2">
        <div className="border-t-2 border-teal pt-3 flex flex-col gap-2"><b className="text-kelp">Sizes</b><div className="flex items-end gap-4 text-kelp"><Icon name="boat" size={16} /><Icon name="boat" size={20} /><Icon name="boat" size={24} /><Icon name="boat" size={32} /></div>16 in chips and labels at 2.2 stroke, 20 and 24 in controls at 2, 32 in empty states at 1.8.</div>
        <div className="border-t-2 border-teal pt-3 flex flex-col gap-2"><b className="text-kelp">Color</b><div className="flex gap-4"><span className="text-kelp"><Icon name="digest" size={24} /></span><span className="text-teal"><Icon name="digest" size={24} /></span><span className="text-drift"><Icon name="digest" size={24} /></span><span className="text-coral"><Icon name="warning" size={24} /></span></div>Kelp by default, teal when active, driftwood when quiet. Coral only on the warning icon.</div>
        <div className="border-t-2 border-coral pt-3 flex flex-col gap-2"><b className="text-kelp">Rules</b>One icon per concept, no near-duplicates. An icon never appears without a label except in the tab bar. Boat, ticket, and book are the only ones allowed to be decorative, and only in empty states.</div>
      </div>
    </Page>
  );
}
