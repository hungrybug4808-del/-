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
  /** 岩のアーチ（天然の橋）：下の面と上の面の高さ。下はくぐれる */
  arch?: [number, number];
  /** 崖の地層：高さ y のブロックの種類（sub より優先） */
  strata?: (y: number) => B;
  bio: Bio;
}

/** マップ（ブロックで作る範囲）の中か。外は遠景として粗く描くだけ */
export const inMap = (x: number, zz: number) => Math.abs(x) < 24 && zz < 36;

/**
 * どのワールドも同じ：魔王城は z=±30、砦は z=±20、城の前庭は |x|<=7.5・|z|>=25.5。
 * 前庭の左右と背中は堀（海のモンスターはここから魔王城を攻める）。堀の左右の腕は |z|=23.5 で前に開き、
 * ワールドの川や水路がここにつながる。
 */
export const CASTLE_Z = 30, FORT_Z = 20;
export const MOAT = { x0: 7.5, x1: 10, z0: 23.5, back0: 33, back1: 35.5 };
/** 堀の腕の中心の |x| */
export const MOAT_X = (MOAT.x0 + MOAT.x1) / 2;
export function moat(x: number, zz: number): Col | null {
  const ax = Math.abs(x);
  const arm = ax > MOAT.x0 && ax <= MOAT.x1 && zz >= MOAT.z0 && zz < MOAT.back1;
  const back = ax <= MOAT.x1 && zz >= MOAT.back0 && zz < MOAT.back1;
  if (!arm && !back) return null;
  return { h: -1.5, mat: B.GRAVEL, sub: B.STONE, water: 0, bio: Bio.MOAT };
}
/** 堀の外側の石垣の縁（堀のすぐ外、1列） */
export function moatRim(x: number, zz: number): boolean {
  const ax = Math.abs(x);
  return (ax > MOAT.x1 && ax <= MOAT.x1 + 0.5 && zz >= MOAT.z0 + 0.5 && zz < MOAT.back1 + 0.5)
    || (ax <= MOAT.x1 + 0.5 && zz >= MOAT.back1 && zz < MOAT.back1 + 0.5);
}
export function castleYard(x: number, zz: number, ground: B = B.GRASS): Col | null {
  if (zz < 25.5 || Math.abs(x) > MOAT.x0 || zz >= MOAT.back0) return null;
  return { h: 0, mat: Math.abs(x) <= 1.5 ? B.PATH : ground, sub: B.DIRT, bio: Bio.PLAIN };
}
