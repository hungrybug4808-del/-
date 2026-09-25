import * as THREE from 'three';
import { eOut, hash } from '../core/math';
import { Vox, eyeMat } from '../core/voxel';
import { K, airFall, applyRig, featherWing, flap, joint, newRoot, strike, type Bind, type Piv } from './kit';
import type { Pose, Rig, Unit, UnitDef } from './types';

// ハーピー（ギリシャ神話）：空・近接・魔素1。
// 人の顔と、紫の羽の腕、黄色い鳥の脚。群れで飛び回り、急降下して爪で裂く

const C = {
  SKIN: 0xe8c8b8, SKIN_D: 0xd0aa98, HAIR: 0x4a2a5a, HAIR_L: 0x6a3e7e, EYE: 0xff5a4a, CHEST: 0x7a6a8a, CHEST_D: 0x5e5070,
  WING: 0x6a5a7a, WING_D: 0x4a3e5a, WING_T: 0x9a8aa8, LEG: 0xd8b040, TALON: 0x3a3a40,
};
const torso = new Vox().box(-2, 0, -1, 4, 5, 3, (x, y, z) => (y >= 3 ? C.SKIN : hash(x, y, z) > 0.5 ? C.CHEST : C.CHEST_D)).box(-1, -2, -4, 2, 1, 4, C.WING_D).box(-2, -1, -5, 4, 1, 2, C.WING_T);
const head = new Vox().box(-3, 5, -2, 6, 5, 5, C.SKIN).box(-3, 9, -3, 6, 2, 6, (x, y, z) => (hash(x, y, z) > 0.6 ? C.HAIR_L : C.HAIR))
  .box(-4, 5, -3, 1, 5, 5, C.HAIR).box(3, 5, -3, 1, 5, 5, C.HAIR).box(-3, 3, -3, 6, 7, 1, C.HAIR).set(-3, 11, 0, C.HAIR).set(2, 11, -2, C.HAIR)
  .box(-1, 6, 3, 2, 1, 1, C.SKIN_D);
const eyes = new Vox().set(-2, 8, 3, C.EYE).set(1, 8, 3, C.EYE);
const wingR = featherWing(9, 4, (i, edge) => (edge ? (i > 5 ? C.WING_T : C.WING_D) : i < 2 ? C.CHEST : C.WING));
const wingL = wingR.mirror();
const legV = (x0: number) => new Vox().box(x0, -4, 0, 1, 4, 1, C.LEG).box(x0 - 1, -5, 0, 3, 1, 1, C.TALON).set(x0, -5, 1, C.TALON);

export interface HarpyRig extends Rig { torso: THREE.Group; head: THREE.Group; wL: THREE.Group; wR: THREE.Group; legL: THREE.Group; legR: THREE.Group }
const S = 0.07;
const P0: Piv = [0, 0, 0], PH: Piv = [0, 5, 0];

function make(mat: THREE.Material): HarpyRig {
  const root = newRoot();
  const torsoG = joint(root, P0, 'hpT', torso, P0, S, mat);
  const headG = joint(torsoG, P0, 'hpH', head, PH, S, mat);
  joint(headG, PH, 'hpE', eyes, PH, S, eyeMat, true);
  const wR = joint(torsoG, P0, 'hpWR', wingR, [0, 0, 0], S, mat); wR.position.set(2 * S, 4 * S, 0);
  const wL = joint(torsoG, P0, 'hpWL', wingL, [-1, 0, 0], S, mat); wL.position.set(-2 * S, 4 * S, 0);
  const legL = joint(torsoG, P0, 'hpLL', legV(-2), [-1.5, 0, 0.5], S, mat);
  const legR = joint(torsoG, P0, 'hpLR', legV(1), [1.5, 0, 0.5], S, mat);
  return { root, torso: torsoG, head: headG, wL, wR, legL, legR };
}
const BINDS: Bind[] = [['head', 'x', 'headRX'], ['head', 'z', 'headRZ'], ['legL', 'x', 'legX'], ['legR', 'x', 'legX']];

function pose(u: Unit<HarpyRig>, T: Pose): void {
  const t = u.st, k = K(t);
  if (u.state === 'move') {
    Object.assign(T, { rootRX: 0.4, flapF: 11, flapA: 0.85, headRX: -0.4, legX: 0.6 });
  } else if (u.state === 'attack') {
    // 翼をたたんで急降下し、脚の爪で裂く
    T.rootY = k([[0, 2.6], [0.3, 3.0], [0.5, 2.1, eOut], [1.0, 2.6]]);
    T.rootRX = k([[0, 0.1], [0.3, -0.4], [0.5, 0.6, eOut], [1.0, 0.1]]);
    T.legX = k([[0, 0.3], [0.3, 0.6], [0.5, -1.5, eOut], [1.0, 0.3]]);
    T.wingBase = k([[0, 0.2], [0.3, 0.9], [0.5, -0.6], [1.0, 0.2]]);
    T.flapA = k([[0, 0.8], [0.3, 0.2], [0.55, 0.2], [0.8, 0.9]]);
    T.headRX = -0.3;
  } else if (u.state === 'dead') {
    airFall(u, T, 2.6);
    T.flapA = 0.2; T.flapF = 20;
  } else {
    T.rootY = 2.6 + 0.08 * Math.sin(u.life * 1.5); T.headRZ = 0.12 * Math.sin(u.life * 1.2);
  }
}

function apply(u: Unit<HarpyRig>, dt: number): void {
  const P = u.P, s = flap(u, dt, P.flapF);
  applyRig(u, BINDS);
  u.rig.root.position.y -= 0.08 * P.flapA * s;
  const wz = P.wingBase + P.flapA * s;
  u.rig.wR.rotation.z = wz; u.rig.wL.rotation.z = -wz;
}

export const harpy: UnitDef<HarpyRig> = {
  type: 'harpy', name: 'ハーピー', icon: '🦅', sub: '空・近接', cost: 1,
  hp: 70, speed: 2.3, range: 1.0, aggro: 7, radius: 0.4, layer: 'air', hitAir: true, ranged: false, hitH: 1,
  barH: 1.3, barW: 0.7, ringR: 0.5, spawnT: 0.8, deathT: 2.4, smooth: 12,
  make,
  base: () => ({ rootY: 2.6, rootRX: 0.1, rootRZ: 0, rootS: 1, headRX: 0, headRZ: 0, legX: 0.3, wingBase: 0.2, flapA: 0.75, flapF: 9 }),
  cycle: () => 1.0,
  pose, apply,
  attack(u) { strike(u, 0.5, 14); },
};
