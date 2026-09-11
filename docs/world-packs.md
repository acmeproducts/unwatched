# World packs

The island is data. `packages/engine/src/packs/island.ts` holds every place, road, job, and till on the default island, and the engine builds the town from it. To grow the island, add to the pack. To make a different island, write another pack and pass it to the engine.

## Shape

```ts
export interface WorldPack {
  id: string; name: string;
  size: { w: number; h: number };              // map units the client draws in
  places: PlaceSpec[];                          // see below
  jobs: JobSpec[];                              // { id, title, place, wage, hours: [from, to], slots }
  float: Record<string, number>;                // coins each unowned business starts with in its till
}
export interface PlaceSpec {
  id: string; name: string;                     // "sawpit", "the sawpit"
  kind: "harbor" | "inn" | "market" | "shop" | "workplace" | "public" | "home" | "civic" | "plot" | "wild";
  district: string; sprite: string;             // "pinewood", "sawpit"
  x: number; y: number;                         // where it stands; people gather just below it
  exits: string[];                              // roads, made two-way on load
  sells?: { item: string; base: number }[];
  beds?: { price: number; capacity: number };
}
```

Rules the engine keeps regardless of the pack:

- A **plot** is empty land. Citizens can buy it and build a house or a shop on it. The plot's name should read as land: "a plot above the cove".
- A **wild** place has no roof: a wood, a quarry, a beach. It can still have jobs.
- Every place must be reachable from the harbor, because that is where the ferry lands.
- Ids are lowercase with dashes or dots. Names are what a person would say.
- Sprites are names in `apps/web/public/world/manifest.json`. A place whose sprite is missing borrows a stand-in until one is drawn, so you can add the place first and the art later.

## Adding a district

1. Add three to six places to the pack with positions that leave room between them. Roads are `exits`; one road to an existing place is enough.
2. Add at least one job so people have a reason to walk there, and a float for its till.
3. Optionally add a plot or two. Plots are what make a district somewhere people want to live.
4. Run `pnpm soak -- --days 10 --brain mock` and read the Gazettes. If nobody ever goes there, it needs a job or a road.
5. Draw the sprites, or open an issue with the "A place, a job, or a sprite" template and let someone else draw them.

## The Tide style, for sprites

Flat vector, rounded shapes, thin dark outlines, three-quarter top-down, on a magenta background that the atlas script strips. Palette: deep teal `#1F5F5B` roofs, cream `#F7F5EE` walls, sage `#B9D9C6` doors and awnings, sand `#EFEDE4`, kelp `#1E2A2B` outlines, one coral `#E8735A` detail per building at most. Save the SVG under `apps/web/public/world/<sprite>.svg` and run:

```bash
pnpm --filter @ferrytown/web exec node scripts/build-world-atlas.mjs
```

That crops it, writes the PNG, and adds it to the manifest.

## A whole other island

Write a second pack, give the engine `new Town({ pack, … })`, and run the server with `FT_TOWN_ID=<your island>`. Two islands can share one record because every person's id carries the island's name. The ferry between them is not built yet; the towns page already lists both.
