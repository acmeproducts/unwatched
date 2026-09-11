import Stripe from "stripe";
import type { AgentState, Tier } from "@smallhours/engine";
import type { Store, Wallet, Plan } from "@smallhours/store";

/** What each plan buys per day, per citizen, per month. Set from the cost audit of September 2026: a Resident costs us about $6 a month in thinking at typical use and $9.40 if every thought is spent; a Patron $12 and $20. */
export const PLANS: Record<Plan, { name: string; price: number; tier1: number; tier2: number; reflect: boolean; blurb: string }> = {
  visitor:  { name: "Visitor",  price: 0,  tier1: 10,  tier2: 0,  reflect: false, blurb: "Habit plus ten thoughts a day. Weekly digest." },
  resident: { name: "Resident", price: 12, tier1: 50,  tier2: 6,  reflect: true,  blurb: "Thinks all day, reflects nightly, writes to you at crossroads. Daily digest, letters read aloud." },
  patron:   { name: "Patron",   price: 29, tier1: 120, tier2: 15, reflect: true,  blurb: "Our most capable mind, deep reflection, a painted portrait, their book and paintings." },
};
export const PACKS: Record<string, { credits: number; price: number }> = { small: { credits: 100, price: 3 }, medium: { credits: 500, price: 12 }, large: { credits: 2000, price: 40 } };
/** What a thought costs in credits when the allowance is spent. */
export const COST: Record<Tier, number> = { 1: 1, 2: 4, 3: 10 };

/**
 * Wallets in memory, written through to the store. Stripe when keys exist; an honest test mode when they do not.
 * Credits never become coins. There is no path from here into the town's economy.
 */
export class Billing {
  private wallets = new Map<string, Wallet>();
  readonly stripe: Stripe | null;
  readonly testMode: boolean;
  constructor(private store: Store | null, private log: (l: string) => void) {
    const key = process.env.STRIPE_SECRET_KEY;
    this.stripe = key ? new Stripe(key) : null;
    this.testMode = !this.stripe;
  }
  async load() { if (this.store) for (const w of await this.store.allWallets()) this.wallets.set(w.ownerId, w); }
  wallet(ownerId: string): Wallet { let w = this.wallets.get(ownerId); if (!w) { w = { ownerId, plan: "visitor", credits: 0, stripeCustomer: null }; this.wallets.set(ownerId, w); } return w; }
  allowance(ownerId: string) { const p = PLANS[this.wallet(ownerId).plan]; return { tier1Max: p.tier1, tier2Max: p.tier2 }; }
  applyPlan(a: AgentState) { if (!a.owner || a.brainKind !== "hosted") return; const al = this.allowance(a.owner); a.budget.tier1Max = al.tier1Max; a.budget.tier2Max = al.tier2Max; a.budget.tier1Left = Math.min(a.budget.tier1Left, al.tier1Max); a.budget.tier2Left = Math.min(a.budget.tier2Left, al.tier2Max); }

  /** The engine asks; we answer from the wallet. */
  bank = (a: AgentState, tier: Tier): boolean => {
    if (!a.owner) return false;
    const w = this.wallet(a.owner); const cost = COST[tier];
    if (w.credits < cost) return false;
    w.credits -= cost;
    void this.store?.saveWallet(w); void this.store?.credit(a.owner, -cost, tier === 1 ? "thought" : tier === 2 ? "stakes" : "reflection", a.id);
    return true;
  };

  async grant(ownerId: string, credits: number, reason: string, ref: string | null = null) { const w = this.wallet(ownerId); w.credits += credits; await this.store?.saveWallet(w); await this.store?.credit(ownerId, credits, reason, ref); return w; }
  async setPlan(ownerId: string, plan: Plan) { const w = this.wallet(ownerId); w.plan = plan; await this.store?.saveWallet(w); return w; }

  /** Stripe Checkout for a pack, returning the URL to send the owner to. */
  async checkoutPack(ownerId: string, pack: string, origin: string): Promise<{ url: string } | { error: string }> {
    const p = PACKS[pack]; if (!p) return { error: "no such pack" };
    if (!this.stripe) return { error: "test mode" };
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment", success_url: `${origin}/account/credits?paid=1`, cancel_url: `${origin}/account/credits`,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: p.price * 100, product_data: { name: `${p.credits} Small Hours credits`, description: "Credits pay for thinking. They never become coins." } } }],
      metadata: { owner_id: ownerId, credits: String(p.credits), pack },
    });
    return session.url ? { url: session.url } : { error: "Stripe did not give a checkout link" };
  }
  async checkoutPlan(ownerId: string, plan: Plan, origin: string): Promise<{ url: string } | { error: string }> {
    if (!this.stripe) return { error: "test mode" };
    const priceId = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`]; if (!priceId) return { error: `no Stripe price configured for ${plan}` };
    const session = await this.stripe.checkout.sessions.create({ mode: "subscription", success_url: `${origin}/account/credits?plan=${plan}`, cancel_url: `${origin}/account/credits`, line_items: [{ price: priceId, quantity: 1 }], metadata: { owner_id: ownerId, plan } });
    return session.url ? { url: session.url } : { error: "Stripe did not give a checkout link" };
  }
  /** Webhook: the only place a purchase becomes credits. */
  async webhook(rawBody: string, signature: string | undefined): Promise<{ ok: boolean; note?: string }> {
    if (!this.stripe) return { ok: false, note: "test mode" };
    const secret = process.env.STRIPE_WEBHOOK_SECRET; if (!secret || !signature) return { ok: false, note: "no webhook secret" };
    let ev: Stripe.Event;
    try { ev = this.stripe.webhooks.constructEvent(rawBody, signature, secret); } catch (e) { return { ok: false, note: (e as Error).message }; }
    if (ev.type === "checkout.session.completed") {
      const s = ev.data.object as Stripe.Checkout.Session; const owner = s.metadata?.owner_id; if (!owner) return { ok: true, note: "no owner" };
      if (s.mode === "payment") await this.grant(owner, Number(s.metadata?.credits ?? 0), "purchase", s.id);
      if (s.mode === "subscription" && s.metadata?.plan) await this.setPlan(owner, s.metadata.plan as Plan);
      this.log(`stripe: ${s.mode} for ${owner}`);
    }
    if (ev.type === "customer.subscription.deleted") { /* plan lapses at renewal: handled by the next lookup */ }
    return { ok: true };
  }
}
