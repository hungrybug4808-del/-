import * as THREE from 'three';
import { eOut, hash, rnd, vec } from '../core/math';
import { Vox, eyeMat } from '../core/voxel';
import { glow } from '../fx/effects';
import { fireShot } from '../battle/projectiles';
import { K, airFall, anchor, applyRig, featherWing, flap, joint, newRoot, type Bind, type Piv } from './kit';
import type { Pose, Rig, Unit, UnitDef } from './types';

// 天狗（日本の伝承）：空・遠距離・魔素4。空からどこでも撃てる。
// 赤い顔に長い鼻、白い髪、頭に黒い頭襟、白い山伏の装束と橙の梵天、黒い翼、一本歯の下駄、羽団扇。
// 団扇をあおいで風の刃を飛ばす

const C = {
  FACE: 0xd83a2a, FACE_D: 0xb02a20, FACE_L: 0xe85a48, HAIR: 0xf0f0f0, HAIR_D: 0xd8d8dc, CAP: 0x1a1a1e, EYE: 0xffd040,
  ROBE: 0xf2f0ea, ROBE_D: 0xd8d4c8, PON: 0xe87a2a, HAKAMA: 0x6a6e78, GETA: 0x8a5a30, WING: 0x2a2a34, WING_T: 0x44445a,
  FAN: 0x5a3a20, FAN_L: 0x7a5a38, FAN_W: 0xf0ead8, GOLD: 0xd4a93f,
};
const legV = (x0: number) => new Vox().box(x0, 0, -1, 2, 4, 2, C.HAKAMA).box(x0, -1, -1, 2, 1, 3, C.GETA).box(x0, -2, 0, 2, 1, 1, C.GETA);
const torso = new Vox().box(-3, 4, -2, 6, 6, 4, (_x, y) => (y === 4 ? C.ROBE_D : C.ROBE)).box(-3, 4, -2, 6, 1, 4, C.HAKAMA)
  .set(-1, 8, 2, C.PON).set(0, 8, 2, C.PON).set(-1, 6, 2, C.PON).set(0, 6, 2, C.PON).box(-3, 9, 2, 6, 1, 1, C.ROBE_D);
const head = new Vox().box(-3, 10, -2, 6, 6, 5, (x, y, z) => (hash(x, y, z) > 0.85 ? C.FACE_D : C.FACE))
  .box(-1, 12, 3, 2, 2, 4, C.FACE_L).set(0, 12, 7, C.FACE_L)
  .box(-4, 11, -3, 8, 6, 2, (x, y, z) => (hash(x, y, z) > 0.6 ? C.HAIR_D : C.HAIR)).box(-4, 11, -1, 1, 5, 3, C.HAIR).box(3, 11, -1, 1, 5, 3, C.HAIR)
  .box(-3, 15, 3, 2, 1, 1, C.HAIR).box(1, 15, 3, 2, 1, 1, C.HAIR).box(-2, 9, 2, 4, 2, 2, C.HAIR).box(-1, 16, 0, 2, 2, 2, C.CAP);
const eyes = new Vox().set(-2, 14, 3, C.EYE).set(1, 14, 3, C.EYE);
const arm = (x0: number) => new Vox().box(x0, 5, -1, 2, 5, 2, (_x, y) => (y === 5 ? C.FACE : C.ROBE)).box(x0, 5, 1, 2, 3, 1, C.ROBE_D);
// 羽団扇：金の柄に、羽を重ねた葉の形
const fan = new Vox().box(0, 0, 0, 1, 3, 1, C.GOLD);
for (let y = 3; y <= 9; y++) { const w = y < 5 ? y - 2 : y > 7 ? 10 - y : 3; for (let x = -w; x <= w; x++) fan.set(x, y, 0, Math.abs(x) === w ? C.FAN : (x + y) % 3 === 0 ? C.FAN_L : C.FAN); }
fan.set(0, 5, 0, C.FAN_W).set(0, 6, 0, C.FAN_W);
const wingR = featherWing(8, 4, (i, edge) => (edge && i > 4 ? C.WING_T : C.WING));

export interface TenguRig extends Rig {
  torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group;
  wL: THREE.Group; wR: THREE.Group; fanTip: THREE.Object3D;
}
const S = 0.075;
const P0: Piv = [0, 0, 0], PT: Piv = [0, 4, 0], PH: Piv = [0, 10, 0], PAR: Piv = [4, 9, 0];

function make(mat: THREE.Material): TenguRig {
  const root = newRoot();
  const legL = joint(root, P0, 'tgLL', legV(-2), [-1, 4, 0], S, mat);
  const legR = joint(root, P0, 'tgLR', legV(0), [1, 4, 0], S, mat);
  const torsoG = joint(root, P0, 'tgT', torso, PT, S, mat);
  const headG = joint(torsoG, PT, 'tgH', head, PH, S, mat);
  joint(headG, PH, 'tgE', eyes, PH, S, eyeMat, true);
  const armL = joint(torsoG, PT, 'tgAL', arm(-5), [-4, 9, 0], S, mat);
  const armR = joint(torsoG, PT, 'tgAR', arm(3), PAR, S, mat);
  const fanG = joint(armR, PAR, 'tgF', fan, [0, 0, 0], S, mat);
  fanG.position.set(0.5 * S, -4.5 * S, 0.5 * S);
  fanG.rotation.x = 0.4;
  const fanTip = anchor(fanG, P0, [0, 7, 0], S);
  const wR = joint(torsoG, PT, 'tgWR', wingR, [0, 0, 0], S, mat); wR.position.set(1.5 * S, 5 * S, -2 * S); wR.rotation.y = -0.5;
  const wL = joint(torsoG, PT, 'tgWL', wingR.mirror(), [-1, 0, 0], S, mat); wL.position.set(-1.5 * S, 5 * S, -2 * S); wL.rotation.y = 0.5;
  return { root, torso: torsoG, head: headG, armL, armR, legL, legR, wL, wR, fanTip };
}
const BINDS: Bind[] = [
  ['torso', 'x', 'torsoRX'], ['torso', 'y', 'torsoRY'], ['head', 'x', 'headRX'], ['head', 'y', 'headRY'],
  ['armL', 'x', 'armLX'], ['armL', 'z', 'armLZ'], ['armR', 'x', 'armRX'], ['armR', 'z', 'armRZ'], ['legL', 'x', 'legL'], ['legR', 'x', 'legR'],
];

function pose(u: Unit<TenguRig>, T: Pose): void {
  const t = u.st, k = K(t);
  if (u.state === 'move') {
    Object.assign(T, { rootRX: 0.35, torsoRX: 0.1, headRX: -0.35, armLX: 0.5, armRX: 0.4, armLZ: -0.3, legL: 0.5, legR: 0.3, flapF: 7, flapA: 0.8 });
  } else if (u.state === 'attack') {
    // 団扇を肩の外へ振りかぶり、横なぎにあおぐ
    const ph = u.aimPitch || 0;
    T.armRX = k([[0, -0.4], [0.55, -2.4], [0.7, -2.5], [0.85, -0.6, eOut], [1.4, -0.4]]) - 0.5 * ph;
    T.armRZ = k([[0, 0.2], [0.55, 0.9], [0.85, -0.4, eOut], [1.4, 0.2]]);
    T.torsoRY = k([[0, 0], [0.55, 0.45], [0.85, -0.35, eOut], [1.4, 0]]);
    T.headRX = -0.4 * ph; T.torsoRX = 0.2 * ph;
    T.armLX = -0.8; T.armLZ = -0.6; T.legL = 0.4; T.legR = -0.1;
  } else if (u.state === 'dead') {
    airFall(u, T, 2.6);
    T.flapA = 0.2; T.flapF = 16;
  } else {
    T.rootY = 2.6 + 0.1 * Math.sin(u.life * 1.1); T.headRY = 0.3 * Math.sin(u.life * 0.5);
    T.legL = 0.15; T.legR = 0.05; T.armLZ = -0.2; T.armLX = -0.3;
  }
}

function apply(u: Unit<TenguRig>, dt: number): void {
  const P = u.P, s = flap(u, dt, P.flapF);
  applyRig(u, BINDS);
  u.rig.root.position.y -= 0.07 * P.flapA * s;
  const wz = 0.3 + P.flapA * s;
  u.rig.wR.rotation.z = wz; u.rig.wL.rotation.z = -wz;
}

const V = new THREE.Vector3();
export const tengu: UnitDef<TenguRig> = {
  type: 'tengu', name: '天狗', icon: '🪭', sub: '空・遠距離', cost: 4,
  hp: 300, speed: 1.5, range: 6.5, aggro: 8, radius: 0.6, layer: 'air', hitAir: true, ranged: true, hitH: 1,
  barH: 1.8, barW: 1.0, ringR: 0.7, spawnT: 1.0, deathT: 2.4, smooth: 12,
  make,
  base: () => ({
    rootY: 2.6, rootRX: 0, rootRZ: 0, rootS: 1, torsoRX: 0, torsoRY: 0, headRX: 0, headRY: 0,
    armLX: -0.2, armLZ: -0.2, armRX: -0.4, armRZ: 0.2, legL: 0.1, legR: 0, flapA: 0.6, flapF: 5,
  }),
  cycle: () => 1.4,
  pose, apply,
  aim(u, p, hd) { u.aimPitch = Math.atan2(p.y - u.pos.y - 3.3, hd); },
  attack(u, _dt, ok) {
    if (u.st > 0.7 && u.st < 0.9 && Math.random() < 0.6) {
      u.rig.fanTip.getWorldPosition(V);
      glow.spawn(vec(V.x, V.y, V.z), vec(rnd(-1, 1), rnd(-0.5, 0.5), rnd(-1, 1)), 0.4, 0.06, 0xc8ffe8, 0);
    }
    if (u.st >= 0.82 && !u.fired.shot && ok && u.target) {
      u.fired.shot = 1;
      u.rig.fanTip.getWorldPosition(V);
      fireShot('wind', V, u.target, 30, u.pos);
    }
  },
};
