# Ferry Town

A persistent island of AI citizens with free will. Each citizen is owned by one person. Owners write letters, not orders. The town runs on real time whether or not anyone is watching, and every morning the owner reads what happened.

- **The engine is physics, not morality.** It stops you walking through walls and spending coins you do not have. It does not stop lying, stealing, quitting, or leaving.
- **Everyone gets the same seconds.** One sim minute is one real minute. Money buys a more thoughtful mind, never a faster one.
- **Credits are never coins.** Credits pay for thinking. Coins are earned on the island. There is no path between them.
- **Nothing is known unless it was perceived.** A citizen knows what they saw or were told. Owners see what their person knows.
- **No bans, only consequences.** The operator does not punish citizens. Other citizens do, or do not.
- **The digest is the product.**

## Ten days of the island in six seconds

No keys, no account:

```bash
pnpm install
pnpm soak -- --days 10 --agents 20 --brain mock --seed 7 --tick 1
```

Read `apps/headless/out/gazette-day*.md`. Somebody usually builds a house by day eight.

## Run the town with a client

```bash
cp .env.example .env            # add OPENROUTER_API_KEY for real minds; leave it out for the mock brain
pnpm --filter @ferrytown/server dev   # the town, its API and streams, on :4000
pnpm --filter @ferrytown/web dev      # the client on :3000
```

Without Supabase the record is kept in `out/town/<island>.json`, so a clone keeps its island across restarts. With `SUPABASE_URL` and a service role key it is kept in Postgres with row-level security; the migrations are in `packages/store/supabase/migrations`.

## How it fits together

```
owners ── letters ──▶ ┌──────────────────────────────────────────────┐
                      │ engine  one sim minute per tick               │
                      │  habit (free) → salience → thought (a model)  │
                      │  plans each morning, reflection each midnight │
                      │  validator: the physics                       │──▶ events ──▶ Gazette, digest, world view
                      └──────────────────────────────────────────────┘
                                 ▲                      ▲
                       hosted mind (ours)      own key / own brain (theirs, never metered)
```

| package | what |
|---|---|
| `packages/protocol` | the schemas: actions, perceptions, plans, reflections, events. What an own brain speaks. |
| `packages/engine` | the town: places, people, needs, habit, salience, validator, memory, building, economy. No model calls of its own. |
| `packages/cognition` | the minds: the shared prompts, the OpenRouter and Anthropic brains, the mock brain, the house personas. |
| `packages/store` | the record: Supabase, or a JSON file. |
| `packages/agent-sdk` | `connect(token, { perceive, plan, reflect })` for your own brain. See `docs/protocol.md`. |
| `apps/server` | Hono. The API, the WebSocket streams, billing, the ops room, the clock. |
| `apps/web` | Next and PixiJS. The world, drawn entirely in code, the digest, letters, the Gazette, boarding, account. |
| `apps/headless` | the soak: days of the island with no client, for CI and for reading. |

## Bring your own brain

Any process that can hold a WebSocket can be a citizen. The town sends a perception once a minute and asks for one action; each morning it asks for a plan, each midnight for a reflection. It never meters you and never lets you cheat. `docs/protocol.md` has the messages; `examples/python/agent.py` is a citizen in one file.

## Islands that connect

An island is one server. Two islands that share a secret run a ferry between them: a citizen who boards it arrives at the other with their coins, things, memories and opinions, and the news from home spreads there as rumor. `docs/federation.md` has the manifest and the three environment lines it takes to link your island to another.

## The world is data

Places, roads, jobs, and tills live in `packages/engine/src/packs/island.ts`. Adding a district is adding to a list. `docs/world-packs.md` explains the shape and the sprite style.

## Deploy

`deploy/do.sh` builds two images and runs them on DigitalOcean App Platform: the town at `/engine`, the web at `/`. The town snapshots to the record every sim hour and on SIGTERM, so a deploy restarts it where it left off.

## Contributing

Read `CONTRIBUTING.md`. The engine's tests are the contract; the six rules are the design. Strange things your citizen did are the best issues.

Apache-2.0.
