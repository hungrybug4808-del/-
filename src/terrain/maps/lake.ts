import { hash } from '../../core/math';
import { Bio } from '../biomes';
import { B } from '../grid';
import { type Col, MOAT, castleYard, inMap, moat, q, smooth, vn } from '../gen-util';
import type { Decor } from '../mesh';
import { DS } from '../mesh';
import type { MapDef } from './types';

// 湖水の国（温暖）：切り立った石灰岩の柱（カルスト）が林立する湖に浮かぶ、白い石の水の都。
// 陸の道は、水の上に架かる白い石の通路3本：西の回廊・中央の大通り（真ん中の広場に陸の竜脈）・東の回廊。
// 通路の間はすべて水路で、海のモンスターはどこでも泳げる（陣地の水路から城の堀へ）。
// 通路どうしは飛び石の浅瀬でつながり、旗で乗り換えられる。空の竜脈は石灰岩の柱の上。

const WALK_H = 0.5, WALK_HALF = 1.5, AVENUE_HALF = 2, PLAZA_R = 5;
/** 西・東の回廊の中心の x（ゆるく折れ曲がる） */
export const westX = (zz: number) => -13 + 2.2 * Math.sin(zz / 4);
export const eastX = (zz: number) => 13 + 2.2 * Math.sin(zz / 4 + 1.2);
/** 陣地の石のテラス（|z| >= 16）。堀の腕と同じ所は水路 */
const TERRACE_Z = 16, TERRACE_X = 18.5;
/** 飛び石（乗り換え）と、陣地の水路の飛び石 */
const STONES = { z0: 11.5, z1: 12.5 }, CANAL_FORD = { z0: 19, z1: 21 };

/** マップの中の石灰岩の柱 [x, |z|, 半径, 高さ] */
const PILLARS: [number, number, number, number][] = [
  [6.5, 0, 2.2, 9], [-7.5, 7.5, 1.5, 10.5], [7, 9, 1.3, 7.5], [-19.5, 4, 2, 12], [19.5, 9, 2.2, 11],
  [-5.5, 14, 1.1, 6.5], [20, 1, 1.6, 9.5], [-20.5, 13, 1.8, 8],
];
const SKY = PILLARS[0];
/** 左右の崖から落ちる滝の |z| */
const FALLS_Z = 5;

/** 遠景：石灰岩の柱が林立する湖（格子ごとに1本、位置をずらす） */
function karstField(x: number, zz: number): number {
  const G = 7, gx = Math.floor(x / G), gz = Math.floor(zz / G);
  let best = 0;
  for (let i = -1; i <= 1; i++)
    for (let k = -1; k <= 1; k++) {
      const a = gx + i, b = gz + k;
      if (hash(a, b, 401) < 0.25) continue;
      const px = (a + 0.2 + 0.6 * hash(a, b, 402)) * G, pz = (b + 0.2 + 0.6 * hash(a, b, 403)) * G;
      const r = 1.4 + 1.8 * hash(a, b, 404), d = Math.hypot(x - px, zz - pz);
      const d0 = Math.max(Math.abs(x) - 24, zz - 36, 0);
      const top = (7 + 16 * hash(a, b, 405)) * smooth(0, 12, d0 + 6);
      if (d < r) best = Math.max(best, top * (d < r - 0.6 ? 1 : 0.85));
    }
  return best;
}
function pillarAt(x: number, zz: number): number {
  for (const [px, pz, r, top] of PILLARS) {
    const d = Math.hypot(x - px, zz - pz) * (1 + 0.12 * (vn(x * 1.3, zz * 1.3, 407) - 0.5));
    if (d < r) return d < r - 0.5 ? top : top - 1.5;
  }
  return 0;
}
const karstCol = (h: number): Col => ({ h: q(h), mat: B.GRASS, sub: B.KARST, strata: () => B.KARST, bio: Bio.KARST });
const water = (h = -1.5): Col => ({ h, mat: B.MARBLE, sub: B.MARBLE, water: 0, bio: Bio.CITY });
function walk(edge: boolean, h = WALK_H): Col {
  return { h, mat: edge ? B.AZURE : B.MARBLE, sub: B.MARBLE, bio: Bio.CITY };
}
/** 飛び石へ下りる一段 */
const step = (): Col => ({ h: 0, mat: B.MARBLE, sub: B.MARBLE, bio: Bio.CITY });
const inStones = (zz: number) => zz >= STONES.z0 && zz < STONES.z1;

function column(x: number, zz: number): Col {
  if (!inMap(x, zz)) {
    // まわりは石灰岩の柱の林立する湖と、その奥の切り立った山
    const d = Math.max(Math.abs(x) - 24, zz - 36, 0);
    const k = karstField(x, zz);
    if (k > 0.5) return karstCol(k);
    const shore = d > 30 ? q(Math.min(3, (d - 30) * 0.2 + 2 * vn(x / 8, zz / 8, 409) - 1)) : -1;
    if (shore >= 0.5) return { h: shore, mat: B.GRASS, sub: B.DIRT, bio: Bio.FOREST };
    return water(-1);
  }
  const m = moat(x, zz);
  if (m) return { ...m, bio: Bio.CITY };
  const yard = castleYard(x, zz, B.MARBLE);
  if (yard) return { ...yard, h: WALK_H, mat: Math.abs(x) <= 1.5 ? B.AZURE : B.MARBLE, sub: B.MARBLE, bio: Bio.CITY };
  // 城の背中側：堀が左右の水路までつながる
  if (zz >= MOAT.back0 && Math.abs(x) <= 22.5) return zz < MOAT.back1 ? water() : walk(false);

  const p = pillarAt(x, zz);
  if (p > 0) return karstCol(p);
  // マップの左右のふちは切り立った崖（外の山へ）
  const edge = Math.abs(x) - 22.5;
  if (edge > -0.5 && edge <= 0 && Math.abs(zz - FALLS_Z) < 0.75) return { ...water(), falls: [0, 9] };
  if (edge > 0) return karstCol(4 + edge * 3 + 3 * vn(x, zz / 2, 411));

  // 陣地の石のテラスと水路（堀の腕の延長）
  if (zz >= TERRACE_Z) {
    const ax = Math.abs(x);
    if (ax > MOAT.x0 && ax <= MOAT.x1) return zz >= CANAL_FORD.z0 && zz < CANAL_FORD.z1 ? { h: -0.5, mat: B.AZURE, sub: B.MARBLE, water: 0, bio: Bio.CITY } : water();
    if (zz >= CANAL_FORD.z0 && zz < CANAL_FORD.z1 && ((ax > MOAT.x0 - 0.5 && ax <= MOAT.x0) || (ax > MOAT.x1 && ax <= MOAT.x1 + 0.5))) return step();
    if (ax <= TERRACE_X) return walk(ax > TERRACE_X - 0.5 || zz < TERRACE_Z + 0.5);
    return water();
  }
  // 中央の大通りと広場（中央に一段高い台、陸の竜脈）
  const dp = Math.hypot(x, zz);
  if (dp < 2) return walk(false, 1);
  if (dp < PLAZA_R) return walk(dp > PLAZA_R - 0.5);
  if (Math.abs(x) <= AVENUE_HALF) return inStones(zz) && Math.abs(x) > AVENUE_HALF - 0.5 ? step() : walk(Math.abs(x) > AVENUE_HALF - 0.5);
  // 西・東の回廊
  const dw = Math.abs(x - westX(zz)), de = Math.abs(x - eastX(zz));
  if (dw <= WALK_HALF) return inStones(zz) && x > westX(zz) + WALK_HALF - 0.5 ? step() : walk(dw > WALK_HALF - 0.5);
  if (de <= WALK_HALF) return inStones(zz) && x < eastX(zz) - WALK_HALF + 0.5 ? step() : walk(de > WALK_HALF - 0.5);
  // 乗り換えの飛び石（浅瀬）
  if (inStones(zz) && x > westX(zz) && x < eastX(zz)) return { h: -0.5, mat: B.AZURE, sub: B.MARBLE, water: 0, bio: Bio.CITY };
  return water(zz > 8 && Math.abs(x) < 20 ? -1.5 : -2);
}

// ---- 水の都の飾り：通路の灯り、広場の像、陣地の門 ----
const WHITE = 0xeef4f7, SHADE = 0xcfdde6, GLOW = 0x9ff0ff, BLUE = 0x4fb8e0;
function lamp(d: Decor, x: number, z: number, y: number): void {
  const vx = Math.round(x / DS), vz = Math.round(z / DS), vy = Math.round(y / DS);
  d.box(vx, vy, vz, 1, 6, 1, WHITE);
  d.box(vx - 1, vy + 6, vz - 1, 3, 1, 3, SHADE);
  d.box(vx, vy + 7, vz, 1, 2, 1, GLOW);
}
function gate(d: Decor, x: number, z: number, half: number, y: number): void {
  const vx0 = Math.round((x - half) / DS), vx1 = Math.round((x + half) / DS), vz = Math.round(z / DS), vy = Math.round(y / DS);
  for (const vx of [vx0, vx1 - 1]) d.box(vx, vy, vz, 1, 14, 2, WHITE);
  for (let vx = vx0; vx < vx1; vx++) {
    const t = (vx - vx0 + 0.5) / (vx1 - vx0), up = Math.round(3 * Math.sin(Math.PI * t));
    d.box(vx, vy + 13 + up, vz, 1, 2, 2, (vx & 1) ? WHITE : SHADE);
    if (Math.abs(t - 0.5) < 0.08) d.box(vx, vy + 15 + up, vz, 1, 2, 2, GLOW);
  }
}
function statue(d: Decor, x: number, z: number, y: number, dir: number): void {
  // 台座の上に、跳ねる魚の像
  const vx = Math.round(x / DS), vz = Math.round(z / DS), vy = Math.round(y / DS);
  d.box(vx - 1, vy, vz - 1, 3, 4, 3, SHADE);
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI, px = vx + Math.round(Math.cos(a) * 3 * dir), py = vy + 4 + Math.round(Math.sin(a) * 5);
    d.box(px, py, vz, 1, 2, 1, i === 0 ? BLUE : WHITE);
    if (i > 2 && i < 7) d.set(px, py, vz + 1, BLUE), d.set(px, py, vz - 1, BLUE);
  }
}

export const lake: MapDef = {
  id: 'lake', name: '湖水の国', icon: '🏞️', climate: '温暖',
  desc: '石灰岩の柱が林立する湖に浮かぶ、白い石の水の都。水の上の3本の通路（西の回廊・中央の大通り・東の回廊）。まわりは全部水路で、海のモンスターはどこでも泳げる',
  column,
  veins: [{ x: 0, z: 0, layer: 'land' }, { x: -8.25, z: 0, layer: 'sea' }, { x: SKY[0], z: SKY[1], layer: 'air' }],
  laneAt(x, z) {
    const zz = Math.abs(z);
    if (Math.abs(x - westX(zz)) <= WALK_HALF + 0.5) return 0;
    if (Math.abs(x) <= AVENUE_HALF + 0.5 || Math.hypot(x, zz) < PLAZA_R + 0.5) return 1;
    if (Math.abs(x - eastX(zz)) <= WALK_HALF + 0.5) return 2;
    return -1;
  },
  laneNames: ['西の回廊', '中央の大通り', '東の回廊'],
  waterfalls: [-1, 1].flatMap(sx => [-1, 1].map(sz => ({ x: sx * 22.25, z: sz * FALLS_Z, top: 9, bottom: 0 }))),
  cpuSpawns: [[-5, 5, 17, 23, 0.4], [-14.5, -12.5, 13, 15.5, 0.3], [10, 12, 13, 15.5, 0.3]],
  high: [{ x: 0, z: 1 }],
  weather: [],
  reserved: (x, zz) => pillarAt(x, zz) === 0,
  decorate(d) {
    for (const s of [1, -1]) {
      for (let zz = 2; zz < TERRACE_Z; zz += 3) {
        if (zz > PLAZA_R) for (const sx of [-1, 1]) lamp(d, sx * (AVENUE_HALF - 0.25), s * zz, WALK_H);
        lamp(d, westX(zz) - WALK_HALF + 0.25, s * zz, WALK_H);
        lamp(d, eastX(zz) + WALK_HALF - 0.25, s * zz, WALK_H);
      }
      gate(d, 0, s * TERRACE_Z, AVENUE_HALF, WALK_H);
      gate(d, westX(TERRACE_Z), s * TERRACE_Z, WALK_HALF, WALK_H);
      gate(d, eastX(TERRACE_Z), s * TERRACE_Z, WALK_HALF, WALK_H);
    }
    statue(d, 3.4, 0, WALK_H, 1);
    statue(d, -3.4, 0, WALK_H, -1);
  },
};
