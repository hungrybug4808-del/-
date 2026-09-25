import * as THREE from 'three';
import { rnd, vec } from '../core/math';
import { glow } from '../fx/effects';
import { scene } from '../render/stage';
import type { Target } from '../units/types';
import { aimPoint, alive, bldAlive, hurt, hurtBld } from './world';

// 飛び道具。狙いを追いかけて飛ぶ（必中）
//  arrow：山なりに飛ぶ矢（弓兵・ケンタウロス・砦）
//  note ：まっすぐ揺れながら飛ぶ歌の音符（セイレーン）
//  wind ：まっすぐ速く飛ぶ風の刃（天狗）

export type ShotKind = 'arrow' | 'note' | 'wind';

interface Shot {
  kind: ShotKind;
  g: THREE.Group;
  from: THREE.Vector3;
  end: THREE.Vector3;
  target: Target;
  from2: { x: number; z: number };
  s: number;
  dur: number;
  arc: number;
  dmg: number;
  prev: THREE.Vector3;
  color: number;
}

const shots: Shot[] = [];
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
const add = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const PARTS: Record<ShotKind, [THREE.BufferGeometry, THREE.Material, number, number, number][]> = {
  arrow: [[box(0.025, 0.025, 0.5), lam(0xc9a26b), 0, 0, -0.27], [box(0.05, 0.05, 0.07), lam(0x9aa3ad), 0, 0, -0.03], [box(0.08, 0.012, 0.1), lam(0xc8323a), 0, 0, -0.48]],
  // 八分音符の形
  note: [[box(0.16, 0.12, 0.12), add(0xff8fd8), 0, 0, 0], [box(0.035, 0.34, 0.035), add(0xffc8ee), 0.07, 0.17, 0], [box(0.12, 0.035, 0.035), add(0xffc8ee), 0.12, 0.33, 0]],
  // 三日月形の刃
  wind: [[box(0.5, 0.05, 0.1), add(0xc8ffe8), 0, 0, 0], [box(0.14, 0.05, 0.1), add(0x9ff0d0), 0.29, 0, -0.07], [box(0.14, 0.05, 0.1), add(0x9ff0d0), -0.29, 0, -0.07]],
};
const SPEED: Record<ShotKind, number> = { arrow: 13, note: 8, wind: 16 };
const HIT_COLOR: Record<ShotKind, number> = { arrow: 0xfff2b0, note: 0xff8fd8, wind: 0xc8ffe8 };
const V = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);

export function fireShot(kind: ShotKind, from: THREE.Vector3, target: Target, dmg: number, shooter: { x: number; z: number }): void {
  const g = new THREE.Group();
  for (const [geo, m, x, y, z] of PARTS[kind]) {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z);
    g.add(me);
  }
  const src = { x: shooter.x, z: shooter.z }, end = aimPoint(target, src), dist = from.distanceTo(end);
  scene.add(g);
  shots.push({
    kind, g, from: from.clone(), end, target, from2: src, s: 0, dur: dist / SPEED[kind] + 0.1,
    arc: kind === 'arrow' ? 0.2 + dist * 0.05 : 0, dmg, prev: from.clone(), color: HIT_COLOR[kind],
  });
}

/** 矢を放つ */
export function fireArrowFrom(from: THREE.Vector3, target: Target, dmg: number, shooter: { x: number; z: number }): void {
  fireShot('arrow', from, target, dmg, shooter);
}

export function updateArrows(dt: number): void {
  for (let i = shots.length - 1; i >= 0; i--) {
    const a = shots[i];
    a.s += dt / a.dur;
    if (a.target.isBld ? bldAlive(a.target) : alive(a.target)) a.end.copy(aimPoint(a.target, a.from2));
    const s = Math.min(a.s, 1);
    V.copy(a.from).lerp(a.end, s);
    V.y += a.arc * 4 * s * (1 - s);
    if (a.kind === 'note') V.y += 0.15 * Math.sin(s * 18);
    a.g.position.copy(V);
    if (a.kind === 'arrow') {
      const dir = V.clone().sub(a.prev);
      if (dir.lengthSq() > 1e-8) a.g.quaternion.setFromUnitVectors(FWD, dir.normalize());
    } else if (a.kind === 'wind') {
      a.g.lookAt(a.end);
      a.g.rotateZ(Math.sin(s * 30) * 0.3);
      if (Math.random() < 0.6) glow.spawn(vec(V.x, V.y, V.z), vec(rnd(-0.3, 0.3), rnd(-0.1, 0.3), rnd(-0.3, 0.3)), 0.3, 0.05, 0xc8ffe8, 0);
    } else {
      a.g.rotation.y += dt * 4;
      if (Math.random() < 0.5) glow.spawn(vec(V.x, V.y, V.z), vec(0, 0.4, 0), 0.4, 0.04, 0xffc8ee, 0);
    }
    a.prev.copy(V);
    if (a.s >= 1) {
      if (a.target.isBld) hurtBld(a.target, a.dmg);
      else if (alive(a.target)) hurt(a.target, a.dmg);
      for (let k = 0; k < (a.kind === 'arrow' ? 5 : 9); k++) glow.spawn(vec(V.x, V.y, V.z), vec(rnd(-1, 1), rnd(0.5, 1.5), rnd(-1, 1)), 0.3, 0.05, a.color, 3);
      scene.remove(a.g);
      shots.splice(i, 1);
    }
  }
}

export function clearArrows(): void {
  shots.forEach(a => scene.remove(a.g));
  shots.length = 0;
}
