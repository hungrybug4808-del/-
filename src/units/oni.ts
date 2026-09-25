import * as THREE from 'three';
import { eIn, eOut, hash } from '../core/math';
import { Vox } from '../core/voxel';
import { addShake, dust } from '../fx/effects';
import { K, anchor, applyRig, fallDeath, joint, newRoot, strike, type Bind, type Piv } from './kit';
import type { Pose, Rig, Unit, UnitDef } from './types';

// 鬼（日本の昔話）：陸・近接・魔素3。体力が高めの壁役。
// 赤い肌、2本のツノ、ぼさぼさの黒髪、虎皮の腰布、トゲ付きの金棒。振り上げて叩きつける

const C = {
  SKIN: 0xd8483a, SKIN_D: 0xb0362c, SKIN_L: 0xe86a58, HORN: 0xf2e8cf, HORN_D: 0xc9b894, HAIR: 0x2a2a30, HAIR_L: 0x44444c,
  EYE: 0xfbfaf2, IRIS: 0xe3b12c, PUPIL: 0x18202e, BROW: 0x2a2a30, MOUTH: 0x3a1420, FANG: 0xf6f1e2,
  TIGER: 0xe8b030, STRIPE: 0x2a2018, GOLD: 0xd4a93f, IRON: 0x3a3d44, IRON_L: 0x565a63, STUD: 0x9aa3ad, GRIP: 0x9a2a2a,
};
const tiger = (x: number, y: number) => ((x + y * 2) % 4 === 0 ? C.STRIPE : C.TIGER);

const leg = (x0: number) => new Vox().box(x0, 0, -2, 4, 5, 4, (_x, y) => (y === 0 ? C.SKIN_D : C.SKIN)).box(x0, 0, 2, 4, 1, 1, C.SKIN_D);
const torso = new Vox()
  .box(-6, 4, -3, 12, 8, 6, (x, y, z) => (z === 2 && y >= 8 && y <= 10 && x !== -1 && x !== 0 ? C.SKIN_L : C.SKIN))
  .box(-7, 3, -4, 14, 3, 8, tiger).box(-3, 1, 4, 6, 3, 1, tiger).box(-3, 1, -5, 6, 3, 1, tiger).box(-7, 6, -4, 14, 1, 8, C.STRIPE);
const head = new Vox().box(-6, 12, -5, 12, 10, 9, C.SKIN);
head.box(-7, 19, -6, 14, 4, 11, (x, y, z) => (hash(x, y, z) > 0.7 ? C.HAIR_L : C.HAIR)).box(-7, 13, -6, 14, 6, 3, C.HAIR).box(-7, 15, -3, 1, 4, 5, C.HAIR).box(6, 15, -3, 1, 4, 5, C.HAIR);
[[-6, 23, -2], [-3, 23, 1], [0, 23, -4], [3, 23, 0], [5, 23, -3], [-1, 24, -1]].forEach(([x, y, z]) => head.set(x, y, z, C.HAIR));
for (const sx of [-5, 3]) head.box(sx, 22, -1, 2, 2, 2, C.HORN_D).box(sx, 24, -1, 2, 2, 2, C.HORN).set(sx + (sx < 0 ? 0 : 1), 26, 0, C.HORN);
head.box(-5, 16, 4, 4, 3, 1, C.EYE).box(1, 16, 4, 4, 3, 1, C.EYE);
head.box(-4, 16, 5, 2, 2, 1, C.IRIS).set(-3, 16, 5, C.PUPIL).box(2, 16, 5, 2, 2, 1, C.IRIS).set(2, 16, 5, C.PUPIL);
head.box(-6, 19, 4, 5, 1, 2, C.BROW).box(1, 19, 4, 5, 1, 2, C.BROW);
head.box(-1, 14, 4, 2, 2, 2, C.SKIN_D).box(-4, 13, 4, 8, 1, 1, C.MOUTH).set(-3, 14, 5, C.FANG).set(2, 14, 5, C.FANG).set(-3, 13, 5, C.FANG).set(2, 13, 5, C.FANG);
function arm(side: number): Vox {
  const v = new Vox(), ax = side < 0 ? -10 : 6, fx = side < 0 ? -11 : 6;
  v.box(ax, 6, -2, 4, 6, 4, C.SKIN).box(ax, 5, -2, 4, 1, 4, C.GOLD);
  v.box(fx, 1, -3, 5, 4, 6, (_x, y, z) => (z === 2 && y >= 2 ? C.SKIN_D : C.SKIN));
  return v;
}
// 金棒：握りは赤い布、先は太い鉄にトゲ
const club = new Vox().box(7, 2, -4, 3, 2, 6, C.GRIP).box(6, 1, 2, 5, 5, 13, (x, y, z) => ((x + y + z) % 2 === 0 ? C.IRON_L : C.IRON));
for (let z = 3; z <= 14; z += 2) for (const [x, y] of [[8, 6], [8, 0], [5, 3], [11, 3]]) club.set(x, y, z, C.STUD);
club.box(7, 2, 15, 3, 3, 1, C.STUD);

export interface OniRig extends Rig {
  legL: THREE.Group; legR: THREE.Group; torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; tip: THREE.Object3D;
}
const S = 0.09;
const P0: Piv = [0, 0, 0], PT: Piv = [0, 5, 0], PH: Piv = [0, 12, 0], PAR: Piv = [8, 11, 0], PC: Piv = [8.5, 3, 0];

function make(mat: THREE.Material): OniRig {
  const root = newRoot();
  const legL = joint(root, P0, 'onLL', leg(-5), [-3, 5, 0], S, mat);
  const legR = joint(root, P0, 'onLR', leg(1), [3, 5, 0], S, mat);
  const torsoG = joint(root, P0, 'onT', torso, PT, S, mat);
  const headG = joint(torsoG, PT, 'onH', head, PH, S, mat);
  const armL = joint(torsoG, PT, 'onAL', arm(-1), [-8, 11, 0], S, mat);
  const armR = joint(torsoG, PT, 'onAR', arm(1), PAR, S, mat);
  const c = joint(armR, PAR, 'onC', club, PC, S, mat);
  const tip = anchor(c, PC, [8.5, 3.5, 14], S);
  return { root, legL, legR, torso: torsoG, head: headG, armL, armR, tip };
}

const BINDS: Bind[] = [
  ['legL', 'x', 'legL'], ['legR', 'x', 'legR'], ['torso', 'x', 'torsoRX'], ['torso', 'y', 'torsoRY'], ['torso', 'z', 'torsoRZ'],
  ['head', 'x', 'headRX'], ['head', 'y', 'headRY'], ['armL', 'x', 'armLX'], ['armL', 'z', 'armLZ'], ['armR', 'x', 'armRX'], ['armR', 'z', 'armRZ'],
];

const V = new THREE.Vector3();
function pose(u: Unit<OniRig>, T: Pose, dt: number): void {
  const t = u.st, k = K(t);
  if (u.state === 'move') {
    // どしどし歩く（サイクロプスより軽く、肩をいからせる）
    u.walk += dt * 4.2;
    const f = u.walk, s = Math.sin(f), a = Math.abs(s);
    Object.assign(T, {
      legL: 0.55 * s, legR: -0.55 * s, rootY: -0.06 * Math.pow(a, 1.5), torsoRZ: 0.07 * s, torsoRY: 0.08 * s, torsoRX: 0.12,
      headRX: -0.08, armLX: -0.35 * Math.sin(f - 0.5), armRX: -0.4 + 0.12 * Math.sin(f - 0.5), armLZ: -0.15, armRZ: 0.12,
    });
    const c = Math.cos(f);
    if (u.prevC !== undefined && Math.sign(c) !== Math.sign(u.prevC)) dust({ x: u.pos.x, y: u.pos.y, z: u.pos.z }, 3, 0.5);
    u.prevC = c;
  } else if (u.state === 'attack') {
    // 金棒を肩の外から振り上げ、全身で叩きつける
    T.armRX = k([[0, -0.4], [0.55, -2.7], [0.68, -2.8], [0.82, 0.25, eIn], [1.0, 0.2], [1.4, -0.4]]);
    T.armRZ = k([[0, 0.12], [0.55, 0.45], [0.82, 0.2, eIn], [1.4, 0.12]]);
    T.armLX = k([[0, 0], [0.55, -0.5], [0.82, 0.5, eIn], [1.4, 0]]);
    T.torsoRX = k([[0, 0.05], [0.55, -0.3], [0.82, 0.4, eIn], [1.0, 0.35, eOut], [1.4, 0.05]]);
    T.torsoRY = k([[0, 0], [0.55, 0.3], [0.82, -0.15, eIn], [1.4, 0]]);
    T.headRX = k([[0, 0], [0.55, -0.25], [0.82, 0.25, eIn], [1.4, 0]]);
    T.rootY = k([[0, 0], [0.55, 0.04], [0.82, -0.1, eIn], [1.4, 0]]);
    T.legL = -0.3; T.legR = 0.25;
  } else if (u.state === 'dead') {
    fallDeath(u, T, 1, true);
  } else {
    const b = Math.sin(u.life * 1.8);
    T.torsoRX = 0.03 * b; T.headRY = 0.25 * Math.sin(u.life * 0.7); T.armRX = -0.4;
  }
}

export const oni: UnitDef<OniRig> = {
  type: 'oni', name: '鬼', icon: '👹', sub: '陸・近接', cost: 3,
  hp: 700, speed: 0.9, range: 1.6, aggro: 5, radius: 0.85, layer: 'land', hitAir: false, ranged: false, hitH: 1.4,
  barH: 3.2, barW: 1.3, ringR: 0.95, spawnT: 0.7, deathT: 2.4, smooth: 14,
  make,
  base: () => ({
    rootY: 0, rootRX: 0, rootS: 1, torsoRX: 0, torsoRY: 0, torsoRZ: 0, headRX: 0, headRY: 0,
    legL: 0, legR: 0, armLX: 0, armLZ: -0.08, armRX: -0.4, armRZ: 0.12,
  }),
  cycle: () => 1.4,
  pose,
  apply: u => applyRig(u, BINDS),
  attack(u) {
    if (u.st >= 0.82 && !u.fired.hit) {
      strike(u, 0.82, 45, 55);
      u.rig.tip.getWorldPosition(V);
      dust({ x: V.x, z: V.z }, 10, 1.0);
      addShake(0.08);
    }
  },
};
