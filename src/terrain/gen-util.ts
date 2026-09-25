import { hash } from '../core/math';
import { Bio } from './biomes';
import { B, CELL } from './grid';

// 地形づくりの共通部品（ノイズ、高さのそろえ方、列の型）。z は |z| で使うので、どのワールドも左右対称になる

const sm = (x: number) => x * x * (3 - 2 * x);
/** 値ノイズ（0〜1） */
export function vn(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z), u = sm(x - xi), v = sm(z - zi);
  const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed), c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export const fbm = (x: number, z: number, seed: number) =>
  0.5 * vn(x / 6, z / 6, seed) + 0.3 * vn(x / 3, z / 3, seed + 1) + 0.2 * vn(x / 1.5, z / 1.5, seed + 2);
export const smooth = (a: number, b: number, x: number) => sm(Math.min(1, Math.max(0, (x - a) / (b - a))));
/** ブロックの高さにそろえる */
export const q = (y: number) => Math.round(y / CELL) * CELL;

/** 1列ぶんの地形 */
export interface Col {
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

/** どのワールドも同じ：魔王城は z=±30、背中側（|z|>33）は海、城の前庭は |x|<=7.5 */
export const CASTLE_Z = 30, FORT_Z = 20;
export function backSea(zz: number): Col | null {
  if (zz <= 33) return null;
  return { h: q(Math.max(-3, -1.0 - (zz - 33) * 1.2)), mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.SEA };
}
export function castleYard(x: number, zz: number, ground: B = B.GRASS): Col | null {
  if (zz < 25.5 || Math.abs(x) > 7.5) return null;
  return { h: 0, mat: Math.abs(x) <= 1.5 ? B.PATH : ground, sub: B.DIRT, bio: Bio.PLAIN };
}
