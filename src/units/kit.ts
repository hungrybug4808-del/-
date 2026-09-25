import * as THREE from 'three';
import { eIn, eOut, kf, rnd, seg, type Key } from '../core/math';
import { Vox, part } from '../core/voxel';
import { addShake, dust, ring, solid, sparkle } from '../fx/effects';
import { canHit, hurt, hurtBld, inRange, targetAlive } from '../battle/world';
import type { Pose, Rig, Unit } from './types';

// キャラクター作りの共通部品

export type Piv = [number, number, number];

/**
 * ボクセル配置を関節パーツにして親に付ける。
 * どのパーツも同じ「モデルの座標」（ボクセル単位）で描き、piv はその関節の位置。
 */
export function joint(parent: THREE.Object3D, parentPiv: Piv, key: string, v: Vox, piv: Piv, s: number, mat: THREE.Material, flat = false): THREE.Group {
  const g = part(key, v, piv[0], piv[1], piv[2], s, mat, flat);
  g.position.set((piv[0] - parentPiv[0]) * s, (piv[1] - parentPiv[1]) * s, (piv[2] - parentPiv[2]) * s);
  parent.add(g);
  return g;
}
/** 目印（手の先・口など）を関節に付ける */
export function anchor(parent: THREE.Object3D, parentPiv: Piv, p: Piv, s: number): THREE.Object3D {
  const o = new THREE.Object3D();
  o.position.set((p[0] - parentPiv[0]) * s, (p[1] - parentPiv[1]) * s, (p[2] - parentPiv[2]) * s);
  parent.add(o);
  return o;
}
export function newRoot(): THREE.Group {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  return g;
}

/** ポーズのキーを関節の回転に割り当てる [パーツ名, 軸, ポーズのキー] */
export type Bind = readonly [string, 'x' | 'y' | 'z', string];
export function applyRig(u: Unit<any>, binds: readonly Bind[]): void {
  const r = u.rig, P = u.P;
  r.root.position.set(u.pos.x, u.pos.y + (P.rootY ?? 0), u.pos.z);
  r.root.rotation.set(P.rootRX ?? 0, u.yawS, P.rootRZ ?? 0);
  for (const [g, ax, k] of binds) (r[g] as THREE.Object3D).rotation[ax] = P[k];
}

export const K = (t: number) => (keys: Key[]) => kf(keys, t);

// ---- 撃破 ----
/** 後ろ（dir=-1）か前（dir=1）へ倒れて、魔素の粒になって消える */
export function fallDeath(u: Unit, T: Pose, dir: number, heavy = false): void {
  const t = u.st, k = K(t), d = heavy ? 1.4 : 1;
  T.rootRX = dir * k([[0, 0], [0.15 * d, -0.15], [0.6 * d, 1.45, eIn], [0.72 * d, 1.35, eOut], [0.82 * d, 1.42]]);
  T.rootY = (T.rootY ?? 0) + 0.2 * seg(t, 0.1, 0.6 * d);
  T.rootS = 1 - eIn(seg(t, 0.9 * d, 1.6 * d));
  if (t >= 0.6 * d && !u.fired.thud) {
    u.fired.thud = 1;
    if (heavy) addShake(0.15);
    dust(u.pos, heavy ? 14 : 6, heavy ? 1.2 : 0.7);
  }
}
/** 水の中へ沈んで消える（海） */
export function sinkDeath(u: Unit, T: Pose): void {
  const t = u.st, k = K(t);
  T.rootRZ = k([[0, 0], [0.3, 0.35], [1.4, 0.6]]);
  T.rootY = (T.rootY ?? 0) - 1.4 * eIn(seg(t, 0.2, 1.6));
  T.rootS = 1 - eIn(seg(t, 1.0, 1.8));
  if (Math.random() < 0.5) solid.spawn({ x: u.pos.x + rnd(-0.5, 0.5), y: u.pos.y + 0.05, z: u.pos.z + rnd(-0.5, 0.5) }, { x: 0, y: rnd(0.8, 1.6), z: 0 }, rnd(0.3, 0.6), rnd(0.06, 0.12), 0xdff4ff, 0);
}
/** きりもみで墜落し、地面にぶつかって消える（空） */
export function airFall(u: Unit, T: Pose, base: number): void {
  const t = u.st, k = K(t);
  T.rootY = k([[0, base], [0.3, base + 0.25], [1.0, 0.4, eIn]]);
  T.rootRZ = k([[0, 0], [0.3, -0.3], [1.0, 1.3, eIn], [1.2, 1.2]]);
  T.rootRX = k([[0, 0], [0.3, -0.4], [1.0, 0.3]]);
  T.rootS = 1 - eIn(seg(t, 1.4, 2.2));
  if (t >= 1.0 && !u.fired.crash) {
    u.fired.crash = 1;
    addShake(0.08);
    ring({ x: u.pos.x, z: u.pos.z }, 0xd9cdb5, 2, 0.5);
    dust({ x: u.pos.x, z: u.pos.z }, 12, 1.2);
  }
}

/** 羽ばたき。体の上下と翼の角度に使う sin を返す */
export function flap(u: Unit, dt: number, freq: number): number {
  u.fp += dt * freq;
  return Math.sin(u.fp);
}

/** 近接の一撃。攻撃の途中の at 秒に一度だけ、まだ届いていれば当てる */
export function strike(u: Unit, at: number, dmg: number, bldDmg = dmg): boolean {
  if (u.st < at || u.fired.hit) return false;
  u.fired.hit = 1;
  const t = u.target;
  if (!t || !targetAlive(t) || !canHit(u, t) || !inRange(u)) return false;
  if (t.isBld) hurtBld(t, bldDmg);
  else hurt(t, dmg);
  return true;
}

/** 水しぶき */
export function splash(p: { x: number; y: number; z: number }, n: number, power = 1): void {
  for (let i = 0; i < n; i++)
    solid.spawn({ x: p.x + rnd(-0.3, 0.3), y: p.y + 0.05, z: p.z + rnd(-0.3, 0.3) }, { x: rnd(-1.5, 1.5) * power, y: rnd(2, 4) * power, z: rnd(-1.5, 1.5) * power }, rnd(0.5, 0.9), rnd(0.07, 0.14), i % 3 ? 0xeaf6ff : 0x9fd4f5, 9);
  ring(p, 0xeaf6ff, 1.6 * power, 0.45);
}

/**
 * 羽の翼（右翼。左は mirror()）。付け根から +x へ len だけ伸び、後ろ（-z）の縁は羽先がぎざぎざ。
 * col(i) は付け根からの距離 i での色。
 */
export function featherWing(len: number, width: number, col: (i: number, edge: boolean) => number): Vox {
  const v = new Vox();
  for (let i = 0; i < len; i++) {
    const w = Math.max(2, Math.round(width * (1 - (i / len) * 0.45)));
    const tip = i % 2 === 0 ? 1 : 0;
    for (let z = -w - tip; z <= 1; z++) v.set(i, 0, z, col(i, z <= -w + 1));
  }
  v.box(0, 1, -1, Math.ceil(len * 0.4), 1, 2, col(0, false));
  return v;
}

export { sparkle };
export type { Rig };
