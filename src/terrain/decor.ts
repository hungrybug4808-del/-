import { hash } from '../core/math';
import { Bio } from './biomes';
import { MAP, RAMP, RIDGE } from './generate';
import { CELL, NX, NZ, biome, colOf, cx, cz, level, walkY, waterDepth } from './grid';
import { DS, Decor } from './mesh';

// 地形ごとの飾り。0.25 のボクセルで組む（キャラクターの細かさに近づける）

const LEAF = [0x3f7f3a, 0x4e9444, 0x5fa84f];
const PINE = [0x2f6b45, 0x3a7a50];
const BARK = 0x6b4a2e, BARK_D = 0x4f3620, DEAD = 0x7a6650;
const leaf = (x: number, y: number, z: number) => LEAF[Math.floor(hash(x, y, z) * 3)];

function oak(d: Decor, x: number, y: number, z: number, r: number): void {
  const th = 5 + Math.floor(r * 4);
  d.box(x, y, z, 2, th, 2, BARK);
  const w = 6, h = 4, x0 = x - 2, z0 = z - 2, y0 = y + th - 1;
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) {
    const edge = (i === 0 || i === w - 1) && (k === 0 || k === w - 1);
    if (edge && (j === 0 || j === h - 1 || hash(x0 + i, y0 + j, z0 + k) > 0.4)) continue;
    d.set(x0 + i, y0 + j, z0 + k, leaf(x0 + i, y0 + j, z0 + k));
  }
  d.box(x - 1, y0 + h, z - 1, 4, 1, 4, leaf);
}
function pine(d: Decor, x: number, y: number, z: number, snow: boolean): void {
  d.box(x, y, z, 1, 3, 1, BARK_D);
  let yy = y + 2;
  for (const w of [7, 5, 5, 3, 1]) {
    const o = (w - 1) / 2;
    for (let i = 0; i < w; i++) for (let k = 0; k < w; k++) {
      if ((i === 0 || i === w - 1) && (k === 0 || k === w - 1) && w > 1) continue;
      d.set(x - o + i, yy, z - o + k, snow && (w <= 3 || hash(x + i, yy, z + k) > 0.6) ? 0xf2f6fa : PINE[(i + k) & 1]);
      d.set(x - o + i, yy + 1, z - o + k, PINE[(i + k + 1) & 1]);
    }
    yy += w === 7 ? 2 : 2;
  }
  if (snow) d.set(x, yy, z, 0xf2f6fa);
}
function deadTree(d: Decor, x: number, y: number, z: number, r: number): void {
  const h = 5 + Math.floor(r * 3);
  d.box(x, y, z, 1, h, 1, DEAD);
  d.box(x + 1, y + h - 2, z, 2, 1, 1, DEAD); d.set(x + 2, y + h - 1, z, DEAD);
  d.box(x - 2, y + h - 3, z, 2, 1, 1, DEAD); d.set(x - 2, y + h - 2, z, DEAD);
  d.box(x, y + h - 1, z - 1, 1, 1, 1, DEAD);
}
function cactus(d: Decor, x: number, y: number, z: number, r: number): void {
  const h = 4 + Math.floor(r * 3), G = 0x4f8f3a, G2 = 0x3f7a30;
  d.box(x, y, z, 1, h, 1, G);
  d.box(x + 1, y + 2, z, 1, 1, 1, G2); d.box(x + 2, y + 2, z, 1, 2, 1, G);
  if (r > 0.5) { d.box(x - 1, y + 3, z, 1, 1, 1, G2); d.box(x - 2, y + 3, z, 1, 2, 1, G); }
}
function palm(d: Decor, x: number, y: number, z: number): void {
  const P = [0x3f9a4a, 0x55b35a];
  for (let j = 0; j < 8; j++) d.set(x + (j > 4 ? 1 : 0), y + j, z, j & 1 ? 0x9a7a50 : 0x8a6a42);
  const tx = x + 1, ty = y + 8;
  d.set(tx, ty, z, P[0]);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= 3; k++) d.set(tx + dx * k, ty - (k === 3 ? 1 : 0), z + dz * k, P[k & 1]);
}
function rock(d: Decor, x: number, y: number, z: number, r: number): void {
  const S = [0x8a8f99, 0x9da3ad, 0x6e737c];
  d.box(x, y, z, 2 + (r > 0.5 ? 1 : 0), 1 + (r > 0.7 ? 1 : 0), 2, (a, b, c) => S[Math.floor(hash(a, b, c) * 3)]);
}
function tuft(d: Decor, x: number, y: number, z: number, c: number, h = 1): void {
  d.box(x, y, z, 1, h, 1, c);
}

/** 飾りを置かない場所（道・城と砦のまわり・竜脈） */
function reserved(x: number, z: number): boolean {
  const zz = Math.abs(z);
  if (Math.abs(x) <= 1.8 && x > -8 && x < 5) return true;
  if (zz >= 25 && Math.abs(x) <= 8) return true;
  if (Math.hypot(x, zz - MAP.fortZ) < 3) return true;
  if (Math.hypot(x - MAP.hill.x, z - MAP.hill.z) < 2.4) return true;
  // 坂と峠は道なので空けておく
  if (x >= RAMP.x0 - 0.5 && x < RAMP.x1 && zz >= RAMP.z0 - 0.5 && zz < RAMP.z1 + 0.5) return true;
  if (x >= RIDGE.x0 - 1 && x < RIDGE.x1 + 1 && zz >= RIDGE.pass[0] - 0.5 && zz < RIDGE.pass[1] + 0.5) return true;
  return false;
}

export function buildDecor(): Decor {
  const d = new Decor();
  for (let iz = 0; iz < NZ; iz++)
    for (let ix = 0; ix < NX; ix++) {
      const c = colOf(ix, iz);
      if (level[c] < 0) continue;
      const x = cx(ix), z = cz(iz);
      if (reserved(x, z)) continue;
      const bio = biome[c] as Bio, wet = waterDepth[c] > 0;
      // 左右対称のマップなので、飾りも |z| で決める
      const zz = Math.abs(z), p = hash(ix, Math.round(zz / CELL), 5), r = hash(ix, Math.round(zz / CELL), 9);
      const vx = Math.round((x - CELL / 2) / DS) + (r > 0.5 ? 1 : 0), vz = Math.round((z - CELL / 2) / DS) + (p > 0.03 ? 1 : 0);
      const vy = Math.round(walkY[c] / DS);
      if (wet) {
        if (bio === Bio.SWAMP && p < 0.12) tuft(d, vx, vy, vz, 0x9aa05a, 3 + Math.floor(r * 2));
        continue;
      }
      switch (bio) {
        case Bio.FOREST: if (p < 0.12) (r < 0.3 ? pine(d, vx, vy, vz, false) : oak(d, vx, vy, vz, r)); else if (p < 0.2) tuft(d, vx, vy, vz, 0x4e8f3a); break;
        case Bio.HILLS: if (p < 0.02) oak(d, vx, vy, vz, r); else if (p < 0.08) tuft(d, vx, vy, vz, 0x5f9a45); break;
        case Bio.HIGHLAND: case Bio.VALLEY: if (p < 0.01) oak(d, vx, vy, vz, r); else if (p < 0.05) tuft(d, vx, vy, vz, r < 0.5 ? 0xf0d040 : 0x5f9a45); break;
        case Bio.GRASSLAND: if (p < 0.14) tuft(d, vx, vy, vz, r < 0.25 ? 0xe05050 : r < 0.5 ? 0xf0d040 : r < 0.62 ? 0xf6f2f0 : 0x6fae4a, r < 0.62 ? 1 : 2); break;
        case Bio.PLAIN: if (p < 0.04) tuft(d, vx, vy, vz, 0x5f9a45, 1 + (r > 0.5 ? 1 : 0)); break;
        case Bio.MOUNTAIN: if (walkY[c] < 7 && p < 0.08) pine(d, vx, vy, vz, false); else if (p < 0.12) rock(d, vx, vy, vz, r); break;
        case Bio.ALPINE: if (walkY[c] < 10.5 && p < 0.04) pine(d, vx, vy, vz, true); break;
        case Bio.DESERT: if (p < 0.018) cactus(d, vx, vy, vz, r); else if (p < 0.03) rock(d, vx, vy, vz, r); break;
        case Bio.WASTE: if (p < 0.02) deadTree(d, vx, vy, vz, r); else if (p < 0.06) rock(d, vx, vy, vz, r); else if (p < 0.09) tuft(d, vx, vy, vz, 0x9a8a50); break;
        case Bio.SWAMP: if (p < 0.05) deadTree(d, vx, vy, vz, r); else if (p < 0.16) tuft(d, vx, vy, vz, 0x7a8a4a, 2); break;
        case Bio.ISLAND: if (walkY[c] >= 0.5 && p < 0.25) palm(d, vx, vy, vz); break;
        case Bio.BEACH: if (p < 0.012) palm(d, vx, vy, vz); break;
        case Bio.COAST: if (p < 0.05) rock(d, vx, vy, vz, r); break;
      }
    }
  return d;
}
