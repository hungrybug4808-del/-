import * as THREE from 'three';
import { eIn, eOut, hash, rnd, seg } from '../core/math';
import { Vox } from '../core/voxel';
import { addShake, dust, ring, solid } from '../fx/effects';
import { alive, canHit, hurt, units } from '../battle/world';
import { K, applyRig, joint, newRoot, strike, type Piv } from './kit';
import type { Pose, Rig, Unit, UnitDef } from './types';

// スライム：陸・近接・魔素1。ぷるぷる跳ねて体当たりする。
// 攻撃を受けるとときどき分裂し、8体集まるとキングスライム（王冠つき）に合体する

const C = { BODY: 0x4ab8e8, BODY_D: 0x2a8ac0, HI: 0xbfeaff, EYE: 0x16263a, GLINT: 0xffffff, MOUTH: 0x1a3a5a, GOLD: 0xf0c030, GOLD_D: 0xc89820, GEM: 0xd8303a };

/** 丸いしずく形の体。y ごとの半径で積む */
function blob(): Vox {
  const v = new Vox(), R = [5, 6, 6, 6, 5.5, 5, 4, 3, 1.5];
  R.forEach((r, y) => {
    for (let x = -6; x <= 6; x++)
      for (let z = -6; z <= 6; z++) {
        if (Math.hypot(x + 0.5, z + 0.5) > r) continue;
        const hi = y >= 5 && x < -1 && z > 0 && hash(x, y, z) > 0.4;
        v.set(x, y, z, y === 0 ? C.BODY_D : hi ? C.HI : C.BODY);
      }
  });
  v.set(-1, 9, 0, C.BODY).set(-1, 10, 0, C.HI);
  // 顔（前 = +z）
  v.box(-3, 4, 5, 1, 2, 1, C.EYE).box(2, 4, 5, 1, 2, 1, C.EYE).set(-3, 5, 5, C.GLINT).set(2, 5, 5, C.GLINT);
  v.box(-2, 2, 5, 4, 1, 1, C.MOUTH).set(-3, 3, 5, C.MOUTH).set(2, 3, 5, C.MOUTH);
  return v;
}
const BODY = blob();
const KING = blob();
// 王冠
for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) {
  const edge = x === -3 || x === 2 || z === -3 || z === 2;
  if (!edge) continue;
  KING.set(x, 10, z, C.GOLD_D).set(x, 11, z, C.GOLD);
  if ((x + z) % 2 === 0) KING.set(x, 12, z, C.GOLD);
}
KING.set(-1, 11, 3, C.GEM).set(0, 11, 3, C.GEM);

export interface SlimeRig extends Rig { body: THREE.Group }
const P0: Piv = [0, 0, 0];

function makeWith(key: string, v: Vox, s: number) {
  return (mat: THREE.Material): SlimeRig => {
    const root = newRoot();
    const body = joint(root, P0, key, v, [-0.5, 0, -0.5], s, mat);
    return { root, body };
  };
}

/** ぷるぷる跳ねる。big はキングスライム */
function poseFor(big: boolean) {
  const hopH = big ? 0.5 : 0.25;
  return (u: Unit<SlimeRig>, T: Pose, dt: number): void => {
    const t = u.st, k = K(t);
    if (u.state === 'move') {
      u.walk += dt * (big ? 3.2 : 5.5);
      const h = Math.abs(Math.sin(u.walk));
      T.rootY = hopH * h; T.sy = 0.82 + 0.28 * h; T.sx = 1.12 - 0.14 * h;
      const c = Math.cos(u.walk);
      if (big && u.prevC !== undefined && Math.sign(c) !== Math.sign(u.prevC)) { dust(u.pos, 6, 0.9); addShake(0.03); }
      u.prevC = c;
    } else if (u.state === 'attack') {
      // 縮んでためて、跳びかかって体当たり
      const hit = big ? 0.9 : 0.45, end = big ? 1.6 : 0.9;
      T.sy = k([[0, 1], [hit * 0.55, 0.62], [hit * 0.8, 1.3, eOut], [hit, 0.7, eIn], [hit + 0.15, 1.05], [end, 1]]);
      T.sx = 2 - T.sy * (T.sy > 1 ? 0.85 : 1);
      T.rootY = k([[0, 0], [hit * 0.55, 0], [hit * 0.8, hopH * 2.2, eOut], [hit, 0, eIn], [end, 0]]);
      T.rootRX = k([[0, 0], [hit * 0.55, -0.15], [hit * 0.9, 0.35], [end, 0]]);
    } else if (u.state === 'dead') {
      // べちゃっとつぶれて、しずくになって消える
      T.sy = k([[0, 1], [0.2, 1.3], [0.45, 0.15, eIn]]);
      T.sx = k([[0, 1], [0.2, 0.85], [0.45, 1.6, eIn]]);
      T.rootS = 1 - eIn(seg(t, 0.6, 1.3));
      if (t >= 0.45 && !u.fired.splat) {
        u.fired.splat = 1;
        for (let i = 0; i < (big ? 30 : 12); i++)
          solid.spawn({ x: u.pos.x, y: u.pos.y + 0.2, z: u.pos.z }, { x: rnd(-2, 2), y: rnd(1.5, 3.5), z: rnd(-2, 2) }, rnd(0.5, 0.9), rnd(0.06, 0.14) * (big ? 1.6 : 1), i % 3 ? C.BODY : C.HI, 9);
        if (big) addShake(0.12);
      }
    } else {
      const b = Math.sin(u.life * (big ? 2.2 : 3.4));
      T.sy = 1 + 0.06 * b; T.sx = 1 - 0.04 * b;
    }
  };
}
function apply(u: Unit<SlimeRig>): void {
  applyRig(u, []);
  u.rig.body.scale.set(u.P.sx, u.P.sy, u.P.sx);
}
const base = () => ({ rootY: 0, rootRX: 0, rootS: 1, sx: 1, sy: 1 });

export const slime: UnitDef<SlimeRig> = {
  type: 'slime', name: 'スライム', icon: '💧', sub: '陸・近接', cost: 1,
  hp: 60, speed: 1.3, range: 0.8, aggro: 5, radius: 0.35, layer: 'land', hitAir: false, ranged: false, hitH: 0.35,
  barH: 1.05, barW: 0.6, ringR: 0.45, spawnT: 0.5, deathT: 1.4, smooth: 18,
  make: makeWith('slime', BODY, 0.06),
  base, pose: poseFor(false), apply,
  cycle: () => 0.9,
  attack(u) { strike(u, 0.45, 8); },
};

const KING_AREA = 2.3, KING_DMG = 55, KING_BLD = 80;
export const kingslime: UnitDef<SlimeRig> = {
  type: 'kingslime', name: 'キングスライム', icon: '👑', sub: '陸・近接', cost: 8,
  hp: 1000, speed: 0.8, range: 1.8, aggro: 5.5, radius: 1.2, layer: 'land', hitAir: false, ranged: false, hitH: 1.1,
  barH: 3.1, barW: 1.6, ringR: 1.4, spawnT: 1.2, deathT: 1.8, smooth: 14,
  make: makeWith('kingslime', KING, 0.17),
  base, pose: poseFor(true), apply,
  cycle: () => 1.6,
  attack(u) {
    if (u.st < 0.9 || u.fired.hit) return;
    // 着地の衝撃で、前の地上の敵をまとめて押しつぶす
    const t = u.target;
    if (t?.isBld) strike(u, 0.9, 0, KING_BLD);
    u.fired.hit = 1;
    const px = u.pos.x + Math.sin(u.yaw) * 1.2, pz = u.pos.z + Math.cos(u.yaw) * 1.2;
    for (const e of units) if (e.team !== u.team && alive(e) && canHit(u, e) && Math.hypot(e.pos.x - px, e.pos.z - pz) < KING_AREA + e.radius) hurt(e, KING_DMG);
    ring({ x: px, z: pz }, C.HI, 3, 0.5);
    dust({ x: px, z: pz }, 14, 1.3);
    addShake(0.15);
  },
};
