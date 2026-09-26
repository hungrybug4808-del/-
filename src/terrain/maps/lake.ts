import { hash } from '../../core/math';
import { Bio } from '../biomes';
import { B } from '../grid';
import { type Col, MOAT, castleYard, inMap, moat, q } from '../gen-util';
import type { Decor } from '../mesh';
import { DS } from '../mesh';
import type { MapDef } from './types';

// 湖水の国（温暖）：石灰岩の柱（カルスト）の林立する湖に浮かぶ、白い石の水の都。
// 街は左右対称の幾何学模様：真ん中に八角形の広場、南北にまっすぐな大通り、東西に回廊と四角い東屋。
// 陸の道は、水の上の3本の通路：西の回廊・中央の大通り（広場の台に陸の竜脈）・東の回廊。
// 通路の間はすべて水路（底に白と青の格子）。海のモンスターはどこでも泳げる（陣地の水路から城の堀へ）。
// 水路には渦潮があり、西の大渦の中心に海の竜脈、向かい合う東の石灰岩の柱の上に空の竜脈。
// 通路どうしは飛び石の浅瀬でつながり、旗で乗り換えられる。街は段になった白い城壁に囲まれる。

const WALK_H = 0.5, WALK_HALF = 1.5, AVENUE_HALF = 2, PLAZA_R = 5, SIDE_X = 13;
/** 陣地の石のテラス（|z| >= 16）。堀の腕と同じ所は水路 */
const TERRACE_Z = 16, TERRACE_X = 18.5;
/** 飛び石（乗り換え）と、陣地の水路の飛び石 */
const STONES = { z0: 11.5, z1: 12.5 }, CANAL_FORD = { z0: 19, z1: 21 };
/** 回廊の四角い東屋 [|z| の中心, 半分の大きさ] */
const PAVILIONS: [number, number][] = [[0, 3], [8, 2.5]];
/** 城壁（マップの左右のふちから外へ、段になって上がる） */
const WALL_X = 22.5;

/** 渦潮 [x, |z|]。最初の1つが海の竜脈（大渦） */
const WHIRLS: [number, number][] = [[-7.5, 0], [-6.75, 7.5], [6.75, 7.5]];
const WHIRL_R = 1.8;
/** 石灰岩の柱 [x, |z|, 半径, 高さ]（左右対称。最初の1つが空の竜脈） */
const PILLARS: [number, number, number, number][] = [
  [7.5, 0, 2.2, 9], [18.5, 4, 1.8, 11], [-18.5, 4, 1.8, 11], [18.5, 12, 1.5, 8.5], [-18.5, 12, 1.5, 8.5],
  [6.75, 14, 1.2, 7], [-6.75, 14, 1.2, 7],
];
const SKY = PILLARS[0];
/** 城壁から落ちる滝の |z| */
const FALLS_Z = 8;

/** 八角形の広場までの距離（正八角形の「半径」） */
const oct = (x: number, zz: number) => Math.max(Math.abs(x), zz, (Math.abs(x) + zz) * 0.7071);

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
      const top = 7 + 16 * hash(a, b, 405);
      if (d < r) best = Math.max(best, top * (d < r - 0.6 ? 1 : 0.85));
    }
  return best;
}
function pillarAt(x: number, zz: number): number {
  for (const [px, pz, r, top] of PILLARS) {
    const d = Math.hypot(x - px, zz - pz);
    if (d < r) return d < r - 0.5 ? top : top - 1.5;
  }
  return 0;
}
const karstCol = (h: number): Col => ({ h: q(h), mat: B.GRASS, sub: B.KARST, strata: () => B.KARST, bio: Bio.KARST });
/** 水路：底に 2 ごとの青い格子 */
function water(h = -1.5, x = 0.3, zz = 0.3): Col {
  const line = Math.abs(x - Math.round(x / 2) * 2) < 0.25 || Math.abs(zz - Math.round(zz / 2) * 2) < 0.25;
  return { h, mat: line ? B.AZURE : B.MARBLE, sub: B.MARBLE, water: 0, bio: Bio.CITY };
}
function walk(edge: boolean, h = WALK_H): Col {
  return { h, mat: edge ? B.AZURE : B.MARBLE, sub: B.MARBLE, bio: Bio.CITY };
}
/** 飛び石へ下りる一段 */
const step = (): Col => ({ h: 0, mat: B.MARBLE, sub: B.MARBLE, bio: Bio.CITY });
const inStones = (zz: number) => zz >= STONES.z0 && zz < STONES.z1;
/** 段になった白い城壁（ふちからの距離 d） */
const wall = (d: number): Col => ({ h: 3 + Math.floor(d / 1.5) * 1.5, mat: Math.floor(d / 1.5) % 2 ? B.AZURE : B.MARBLE, sub: B.MARBLE, strata: () => B.MARBLE, bio: Bio.CITY });

function column(x: number, zz: number): Col {
  const ax = Math.abs(x);
  if (!inMap(x, zz)) {
    // 城壁の外は、石灰岩の柱の林立する湖
    const d = Math.max(ax - WALL_X, zz - 36);
    if (d < 7.5) return wall(d);
    const k = karstField(x, zz);
    if (k > 0.5) return karstCol(k);
    return { h: -1, mat: B.MARBLE, sub: B.MARBLE, water: 0, bio: Bio.CITY };
  }
  const m = moat(x, zz);
  if (m) return { ...m, bio: Bio.CITY };
  const yard = castleYard(x, zz, B.MARBLE);
  if (yard) return { ...yard, h: WALK_H, mat: ax <= 1.5 ? B.AZURE : B.MARBLE, sub: B.MARBLE, bio: Bio.CITY };
  // 城の背中側：堀が左右の水路までつながる
  if (zz >= MOAT.back0 && ax <= WALL_X) return zz < MOAT.back1 ? water(-1.5, x, zz) : walk(false);

  // 城壁と、城壁から落ちる滝
  if (ax > WALL_X) return wall(ax - WALL_X);
  if (ax > WALL_X - 0.5 && Math.abs(zz - FALLS_Z) < 0.75) return { ...water(), falls: [0, 3] };
  const p = pillarAt(x, zz);
  if (p > 0) return karstCol(p);
  // 渦潮（外に青い輪）
  for (const [wx, wz] of WHIRLS) {
    const d = Math.hypot(x - wx, zz - wz);
    if (d < WHIRL_R) return { h: -3.5, mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.WHIRL };
    if (d < WHIRL_R + 0.5) return { h: -1.5, mat: B.AZURE, sub: B.MARBLE, water: 0, bio: Bio.CITY };
  }

  // 陣地の石のテラスと水路（堀の腕の延長）
  if (zz >= TERRACE_Z) {
    if (ax > MOAT.x0 && ax <= MOAT.x1) return zz >= CANAL_FORD.z0 && zz < CANAL_FORD.z1 ? { h: -0.5, mat: B.AZURE, sub: B.MARBLE, water: 0, bio: Bio.CITY } : water(-1.5, x, zz);
    if (zz >= CANAL_FORD.z0 && zz < CANAL_FORD.z1 && ((ax > MOAT.x0 - 0.5 && ax <= MOAT.x0) || (ax > MOAT.x1 && ax <= MOAT.x1 + 0.5))) return step();
    if (ax <= TERRACE_X) return walk(ax > TERRACE_X - 0.5 || zz < TERRACE_Z + 0.5 || Math.abs(zz - 20) < 0.25 && ax > MOAT.x1);
    return water(-1.5, x, zz);
  }
  // 八角形の広場：真ん中の台（陸の竜脈）・青い輪・ふち
  const o = oct(x, zz);
  if (o < 2) return walk(o > 1.5, 1);
  if (o < PLAZA_R) return walk(o > PLAZA_R - 0.5 || Math.abs(o - 3.5) < 0.25);
  // 中央の大通り（真ん中に青い線）
  if (ax <= AVENUE_HALF) return inStones(zz) && ax > AVENUE_HALF - 0.5 ? step() : walk(ax > AVENUE_HALF - 0.5 || ax < 0.25);
  // 西・東の回廊と四角い東屋
  const dw = Math.abs(ax - SIDE_X);
  for (const [pz, half] of PAVILIONS)
    if (dw <= half && Math.abs(zz - pz) <= half) return walk(dw > half - 0.5 || Math.abs(zz - pz) > half - 0.5 || (dw < 0.75 && Math.abs(zz - pz) < 0.75), dw < 0.75 && Math.abs(zz - pz) < 0.75 ? 1 : WALK_H);
  if (dw <= WALK_HALF) return inStones(zz) && ax < SIDE_X - WALK_HALF + 0.5 ? step() : walk(dw > WALK_HALF - 0.5);
  // 乗り換えの飛び石（浅瀬、白と青の市松）
  if (inStones(zz) && ax < SIDE_X) return { h: -0.5, mat: Math.floor(x) & 1 ? B.AZURE : B.MARBLE, sub: B.MARBLE, water: 0, bio: Bio.CITY };
  return water(-1.5, x, zz);
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
  desc: '石灰岩の柱が林立する湖に浮かぶ、左右対称の白い石の水の都。八角形の広場と3本の通路（西の回廊・中央の大通り・東の回廊）。水路には渦潮、まわりは全部水路で、海のモンスターはどこでも泳げる',
  column,
  veins: [{ x: 0, z: 0, layer: 'land' }, { x: WHIRLS[0][0], z: WHIRLS[0][1], layer: 'sea' }, { x: SKY[0], z: SKY[1], layer: 'air' }],
  whirlpools: WHIRLS.flatMap(([x, z]) => (z === 0 ? [{ x, z }] : [{ x, z }, { x, z: -z }])),
  laneAt(x, z) {
    const zz = Math.abs(z), ax = Math.abs(x);
    if (Math.abs(ax - SIDE_X) <= WALK_HALF + 0.5 || PAVILIONS.some(([pz, h]) => Math.abs(ax - SIDE_X) <= h + 0.5 && Math.abs(zz - pz) <= h + 0.5))
      return x < 0 ? 0 : 2;
    if (ax <= AVENUE_HALF + 0.5 || oct(x, zz) < PLAZA_R + 0.5) return 1;
    return -1;
  },
  laneNames: ['西の回廊', '中央の大通り', '東の回廊'],
  waterfalls: [-1, 1].flatMap(sx => [-1, 1].map(sz => ({ x: sx * (WALL_X - 0.25), z: sz * FALLS_Z, top: 3, bottom: 0 }))),
  cpuSpawns: [[-5, 5, 17, 23, 0.4], [-14, -12, 13, 15.5, 0.3], [12, 14, 13, 15.5, 0.3]],
  high: [{ x: 0, z: 1 }],
  weather: [],
  reserved: (x, zz) => pillarAt(x, zz) === 0,
  decorate(d) {
    for (const s of [1, -1]) {
      for (let zz = 6; zz < TERRACE_Z; zz += 2) for (const sx of [-1, 1]) lamp(d, sx * (AVENUE_HALF - 0.25), s * zz, WALK_H);
      for (const sx of [-1, 1]) {
        for (let zz = 4.5; zz < TERRACE_Z; zz += 2) if (Math.abs(zz - 8) > 3) for (const e of [-1, 1]) lamp(d, sx * (SIDE_X + e * (WALK_HALF - 0.25)), s * zz, WALK_H);
        for (const [pz, h] of PAVILIONS) for (const e of [-1, 1]) for (const f of [-1, 1]) lamp(d, sx * (SIDE_X + e * (h - 0.25)), s * (pz + f * (h - 0.25)), WALK_H);
        gate(d, sx * SIDE_X, s * TERRACE_Z, WALK_HALF, WALK_H);
      }
      gate(d, 0, s * TERRACE_Z, AVENUE_HALF, WALK_H);
    }
    // 広場の八つの角に灯り、左右に魚の像
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) * (Math.PI / 4), r = (PLAZA_R - 0.3) / Math.cos(Math.PI / 8);
      lamp(d, Math.cos(a) * r, Math.sin(a) * r, WALK_H);
    }
    statue(d, 3.2, 0, WALK_H, 1);
    statue(d, -3.2, 0, WALK_H, -1);
  },
};
