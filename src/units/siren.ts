import * as THREE from 'three';
import { eOut, hash, rnd, seg, vec } from '../core/math';
import { Vox, eyeMat } from '../core/voxel';
import { glow } from '../fx/effects';
import { fireShot } from '../battle/projectiles';
import { K, anchor, applyRig, joint, newRoot, sinkDeath, type Bind, type Piv } from './kit';
import type { Pose, Rig, Unit, UnitDef } from './types';

// セイレーン（ギリシャ神話）：海・遠距離・魔素2。
// 長い紫の髪と貝殻の飾り、水に沈んだ青緑の魚の尾。両腕を広げて歌い、音符を飛ばす

const C = {
  SKIN: 0xf2d6c8, SKIN_D: 0xdcb8a8, HAIR: 0x9a5ac8, HAIR_D: 0x7a44a8, HAIR_L: 0xb77ee0, SHELL: 0xf0a0b8, SHELL_D: 0xd88098,
  LIP: 0xe06a8a, EYE: 0x5fe8d8, SCALE: 0x3fb8a8, SCALE_D: 0x2f9a8e, SCALE_L: 0x6fd8c8, FIN: 0xc8a8f0, FIN_D: 0xa888d8, PEARL: 0xf8f4ff,
};
const scale = (x: number, y: number, z: number) => { const h = hash(x, y, z); return h > 0.8 ? C.SCALE_D : h < 0.15 ? C.SCALE_L : C.SCALE; };

const torso = new Vox().box(-2, 0, -1, 4, 5, 3, C.SKIN).box(-3, -1, -2, 6, 2, 5, scale)
  .box(-2, 3, 2, 2, 2, 1, C.SHELL).box(0, 3, 2, 2, 2, 1, C.SHELL_D).box(-2, 2, 2, 4, 1, 1, C.PEARL);
const head = new Vox().box(-3, 5, -2, 6, 6, 5, C.SKIN)
  .box(-3, 9, -3, 6, 3, 6, (x, y, z) => (hash(x, y, z) > 0.7 ? C.HAIR_L : C.HAIR))
  .box(-4, 5, -3, 1, 6, 5, C.HAIR).box(3, 5, -3, 1, 6, 5, C.HAIR).box(-3, 3, -3, 6, 7, 1, C.HAIR_D)
  .box(-1, 6, 2, 2, 1, 1, C.LIP).set(-4, 10, 1, C.SHELL).set(-4, 9, 1, C.SHELL_D).set(-3, 10, 3, C.HAIR).set(2, 10, 3, C.HAIR);
const hairBack = new Vox().box(-3, -1, -4, 6, 5, 1, (x, y, z) => (hash(x, y, z) > 0.6 ? C.HAIR_D : C.HAIR)).box(-2, -3, -4, 4, 2, 1, C.HAIR_D);
const eyes = new Vox().set(-2, 8, 3, C.EYE).set(1, 8, 3, C.EYE);
const arm = (x0: number) => new Vox().box(x0, 1, -1, 2, 4, 2, (_x, y) => (y === 1 ? C.SKIN_D : C.SKIN));
const tailA = new Vox().box(-2, -2, -5, 4, 2, 4, scale);
const tailB = new Vox().box(-1, -2, -9, 2, 2, 4, scale);
const fin = new Vox().box(-3, -1, -12, 6, 1, 3, (x) => (Math.abs(x + 0.5) > 1.5 ? C.FIN_D : C.FIN)).box(-1, -1, -10, 2, 1, 1, C.FIN_D);

export interface SirenRig extends Rig {
  torso: THREE.Group; head: THREE.Group; hair: THREE.Group; armL: THREE.Group; armR: THREE.Group;
  tailA: THREE.Group; tailB: THREE.Group; fin: THREE.Group; mouth: THREE.Object3D;
}
const S = 0.075;
const P0: Piv = [0, 0, 0], PH: Piv = [0, 5, 0], PTA: Piv = [0, -1, -1], PTB: Piv = [0, -1, -5], PF: Piv = [0, -1, -9];

function make(mat: THREE.Material): SirenRig {
  const root = newRoot();
  const torsoG = joint(root, P0, 'srT', torso, P0, S, mat);
  const headG = joint(torsoG, P0, 'srH', head, PH, S, mat);
  joint(headG, PH, 'srE', eyes, PH, S, eyeMat, true);
  const hair = joint(headG, PH, 'srHB', hairBack, [0, 4, -4], S, mat);
  const armL = joint(torsoG, P0, 'srAL', arm(-4), [-3, 4, 0], S, mat);
  const armR = joint(torsoG, P0, 'srAR', arm(2), [3, 4, 0], S, mat);
  const tA = joint(torsoG, P0, 'srTA', tailA, PTA, S, mat);
  const tB = joint(tA, PTA, 'srTB', tailB, PTB, S, mat);
  const finG = joint(tB, PTB, 'srF', fin, PF, S, mat);
  const mouth = anchor(headG, PH, [0, 6.5, 4], S);
  return { root, torso: torsoG, head: headG, hair, armL, armR, tailA: tA, tailB: tB, fin: finG, mouth };
}

const BINDS: Bind[] = [
  ['torso', 'x', 'torsoRX'], ['head', 'x', 'headRX'], ['head', 'z', 'headRZ'], ['hair', 'x', 'hairRX'],
  ['armL', 'x', 'armLX'], ['armL', 'z', 'armLZ'], ['armR', 'x', 'armRX'], ['armR', 'z', 'armRZ'],
];

function pose(u: Unit<SirenRig>, T: Pose): void {
  const t = u.st, k = K(t);
  if (u.state === 'move') {
    // 前へ身を倒し、尾で水をかいて泳ぐ
    Object.assign(T, { rootY: -0.3, rootRX: 0.45, headRX: -0.4, armLX: 0.9, armRX: 0.9, armLZ: -0.3, armRZ: 0.3, hairRX: 0.6, tailAmp: 0.45, tailF: 7 });
  } else if (u.state === 'attack') {
    // 胸を張って両腕を広げ、歌う
    T.armLZ = k([[0, -0.2], [0.5, -1.3], [1.2, -1.3], [1.6, -0.2]]);
    T.armRZ = k([[0, 0.2], [0.5, 1.3], [1.2, 1.3], [1.6, 0.2]]);
    T.armLX = T.armRX = k([[0, 0], [0.5, -0.6], [1.2, -0.6], [1.6, 0]]);
    T.headRX = k([[0, 0], [0.55, -0.45], [0.8, 0.1, eOut], [1.6, 0]]) - 0.4 * (u.aimPitch || 0);
    T.torsoRX = k([[0, 0], [0.55, -0.2], [0.8, 0.1, eOut], [1.6, 0]]);
    T.rootY = k([[0, -0.15], [0.55, 0.05], [1.6, -0.15]]);
    T.headRZ = 0.08 * Math.sin(t * 9) * seg(t, 0.3, 0.8);
    T.tailAmp = 0.2; T.tailF = 3;
  } else if (u.state === 'dead') {
    sinkDeath(u, T);
    T.headRX = -0.5; T.armLZ = -0.9; T.armRZ = 0.9;
  } else {
    const b = Math.sin(u.life * 1.7);
    T.rootY = -0.15 + 0.04 * b; T.headRZ = 0.1 * Math.sin(u.life * 0.8); T.hairRX = 0.1 * b;
    T.armLZ = -0.25; T.armRZ = 0.25; T.armLX = T.armRX = -0.2;
  }
}

function apply(u: Unit<SirenRig>, dt: number): void {
  applyRig(u, BINDS);
  const r = u.rig, P = u.P;
  u.tp += dt * P.tailF;
  r.tailA.rotation.x = P.tailAmp * Math.sin(u.tp);
  r.tailB.rotation.x = P.tailAmp * 1.2 * Math.sin(u.tp - 0.9);
  r.fin.rotation.x = P.tailAmp * 1.4 * Math.sin(u.tp - 1.8) - 0.15;
}

const V = new THREE.Vector3();
export const siren: UnitDef<SirenRig> = {
  type: 'siren', name: 'セイレーン', icon: '🧜', sub: '海・遠距離', cost: 2,
  hp: 150, speed: 1.5, range: 6, aggro: 7.5, radius: 0.45, layer: 'sea', hitAir: true, ranged: true, hitH: 0.5,
  barH: 1.4, barW: 0.8, ringR: 0.55, spawnT: 0.7, deathT: 2.0, smooth: 10,
  make,
  base: () => ({
    rootY: -0.15, rootRX: 0, rootRZ: 0, rootS: 1, torsoRX: 0, headRX: 0, headRZ: 0, hairRX: 0,
    armLX: -0.2, armLZ: -0.25, armRX: -0.2, armRZ: 0.25, tailAmp: 0.18, tailF: 2.5,
  }),
  cycle: () => 1.6,
  pose, apply,
  attack(u, _dt, ok) {
    if (u.st > 0.3 && u.st < 0.8 && Math.random() < 0.3) {
      u.rig.mouth.getWorldPosition(V);
      glow.spawn(vec(V.x + rnd(-0.2, 0.2), V.y, V.z + rnd(-0.2, 0.2)), vec(rnd(-0.3, 0.3), rnd(0.4, 0.9), rnd(-0.3, 0.3)), 0.7, 0.05, 0xff8fd8, -0.2);
    }
    if (u.st >= 0.8 && !u.fired.shot && ok && u.target) {
      u.fired.shot = 1;
      u.rig.mouth.getWorldPosition(V);
      fireShot('note', V, u.target, 16, u.pos);
    }
  },
};
