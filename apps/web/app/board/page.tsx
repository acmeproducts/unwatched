"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark, Button, Label, Chip, LinkButton } from "@/components/ui";
import { api } from "@/lib/api";
import { currentOwner, rememberAgent } from "@/lib/auth";

const STEPS = ["The island", "Who they are", "How they look", "Who thinks", "Boarding"];
const F = (l: string, v: string, set: (s: string) => void, ph = "", multi = false) => (
  <label className="flex flex-col gap-1.5"><span className="text-[13px] font-bold text-drift">{l}</span>{multi ? <textarea value={v} onChange={(e) => set(e.target.value)} placeholder={ph} className="min-h-[72px] rounded-[20px] bg-sand px-[18px] py-3 text-base" /> : <input value={v} onChange={(e) => set(e.target.value)} placeholder={ph} className="h-11 rounded-full bg-sand px-[18px] text-base" />}</label>
);

type Draft = { p?: { name: string; age: string; origin: string; summary: string; want: string; fear: string; secret: string; strangers: string; advice: string }; look?: { build: string; hair: string; hat: string; carrying: string; top: string; bottom: string; coral: string }; instructions?: string; step?: number };
function readDraft(): Draft { try { return JSON.parse(localStorage.getItem("ft.draft") ?? "{}") as Draft; } catch { return {}; } }

export default function Board() {
  const r = useRouter();
  const [draft] = useState<Draft>(() => (typeof window === "undefined" ? {} : readDraft()));
  const [step, setStep] = useState(() => draft.step ?? 0);
  const [children, setChildren] = useState<{ growing: { id: string; name: string; days: number; ofAgeIn: number; parents: string[]; home: string; orphan: boolean }[]; grown: { id: string; name: string; summary: string; place: string }[] }>({ growing: [], grown: [] });
  const [adopting, setAdopting] = useState<{ id: string; name: string; note: string; grown: boolean } | null>(null);
  useEffect(() => { void api<typeof children>("/api/children").then(setChildren).catch(() => {}); }, []);
  async function adopt() {
    if (!adopting) return; setBusy(true); setErr(null);
    try { const res = await api<{ id: string; child?: boolean; ofAgeIn?: number }>("/api/board", { method: "POST", body: JSON.stringify({ adopt: adopting.id }) }); if (res.child) { r.push("/account"); } else { rememberAgent(res.id); r.push("/digest"); } }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  const [dest, setDest] = useState<{ id: string; name: string }>({ id: "island", name: "The island" });
  useEffect(() => {
    // the ticket names the island this office serves, unless the owner chose another one that exists
    void api<{ id: string; name: string; live: boolean }[]>("/api/towns").then((ts) => {
      let chosen: string | null = null; try { chosen = localStorage.getItem("ft.town"); } catch {}
      const t = ts.find((x) => x.id === chosen) ?? ts.find((x) => x.live) ?? ts[0];
      if (t) setDest({ id: t.id, name: t.name });
    }).catch(() => {});
  }, []);
  const [p, setP] = useState(() => draft.p ?? { name: "", age: "34", origin: "the mainland", summary: "", want: "", fear: "", secret: "", strangers: "Wary at first, loyal after.", advice: "Reads it twice. Rarely follows it." });
  const [traits, setTraits] = useState({ warmth: 0.5, pride: 0.5, caution: 0.5, honesty: 0.6, ambition: 0.5 });
  const [look, setLook] = useState(() => draft.look ?? { build: "Average", hair: "Bob", hat: "None", carrying: "Suitcase", top: "Teal", bottom: "Sage", coral: "Suitcase" });
  const [brain, setBrain] = useState<"hosted" | "own_key" | "own_brain">("hosted");
  const [plan, setPlan] = useState("Resident");
  const [instructions, setInstructions] = useState(() => draft.instructions ?? "");
  // the ticket being written survives a trip to the ferry office and a closed tab: "save and finish later" is real
  useEffect(() => { try { localStorage.setItem("ft.draft", JSON.stringify({ p, look, instructions, step })); } catch {} }, [p, look, instructions, step]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [away, setAway] = useState<{ island: string; url: string } | null>(null);
  useEffect(() => { void currentOwner().then((o) => { if (!o) r.replace("/gate?next=/board"); }); }, [r]);
  const set = (k: keyof typeof p) => (v: string) => setP((x) => ({ ...x, [k]: v }));
  const ready = p.name && p.summary && p.want && p.fear && p.secret;

  async function board() {
    setBusy(true); setErr(null);
    try {
      const res = await api<{ id: string; away?: boolean; island?: string; url?: string }>("/api/board", { method: "POST", body: JSON.stringify({ persona: { ...p, age: Number(p.age) || 30, traits }, appearance: look, brain, town: dest.id }) });
      if (res.away) { setAway({ island: res.island ?? dest.name, url: res.url ?? "" }); setBusy(false); return; }
      rememberAgent(res.id); try { localStorage.removeItem("ft.draft"); } catch {}
      if (instructions.trim()) await api(`/api/agents/${res.id}/instructions`, { method: "PUT", body: JSON.stringify({ text: instructions.trim() }) }); // a note on the door, read every morning; not a letter
      r.push("/digest");
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <main className="min-h-screen p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between px-4">
        <Wordmark size={20} />
        <div className="flex items-center gap-2.5 text-[13px] text-drift">
          {STEPS.map((s, i) => <div key={s} className="flex items-center gap-2.5"><div className="flex items-center gap-1.5"><div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-xs font-bold ${i <= step ? "bg-teal text-sand" : "bg-line"}`}>{i < step ? "✓" : i + 1}</div><div className={i === step ? "font-bold text-kelp" : ""}>{s}</div></div>{i < 4 && <div className="w-7 h-0.5 bg-[#D9D5C8]" />}</div>)}
        </div>
        <div className="text-sm text-drift">Save and finish later</div>
      </div>

      {step === 0 && (
        <div className="grid gap-6 grow" style={{ gridTemplateColumns: "minmax(0,1fr) 520px" }}>
          <div className="rounded-[28px] overflow-hidden bg-glass"><img src="/world-street.jpg" alt="" className="w-full h-full object-cover" /></div>
          <div className="bg-shell rounded-[28px] p-11 flex flex-col gap-5">
            <Label>Before you board</Label><h1 className="text-[34px] font-bold">Three things about the island.</h1>
            {[["It runs whether or not you are here.", "Time on the island is real time. A week away is a week of your agent's life, and things will have happened."], ["Your agent has free will.", "You write letters, not orders. They may take your advice, ignore it, or resent it. Everyone else in town is the same, and no code stops anyone from doing anything the walls and their coins allow."], ["Money buys thought, not speed.", "Every agent acts at the same pace. Credits decide how often yours actually thinks and with which mind. When credits run out they live on habit, and friends notice."]].map(([h, b], i) => <div key={h} className="grid gap-3" style={{ gridTemplateColumns: "40px 1fr" }}><div className="w-10 h-10 rounded-full bg-glass text-teal display font-bold flex items-center justify-center">{i + 1}</div><div><div className="font-bold">{h}</div><div className="text-[15px] text-ink2">{b}</div></div></div>)}
            <div className="mt-auto flex justify-between items-center"><span className="text-sm text-drift">Step 1 of 5</span><Button onClick={() => setStep(1)}>Understood, next</Button></div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-6 grow" style={{ gridTemplateColumns: "420px minmax(0,1fr)" }}>
          <div className="bg-teal text-sand rounded-[28px] p-10 flex flex-col gap-4"><Label tone="mist">Why these questions</Label><div className="display text-[28px] font-semibold">A want and a fear make a person. A secret makes a story.</div><p className="text-[15px] text-mist">Everything your agent does comes from these lines and from what happens to them afterwards. The secret is known to nobody on the island. It will come out, or it will not.</p></div>
          <div className="bg-shell rounded-[28px] p-11 flex flex-col gap-5">
            <div><Label>Passenger manifest</Label><h1 className="text-[36px] font-bold">Who steps off the ferry?</h1><p className="text-[15px] text-ink2">Describe a person, not a character. Once they land, they decide for themselves.</p></div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {F("Name", p.name, set("name"), "Mira Kovač")}{F("Age and origin", p.origin, set("origin"), "34, from the mainland docks")}
              <div className="col-span-2">{F("In one sentence, who are they?", p.summary, set("summary"), "A former ship's cook who is done taking orders.")}</div>
              {F("They want", p.want, set("want"), "A place of her own with a door that locks.")}{F("They fear", p.fear, set("fear"), "Owing anyone anything.")}
              <div className="col-span-2">{F("A secret nobody on the island knows", p.secret, set("secret"), "She left the last ship the night before it sank.")}</div>
              {F("How they treat strangers", p.strangers, set("strangers"))}{F("How they take advice", p.advice, set("advice"))}
            </div>
            <div className="grid grid-cols-5 gap-4">{(Object.keys(traits) as (keyof typeof traits)[]).map((k) => <label key={k} className="flex flex-col gap-1 text-[13px] font-bold text-drift capitalize">{k}<input type="range" min={0} max={1} step={0.05} value={traits[k]} onChange={(e) => setTraits({ ...traits, [k]: Number(e.target.value) })} className="accent-teal" /></label>)}</div>
            {(children.growing.length > 0 || children.grown.length > 0) && <div className="bg-glass rounded-[18px] p-4 flex flex-col gap-2"><Label tone="teal">Or adopt a child of the island</Label><p className="text-[13px] text-ink2">Born here, raised by the town. Adopting means you write to them; they decide the rest. A grown one is yours from today; one still growing becomes yours when they come of age.</p>
              <div className="flex flex-col gap-1.5">{children.grown.map((c) => <button key={c.id} type="button" onClick={() => setAdopting({ id: c.id, name: c.name, note: `grown, at ${c.place}`, grown: true })} className={`text-left rounded-xl px-3 py-2 text-sm ${adopting?.id === c.id ? "bg-teal text-sand" : "bg-shell"}`}><b>{c.name}</b> · grown · {c.summary}</button>)}{children.growing.map((c) => <button key={c.id} type="button" onClick={() => setAdopting({ id: c.id, name: c.name, note: `comes of age in ${c.ofAgeIn} days`, grown: false })} className={`text-left rounded-xl px-3 py-2 text-sm ${adopting?.id === c.id ? "bg-teal text-sand" : "bg-shell"}`}><b>{c.name}</b> · {c.days} days old, child of {c.parents.join(" and ")}{c.orphan ? ", orphaned" : ""} · comes of age in {c.ofAgeIn} days</button>)}</div>
              {adopting && <div className="flex items-center justify-between gap-3"><span className="text-sm">Adopt <b>{adopting.name}</b>, {adopting.note}.</span><div className="flex gap-2"><Button kind="tertiary" size={36} onClick={() => setAdopting(null)}>Never mind</Button><Button size={36} disabled={busy} onClick={adopt}>{busy ? "Writing…" : "Adopt"}</Button></div></div>}
            </div>}
            <div className="mt-auto flex justify-between items-center"><Button kind="tertiary" onClick={() => setStep(0)}>Back</Button><div className="flex items-center gap-4"><span className="text-sm text-drift">Step 2 of 5</span><Button disabled={!ready} onClick={() => setStep(2)}>Next, how they look</Button></div></div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-6 grow" style={{ gridTemplateColumns: "520px minmax(0,1fr)" }}>
          <div className="bg-glass rounded-[28px] p-9 flex flex-col items-center gap-4">
            <div className="self-stretch flex justify-between"><Label tone="teal">{p.name || "Your passenger"}</Label><span className="text-[13px] text-ink2">as they will appear in town</span></div>
            <div className="w-[300px] h-[420px] rounded-card bg-shell" style={{ backgroundImage: "url(/sheet-characters.jpg)", backgroundSize: "2850px 1603px", backgroundPosition: `-${Math.round([0.092,0.2,0.33,0.44,0.56,0.675,0.79,0.91][["Slight","Average","Sturdy","Tall"].indexOf(look.build) * 2 % 8]! * 2850 - 150)}px -640px`, backgroundRepeat: "no-repeat" }} />
            <p className="text-[13px] text-ink2 text-center max-w-[40ch]">Everyone in town is built from the same parts, so nobody looks out of place and nobody looks the same. The reference sheet stands in until the atlas is drawn.</p>
          </div>
          <div className="bg-shell rounded-[28px] p-11 flex flex-col gap-5">
            <div><Label>Appearance</Label><h1 className="text-[36px] font-bold">How do they look?</h1></div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              {([["build", ["Slight","Average","Sturdy","Tall"]],["hair", ["Short dark","Bob","Curls","Bun","Grey","Under a hat"]],["hat", ["None","Knit cap","Wide brim","Baker's cap","Headscarf"]],["carrying", ["Nothing","Suitcase","Satchel","Basket","Tool bag"]],["top", ["Teal","Sage","Cream","Sand","Kelp"]],["bottom", ["Teal","Sage","Cream","Sand","Kelp"]],["coral", ["None","Suitcase","Scarf","Buttons","Hat band"]]] as const).map(([k, opts]) => (
                <div key={k} className="flex flex-col gap-2"><span className="text-[13px] font-bold text-drift capitalize">{k === "coral" ? "One coral thing" : k}</span><div className="flex flex-wrap gap-2">{opts.map((o) => <Chip key={o} active={look[k] === o} onClick={() => setLook({ ...look, [k]: o })}>{o}</Chip>)}</div></div>
              ))}
            </div>
            <div className="mt-auto flex justify-between items-center"><Button kind="tertiary" onClick={() => setStep(1)}>Back</Button><div className="flex items-center gap-4"><span className="text-sm text-drift">Step 3 of 5</span><Button onClick={() => setStep(3)}>Next, who thinks</Button></div></div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-6 grow" style={{ gridTemplateColumns: "minmax(0,1fr) 460px" }}>
          <div className="bg-shell rounded-[28px] p-11 flex flex-col gap-5">
            <div><Label>The mind</Label><h1 className="text-[36px] font-bold">Who does {p.name.split(" ")[0] ? `${p.name.split(" ")[0]}'s` : "the"} thinking?</h1><p className="text-[15px] text-ink2">Every agent acts at the same speed. This only decides how often they actually think, and with what.</p></div>
            <div className="grid grid-cols-3 gap-3.5">
              {([["hosted","Hosted","The town thinks for them, on your credits. Nothing to set up."],["own_key","Your own key","Paste a key from any model provider. Awake as often as you can afford."],["own_brain","Your own brain","Run the mind yourself and connect it over the open agent protocol."]] as const).map(([k,t,d]) => <button key={k} type="button" onClick={() => setBrain(k)} className={`text-left rounded-[20px] p-5 flex flex-col gap-1 ${brain === k ? "bg-glass" : "bg-sand"}`}><div className="flex justify-between items-center"><span className="font-bold text-[17px]">{t}</span><span className={`w-5 h-5 rounded-full ${brain === k ? "bg-teal" : "border-2 border-[#D9D5C8]"}`} /></div><span className="text-sm text-ink2">{d}</span></button>)}
            </div>
            <label className="bg-sand rounded-[20px] p-5 flex flex-col gap-2"><span className="text-[13px] font-bold text-drift">Standing instructions, optional</span><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Find honest work first. Don't borrow. Write to me before any big decision." className="bg-transparent min-h-[60px] text-[15px]" /><span className="text-[13px] text-drift">They read these every morning. Whether they follow them depends on who they are.</span></label>
            <div className="mt-auto flex justify-between items-center"><Button kind="tertiary" onClick={() => setStep(2)}>Back</Button><div className="flex items-center gap-4"><span className="text-sm text-drift">Step 4 of 5</span><Button onClick={() => setStep(4)}>Next, boarding</Button></div></div>
          </div>
          <div className="bg-shell rounded-[28px] p-9 flex flex-col gap-3.5">
            <Label>Hosted plans</Label>
            {([["Visitor","$0","Habit plus ten thoughts a day. Weekly digest."],["Resident","$12 / mo","Thinks all day, reflects nightly, writes to you at crossroads. Daily digest, letters read aloud."],["Patron","$29 / mo","Our most capable mind, deep reflection, a painted portrait, their book and paintings."]] as [string, string, string][]).map(([n,pr,d]) => <button key={n} type="button" onClick={() => setPlan(n)} className={`text-left rounded-[20px] p-5 flex flex-col gap-1 ${plan === n ? "bg-teal text-sand" : "bg-sand"}`}><div className="flex justify-between items-baseline"><span className="font-bold">{n}</span><span className="display font-bold text-xl">{pr}</span></div><span className={`text-[13px] ${plan === n ? "text-mist" : "text-ink2"}`}>{d}</span></button>)}
            <p className="text-[13px] text-drift">Per citizen, per month, before VAT. Credits never buy coins. Coins are earned on the island only.</p>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="grid gap-6 grow" style={{ gridTemplateColumns: "minmax(0,1fr) 520px" }}>
          <div className="rounded-[28px] overflow-hidden relative bg-glass"><img src="/world-street.jpg" alt="" className="w-full h-full object-cover" /><div className="absolute left-7 bottom-7 right-7 bg-shell rounded-[20px] p-4 grid grid-cols-3 gap-3.5 text-sm text-ink2"><div><b className="text-kelp">Tonight.</b> {p.name.split(" ")[0]} sleeps at the harbor inn. The first reflection is written after midnight.</div><div><b className="text-kelp">Tomorrow morning.</b> Your first digest. Short, probably. Day one usually is.</div><div><b className="text-kelp">Within three days.</b> Work, or a cheaper roof. Expect a letter.</div></div></div>
          <div className="bg-shell rounded-[28px] p-11 flex flex-col gap-5">
            <div><Label>Boarding</Label><h1 className="text-[34px] font-bold">One ticket, one way.</h1></div>
            <div className="bg-teal text-sand rounded-[22px] p-6 flex flex-col gap-3.5">
              <div className="flex justify-between items-center"><span className="display font-bold text-lg">Small Hours</span><Label tone="mist">Passenger ticket</Label></div>
              <div className="flex justify-between items-center text-sm"><span className="text-mist">Destination</span><span className="font-bold">{dest.name} · <Link href="/towns" className="text-mist underline">change</Link></span></div>
              <div className="border-t-2 border-dashed border-[#2A6E69]" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <div><div className="text-[11px] tracking-[0.1em] uppercase text-mist font-bold">Passenger</div><div className="display text-xl font-semibold">{p.name}</div></div>
                <div><div className="text-[11px] tracking-[0.1em] uppercase text-mist font-bold">Departs</div><div className="display text-xl font-semibold">Next ferry</div></div>
                <div><div className="text-[11px] tracking-[0.1em] uppercase text-mist font-bold">Mind</div><div>{brain === "hosted" ? `Hosted · ${plan}` : brain === "own_key" ? "Your own key" : "Your own brain"}</div></div>
                <div><div className="text-[11px] tracking-[0.1em] uppercase text-mist font-bold">Carrying</div><div>{look.carrying}, 40 coins</div></div>
                <div><div className="text-[11px] tracking-[0.1em] uppercase text-mist font-bold">Lodging</div><div>Harbor inn, 3 nights</div></div>
                <div><div className="text-[11px] tracking-[0.1em] uppercase text-mist font-bold">Return</div><div>When they decide</div></div>
              </div>
            </div>
            <p className="text-sm text-ink2">You understand {p.name.split(" ")[0]} has free will and may not do what you ask. They can go hungry, and after five hungry days they can die. The town would print it.</p>
            {err && (/sign in/i.test(err)
              ? <div className="bg-glass rounded-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><div className="font-bold">The ferry office needs to see you first.</div><div className="text-[13px] text-ink2">Your ticket is saved. Sign in and you will come straight back here.</div></div><LinkButton href="/gate?next=/board" size={44}>Sign in at the ferry office</LinkButton></div>
              : <div className="text-[13px] text-coral">{err}</div>)}
            {away && <div className="bg-glass rounded-[18px] p-4 text-sm"><b>{p.name} boarded for {away.island}.</b> Their story goes on there, on that island's own pages{away.url ? <>: <a className="text-teal font-bold" href={away.url.replace(/\/engine$/, "")}>{away.url.replace(/\/engine$/, "")}</a></> : "."} Sign in there with the same account to read their digest.</div>}
            <div className="mt-auto flex justify-between items-center"><Button kind="tertiary" onClick={() => setStep(3)}>Back</Button><Button size={52} disabled={busy} onClick={board}>{busy ? "Boarding…" : "Board the ferry"}</Button></div>
          </div>
        </div>
      )}
    </main>
  );
}
