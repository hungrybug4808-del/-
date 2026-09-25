import * as THREE from 'three';
import { eIn, eOut, hash } from '../core/math';
import { Vox, eyeMat } from '../core/voxel';
import { K, airFall, applyRig, featherWing, flap, joint, newRoot, strike, type Bind, type Piv } from './kit';
import type { Pose, Rig, Unit, UnitDef } from './types';

// グリフォン（ヨーロッパの伝説）：空・近接・魔素2。速い。
// 白いワシの頭と翼に、金色のライオンの体。一度舞い上がってから急降下して襲う

const C = {
  LION: 0xd8a848, LION_D: 0xb88a38, LION_L: 0xe8c068, WHITE: 0xf4f0e6, WHITE_D: 0xd8d2c4, BEAK: 0xf0c040, BEAK_D: 0xc89020,
  EYE: 0xffc830, TALON: 0xe8c040, CLAW: 0x3a3a40, WING: 0x7a5a3a, WING_D: 0x5e4428, TUFT: 0x6a4a28,
};
const fur = (x: number, y: number, z: number) => { const h = hash(x, y, z); return h > 0.85 ? C.LION_D : h < 0.15 ? C.LION_L : C.LION; };
const feather = (x: number, y: number, z: number) => (hash(x, y, z) > 0.75 ? C.WHITE_D : C.WHITE);

const body = new Vox().box(-3, -2, -6, 6, 5, 11, fur).box(-3, -2, 2, 6, 5, 3, feather).box(-3, 3, 1, 6, 1, 4, feather);
const head = new Vox().box(-2, 2, 4, 4, 5, 4, feather).box(-2, 3, 8, 3, 2, 2, C.BEAK).box(-1, 2, 9, 2, 1, 1, C.BEAK_D).box(-2, 7, 4, 4, 1, 2, C.WHITE_D);
const eyes = new Vox().set(-3, 5, 6, C.EYE).set(2, 5, 6, C.EYE);
const front = (x0: number) => new Vox().box(x0, -6, 2, 2, 4, 2, C.TALON).box(x0 - 1, -7, 2, 3, 1, 3, C.CLAW);
const back = (x0: number) => new Vox().box(x0, -6, -5, 2, 4, 2, fur).box(x0, -7, -5, 2, 1, 3, C.LION_D);
const tail = new Vox().box(0, 0, -9, 1, 1, 3, C.LION_D).box(-1, -1, -11, 3, 3, 2, C.TUFT);
const wIn = featherWing(8, 6, (i, edge) => (edge ? C.WING_D : i < 3 ? C.WHITE : C.WING));
const wOut = new Vox();
for (let i = 0; i < 7; i++) { const w = 6 - Math.floor(i / 2), tip = i % 2; for (let z = -w - tip; z <= 1; z++) wOut.set(i, 0, z, z <= -w + 1 ? C.WING_D : i >= 5 ? C.WHITE : C.WING); }

interface Wing { gi: THREE.Group; go: THREE.Group }
export interface GriffonRig extends Rig { body: THREE.Group; head: THREE.Group; legs: THREE.Group[]; tail: THREE.Group; wR: Wing; wL: Wing }
const S = 0.08;
const P0: Piv = [0, 0, 0], PH: Piv = [0, 3, 4];

function make(mat: THREE.Material): GriffonRig {
  const root = newRoot();
  const bodyG = joint(root, P0, 'gfB', body, P0, S, mat);
  const headG = joint(bodyG, P0, 'gfH', head, PH, S, mat);
  joint(headG, PH, 'gfE', eyes, PH, S, eyeMat, true);
  const legs = [joint(bodyG, P0, 'gfFL', front(-3), [-2, -2, 3], S, mat), joint(bodyG, P0, 'gfFR', front(1), [2, -2, 3], S, mat),
    joint(bodyG, P0, 'gfBL', back(-3), [-2, -2, -4], S, mat), joint(bodyG, P0, 'gfBR', back(1), [2, -2, -4], S, mat)];
  const tailG = joint(bodyG, P0, 'gfTl', tail, [0, 0, -6], S, mat);
  const wing = (sign: number): Wing => {
    const gi = joint(bodyG, P0, sign > 0 ? 'gfWI' : 'gfWIm', sign > 0 ? wIn : wIn.mirror(), [sign > 0 ? 0 : -1, 0, 0], S, mat);
    gi.position.set(3 * sign * S, 2.5 * S, 1 * S);
    const go = joint(gi, P0, sign > 0 ? 'gfWO' : 'gfWOm', sign > 0 ? wOut : wOut.mirror(), [sign > 0 ? 0 : -1, 0, 0], S, mat);
    go.position.set(8 * sign * S, 0, 0);
    return { gi, go };
  };
  return { root, body: bodyG, head: headG, legs, tail: tailG, wR: wing(1), wL: wing(-1) };
}
const BINDS: Bind[] = [['head', 'x', 'headRX'], ['head', 'y', 'headRY'], ['tail', 'x', 'tailRX']];

function pose(u: Unit<GriffonRig>, T: Pose): void {
  const t = u.st, k = K(t);
  if (u.state === 'move') {
    Object.assign(T, { rootRX: 0.18, flapF: 7.5, flapA: 0.85, legF: 1.2, legB: 1.3, headRX: -0.1, tailRX: 0.3 });
    T.rootRZ = 0.1 * Math.sin(u.life * 1.3);
  } else if (u.state === 'attack') {
    // 舞い上がって、爪を前に出して急降下
    T.rootY = k([[0, 2.6], [0.5, 3.4], [0.75, 2.0, eIn], [0.95, 2.1], [1.3, 2.6]]);
    T.rootRX = k([[0, 0], [0.5, -0.5], [0.75, 0.7, eIn], [0.95, 0.4], [1.3, 0]]);
    T.legF = k([[0, 1.0], [0.5, 0.6], [0.72, -1.3, eOut], [1.0, -0.8], [1.3, 1.0]]);
    T.wingBase = k([[0, 0.15], [0.5, 0.2], [0.65, 0.9], [0.95, 0.9], [1.1, 0.15]]);
    T.flapA = k([[0, 0.8], [0.5, 1.0], [0.6, 0.1], [0.95, 0.1], [1.1, 0.8]]);
    T.headRX = k([[0, 0], [0.5, -0.3], [0.75, 0.3], [1.3, 0]]);
  } else if (u.state === 'dead') {
    airFall(u, T, 2.6);
    T.flapA = 0.3; T.flapF = 14; T.legF = 0.3; T.legB = 0.3;
  } else {
    T.rootY = 2.6 + 0.1 * Math.sin(u.life * 0.9); T.headRY = 0.4 * Math.sin(u.life * 0.7); T.rootRZ = 0.04 * Math.sin(u.life * 1.3);
  }
}

function apply(u: Unit<GriffonRig>, dt: number): void {
  const P = u.P, s = flap(u, dt, P.flapF), r = u.rig;
  applyRig(u, BINDS);
  r.root.position.y -= 0.1 * P.flapA * s;
  r.legs[0].rotation.x = r.legs[1].rotation.x = P.legF;
  r.legs[2].rotation.x = r.legs[3].rotation.x = P.legB;
  const wz = P.wingBase + P.flapA * s, wo = P.flapA * 0.5 * Math.sin(u.fp - 0.7);
  r.wR.gi.rotation.z = wz; r.wR.go.rotation.z = wo;
  r.wL.gi.rotation.z = -wz; r.wL.go.rotation.z = -wo;
}

export const griffon: UnitDef<GriffonRig> = {
  type: 'griffon', name: 'グリフォン', icon: '🦁', sub: '空・近接', cost: 2,
  hp: 240, speed: 2.5, range: 1.2, aggro: 8, radius: 0.8, layer: 'air', hitAir: true, ranged: false, hitH: 1,
  barH: 1.8, barW: 1.2, ringR: 1.0, spawnT: 1.0, deathT: 2.4, smooth: 10,
  make,
  base: () => ({
    rootY: 2.6, rootRX: 0, rootRZ: 0, rootS: 1, headRX: 0, headRY: 0, tailRX: 0.2, legF: 0.9, legB: 1.0, wingBase: 0.15, flapA: 0.75, flapF: 6,
  }),
  cycle: () => 1.3,
  pose, apply,
  attack(u) { strike(u, 0.75, 32, 28); },
};
