import { Bio } from '../biomes';
import { B } from '../grid';
import { type Col, MOAT_X, MOAT, castleYard, inMap, moat, moatRim, q, smooth, vn } from '../gen-util';
import type { MapDef } from './types';

// 草原の国（温帯）：なだらかな丘の続く田園。
// 西の丘から流れてくる小川が真ん中の池に注ぎ、池から川が南北に流れて、両方の魔王城の堀になる（海のモンスターの道）。
// 陸の道は3本：西の田園（川の向こう、小川の浅瀬を渡る）・中央の丘の道（丘の上に陸の竜脈）・東の丘陵（少し高い）。
// 中央と東の間は森の帯。森の中の小道と、川の飛び石の浅瀬は、旗で乗り換えるときに通る。

/** 川の中心の x（池から堀の西の腕まで） */
export const riverX = (zz: number) => {
  const w = -9 + 1.3 * Math.sin(zz / 3.2);
  return zz < 21 ? w : w + (-MOAT_X - w) * smooth(21, MOAT.z0, zz);
};
const RIVER_HALF = 1.25, POND_R = 3.2, STREAM_HALF = 0.9;
/** 森の帯（中央と東の間） */
const BELT = { x0: 6, x1: 10.5, z1: 16 };
/** 森の小道（乗り換え）と、川の飛び石の浅瀬 */
const GLADE = { z0: 11, z1: 13 }, FORD = { z0: 17.5, z1: 20 };

/** なだらかな丘の高さ（1マスで1段より急にならない） */
function rolling(x: number, zz: number): number {
  return 2.2 * vn(x / 9, zz / 9, 61) + 0.9 * vn(x / 4.5, zz / 4.5, 62) - 1.1;
}
/** マップの外で、ふちから離れるほど高くなる（遠くの山） */
function outerRise(x: number, zz: number): number {
  const d = Math.max(Math.abs(x) - 24, zz - 36, 0);
  return d <= 0 ? 0 : 0.12 * d + Math.max(0, d - 30) * 0.25 * (0.6 + vn(x / 14, zz / 14, 71));
}

function column(x: number, zz: number): Col {
  const out = !inMap(x, zz);
  const m = moat(x, zz);
  if (m && !out) return m;
  if (moatRim(x, zz) && !out) return { h: 0.5, mat: B.STONE, sub: B.STONE, bio: Bio.COAST };
  const yard = out ? null : castleYard(x, zz);
  if (yard) return yard;

  const rx = riverX(zz), dr = Math.abs(x - rx);
  // 真ん中の池（海の竜脈）と、西から注ぐ小川
  const dp = Math.hypot(x - riverX(0), zz);
  if (dp < POND_R) return { h: dp < POND_R - 1 ? -2 : -1, mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.LAKE };
  if (zz < STREAM_HALF + 0.35 * Math.sin(x / 2.5) && x < riverX(0) && x > -70)
    return { h: -0.5, mat: B.GRAVEL, sub: B.DIRT, water: 0, bio: Bio.RIVER };
  // 川（深くて陸では渡れない。飛び石の浅瀬だけ渡れる）
  if (zz < MOAT.z0 && dr < RIVER_HALF) {
    const ford = (zz >= FORD.z0 && zz < FORD.z1) || (zz >= GLADE.z0 && zz < GLADE.z1);
    if (ford) return { h: -0.5, mat: B.STONE, sub: B.GRAVEL, water: 0, bio: Bio.FORD };
    return { h: dr < RIVER_HALF - 0.5 ? -1.5 : -1, mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.RIVER };
  }

  // 地面：なだらかな丘。砦・城のまわりと川べりは平らに近づける
  let h = rolling(x, zz);
  if (x >= BELT.x1) h += 1.2 * smooth(BELT.x1 - 2, BELT.x1 + 3, x) * (1 - smooth(14, 19, zz));
  const dy = Math.hypot(Math.max(Math.abs(x) - MOAT.x1 - 0.5, 0), Math.max(MOAT.z0 - zz, 0));
  const stream = x < riverX(0) ? smooth(1.5, 4.5, zz) : 1;
  const flat = smooth(4, 8, Math.hypot(x, zz - 20)) * smooth(2.5, 5, dr) * smooth(2, 6, dy) * stream;
  const hill = Math.hypot(x, zz);
  h = Math.max(0, h) * flat;
  if (hill < 5) h = Math.max(h, 1.5 * (1 - smooth(1.2, 5, hill)));
  h += outerRise(x, zz);
  const hq = q(h);

  // 遠くの山（石と雪）
  if (out && hq > 13) return { h: hq, mat: hq > 17 ? B.SNOW : B.STONE, sub: B.STONE, bio: Bio.MOUNTAIN };
  if (out && hq > 6) return { h: hq, mat: B.GRASS, sub: B.DIRT, bio: vn(x / 5, zz / 5, 83) > 0.35 ? Bio.FOREST : Bio.MOUNTAIN };

  const road = Math.abs(x) <= 1.5 && x > rx + RIVER_HALF && zz < MOAT.z0;
  const glade = zz >= GLADE.z0 && zz < GLADE.z1 && x > BELT.x0 - 1 && x < BELT.x1 + 1;
  if (road || glade) return { h: hq, mat: B.PATH, sub: B.DIRT, bio: Bio.PLAIN };
  // 中央と東の間の森の帯
  if (x >= BELT.x0 && x < BELT.x1 && zz < BELT.z1) return { h: hq, mat: B.GRASS, sub: B.DIRT, bio: Bio.FOREST };
  // 西の田園（区画ごとに麦畑・牧草地）
  if (x < rx - RIVER_HALF) {
    if (x < -19 || out) return { h: hq, mat: B.GRASS, sub: B.DIRT, bio: vn(x / 4, zz / 4, 85) > 0.45 ? Bio.FOREST : Bio.HILLS };
    const f = vn(Math.floor(x / 3.5) + 0.5, Math.floor(zz / 4) + 0.5, 87);
    return { h: hq, mat: f > 0.75 ? B.DIRT : f > 0.35 ? B.MEADOW : B.GRASS, sub: B.DIRT, bio: f > 0.35 ? Bio.FARM : Bio.GRASSLAND };
  }
  // 東の丘陵
  if (x >= BELT.x1) {
    if (x > 20 || out) return { h: hq, mat: B.GRASS, sub: B.DIRT, bio: vn(x / 4, zz / 4, 89) > 0.4 ? Bio.FOREST : Bio.HILLS };
    return { h: hq, mat: vn(x / 3, zz / 3, 91) > 0.5 ? B.MEADOW : B.GRASS, sub: B.DIRT, bio: vn(x / 3, zz / 3, 93) > 0.62 ? Bio.GRASSLAND : Bio.HILLS };
  }
  // 中央：牧草地と花畑
  if (zz > 30 || out) return { h: hq, mat: B.GRASS, sub: B.DIRT, bio: vn(x / 4, zz / 4, 95) > 0.5 ? Bio.FOREST : Bio.HILLS };
  return { h: hq, mat: zz > 13 ? B.MEADOW : B.GRASS, sub: B.DIRT, bio: vn(x / 3, zz / 3, 97) > 0.55 ? Bio.GRASSLAND : Bio.PLAIN };
}

export const meadow: MapDef = {
  id: 'meadow', name: '草原の国', icon: '🌿', climate: '温帯',
  desc: 'なだらかな丘の続く田園。西の田園・中央の丘の道・東の丘陵の3本と、池から城の堀へ流れる川。はじめての人向け',
  column,
  sky: { x: 8.25, z: 0, top: 8.5, r: 2.6 },
  veins: [{ x: 0, z: 0, layer: 'land' }, { x: riverX(0), z: 0, layer: 'sea' }, { x: 8.25, z: 0, layer: 'air' }],
  laneAt(x, z) {
    const zz = Math.abs(z), rx = riverX(zz);
    if (x < rx - RIVER_HALF) return 0;
    if (x > rx + RIVER_HALF && x < BELT.x0) return 1;
    if (x >= BELT.x1) return 2;
    return -1;
  },
  laneNames: ['西の田園', '中央の丘', '東の丘陵'],
  cpuSpawns: [[-4, 4, 13, 23, 0.45], [-17, -12, 13, 16.5, 0.3], [12, 18, 13, 16.5, 0.25]],
  high: [{ x: 14, z: 5 }, { x: 15, z: 10 }, { x: 13, z: 14 }],
  weather: [{ kind: 'rain', x0: -14, x1: -4, z0: -4.5, z1: 4.5, mirror: false, count: 160 }],
  rainClouds: [[-10, -2], [-8, 2.5]],
  reserved(x, zz) {
    if (Math.abs(x) <= 1.8 && zz < MOAT.z0) return true;
    return zz >= GLADE.z0 - 0.5 && zz < GLADE.z1 + 0.5 && x > BELT.x0 - 1.5 && x < BELT.x1 + 1.5;
  },
};
