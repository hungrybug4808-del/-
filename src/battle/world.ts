import * as THREE from 'three';
import { cl } from '../core/math';
import { addShake } from '../fx/effects';
import type { Building, Target, Team, Unit, UnitState } from '../units/types';

// 戦場の共有状態と、ダメージ・距離などの基本ルール

export interface TeamInfo {
  color: number;
  /** 魔王城の中心の z */
  castleZ: number;
  /** 出撃できるのは z がこの値より自陣側 */
  half: number;
  dir: 1 | -1;
}

export const TEAM: [TeamInfo, TeamInfo] = [
  { color: 0x4aa3ff, castleZ: -32, half: -3, dir: 1 },
  { color: 0xff5a5a, castleZ: 32, half: 3, dir: -1 },
];
export const inOwnHalf = (team: Team, z: number) => (team === 0 ? z < TEAM[0].half : z > TEAM[1].half);

export const units: Unit[] = [];
export const blds: Building[] = [];

export const game = { over: false, winner: -1 as -1 | Team, endT: 0 };

/** 画面に短いメッセージを出す（UI 側が差し替える） */
export const notify = { toast: (_msg: string): void => {} };

/** 高台の射程アップ：相手より 1 高いごとに +0.5、最大 +2 */
export const HIGH_GROUND_PER = 0.5, HIGH_GROUND_MAX = 2;
/** 近接攻撃が届く高さの差 */
export const MELEE_DY = 1.0;

export function setState(u: Unit, s: UnitState): void {
  u.state = s;
  u.st = 0;
  u.fired = {};
}
export function alive(e: Unit | null | undefined): e is Unit {
  return !!e && e.state !== 'dead' && !e.remove;
}
export function bldAlive(b: Building): boolean {
  return b.hp > 0;
}
export function targetAlive(t: Target): boolean {
  return t.isBld ? bldAlive(t) : alive(t);
}
export function validTarget(u: Unit): boolean {
  return !!u.target && targetAlive(u.target);
}
export function hdist(a: { pos: THREE.Vector3 }, b: { pos: THREE.Vector3 }): number {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
}

/** 建物の上で、(x,z) に一番近い点（魔王城は横に長い箱、砦は円） */
export function bldPoint(b: Building, x: number, z: number): { x: number; z: number } {
  if (b.box) return { x: cl(x, b.box.x0, b.box.x1), z: cl(z, b.box.z0, b.box.z1) };
  const dx = x - b.pos.x, dz = z - b.pos.z, d = Math.hypot(dx, dz) || 1, r = Math.min(d, b.radius);
  return { x: b.pos.x + (dx / d) * r, z: b.pos.z + (dz / d) * r };
}
export function bldDist(u: { pos: THREE.Vector3 }, b: Building): number {
  const p = bldPoint(b, u.pos.x, u.pos.z);
  return Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
}

/** 狙われる点の高さ */
function aimY(t: Target): number {
  if (t.isBld) return t.pos.y + t.aimH;
  return t.pos.y + (t.air ? 2.6 : t.d.hitH);
}
/** 狙う点。from は攻撃する側の位置（魔王城は近い面を狙う） */
export function aimPoint(t: Target, from: { x: number; z: number }): THREE.Vector3 {
  if (t.isBld) {
    const p = bldPoint(t, from.x, from.z);
    return new THREE.Vector3(p.x, aimY(t), p.z);
  }
  return new THREE.Vector3(t.pos.x, aimY(t), t.pos.z);
}

/** 遠距離モンスターの射程。陸の遠距離は高い所にいるほど伸びる */
export function rangeOf(u: Unit, t: Target): number {
  const r = u.d.range;
  if (!u.d.ranged || u.air) return r;
  const ty = t.isBld ? t.pos.y : t.pos.y;
  return r + cl((u.pos.y - ty) * HIGH_GROUND_PER, 0, HIGH_GROUND_MAX);
}

/** 近接は同じ場所（陸どうし）で、段差の上下にいない相手だけ */
export function canHit(u: Unit, t: Target): boolean {
  if (t.isBld) return u.d.ranged || u.air || Math.abs(u.pos.y - t.pos.y) <= MELEE_DY;
  if (t.air && !u.d.hitAir) return false;
  if (!u.d.ranged && !u.air && !t.air && Math.abs(u.pos.y - t.pos.y) > MELEE_DY) return false;
  return true;
}

export function inRange(u: Unit): boolean {
  const t = u.target!;
  if (!canHit(u, t)) return false;
  if (t.isBld) return bldDist(u, t) <= rangeOf(u, t) + 0.1;
  return hdist(u, t) - t.radius - u.radius * 0.5 <= rangeOf(u, t);
}

export function hurt(e: Unit, dmg: number): void {
  if (!alive(e)) return;
  e.hp -= dmg;
  e.flash = 1;
  if (e.hp <= 0) {
    e.hp = 0;
    setState(e, 'dead');
  }
}
export function hurtBld(b: Building, dmg: number): void {
  if (b.hp <= 0) return;
  b.hp = Math.max(0, b.hp - dmg);
  b.flash = 1;
  if (b.hp > 0) return;
  b.fallT = 0;
  addShake(b.kind === 'castle' ? 0.6 : 0.35);
  if (b.kind === 'fort') notify.toast(b.team === 0 ? '自軍の砦が落とされた！' : '敵の砦を落とした！');
  if (b.kind === 'castle' && !game.over) {
    game.over = true;
    game.winner = (1 - b.team) as Team;
    game.endT = 0;
  }
}
