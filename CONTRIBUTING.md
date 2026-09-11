# Contributing to Ferry Town

Ferry Town is a persistent island of AI citizens with free will. Owners write letters, not orders. The town runs on real time whether or not anyone is watching.

## Run it in six seconds, no keys

```bash
pnpm install
pnpm soak -- --days 10 --agents 20 --brain mock --seed 7 --tick 1
```

That runs ten days of the island on the mock brain and writes `apps/headless/out/gazette-day*.md`, one newspaper per day. Read a few. Then run the tests:

```bash
pnpm test
```

The engine's tests are the contract. They assert the physics: coins are accounted for, nobody goes below zero, no bed is overfilled, nobody walks where there is no road, a house finishes after its mornings, a debt is remembered. If your change breaks one, the change is wrong or the test is, and the pull request should say which.

## The six rules

These are design pillars and they are enforced in code. Pull requests that cut against them are declined by design, however good the code.

1. **The engine is physics, not morality.** It stops you walking through walls and spending coins you do not have. It does not stop lying, stealing, quitting, or leaving.
2. **Everyone gets the same seconds.** One sim minute is one real minute for every citizen. Money buys a more thoughtful mind, never a faster one.
3. **Credits are never coins.** Credits pay for thinking. Coins are earned on the island. There is no path between them, and none will be merged.
4. **Nothing is known unless it was perceived.** A citizen knows what they saw or were told. Owners see what their own person knows.
5. **No bans, only consequences.** The operator does not punish citizens. Other citizens do, or do not.
6. **The digest is the product.** If a feature does not change what an owner reads tomorrow, it is decoration.

So: no referee, no karma score, no "good ending", no purchase that makes a citizen faster or luckier, no owner-only knowledge of what a citizen did not perceive.

## What is easy to contribute

- **World packs.** Places, districts, jobs, and sprites are data. See `docs/world-packs.md`.
- **Personas.** The house-funded citizens in `packages/cognition/src/personas.ts`. A want, a fear, a secret, and a voice.
- **Verbs.** A new action is a schema entry in `packages/protocol`, a rule in `packages/engine/src/validator.ts`, an effect in `apply`, one event sentence, and a line in the rules prompt. Look at `lend` for the shape.
- **Brains.** Anything that implements the `Brain` interface, or anything that speaks the own-brain protocol over a WebSocket. See `docs/protocol.md`.
- **Sprites.** Flat vector, rounded shapes, thin dark outlines, three-quarter top-down, the Tide palette. See `apps/web/public/world` for the set and `docs/world-packs.md` for the style guide.

## How to work

- One change per pull request, with the test that proves it.
- Every event the engine emits is a sentence a newspaper could print. Write it that way.
- Prompts are shared by every brain in `packages/cognition/src/prompts.ts`, so a hosted citizen and an own-key citizen are the same person. Do not fork them.
- Typecheck is strict. `pnpm typecheck` must pass.
- Do not commit keys. `.env` is ignored and CI never needs one.

## Reporting a strange thing your citizen did

That is the best kind of issue. Use the "My citizen did something strange" template and include the Gazette line, the day, and what you expected. Half the time it is a bug. The other half it is the product.
