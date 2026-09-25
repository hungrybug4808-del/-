import { hash } from '../core/math';
import { Bio } from './biomes';
import {
  B, CELL, NX, NY, NZ, biome, colOf, computeColumns, cx, cz, iyOf, setB,
} from './grid';

// 最初のマップ。z=0 を境に左右対称で、両端（z=±30）に魔王城。背中側（|z|>33）は海。
// x の南（−）から北（＋）へ：
//   海の通り道 → 南の低地（海岸・砂浜・砂漠・荒野・沼地）→ 中央の平らな道（平原・草原・中央の丘）
//   → 丘陵と森林 → 絶壁の上の高台（谷・渡河点・洞窟）→ 山岳と高山（湖・滝）
// 陸の道は3本：北（高台）・中央（丘と渡河点）・南（海沿いの砂漠と沼地）。
// 中央と南は岩の尾根で区切り、途中の峠で乗り換えられる。中央の丘陵から高台へも途中の坂で上がれる。
// 川は山の湖から滝で高台へ、もう一度滝で低地へ落ち、中央の丘の両側に分かれて沼地から海へ注ぐ。

// ---- ノイズ（z は |z| で使うので左右対称になる） ----
const sm = (x: number) => x * x * (3 - 2 * x);
function vn(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z), u = sm(x - xi), v = sm(z - zi);
  const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed), c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
const fbm = (x: number, z: number, seed: number) =>
  0.5 * vn(x / 6, z / 6, seed) + 0.3 * vn(x / 3, z / 3, seed + 1) + 0.2 * vn(x / 1.5, z / 1.5, seed + 2);
const smooth = (a: number, b: number, x: number) => sm(Math.min(1, Math.max(0, (x - a) / (b - a))));
/** ブロックの高さにそろえる */
const q = (y: number) => Math.round(y / CELL) * CELL;

interface Col {
  /** 地面の上面の高さ */
  h: number;
  mat: B;
  sub: B;
  /** 水面の高さ */
  water?: number;
  /** 洞窟：床と天井の高さ */
  cave?: [number, number];
  /** 滝：水が落ちている高さの範囲 */
  falls?: [number, number];
  bio: Bio;
}

/** 海岸線の x */
const shoreX = (zz: number) => -17 + 0.8 * (vn(zz / 3, 0, 11) - 0.5);
/** 低地の川の中心の |z|。中央の丘の両側で2本に分かれる */
const riverZ = (x: number) => 6.2 * smooth(-9, -6, x) * (1 - smooth(3, 6, x));
const RIVER_W = 1.2;

/** 中央と南を区切る岩の尾根。峠（pass）だけ通れる */
export const RIDGE = { x0: -10.5, x1: -8, z0: 0, z1: 22.5, pass: [12, 14.5] as const };
/** 中央の丘陵から高台へ上がる坂 */
export const RAMP = { x0: 5, x1: 10, z0: 8.5, z1: 11 };
/** 渡河点と洞窟の幅（道を広げる） */
const FORD_HALF = 2.5, CAVE_X0 = 11.5, CAVE_X1 = 16;

export const MAP = {
  castleZ: 30,
  fortZ: 20,
  hill: { x: 0, z: 0, top: 1.5 },
  /** 空の竜脈を載せる浮島（崖より高い） */
  sky: { x: 7, z: 0, top: 8.5, r: 2.6 },
  /** 竜脈：陸（中央の丘）・海（海の通り道の真ん中）・空（浮島） */
  veins: [
    { x: 0, z: 0, layer: 'land' },
    { x: -20.5, z: 0, layer: 'sea' },
    { x: 7, z: 0, layer: 'air' },
  ] as { x: number; z: number; layer: 'land' | 'sea' | 'air' }[],
  waterfalls: [] as { x: number; z: number; top: number; bottom: number }[],
  whirlpools: [{ x: -20.5, z: 5.5 }, { x: -20.5, z: -5.5 }],
};

function column(x: number, zz: number): Col {
  const sx = shoreX(zz);

  // 魔王城の背中側の海
  if (zz > 33) return { h: q(Math.max(-3, -1.0 - (zz - 33) * 1.2)), mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.SEA };

  // 南の海の通り道（島と渦潮）
  if (x < sx) {
    const di = Math.hypot(x + 20.5, zz - 13);
    if (di < 2.6) return { h: di < 1.2 ? 0.5 : di < 2.0 ? 0 : -0.5, mat: B.SAND, sub: B.SAND, water: 0, bio: Bio.ISLAND };
    if (Math.hypot(x + 20.5, zz - 5.5) < 1.8) return { h: -3.5, mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.WHIRL };
    const drop = zz >= 25 ? -1.5 : -0.5;
    const h = q(Math.max(-3, drop - (sx - x) * 0.8 + 0.4 * (vn(x / 2, zz / 2, 13) - 0.5)));
    return { h, mat: h >= -1.5 ? B.SAND : B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.SEA };
  }

  // 低地の川（中央の道の上では渡河点、沼地では浅い）
  if (x < 10 && Math.abs(zz - riverZ(x)) < RIVER_W) {
    if (x >= 9.5) return { h: -1.5, mat: B.GRAVEL, sub: B.STONE, water: 0, falls: [0, 2.5], bio: Bio.FALLS };
    if (Math.abs(x) <= FORD_HALF) return { h: -0.5, mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.FORD };
    // 尾根を横切る所は深く（陸では渡れない）、その先の沼地では浅い
    if (x < RIDGE.x0) return { h: -0.5, mat: B.MUD, sub: B.MUD, water: 0, bio: Bio.SWAMP };
    return { h: x >= 8 ? -1.5 : -1.0, mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.RIVER };
  }

  // 魔王城の前庭
  if (zz >= 25.5 && Math.abs(x) <= 7.5) return { h: 0, mat: Math.abs(x) <= 1.5 ? B.PATH : B.GRASS, sub: B.DIRT, bio: Bio.PLAIN };

  // 中央と南を区切る岩の尾根と、乗り換えの峠
  if (x >= RIDGE.x0 && x < RIDGE.x1 && zz >= RIDGE.z0 && zz < RIDGE.z1) {
    if (zz >= RIDGE.pass[0] && zz < RIDGE.pass[1]) return { h: 0.5, mat: B.GRAVEL, sub: B.DIRT, bio: Bio.HILLS };
    return { h: q(2.5 + 1.2 * vn(x / 1.5, zz / 1.5, 45)), mat: B.STONE, sub: B.STONE, bio: Bio.MOUNTAIN };
  }

  // 南の低地
  if (x < -8) {
    const shore = x < sx + 2.5;
    if (zz >= 25) return shore
      ? { h: 1.0, mat: B.STONE, sub: B.STONE, bio: Bio.COAST }
      : { h: 0.5, mat: B.GRASS, sub: B.DIRT, bio: Bio.PLAIN };
    if (zz >= 5 && shore) return { h: 0, mat: B.SAND, sub: B.SAND, bio: Bio.BEACH };
    if (zz >= 12) return { h: q(Math.min(1, 1.3 * vn(x / 2.5, zz / 2.5, 21))), mat: B.SAND, sub: B.SAND, bio: Bio.DESERT };
    if (zz >= 5) {
      if (vn(x / 1.2, zz / 1.2, 41) > 0.8) return { h: 1.0, mat: B.STONE, sub: B.STONE, bio: Bio.WASTE };
      return { h: q(0.7 * vn(x / 3, zz / 3, 31)), mat: B.DRY, sub: B.DRY, bio: Bio.WASTE };
    }
    return vn(x / 1.8, zz / 1.8, 51) > 0.45
      ? { h: -0.5, mat: B.MUD, sub: B.MUD, water: 0, bio: Bio.SWAMP }
      : { h: 0, mat: B.MUD, sub: B.DIRT, bio: Bio.SWAMP };
  }

  // 中央の平らな道と中央の丘
  if (x < 5) {
    const road = Math.abs(x) <= 1.5;
    const dh = Math.hypot(x - MAP.hill.x, zz);
    if (dh < 5) return { h: q(MAP.hill.top * (1 - smooth(1.2, 5, dh))), mat: road ? B.PATH : B.GRASS, sub: B.DIRT, bio: Bio.HILLS };
    if (zz > 14) return { h: 0, mat: road ? B.PATH : B.MEADOW, sub: B.DIRT, bio: Bio.GRASSLAND };
    return { h: 0, mat: road ? B.PATH : B.GRASS, sub: B.DIRT, bio: Bio.PLAIN };
  }

  // 城の横（高台からの下り口）
  if (zz >= 29 && x < 17) return { h: 0, mat: B.GRASS, sub: B.DIRT, bio: Bio.PLAIN };

  // 丘陵から高台へ上がる坂（道の乗り換え）
  if (x >= RAMP.x0 && x < RAMP.x1 && zz >= RAMP.z0 && zz < RAMP.z1)
    return { h: q(Math.min(3.5, Math.max(0.5, ((x - RAMP.x0) / (RAMP.x1 - RAMP.x0)) * 4))), mat: B.PATH, sub: B.DIRT, bio: Bio.HILLS };

  // 丘陵と森林（ところどころ崖のある段丘）
  if (x < 10) {
    const forest = vn(x / 3, zz / 3, 81) > 0.45;
    if (zz < 27 && vn(x / 2.2, zz / 2.2, 71) > 0.74) return { h: 2.5, mat: B.GRASS, sub: B.STONE, bio: forest ? Bio.FOREST : Bio.HILLS };
    const h = zz < 27 ? q(Math.min(1.5, Math.max(0, fbm(x, zz, 61) * 2.4 - 0.4))) : 0;
    return { h, mat: B.GRASS, sub: B.DIRT, bio: forest ? Bio.FOREST : Bio.HILLS };
  }

  // 絶壁の上の高台
  if (x < 17) {
    const P = zz <= 23 ? 4 : q(4 * (1 - (zz - 23) / 6));
    if (zz >= 14 && zz < 17.5) {
      // 尾根を貫く洞窟
      if (x >= CAVE_X0 && x < CAVE_X1) return { h: q(9.5 + fbm(x, zz, 97)), mat: B.STONE, sub: B.STONE, cave: [4, 8.5], bio: Bio.CAVE };
      return { h: q(8.5 + 2 * fbm(x, zz, 97)), mat: B.STONE, sub: B.STONE, bio: Bio.MOUNTAIN };
    }
    if (zz < 4) {
      // 川の谷と、高台の渡河点
      if (zz < RIVER_W) {
        if (x >= 16.5) return { h: 1.0, mat: B.GRAVEL, sub: B.STONE, water: 2.5, falls: [2.5, 8], bio: Bio.FALLS };
        const ford = x >= CAVE_X0 && x < CAVE_X1;
        return { h: ford ? 2.0 : 1.5, mat: B.GRAVEL, sub: B.STONE, water: 2.5, bio: ford ? Bio.FORD : Bio.RIVER };
      }
      return { h: q(2.5 + 1.5 * smooth(RIVER_W, 4, zz)), mat: B.GRASS, sub: B.DIRT, bio: Bio.VALLEY };
    }
    const forest = x > 14.5 && vn(x / 3, zz / 3, 83) > 0.5;
    return { h: P, mat: B.GRASS, sub: B.DIRT, bio: forest ? Bio.FOREST : Bio.HIGHLAND };
  }

  // 山岳・高山と山の湖
  const e = ((x - 20.5) / 2.2) ** 2 + (zz / 2.9) ** 2;
  if (e < 1) return { h: 7.0, mat: B.SAND, sub: B.STONE, water: 8.0, bio: Bio.LAKE };
  if (x < 18.5 && zz < RIVER_W) return { h: 7.5, mat: B.STONE, sub: B.STONE, water: 8.0, bio: Bio.RIVER };
  // 北の端は海へ下る
  let m = q(Math.min(14, 5 + (x - 17) * 1.3 + 3 * fbm(x, zz, 91), (24.2 - x) * 4 - 0.5));
  if (e < 2) m = Math.max(m, 8.5);
  if (m < 0) return { h: m, mat: B.GRAVEL, sub: B.STONE, water: 0, bio: Bio.SEA };
  if (m > 8.5) return { h: m, mat: B.SNOW, sub: B.STONE, bio: Bio.ALPINE };
  return { h: m, mat: m < 6.5 && vn(x / 2, zz / 2, 93) > 0.5 ? B.GRASS : B.STONE, sub: B.STONE, bio: Bio.MOUNTAIN };
}

export function generateMap(): void {
  for (let iz = 0; iz < NZ; iz++)
    for (let ix = 0; ix < NX; ix++) {
      const x = cx(ix), z = cz(iz), zz = Math.abs(z);
      const c = column(x, zz);
      biome[colOf(ix, iz)] = c.bio;
      const top = iyOf(c.h);
      for (let iy = 0; iy <= top && iy < NY; iy++) setB(ix, iy, iz, iy === top ? c.mat : top - iy <= 2 ? c.sub : B.STONE);
      if (c.water !== undefined) for (let iy = top + 1; iy <= iyOf(c.water); iy++) setB(ix, iy, iz, B.WATER);
      if (c.cave) {
        const f = iyOf(c.cave[0]);
        setB(ix, f, iz, B.GRAVEL);
        for (let iy = f + 1; iy <= iyOf(c.cave[1]); iy++) setB(ix, iy, iz, B.AIR);
      }
      if (c.falls) for (let iy = iyOf(c.falls[0]) + 1; iy <= iyOf(c.falls[1]); iy++) setB(ix, iy, iz, B.WATER);
    }
  // 浮島：上は草地、下は岩の円錐
  const I = MAP.sky;
  for (let iz = 0; iz < NZ; iz++)
    for (let ix = 0; ix < NX; ix++) {
      const x = cx(ix), z = cz(iz), d = Math.hypot(x - I.x, z - I.z);
      if (d >= I.r) continue;
      const bottom = q(I.top - 1 - 3.2 * (1 - d / I.r) - 0.6 * hash(ix, 7, Math.abs(iz - NZ / 2 + 0.5) | 0));
      const top = iyOf(d > I.r - 0.6 ? I.top - 0.5 : I.top);
      for (let iy = iyOf(bottom); iy <= top; iy++) setB(ix, iy, iz, iy === top ? B.GRASS : top - iy <= 1 ? B.DIRT : B.STONE);
    }
  computeColumns();
  MAP.waterfalls = [
    { x: 9.75, z: 0, top: 2.5, bottom: 0 },
    { x: 16.75, z: 0, top: 8, bottom: 2.5 },
  ];
}

// 地形はほかのモジュール（建物の配置など）より先に必要なので、読み込んだ時点で作る
generateMap();
