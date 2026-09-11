/**
 * One palette for the whole island: the street, the interiors, the painting, the citizens. Every drawn thing takes its
 * colour from here, so the three views read as one place. Hex numbers, as Pixi wants them.
 */
export const KELP = 0x1e2a2b, TEAL = 0x1f5f5b, TEAL_DARK = 0x174a47, CREAM = 0xf7f5ee, CREAM_DARK = 0xe9e5d8, SAND = 0xefede4, SAGE = 0xb9d9c6, SAGE_DARK = 0x9fc2ad, CORAL = 0xe8735a;
export const WOOD = 0xc9b58f, WOOD_DARK = 0xa8946f, STONE = 0xdcd9cf, STONE_DARK = 0xc8c4b8, GLASS = 0xdcebe3, DARK = 0x2f3b3a, DRIFT = 0x6f7a78, MIST = 0xdcebe3;
/** The ground and the water. */
export const GROUND = { water: 0xc3dcd6, waterDeep: 0xb0cec7, shallow: 0xd2e5de, foam: CREAM, sand: 0xe9e0c8, wetSand: 0xdccfb0, grass: 0xcadcc2, earth: 0xe0d4b8, earthEdge: 0xcfc1a3, cobble: 0xe1dbcb, forest: 0xb5cdb6, rock: 0xd7d3c6, field: 0xc9d9b8 };
/** Light: lamplight, the night, the dusk. */
export const LIGHT = { lamp: 0xfff2c2, window: 0xffe3a3, star: 0xfff6d5, night: KELP, dusk: CORAL, shadow: KELP, lowSunShadow: 0x5a3f2e };
/** The sky in the painting, by hour and weather. */
export const SKY = { night: [0x16262b, 0x2a3f45], storm: [0x4a5a63, 0x7a8790], grey: [0x9aa9ad, 0xc7d0d2], dusk: [0xf0b98a, 0xf7dcc0], day: [0xbfe0ea, 0xe6f2f3] } as const;
