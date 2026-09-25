import * as THREE from 'three';
import { eIn, hash } from '../core/math';
import { Vox, eyeMat } from '../core/voxel';
import { addShake } from '../fx/effects';
import { alive, canHit, hurt, units } from '../battle/world';
import { K, applyRig, joint, newRoot, sinkDeath, splash, strike, type Bind, type Piv } from './kit';
import type { Pose, Rig, Unit, UnitDef } from './types';

// クラーケン（北欧の伝承）：海・近接・魔素4。海の壁役。
// 赤紫の大ダコ。黄色い目に横長の瞳、8本の触手。前の2本を振り上げて叩きつける

const C = {
  SKIN: 0x8a2a4a, SKIN_D: 0x6a1e38, SPOT: 0xb04a6a, SUCK: 0xf0b0c0, EYE: 0xffd84a, PUPIL: 0x18101a, LIP: 0x5a1430,
};
const skin = (x: number, y: number, z: number) => { const h = hash(x, y, z); return h > 0.86 ? C.SPOT : h < 0.12 ? C.SKIN_D : C.SKIN; };

const head = new Vox().box(-4, -1, -4, 8, 8, 8, skin).box(-3, 7, -3, 6, 2, 6, skin).box(-2, 9, -3, 4, 1, 5, skin).box(-1, 10, -2, 2, 1, 3, skin)
  .box(-3, -1, 4, 6, 1, 1, C.LIP);
const eyes = new Vox().box(-4, 3, 4, 3, 2, 1, C.EYE).box(1, 3, 4, 3, 2, 1, C.EYE).box(-4, 3, 5, 3, 1, 1, C.PUPIL).box(1, 3, 5, 3, 1, 1, C.PUPIL);
/** 触手の1節（先へ行くほど細い）。z 方向へ伸びる */
function segV(i: number, n: number): Vox {
  const w = i >= n - 1 ? 1 : 2, v = new Vox();
  v.box(-w / 2 | 0, 0, 3 * i, w, w, 3, (x, y, z) => (y === 0 && hash(x, z, 3) > 0.5 ? C.SUCK : skin(x, y, z)));
  if (i === n - 1) v.set(0, 0, 3 * i + 3, C.SKIN_D);
  return v;
}

interface Tentacle { g: THREE.Group; segs: THREE.Group[]; front: boolean; ph: number }
export interface KrakenRig extends Rig { body: THREE.Group; head: THREE.Group; tent: Tentacle[] }
const S = 0.12;
const P0: Piv = [0, 0, 0];

function make(mat: THREE.Material): KrakenRig {
  const root = newRoot();
  const body = new THREE.Group();
  root.add(body);
  const headG = joint(body, P0, 'krH', head, [0, 0, 0], S, mat);
  joint(headG, P0, 'krE', eyes, P0, S, eyeMat, true);
  const tent: Tentacle[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, front = i === 0 || i === 7, n = front ? 5 : 4;
    const g = new THREE.Group();
    g.position.set(Math.sin(a) * 3.2 * S, -0.5 * S, Math.cos(a) * 3.2 * S);
    g.rotation.y = a;
    body.add(g);
    const segs: THREE.Group[] = [];
    let parent: THREE.Object3D = g, pp: Piv = [0, 0, 0];
    for (let j = 0; j < n; j++) {
      const piv: Piv = [0, 0.5, 3 * j];
      const sg = joint(parent, pp, 'krT' + n + '_' + j, segV(j, n), piv, S, mat);
      segs.push(sg);
      parent = sg; pp = piv;
    }
    tent.push({ g, segs, front, ph: i * 0.9 });
  }
  return { root, body, head: headG, tent };
}
const BINDS: Bind[] = [['head', 'x', 'headRX'], ['head', 'z', 'headRZ']];

function pose(u: Unit<KrakenRig>, T: Pose): void {
  const t = u.st, k = K(t);
  if (u.state === 'move') {
    Object.assign(T, { headRX: 0.25, rootY: -0.25, tAmp: 0.35, tF: 4, tLift: 0.1 });
  } else if (u.state === 'attack') {
    // 前の2本を高く振り上げ、ためてから叩きつける
    T.raise = k([[0, 0], [0.9, 1], [1.05, 1], [1.2, -0.3, eIn], [1.5, -0.2], [1.8, 0]]);
    T.headRX = k([[0, 0], [0.9, -0.3], [1.2, 0.35, eIn], [1.8, 0]]);
    T.rootY = k([[0, -0.4], [0.9, -0.1], [1.2, -0.5, eIn], [1.8, -0.4]]);
    T.tAmp = 0.15;
  } else if (u.state === 'dead') {
    sinkDeath(u, T);
    T.tAmp = 0.5; T.tF = 8;
  } else {
    T.headRZ = 0.06 * Math.sin(u.life * 0.9); T.rootY = -0.4 + 0.06 * Math.sin(u.life * 1.3);
  }
}

function apply(u: Unit<KrakenRig>, dt: number): void {
  applyRig(u, BINDS);
  const P = u.P;
  u.tp += dt * P.tF;
  for (const tt of u.rig.tent) {
    tt.segs.forEach((sg, j) => {
      let x = P.tAmp * Math.sin(u.tp - j * 0.8 + tt.ph) - P.tLift * (j === 0 ? 1 : 0);
      if (tt.front) x += j === 0 ? -1.3 * P.raise : j < 3 ? -0.35 * P.raise : 0.2 * P.raise;
      sg.rotation.x = x;
    });
  }
}

const AREA_DMG = 50, CASTLE_DMG = 90;
export const kraken: UnitDef<KrakenRig> = {
  type: 'kraken', name: 'クラーケン', icon: '🐙', sub: '海・近接', cost: 4,
  hp: 900, speed: 0.8, range: 1.6, aggro: 5, radius: 1.2, layer: 'sea', hitAir: false, ranged: false, hitH: 0.8,
  barH: 2.2, barW: 1.5, ringR: 1.4, spawnT: 0.9, deathT: 2.4, smooth: 10,
  make,
  base: () => ({ rootY: -0.4, rootRX: 0, rootRZ: 0, rootS: 1, headRX: 0, headRZ: 0, tAmp: 0.22, tF: 2, tLift: 0, raise: 0 }),
  cycle: () => 1.8,
  pose, apply,
  attack(u) {
    if (u.st < 1.2 || u.fired.slam) return;
    u.fired.slam = 1;
    const px = u.pos.x + Math.sin(u.yaw) * 2, pz = u.pos.z + Math.cos(u.yaw) * 2;
    if (u.target?.isBld) strike(u, 1.2, 0, CASTLE_DMG);
    else for (const e of units) if (e.team !== u.team && alive(e) && canHit(u, e) && Math.hypot(e.pos.x - px, e.pos.z - pz) < 1.8 + e.radius) hurt(e, AREA_DMG);
    splash({ x: px, y: u.pos.y, z: pz }, 16, 1.2);
    addShake(0.12);
  },
};
