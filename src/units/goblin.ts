import * as THREE from 'three';
import { eOut, hash } from '../core/math';
import { Vox, eyeMat } from '../core/voxel';
import { K, anchor, applyRig, fallDeath, joint, newRoot, strike, type Bind, type Piv } from './kit';
import type { Pose, Rig, Unit, UnitDef } from './types';

// ゴブリン（ヨーロッパの民話）：陸・近接・魔素1。
// 緑の肌、とがった大きな耳と鼻、黄色い目、ぼろの服と短剣。背を丸めてちょこまか走る

const C = {
  SKIN: 0x7fae4a, SKIN_D: 0x5f8f38, EAR: 0xa0c86a, NOSE: 0x6f9a40, EYE: 0xffe04a, MOUTH: 0x2a1a14, TOOTH: 0xf0ead8,
  RAG: 0x7a5a36, RAG_D: 0x5e4428, BELT: 0x3e2a1a, PANTS: 0x4a3f36, FOOT: 0x3a2a20, STEEL: 0xb4bdc6, GRIP: 0x5a391f,
};
const rag = (x: number, y: number, z: number) => (hash(x, y, z) > 0.7 ? C.RAG_D : C.RAG);

const leg = (x0: number) => new Vox().box(x0, 0, -1, 2, 3, 2, (_x, y) => (y === 0 ? C.FOOT : C.PANTS));
const torso = new Vox().box(-3, 3, -2, 6, 4, 4, rag).box(-3, 3, -2, 6, 1, 4, C.BELT);
[-3, 0, 2].forEach(x => torso.set(x, 2, -2, C.RAG_D).set(x, 2, 1, C.RAG_D));
const head = new Vox().box(-4, 7, -3, 8, 6, 7, (_x, y) => (y >= 12 ? C.SKIN_D : C.SKIN));
head.box(-7, 10, -1, 3, 2, 1, C.EAR).box(4, 10, -1, 3, 2, 1, C.EAR).set(-8, 11, -1, C.EAR).set(7, 11, -1, C.EAR);
head.box(-1, 8, 4, 2, 2, 2, C.NOSE).box(-3, 7, 4, 6, 1, 1, C.MOUTH).set(-2, 7, 4, C.TOOTH).set(1, 7, 4, C.TOOTH);
head.box(-3, 11, 4, 2, 1, 1, C.SKIN_D).box(1, 11, 4, 2, 1, 1, C.SKIN_D);
const eyes = new Vox().box(-3, 10, 4, 2, 1, 1, C.EYE).box(1, 10, 4, 2, 1, 1, C.EYE);
const arm = (x0: number) => new Vox().box(x0, 3, -1, 2, 4, 2, (_x, y) => (y === 3 ? C.SKIN_D : C.SKIN));
const dagger = new Vox().box(3, 3, -1, 1, 1, 2, C.GRIP).box(2, 3, 1, 3, 1, 1, C.GRIP).box(3, 3, 2, 1, 1, 4, C.STEEL);

export interface GoblinRig extends Rig {
  legL: THREE.Group; legR: THREE.Group; torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; tip: THREE.Object3D;
}
const S = 0.065;
const P0: Piv = [0, 0, 0], PT: Piv = [0, 3, 0], PH: Piv = [0, 7, 0], PAR: Piv = [4, 7, 0];

function make(mat: THREE.Material): GoblinRig {
  const root = newRoot();
  const legL = joint(root, P0, 'gbLL', leg(-3), [-2, 3, 0], S, mat);
  const legR = joint(root, P0, 'gbLR', leg(1), [2, 3, 0], S, mat);
  const torsoG = joint(root, P0, 'gbT', torso, PT, S, mat);
  const headG = joint(torsoG, PT, 'gbH', head, PH, S, mat);
  joint(headG, PH, 'gbE', eyes, PH, S, eyeMat, true);
  const armL = joint(torsoG, PT, 'gbAL', arm(-5), [-4, 7, 0], S, mat);
  const armR = joint(torsoG, PT, 'gbAR', arm(3), PAR, S, mat);
  const dg = joint(armR, PAR, 'gbD', dagger, [3.5, 3.5, 0], S, mat);
  const tip = anchor(dg, [3.5, 3.5, 0], [3.5, 3.5, 5.5], S);
  return { root, legL, legR, torso: torsoG, head: headG, armL, armR, tip };
}

const BINDS: Bind[] = [
  ['legL', 'x', 'legL'], ['legR', 'x', 'legR'], ['torso', 'x', 'torsoRX'], ['torso', 'y', 'torsoRY'],
  ['head', 'x', 'headRX'], ['head', 'z', 'headRZ'], ['armL', 'x', 'armLX'], ['armR', 'x', 'armRX'], ['armR', 'z', 'armRZ'],
];

function pose(u: Unit<GoblinRig>, T: Pose, dt: number): void {
  const t = u.st, k = K(t);
  if (u.state === 'move') {
    u.walk += dt * 10;
    const s = Math.sin(u.walk);
    Object.assign(T, {
      legL: 0.8 * s, legR: -0.8 * s, rootY: 0.06 * Math.abs(Math.cos(u.walk)), torsoRX: 0.35, torsoRY: 0.1 * s,
      headRX: -0.25, headRZ: 0.08 * s, armLX: -0.7 * s, armRX: 0.5 * s - 0.3,
    });
  } else if (u.state === 'attack') {
    // 小刻みに踏み込んで短剣で突く
    T.armRX = k([[0, -0.3], [0.18, 0.4], [0.32, -1.6, eOut], [0.5, -1.4], [0.8, -0.3]]);
    T.torsoRY = k([[0, 0], [0.18, 0.35], [0.32, -0.3, eOut], [0.8, 0]]);
    T.torsoRX = k([[0, 0.3], [0.32, 0.5], [0.8, 0.3]]);
    T.rootY = k([[0, 0], [0.2, 0.08], [0.34, 0], [0.8, 0]]);
    T.legL = -0.4; T.legR = 0.3; T.headRX = -0.3; T.armLX = 0.4;
  } else if (u.state === 'dead') {
    fallDeath(u, T, -1);
  } else {
    const b = Math.sin(u.life * 4);
    T.rootY = 0.01 * (b + 1); T.torsoRX = 0.3 + 0.03 * b; T.headRZ = 0.12 * Math.sin(u.life * 2.3); T.armRX = -0.3;
  }
}

export const goblin: UnitDef<GoblinRig> = {
  type: 'goblin', name: 'ゴブリン', icon: '👺', sub: '陸・近接', cost: 1,
  hp: 90, speed: 1.9, range: 0.9, aggro: 6, radius: 0.35, layer: 'land', hitAir: false, ranged: false, hitH: 0.5,
  barH: 1.3, barW: 0.7, ringR: 0.45, spawnT: 0.5, deathT: 1.8, smooth: 16,
  make,
  base: () => ({ rootY: 0, rootRX: 0, rootS: 1, torsoRX: 0.3, torsoRY: 0, headRX: -0.2, headRZ: 0, legL: 0, legR: 0, armLX: 0, armRX: -0.3, armRZ: 0.15 }),
  cycle: () => 0.8,
  pose,
  apply: u => applyRig(u, BINDS),
  attack(u) { strike(u, 0.32, 12); },
};
