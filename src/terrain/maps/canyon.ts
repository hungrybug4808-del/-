import { Bio } from '../biomes';
import { B } from '../grid';
import { type Col, backSea, castleYard, fbm, q, vn } from '../gen-util';
import type { MapDef } from './types';

// 峡谷の国（乾燥・砂嵐）：高い台地を、うねる峡谷が割っている。
// 陸の道は、西の台地の上・うねる峡谷の底（真ん中のオアシスに陸の竜脈）・東の台地の上の3本。
// 台地の上は峡谷を見下ろす高台で、谷底の敵を上から撃てる。台地へは陣地の近くの坂から上がる。
// 陣地（|z| >= 18）は低い盆地で、3本の道はここで合流する。

const shoreX = (zz: number) => -19 + 0.8 * (vn(zz / 3, 0, 17) - 0.5);
const BASIN_Z = 18, MESA_H = 4;
/** 峡谷の中心の x（陣地の口から、東へふくらんで、真ん中のオアシスへ） */
export const canyonX = (zz: number) => (zz < BASIN_Z ? 8 * Math.sin((Math.PI * zz) / BASIN_Z) : 0);
const CANYON_HALF = 2.25, OASIS_R = 4.5;
const inCanyon = (x: number, zz: number) => Math.abs(x - canyonX(zz)) < CANYON_HALF || Math.hypot(x, zz) < OASIS_R;

function column(x: number, zz: number): Col {
  const sea = backSea(zz);
  if (sea) return sea;
  const sx = shoreX(zz);
  if (x < sx) return { h: q(Math.max(-3, -1.0 - (sx - x) * 0.8)), mat: B.SAND, sub: B.GRAVEL, water: 0, bio: Bio.SEA };
  const yard = castleYard(x, zz, B.SAND);
  if (yard) return { ...yard, bio: Bio.DESERT };
  // 東の端の赤い岩山
  if (x >= 21) {
    const m = q(Math.min(9, 5 + (x - 21) * 1.5 + 2 * fbm(x, zz, 91), (24.2 - x) * 4 - 0.5));
    if (m < 0) return { h: m, mat: B.GRAVEL, sub: B.STONE, water: 0, bio: Bio.SEA };
    return { h: m, mat: B.DRY, sub: B.DRY, bio: Bio.MOUNTAIN };
  }
  // 陣地の盆地
  if (zz >= BASIN_Z) return { h: 0, mat: Math.abs(x) <= 1.5 ? B.PATH : B.SAND, sub: B.SAND, bio: Bio.DESERT };
  // 台地へ上がる坂（西・東）
  if (zz >= BASIN_Z - 4 && Math.abs(x) >= 10 && Math.abs(x) < 16)
    return { h: q((MESA_H * (BASIN_Z - zz)) / 4), mat: B.PATH, sub: B.SAND, bio: Bio.DESERT };
  // 峡谷の底と、真ん中のオアシス（泉とヤシ）
  if (inCanyon(x, zz)) {
    const d = Math.hypot(x, zz);
    if (Math.hypot(x + 2.2, zz) < 1.3) return { h: -1, mat: B.SAND, sub: B.SAND, water: 0, bio: Bio.LAKE };
    if (d < OASIS_R) return { h: 0.5, mat: B.GRASS, sub: B.SAND, bio: Bio.ISLAND };
    return { h: 0, mat: B.SAND, sub: B.SAND, bio: Bio.VALLEY };
  }
  // 西の海岸は崖
  if (x < sx + 1.5) return { h: MESA_H, mat: B.DRY, sub: B.STONE, bio: Bio.COAST };
  // 台地の上（砂丘と岩の柱）
  if (vn(x / 1.2, zz / 1.2, 41) > 0.84) return { h: MESA_H + 2, mat: B.DRY, sub: B.DRY, bio: Bio.WASTE };
  return { h: q(MESA_H + 0.6 * vn(x / 2.5, zz / 2.5, 21)), mat: vn(x / 4, zz / 4, 23) > 0.5 ? B.SAND : B.DRY, sub: B.DRY, bio: Bio.DESERT };
}

export const canyon: MapDef = {
  id: 'canyon', name: '峡谷の国', icon: '🏜️', climate: '乾燥・砂嵐',
  desc: '高い台地をうねる峡谷が割る。谷底の曲がりくねった道（真ん中のオアシスに陸の竜脈）と、谷を見下ろす両側の台地の道',
  column,
  sky: { x: -9, z: 0, top: 10, r: 2.4, top_mat: B.SAND },
  veins: [{ x: 1.8, z: 0, layer: 'land' }, { x: -21.5, z: 0, layer: 'sea' }, { x: -9, z: 0, layer: 'air' }],
  laneAt(x, z) {
    const zz = Math.abs(z);
    if (inCanyon(x, zz)) return 1;
    return x < canyonX(zz) ? 0 : 2;
  },
  laneNames: ['西の台地', 'うねる峡谷', '東の台地'],
  cpuSpawns: [[2, 5.5, 13.5, 16.5, 0.4], [-15, -10, 11, 16, 0.3], [10, 15, 11, 16, 0.3]],
  high: [{ x: canyonX(4) + 3.5, z: 4 }, { x: canyonX(9) - 3.5, z: 9 }, { x: canyonX(14) + 3.5, z: 14 }, { x: -4.5, z: 3 }],
  weather: [{ kind: 'sand', x0: -22, x1: 20, z0: 0, z1: 30, mirror: true, count: 420 }],
};
