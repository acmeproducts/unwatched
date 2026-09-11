// Makes the Unwatched products and prices on a Stripe account, and the webhook, once; safe to run again.
//   STRIPE_KEY=sk_test_… node scripts/stripe-setup.mjs [--webhook https://unwatched.world/engine/api/stripe/webhook] [--env .env]
//   node scripts/stripe-setup.mjs --cli [--live] …      goes through the logged-in Stripe CLI instead of a key
// Prices are found by lookup key (see apps/server/src/billing.ts LOOKUP), so the server needs no price ids in its env.
// The webhook signing secret is only shown by Stripe at creation: with --env it is written into that file and never printed.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const Stripe = require("../apps/server/node_modules/stripe");
const args = process.argv.slice(2); const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; }; const flag = (n) => args.includes(n);
const key = process.env.STRIPE_KEY; const viaCli = flag("--cli");
if (!key && !viaCli) { console.error("STRIPE_KEY is not set (or pass --cli to use the logged-in Stripe CLI)"); process.exit(1); }
const live = viaCli ? flag("--live") : key.startsWith("sk_live_") || key.startsWith("rk_live_");
console.log(live ? "LIVE mode" : "test mode", viaCli ? "through the Stripe CLI" : "");
/** The same handful of calls, either through the SDK or the CLI's `stripe get|post|delete`. Params are flattened to Stripe's bracket form. */
const flat = (o, pre = "", out = []) => { for (const [k, v] of Object.entries(o)) { const name = pre ? `${pre}[${k}]` : k; if (Array.isArray(v)) v.forEach((x, i) => typeof x === "object" ? flat(x, `${name}[${i}]`, out) : out.push(`${name}[${i}]=${x}`)); else if (v && typeof v === "object") flat(v, name, out); else if (v !== undefined) out.push(`${name}=${v}`); } return out; };
const cli = (method, path, params = {}) => { const a = [method, path, ...(live ? ["--live"] : [])]; for (const kv of flat(params)) a.push("-d", kv); return JSON.parse(execFileSync("stripe", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })); };
const sdk = key ? new Stripe(key) : null;
const api = {
  create: (res, params) => viaCli ? cli("post", `/v1/${res}`, params) : (res === "billing_portal/configurations" ? sdk.billingPortal.configurations.create(params) : res === "webhook_endpoints" ? sdk.webhookEndpoints.create(params) : sdk[res].create(params)),
  update: (res, id, params) => viaCli ? cli("post", `/v1/${res}/${id}`, params) : (res === "billing_portal/configurations" ? sdk.billingPortal.configurations.update(id, params) : res === "webhook_endpoints" ? sdk.webhookEndpoints.update(id, params) : sdk[res].update(id, params)),
};
const stripe = { products: { list: (p) => viaCli ? cli("get", "/v1/products", p) : sdk.products.list(p), create: (p) => api.create("products", p) }, prices: { list: (p) => viaCli ? cli("get", "/v1/prices", p) : sdk.prices.list(p), create: (p) => api.create("prices", p) },
  billingPortal: { configurations: { list: (p) => viaCli ? cli("get", "/v1/billing_portal/configurations", p) : sdk.billingPortal.configurations.list(p), create: (p) => api.create("billing_portal/configurations", p), update: (id, p) => api.update("billing_portal/configurations", id, p) } },
  webhookEndpoints: { list: (p) => viaCli ? cli("get", "/v1/webhook_endpoints", p) : sdk.webhookEndpoints.list(p), create: (p) => api.create("webhook_endpoints", p), update: (id, p) => api.update("webhook_endpoints", id, p) } };

const PRODUCTS = [
  { key: "visitor", name: "Unwatched Visitor", statement: "UNWATCHED VISITOR", description: "One citizen with ten thoughts a day: enough to answer a letter and keep a job. No careful decisions, no nightly reflection.", prices: [{ lookup: "unwatched_visitor_monthly", amount: 300, recurring: { interval: "month" } }] },
  { key: "resident", name: "Unwatched Resident", statement: "UNWATCHED RESIDENT", description: "One citizen who thinks all day, reflects nightly and writes to you at crossroads. Daily digest, letters read aloud.", prices: [{ lookup: "unwatched_resident_monthly", amount: 1200, recurring: { interval: "month" } }] },
  { key: "patron", name: "Unwatched Patron", statement: "UNWATCHED PATRON", description: "Our most capable mind for one citizen: deep reflection, a painted portrait, their book and paintings.", prices: [{ lookup: "unwatched_patron_monthly", amount: 2900, recurring: { interval: "month" } }] },
  { key: "credits", name: "Unwatched credits", statement: "UNWATCHED CREDITS", description: "Credits pay for thinking beyond the plan's daily allowance. They never become coins.", prices: [
    { lookup: "unwatched_pack_small", amount: 300, nickname: "100 credits" }, { lookup: "unwatched_pack_medium", amount: 1200, nickname: "500 credits" }, { lookup: "unwatched_pack_large", amount: 4000, nickname: "2,000 credits" } ] },
];
const products = await stripe.products.list({ limit: 100, active: true });
const prices = await stripe.prices.list({ limit: 100, active: true, lookup_keys: PRODUCTS.flatMap((p) => p.prices.map((x) => x.lookup)) });
for (const P of PRODUCTS) {
  let prod = products.data.find((p) => p.metadata?.unwatched === P.key);
  if (!prod) { prod = await stripe.products.create({ name: P.name, description: P.description, statement_descriptor: P.statement, metadata: { unwatched: P.key }, tax_code: "txcd_10103000" }); console.log("made product", P.name, prod.id); }
  else console.log("product", P.name, prod.id);
  for (const x of P.prices) {
    const have = prices.data.find((p) => p.lookup_key === x.lookup);
    if (have && have.unit_amount === x.amount && have.product === prod.id) { console.log("  price", x.lookup, have.id, `$${(x.amount / 100).toFixed(2)}`); continue; }
    const made = await stripe.prices.create({ product: prod.id, currency: "usd", unit_amount: x.amount, lookup_key: x.lookup, transfer_lookup_key: true, nickname: x.nickname, ...(x.recurring ? { recurring: x.recurring } : {}), tax_behavior: "exclusive" });
    console.log("  made price", x.lookup, made.id, `$${(x.amount / 100).toFixed(2)}`, have ? "(moved the lookup key off the old price)" : "");
  }
}
// the customer portal: card, invoices, and ending a plan; switching between the two plans happens on the same page
try {
  const confs = await stripe.billingPortal.configurations.list({ limit: 10 });
  const planPrices = (await stripe.prices.list({ lookup_keys: ["unwatched_visitor_monthly", "unwatched_resident_monthly", "unwatched_patron_monthly"], active: true })).data;
  const products_ = [...new Set(planPrices.map((p) => p.product))].map((prod) => ({ product: prod, prices: planPrices.filter((p) => p.product === prod).map((p) => p.id) }));
  const features = { invoice_history: { enabled: true }, payment_method_update: { enabled: true }, customer_update: { enabled: true, allowed_updates: ["email", "address"] }, subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "unused", "other"] } }, subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations", products: products_ } };
  const mine = confs.data.find((c) => c.metadata?.unwatched === "1");
  if (mine) { await stripe.billingPortal.configurations.update(mine.id, { features }); console.log("portal", mine.id); }
  else { const c = await stripe.billingPortal.configurations.create({ business_profile: { headline: "Unwatched" }, features, metadata: { unwatched: "1" }, default_return_url: "https://unwatched.world/account/credits" }); console.log("made portal", c.id); }
} catch (e) { console.log("portal not configured:", e.message); }
// the webhook: created once per url; the secret goes into the env file, never to the screen
const url = arg("--webhook"), envFile = arg("--env");
if (url) {
  const events = ["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted", "invoice.payment_failed"];
  const hooks = await stripe.webhookEndpoints.list({ limit: 50 });
  let hook = hooks.data.find((h) => h.url === url);
  if (hook) { await stripe.webhookEndpoints.update(hook.id, { enabled_events: events, disabled: false }); console.log("webhook", hook.id, url, "(secret unchanged; it was set when it was made)"); }
  else {
    hook = await stripe.webhookEndpoints.create({ url, enabled_events: events, description: "Unwatched island" }); console.log("made webhook", hook.id, url);
    if (envFile && hook.secret) { const txt = existsSync(envFile) ? readFileSync(envFile, "utf8") : ""; const line = `STRIPE_WEBHOOK_SECRET=${hook.secret}`; const next = /^STRIPE_WEBHOOK_SECRET=.*$/m.test(txt) ? txt.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, line) : txt + (txt.endsWith("\n") || !txt ? "" : "\n") + line + "\n"; writeFileSync(envFile, next); console.log("wrote STRIPE_WEBHOOK_SECRET into", envFile); }
    else if (hook.secret) console.log("the signing secret was not saved anywhere: pass --env <file>, or delete the endpoint and run again");
  }
}
