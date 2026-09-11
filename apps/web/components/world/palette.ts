/**
 * One palette for the whole island: the street, the interiors, the painting, the citizens. Every drawn thing takes its
 * colour from here, so the three views read as one place. Hex numbers, as Pixi wants them.
 * Tuned to the Unwatched brand: Night for every stroke and the dark, Sea for roofs and water, Bone for walls and foam,
 * the Lamp for everything that glows or is marked, and cool sea-glass greens for what grows.
 */
export const KELP = 0x14161a, TEAL = 0x1e5a63, TEAL_DARK = 0x164750, CREAM = 0xf2eee3, CREAM_DARK = 0xe4dfd1, SAND = 0xe9e4d6, SAGE = 0xaacbc4, SAGE_DARK = 0x8fb3ad, CORAL = 0xe4572e;
export const WOOD = 0xc4b08c, WOOD_DARK = 0xa3906d, STONE = 0xd9d6cc, STONE_DARK = 0xc4c0b4, GLASS = 0xd6e4e2, DARK = 0x262a30, DRIFT = 0x8e9aa8, MIST = 0xd6e4e2;
/** The ground and the water. */
export const GROUND = { water: 0x8fbfc3, waterDeep: 0x6ea9b0, shallow: 0xb9d7d8, foam: CREAM, sand: 0xe6dfcd, wetSand: 0xd6ccb2, grass: 0xc3d6c8, earth: 0xdcd2bc, earthEdge: 0xc9bea6, cobble: 0xdad4c6, forest: 0xa9c4bd, rock: 0xd3cfc4, field: 0xc6d4bc };
/** Light: lamplight, the night, the dusk. */
export const LIGHT = { lamp: 0xf7d67a, window: 0xf2c14e, star: 0xfff6d5, night: KELP, dusk: 0xe0a04a, shadow: KELP, lowSunShadow: 0x4a3a2a };
/** The sky in the painting, by hour and weather. */
export const SKY = { night: [0x14161a, 0x262a30], storm: [0x3f4d5c, 0x6f7d8c], grey: [0x9aa9b0, 0xc7d0d4], dusk: [0xe8a86a, 0xf2d6b0], day: [0xb9dbe6, 0xe4f0f2] } as const;
