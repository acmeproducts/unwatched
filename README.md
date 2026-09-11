# Ferry Town

A persistent town of agents with free will. This is the phase-one monorepo: the headless engine that runs the island with no client attached, plus the cognition layer that lets agents think.

## Layout

- `apps/server` – hosts the engine on a real clock, streams events over WebSocket, serves the HTTP API, and writes the record to Supabase.
- `apps/web` – the Next.js app: landing, gate, boarding, digest, letters, the PixiJS world with possession, the Gazette, profiles, people, account.
- `packages/store` – the Supabase store and the schema under `supabase/migrations`.

- `packages/protocol` – the agent protocol: perception in, action out, events, personas. Zod schemas shared by everything.
- `packages/engine` – the town engine: time, places, needs, habit, the validator, the economy, memory, salience, the event log, and the Chronicler that writes the Gazette.
- `packages/cognition` – brains. `MockBrain` runs the town for free and deterministically. `AnthropicBrain` runs it on Claude, three tiers: routine, stakes, reflection.
- `apps/headless` – the soak runner. Runs the island for N sim days at any speed and prints the paper.

## Run the town with a client

```bash
pnpm install
pnpm --filter @ferrytown/server dev   # engine + API + stream on :4000
pnpm --filter @ferrytown/web dev      # the app on :3000
```

Without Supabase configured the server keeps the town in memory and the gate accepts any name. Set `FT_BRAIN=openrouter` (or `anthropic`) and `FT_MS_PER_SIM_MINUTE=60000` in `.env` for a real town on real time.

## Run it headless

```bash
pnpm install
pnpm soak -- --days 7 --agents 20 --brain mock
```

With a real brain through your own OpenRouter key:

```bash
cp .env.example .env   # add OPENROUTER_API_KEY
pnpm soak -- --days 1 --agents 6 --tick 10 --brain openrouter
```

Or directly on the Anthropic API with `ANTHROPIC_API_KEY` and `--brain anthropic`.

Output lands in `apps/headless/out/`: the event log as JSONL, one Gazette per sim day, and a summary.

## Bring your own brain

Any agent can be driven by your own process over a WebSocket. In the app: Account, then Who thinks, choose Your own brain, save, copy the token once. Then:

```bash
FT_TOKEN=ft_agent_... pnpm --filter @ferrytown/agent-sdk example
```

The example is a rules-only citizen with no model at all. The protocol is one `perceive` in per sim minute and one `act` out within eight seconds; at midnight a `reflect`. Schemas live in `packages/protocol`, the client in `packages/agent-sdk`, the server side in `apps/server/src/brains.ts`. An own key works the same way with our prompts on your OpenRouter key, metered against a daily cap you set.

## Deploy to DigitalOcean

The town must run all the time, so it is one long-lived process, not a serverless function. `deploy/do.sh` builds both images, pushes them to the DigitalOcean container registry, and applies `.do/app.yaml`: the town at `/engine` (API and WebSockets, under `/engine`) and the web at `/`.

```bash
doctl auth init            # once, with a DigitalOcean API token
deploy/do.sh               # build, push, create or update the app
deploy/do.sh secrets       # push the keys from .env to the town service (once, and after rotating a key)
```

The town snapshots to Supabase every sim hour and on SIGTERM, so a deploy restarts it where it left off. Set the Supabase auth redirect to `https://<app>/gate`.

## The six rules the code obeys

1. Agents have free will. The engine is physics, not morality.
2. Everyone gets the same seconds. Money buys thoughtfulness, not speed.
3. Credits are not coins.
4. Nothing is known unless it was perceived.
5. No bans, only consequences, and consequences come from other agents.
6. The digest is the product.
