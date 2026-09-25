import { B } from './grid';

/** 地形の種類 */
export const enum Bio {
  PLAIN = 0, GRASSLAND, FOREST, HILLS, MOUNTAIN, ALPINE, VALLEY, HIGHLAND, CAVE,
  DESERT, WASTE, SWAMP, LAKE, RIVER, FORD, FALLS, SEA, COAST, BEACH, ISLAND, WHIRL,
}

/** ブロックの上面・側面の色 */
export const TOP_COLOR: Record<number, number[]> = {
  [B.GRASS]: [0x6ba350, 0x7bb45b, 0x94c86e],
  [B.MEADOW]: [0x7fbd5a, 0x8fca66, 0xa6d77a],
  [B.DIRT]: [0x7a5a3c],
  [B.PATH]: [0xb89b6a, 0xa98c5c],
  [B.STONE]: [0x8a8f99, 0x9da3ad, 0x6e737c],
  [B.SNOW]: [0xf2f6fa, 0xe4ecf3],
  [B.SAND]: [0xe3cf94, 0xd8c285],
  [B.DRY]: [0xb98a5a, 0xa57649, 0xc59a68],
  [B.MUD]: [0x5d5236, 0x6a5e3e],
  [B.GRAVEL]: [0x9a958c, 0x857f76],
  [B.ICE]: [0xcfe8f4, 0xbcdcee, 0xe2f2fa],
};
export const SIDE_COLOR: Record<number, number[]> = {
  ...TOP_COLOR,
  [B.GRASS]: [0x7a5a3c, 0x6f5236],
  [B.MEADOW]: [0x7a5a3c, 0x6f5236],
  [B.SNOW]: [0xdfe7ee, 0x9da3ad],
};

/** 水の色（地形ごと） */
export function waterColor(bio: Bio): number {
  switch (bio) {
    case Bio.SWAMP: return 0x4f6a4a;
    case Bio.LAKE: return 0x3fa8c8;
    case Bio.RIVER: case Bio.FORD: case Bio.FALLS: case Bio.VALLEY: return 0x4a9fd8;
    case Bio.WHIRL: return 0x1f5a9a;
    default: return 0x2f7fc4;
  }
}
