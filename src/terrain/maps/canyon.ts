import { hash } from '../../core/math';
import { Bio } from '../biomes';
import { B } from '../grid';
import { type Col, MOAT, MOAT_X, castleYard, inMap, moat, moatRim, q, smooth, vn } from '../gen-util';
import type { MapDef } from './types';

// 峡谷の国（乾燥・砂嵐）：赤い地層の台地を、うねる峡谷が割っている。まわりは岩山（ビュート）の並ぶ荒野。
// 陸の道は、西の台地の上・うねる峡谷の底（真ん中のオアシスに陸の竜脈）・東の台地の上の3本。
// 谷底には川が流れ（海のモンスターの道）、オアシスの泉を通って、陣地で2つに分かれて両方の堀へ注ぐ。
// 台地の上は峡谷を見下ろす高台で、谷底の敵を上から撃てる。台地へは陣地の近くの坂から上がる。
// 峡谷には天然の石のアーチが架かる（下をくぐれる）。空の竜脈は、西の台地にそびえる岩山の上。

const BASIN_Z = 18, MESA_H = 4;
/** 峡谷の中心の x（陣地の口から、東へふくらんで、真ん中のオアシスへ） */
export const canyonX = (zz: number) => (zz < BASIN_Z ? 8 * Math.sin((Math.PI * zz) / BASIN_Z) : 0);
const CANYON_HALF = 3.25, RIVER_HALF = 1, OASIS_R = 5.5, POOL = { x: -2.5, r: 2.2 }, MOUTH_Z = 17.5;
/** 川は峡谷の西の壁ぞいを流れる（東側が広い河原） */
const riverX = (zz: number) => canyonX(zz) - (CANYON_HALF - RIVER_HALF - 0.25);
const ARCH = { z0: 7.75, z1: 9.25, y0: 4, y1: 5 };
const BUTTE = { x: -11, z: 0, r: 2, top: 10 };
const inCanyon = (x: number, zz: number) => Math.abs(x - canyonX(zz)) < CANYON_HALF || Math.hypot(x, zz) < OASIS_R;
/** 陣地で2つに分かれる浅い流れの中心の |x| */
const armX = (zz: number) => MOAT_X * smooth(MOUTH_Z, MOAT.z0, zz);

/** 崖の地層（赤・橙・白の縞） */
const BANDS = [B.RED, B.RED, B.ORANGE, B.CREAM, B.ORANGE, B.RED, B.CREAM, B.ORANGE];
const strata = (y: number) => BANDS[(((Math.floor(y * 2) % 8) + 8) % 8)];
const rock = (h: number, mat: B = B.DRY, bio = Bio.WASTE): Col => ({ h: q(h), mat, sub: B.RED, strata, bio });

/** 遠景：荒野に並ぶ岩山（格子ごとに1つ、平らな頂） */
function buttes(x: number, zz: number): number {
  const G = 11, gx = Math.floor(x / G), gz = Math.floor(zz / G);
  let best = 0;
  for (let i = -1; i <= 1; i++)
    for (let k = -1; k <= 1; k++) {
      const a = gx + i, b = gz + k;
      if (hash(a, b, 501) < 0.35) continue;
      const px = (a + 0.25 + 0.5 * hash(a, b, 502)) * G, pz = (b + 0.25 + 0.5 * hash(a, b, 503)) * G;
      const r = 1.8 + 3.2 * hash(a, b, 504), d = Math.hypot((x - px) * (1 + hash(a, b, 506)), zz - pz);
      if (d < r) best = Math.max(best, 8 + 12 * hash(a, b, 505) - (d > r - 0.8 ? 1.5 : 0));
    }
  return best;
}

function column(x: number, zz: number): Col {
  if (!inMap(x, zz)) {
    // 台地の高さの荒野と、岩山。城の背中側は盆地から崖で上がる
    const b = buttes(x, zz);
    if (b > 0) return rock(MESA_H + b, B.DRY, Bio.WASTE);
    const base = zz > 36 && Math.abs(x) < 24 ? MESA_H * smooth(36, 39, zz) : MESA_H;
    return { h: q(base + 0.8 * vn(x / 5, zz / 5, 507)), mat: vn(x / 6, zz / 6, 509) > 0.45 ? B.SAND : B.DRY, sub: B.RED, strata, bio: Bio.DESERT };
  }
  const m = moat(x, zz);
  if (m) return m;
  if (moatRim(x, zz)) return rock(0.5, B.CREAM, Bio.COAST);
  const yard = castleYard(x, zz, B.SAND);
  if (yard) return { ...yard, bio: Bio.DESERT };
  // 城の背中側と、左右のふちの赤い岩壁
  if (zz >= MOAT.back1) return rock(MESA_H * smooth(35.5, 37, zz));
  if (Math.abs(x) >= 21.5) return rock(MESA_H + 1.5 + (Math.abs(x) - 21.5) * 2 + 1.5 * vn(x / 2, zz / 2, 511));

  // 陣地の盆地（川が2つの浅い流れに分かれて堀へ）
  if (zz >= BASIN_Z || (zz >= MOUTH_Z && Math.abs(x) < CANYON_HALF)) {
    if (zz < MOAT.z0 && Math.abs(Math.abs(x) - armX(zz)) < 1) return { h: -0.5, mat: B.SAND, sub: B.SAND, water: 0, bio: Bio.RIVER };
    return { h: 0, mat: Math.abs(x) <= 1.5 ? B.PATH : B.SAND, sub: B.SAND, bio: Bio.DESERT };
  }
  // 台地へ上がる坂（西・東）
  if (zz >= BASIN_Z - 4 && Math.abs(x) >= 10 && Math.abs(x) < 16 && !inCanyon(x, zz))
    return { h: q((MESA_H * (BASIN_Z - zz)) / 4), mat: B.PATH, sub: B.RED, strata, bio: Bio.DESERT };

  // 峡谷の底：川と河原、オアシスの泉とヤシ。天然のアーチ
  if (inCanyon(x, zz)) {
    const arch: [number, number] | undefined = zz >= ARCH.z0 && zz < ARCH.z1 && Math.hypot(x, zz) >= OASIS_R ? [ARCH.y0, ARCH.y1 - 0.5 * Math.abs(zz - (ARCH.z0 + ARCH.z1) / 2)] : undefined;
    const dp = Math.hypot(x, zz), dq = Math.hypot(x - POOL.x, zz);
    let c: Col;
    if (dq < POOL.r) c = { h: dq < POOL.r - 1 ? -2 : -1, mat: B.SAND, sub: B.SAND, water: 0, bio: Bio.LAKE };
    else if (Math.abs(x - riverX(zz)) < RIVER_HALF) c = { h: -1.5, mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.RIVER };
    else if (dp < OASIS_R) c = { h: 0.5, mat: B.GRASS, sub: B.SAND, bio: Bio.ISLAND };
    else c = { h: 0, mat: vn(x / 2, zz / 2, 513) > 0.5 ? B.SAND : B.GRAVEL, sub: B.SAND, bio: Bio.VALLEY };
    return arch ? { ...c, arch, mat: c.mat, sub: B.RED, strata } : c;
  }
  // 西の台地にそびえる岩山（空の竜脈）
  const db = Math.hypot(x - BUTTE.x, zz - BUTTE.z);
  if (db < BUTTE.r) return rock(BUTTE.top, B.CREAM, Bio.WASTE);
  if (db < BUTTE.r + 0.7) return rock(BUTTE.top - 2.5);
  // 台地の上（砂丘と、ところどころ岩の柱）
  const p = vn(x / 1.6, zz / 1.6, 41);
  if (p > 0.9) return rock(MESA_H + 1.5 + 3 * (p - 0.9) / 0.1);
  return { h: q(MESA_H + 0.6 * vn(x / 2.5, zz / 2.5, 21)), mat: vn(x / 4, zz / 4, 23) > 0.5 ? B.SAND : B.DRY, sub: B.RED, strata, bio: Bio.DESERT };
}

export const canyon: MapDef = {
  id: 'canyon', name: '峡谷の国', icon: '🏜️', climate: '乾燥・砂嵐',
  desc: '赤い地層の台地を、川の流れる峡谷がうねりながら割る。谷底の道（オアシスに陸の竜脈、天然のアーチ）と、谷を見下ろす両側の台地の道',
  column,
  veins: [{ x: 2.5, z: 0, layer: 'land' }, { x: POOL.x, z: 0, layer: 'sea' }, { x: BUTTE.x, z: BUTTE.z, layer: 'air' }],
  laneAt(x, z) {
    const zz = Math.abs(z);
    if (inCanyon(x, zz)) return 1;
    return x < canyonX(zz) ? 0 : 2;
  },
  laneNames: ['西の台地', 'うねる峡谷', '東の台地'],
  cpuSpawns: [[-3, 3, 18.5, 23, 0.4], [-15, -10, 10, 13.5, 0.3], [12, 16, 10, 13.5, 0.3]],
  high: [{ x: canyonX(4) + 4, z: 4 }, { x: canyonX(9) - 4, z: 9 }, { x: canyonX(14) + 4, z: 14 }, { x: -6.5, z: 3 }],
  weather: [{ kind: 'sand', x0: -22, x1: 20, z0: 0, z1: 30, mirror: true, count: 300 }],
};
