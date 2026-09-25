import * as THREE from 'three';
import { cl } from '../core/math';
import { addShake } from '../fx/effects';
import type { Building, Target, Team, Unit, UnitState } from '../units/types';

// 戦場の共有状態と、ダメージ・距離などの基本ルール

export interface TeamInfo {
  color: number;
  /** 魔王城の正面（攻撃を受ける面）の z */
  front: number;
  /** 出撃できる z の範囲 */
  zone: [number, number];
  dir: 1 | -1;
}

export const TEAM: [TeamInfo, TeamInfo] = [
  { color: 0x4aa3ff, front: -12.4, zone: [-11, -2], dir: 1 },
  { color: 0xff5a5a, front: 12.4, zone: [2, 11], dir: -1 },
];

export const units: Unit[] = [];
export const blds: Building[] = [];

export const game = { over: false, winner: -1 as -1 | Team, endT: 0 };

/** 画面に短いメッセージを出す（UI 側が差し替える） */
export const notify = { toast: (_msg: string): void => {} };

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
/** 建物までの距離。魔王城は横に長いので正面の面までの距離 */
export function bldDist(u: Unit, b: Building): number {
  return b.kind === 'castle' ? Math.abs(u.pos.z - TEAM[b.team].front) : hdist(u, b) - b.radius;
}
export function inRange(u: Unit): boolean {
  const t = u.target!;
  if (t.isBld) return bldDist(u, t) <= u.d.range + 0.1;
  return hdist(u, t) - t.radius - u.radius * 0.5 <= u.d.range;
}
/** 狙う点。x は攻撃する側の x（魔王城は正面のどこを狙うか） */
export function aimPoint(t: Target, x: number): THREE.Vector3 {
  if (t.isBld)
    return t.kind === 'castle'
      ? new THREE.Vector3(cl(x, -2.5, 2.5), 1.8, TEAM[t.team].front)
      : new THREE.Vector3(t.pos.x, 1.4, t.pos.z);
  return new THREE.Vector3(t.pos.x, t.air ? 2.6 : t.d.hitH, t.pos.z);
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
