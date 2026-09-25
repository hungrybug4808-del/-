import * as THREE from 'three';
import { rnd, vec } from '../core/math';
import { glow } from '../fx/effects';
import { scene } from '../render/stage';
import type { Target } from '../units/types';
import { aimPoint, alive, bldAlive, hurt, hurtBld } from './world';

interface Arrow {
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
}

const arrows: Arrow[] = [];
const gShaft = new THREE.BoxGeometry(0.025, 0.025, 0.5);
const gHead = new THREE.BoxGeometry(0.05, 0.05, 0.07);
const gF = new THREE.BoxGeometry(0.08, 0.012, 0.1);
const mShaft = new THREE.MeshLambertMaterial({ color: 0xc9a26b });
const mHead = new THREE.MeshLambertMaterial({ color: 0x9aa3ad });
const mF = new THREE.MeshLambertMaterial({ color: 0xc8323a });
const V = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);

/** 矢を放つ。狙いを追いかけて山なりに飛ぶ（必中） */
export function fireArrowFrom(from: THREE.Vector3, target: Target, dmg: number, shooter: { x: number; z: number }): void {
  const g = new THREE.Group();
  ([[gShaft, mShaft, -0.27], [gHead, mHead, -0.03], [gF, mF, -0.48]] as const).forEach(([geo, m, z]) => {
    const me = new THREE.Mesh(geo, m);
    me.position.z = z;
    g.add(me);
  });
  const src = { x: shooter.x, z: shooter.z }, end = aimPoint(target, src), dist = from.distanceTo(end);
  scene.add(g);
  arrows.push({ g, from: from.clone(), end, target, from2: src, s: 0, dur: dist / 13 + 0.1, arc: 0.2 + dist * 0.05, dmg, prev: from.clone() });
}

export function updateArrows(dt: number): void {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.s += dt / a.dur;
    if (a.target.isBld ? bldAlive(a.target) : alive(a.target)) a.end.copy(aimPoint(a.target, a.from2));
    const s = Math.min(a.s, 1);
    V.copy(a.from).lerp(a.end, s);
    V.y += a.arc * 4 * s * (1 - s);
    a.g.position.copy(V);
    const dir = V.clone().sub(a.prev);
    if (dir.lengthSq() > 1e-8) a.g.quaternion.setFromUnitVectors(FWD, dir.normalize());
    a.prev.copy(V);
    if (a.s >= 1) {
      if (a.target.isBld) hurtBld(a.target, a.dmg);
      else if (alive(a.target)) hurt(a.target, a.dmg);
      for (let k = 0; k < 5; k++) glow.spawn(vec(V.x, V.y, V.z), vec(rnd(-1, 1), rnd(0.5, 1.5), rnd(-1, 1)), 0.25, 0.04, 0xfff2b0, 3);
      scene.remove(a.g);
      arrows.splice(i, 1);
    }
  }
}

export function clearArrows(): void {
  arrows.forEach(a => scene.remove(a.g));
  arrows.length = 0;
}
