import * as THREE from 'three';
import { eOut, hash } from '../core/math';
import { Vox } from '../core/voxel';
import { K, anchor, applyRig, joint, newRoot, sinkDeath, splash, strike, type Bind, type Piv } from './kit';
import type { Pose, Rig, Unit, UnitDef } from './types';

// 河童（日本の昔話）：海・近接・魔素2。
// 緑の肌、頭に水の入った皿、黄色いくちばし、背中に甲羅。水から飛びかかって爪で引っかく

const C = {
  SKIN: 0x5fa050, SKIN_D: 0x4a8a3e, BELLY: 0xe8d890, SHELL: 0x6a7a3a, SHELL_D: 0x4f5a28, SHELL_L: 0x8a9a4a,
  PLATE: 0xe8f4f8, PLATE_W: 0x7fc8e8, HAIR: 0x2f5a2a, BEAK: 0xe8b040, BEAK_D: 0xc89030, EYE: 0x18202e, SHINE: 0xffffff, CLAW: 0xf0ead8,
};
const shell = (x: number, y: number) => ((x + y) % 3 === 0 ? C.SHELL_D : (x * 3 + y) % 5 === 0 ? C.SHELL_L : C.SHELL);

const torso = new Vox().box(-3, 0, -2, 6, 5, 4, C.SKIN).box(-2, 0, 2, 4, 4, 1, (_x, y) => (y % 2 ? C.BELLY : 0xd8c880))
  .box(-4, 0, -4, 8, 6, 2, shell).box(-3, 6, -4, 6, 1, 2, C.SHELL_D);
const head = new Vox().box(-3, 5, -3, 6, 5, 6, (x, y, z) => (hash(x, y, z) > 0.8 ? C.SKIN_D : C.SKIN))
  .box(-3, 9, -3, 6, 1, 6, C.HAIR).box(-2, 10, -2, 4, 1, 4, C.PLATE).box(-1, 10, -1, 2, 1, 2, C.PLATE_W)
  .box(-4, 7, -3, 1, 3, 5, C.HAIR).box(3, 7, -3, 1, 3, 5, C.HAIR).box(-3, 7, -4, 6, 3, 1, C.HAIR)
  .box(-1, 6, 3, 2, 1, 2, C.BEAK).box(-1, 5, 3, 2, 1, 1, C.BEAK_D)
  .set(-2, 8, 3, C.EYE).set(1, 8, 3, C.EYE).set(-2, 9, 3, C.SHINE).set(1, 9, 3, C.SHINE);
const arm = (x0: number) => new Vox().box(x0, 1, -1, 2, 4, 2, C.SKIN).box(x0, 0, -1, 2, 1, 3, C.SKIN_D).set(x0, 0, 2, C.CLAW).set(x0 + 1, 0, 2, C.CLAW);

export interface KappaRig extends Rig { torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; hand: THREE.Object3D }
const S = 0.065;
const P0: Piv = [0, 0, 0], PH: Piv = [0, 5, 0], PAR: Piv = [4, 4, 0];

function make(mat: THREE.Material): KappaRig {
  const root = newRoot();
  const torsoG = joint(root, P0, 'kpT', torso, P0, S, mat);
  const headG = joint(torsoG, P0, 'kpH', head, PH, S, mat);
  const armL = joint(torsoG, P0, 'kpAL', arm(-5), [-4, 4, 0], S, mat);
  const armR = joint(torsoG, P0, 'kpAR', arm(3), PAR, S, mat);
  const hand = anchor(armR, PAR, [4, 0, 2], S);
  return { root, torso: torsoG, head: headG, armL, armR, hand };
}
const BINDS: Bind[] = [
  ['torso', 'x', 'torsoRX'], ['torso', 'y', 'torsoRY'], ['head', 'x', 'headRX'], ['head', 'z', 'headRZ'],
  ['armL', 'x', 'armLX'], ['armL', 'z', 'armLZ'], ['armR', 'x', 'armRX'], ['armR', 'z', 'armRZ'],
];

function pose(u: Unit<KappaRig>, T: Pose, dt: number): void {
  const t = u.st, k = K(t);
  if (u.state === 'move') {
    // 平泳ぎのように腕で水をかく
    u.walk += dt * 5;
    const s = Math.sin(u.walk);
    Object.assign(T, { rootY: -0.25 + 0.04 * s, rootRX: 0.5, headRX: -0.5, armLX: -1.2 + 0.8 * s, armRX: -1.2 + 0.8 * s, armLZ: -0.4 - 0.4 * s, armRZ: 0.4 + 0.4 * s });
  } else if (u.state === 'attack') {
    // 水から身を乗り出して爪で引っかく
    T.rootY = k([[0, -0.2], [0.3, -0.3], [0.45, 0.2, eOut], [0.7, 0.05], [1.0, -0.2]]);
    T.rootRX = k([[0, 0.1], [0.3, -0.2], [0.45, 0.5, eOut], [1.0, 0.1]]);
    T.armRX = k([[0, -0.3], [0.3, -2.2], [0.45, -0.4, eOut], [1.0, -0.3]]);
    T.armRZ = k([[0, 0.3], [0.3, 0.6], [0.45, -0.2, eOut], [1.0, 0.3]]);
    T.armLX = k([[0, -0.3], [0.3, -1.6], [0.55, -0.4, eOut], [1.0, -0.3]]);
    T.torsoRY = k([[0, 0], [0.3, 0.3], [0.45, -0.3, eOut], [1.0, 0]]);
  } else if (u.state === 'dead') {
    sinkDeath(u, T);
    T.armLZ = -1; T.armRZ = 1;
  } else {
    const b = Math.sin(u.life * 2.2);
    T.rootY = -0.2 + 0.04 * b; T.headRZ = 0.1 * Math.sin(u.life * 1.3); T.armLZ = -0.3; T.armRZ = 0.3;
  }
}

const V = new THREE.Vector3();
export const kappa: UnitDef<KappaRig> = {
  type: 'kappa', name: '河童', icon: '🐢', sub: '海・近接', cost: 2,
  hp: 200, speed: 1.8, range: 1.0, aggro: 5, radius: 0.45, layer: 'sea', hitAir: false, ranged: false, hitH: 0.4,
  barH: 1.2, barW: 0.75, ringR: 0.5, spawnT: 0.6, deathT: 2.0, smooth: 14,
  make,
  base: () => ({ rootY: -0.2, rootRX: 0.1, rootRZ: 0, rootS: 1, torsoRX: 0, torsoRY: 0, headRX: 0, headRZ: 0, armLX: -0.3, armLZ: -0.3, armRX: -0.3, armRZ: 0.3 }),
  cycle: () => 1.0,
  pose,
  apply: u => applyRig(u, BINDS),
  attack(u) {
    if (strike(u, 0.45, 24)) {
      u.rig.hand.getWorldPosition(V);
      splash({ x: V.x, y: u.pos.y, z: V.z }, 5, 0.6);
    }
  },
};
