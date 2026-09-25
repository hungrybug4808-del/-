import * as THREE from 'three';
import { eIn, eOut, hash, seg } from '../core/math';
import { Vox, eyeMat } from '../core/voxel';
import { fireShot } from '../battle/projectiles';
import { K, anchor, applyRig, joint, newRoot, type Bind, type Piv } from './kit';
import type { Pose, Rig, Unit, UnitDef } from './types';

// ケンタウロス（ギリシャ神話）：陸・遠距離・魔素3。足が速い弓兵。
// 栗毛の馬の体に、緑の服の射手の上半身。駆けながら追い、止まって弓を引く

const C = {
  HORSE: 0x8a5a32, HORSE_D: 0x6e4424, HORSE_L: 0xa06a3e, SOCK: 0xefe6d6, HOOF: 0x2a2220, MANE: 0x2e241c,
  SKIN: 0xe0b48a, SKIN_D: 0xc8966c, HAIR: 0x5a3a20, HAIR_D: 0x44291a, EYE: 0x1c2230, TUNIC: 0x3f7a4a, TUNIC_D: 0x2f5f3a,
  STRAP: 0x6b4428, GOLD: 0xd4a93f, QUIVER: 0x7a4b2a, FEATHER: 0xf3efe6, BOW: 0x8b4a28, BOW_D: 0x4f2a16, BOW_T: 0xd8b25a,
};
const coat = (x: number, y: number, z: number) => { const h = hash(x, y, z); return h > 0.85 ? C.HORSE_D : h < 0.12 ? C.HORSE_L : C.HORSE; };

const body = new Vox().box(-4, 5, -7, 8, 6, 12, coat).box(-4, 5, -7, 8, 1, 12, C.HORSE_D).box(-3, 6, 5, 6, 5, 1, coat);
const legV = (x0: number, z0: number) => new Vox().box(x0, 0, z0, 2, 5, 2, (_x, y) => (y === 0 ? C.HOOF : y <= 1 ? C.SOCK : coat(_x, y, z0)));
const tail = new Vox().box(-1, 8, -9, 2, 3, 2, C.MANE).box(-1, 5, -10, 2, 3, 2, C.MANE).set(0, 4, -10, C.MANE);
const upper = new Vox().box(-3, 11, 1, 6, 6, 4, (_x, y) => (y === 11 ? C.STRAP : C.TUNIC)).box(-3, 11, 1, 6, 1, 4, C.STRAP);
for (let i = 0; i < 6; i++) upper.set(-3 + i, 11 + i, 5, C.STRAP);
upper.box(1, 12, -1, 2, 6, 2, C.QUIVER).set(1, 18, -1, C.FEATHER).set(2, 18, 0, C.FEATHER).set(2, 19, -1, C.FEATHER);
const head = new Vox().box(-3, 17, 0, 6, 6, 6, C.SKIN).box(-3, 21, -1, 6, 3, 7, C.HAIR).box(-4, 17, -1, 1, 6, 5, C.HAIR).box(3, 17, -1, 1, 6, 5, C.HAIR).box(-3, 15, -1, 6, 4, 1, C.HAIR_D);
head.box(-3, 21, 6, 6, 1, 1, C.GOLD).box(-1, 18, 6, 2, 1, 1, C.SKIN_D);
const eyes = new Vox().set(-2, 20, 6, C.EYE).set(1, 20, 6, C.EYE);
const arm = (x0: number) => new Vox().box(x0, 11, 2, 2, 5, 2, (_x, y) => (y >= 15 ? C.TUNIC_D : y === 11 ? C.SKIN_D : C.SKIN));
const bow = new Vox();
for (let y = -6; y <= 6; y++) { const a = Math.abs(y), z = a <= 1 ? 1 : a <= 3 ? 0 : a <= 5 ? -1 : -2; bow.set(0, y, z, a === 6 ? C.BOW_T : a <= 1 ? C.BOW_D : C.BOW); }

export interface CentaurRig extends Rig {
  body: THREE.Group; legs: THREE.Group[]; tail: THREE.Group; upper: THREE.Group; head: THREE.Group;
  armL: THREE.Group; armR: THREE.Group; bow: THREE.Group; hand: THREE.Object3D;
  str: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
}
const S = 0.075;
const P0: Piv = [0, 0, 0], PB: Piv = [0, 8, 0], PU: Piv = [0, 11, 3], PH: Piv = [0, 17, 3], PAL: Piv = [-4, 16, 3], PAR: Piv = [4, 16, 3];

function make(mat: THREE.Material): CentaurRig {
  const root = newRoot();
  const bodyG = joint(root, P0, 'ceB', body, PB, S, mat);
  const legs = ([[-4, 3], [2, 3], [-4, -6], [2, -6]] as const).map(([x, z], i) => joint(bodyG, PB, 'ceL' + i, legV(x, z), [x + 1, 5, z + 1], S, mat));
  const tailG = joint(bodyG, PB, 'ceTl', tail, [0, 10, -7], S, mat);
  const upperG = joint(bodyG, PB, 'ceU', upper, PU, S, mat);
  const headG = joint(upperG, PU, 'ceH', head, PH, S, mat);
  joint(headG, PH, 'ceE', eyes, PH, S, eyeMat, true);
  const armL = joint(upperG, PU, 'ceAL', arm(-5), PAL, S, mat);
  const armR = joint(upperG, PU, 'ceAR', arm(3), PAR, S, mat);
  const hand = anchor(armR, PAR, [4, 11, 3], S);
  const bowG = joint(armL, PAL, 'ceBw', bow, [0, 0, 0], S, mat);
  bowG.position.set(0, -5 * S, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const str = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xf4efe2 }));
  str.frustumCulled = false;
  bowG.add(str);
  return { root, body: bodyG, legs, tail: tailG, upper: upperG, head: headG, armL, armR, bow: bowG, hand, str };
}

const BINDS: Bind[] = [
  ['body', 'x', 'bodyRX'], ['upper', 'x', 'upRX'], ['upper', 'y', 'upRY'], ['head', 'x', 'headRX'], ['head', 'y', 'headRY'],
  ['armL', 'x', 'armLX'], ['armL', 'z', 'armLZ'], ['armR', 'x', 'armRX'], ['armR', 'z', 'armRZ'], ['tail', 'x', 'tailRX'], ['tail', 'y', 'tailRY'],
];

function pose(u: Unit<CentaurRig>, T: Pose, dt: number): void {
  const t = u.st, k = K(t);
  if (u.state === 'move') {
    // 駆け足：前脚と後脚が半周ずれる
    u.walk += dt * 9;
    const f = u.walk;
    Object.assign(T, {
      l0: 0.75 * Math.sin(f), l1: 0.75 * Math.sin(f + 0.5), l2: 0.75 * Math.sin(f + Math.PI), l3: 0.75 * Math.sin(f + Math.PI + 0.5),
      bodyRX: 0.07 * Math.sin(2 * f), rootY: 0.1 * Math.abs(Math.sin(f)), upRX: 0.2 - 0.07 * Math.sin(2 * f), tailRX: 0.9, tailRY: 0.2 * Math.sin(f),
      headRX: -0.15, armLX: -0.3, armRX: -0.3 * Math.sin(f),
    });
  } else if (u.state === 'attack') {
    // 立ち止まって弓を構え、引き絞って放つ
    const ph = u.aimPitch || 0;
    T.upRX = -0.5 * ph; T.headRX = -0.3 * ph;
    T.armLX = -1.5 - ph; T.armLZ = 0.1;
    T.armRX = k([[0, -0.4], [0.3, -1.55], [0.7, -1.4], [0.75, -1.1, eOut], [1.3, -0.4]]) - ph;
    T.armRZ = k([[0, 0], [0.3, -0.2], [0.7, -0.55], [0.75, -0.1, eOut], [1.3, 0]]);
    T.draw = t < 0.7 ? seg(t, 0.2, 0.6) : 0;
    T.l0 = k([[0, 0], [0.1, -0.5], [0.3, 0]]); T.tailRX = 0.5; T.tailRY = 0.15 * Math.sin(u.life * 3);
  } else if (u.state === 'dead') {
    // 脚を折って横倒し
    T.l0 = T.l1 = k([[0, 0], [0.5, -1.2]]); T.l2 = T.l3 = k([[0, 0], [0.5, 1.0]]);
    T.rootRZ = k([[0, 0], [0.3, -0.15], [0.8, 1.35, eIn], [0.9, 1.25, eOut], [1.0, 1.3]]);
    T.rootY = k([[0, 0], [0.8, 0.15]]);
    T.upRX = k([[0, 0], [0.3, -0.4], [0.9, 0.2]]);
    T.rootS = 1 - eIn(seg(t, 1.1, 1.9));
  } else {
    const b = Math.sin(u.life * 1.6);
    T.bodyRX = 0.01 * b; T.tailRX = 0.35 + 0.1 * b; T.tailRY = 0.25 * Math.sin(u.life * 1.1); T.headRY = 0.3 * Math.sin(u.life * 0.6);
    T.l0 = 0.15 * Math.max(0, Math.sin(u.life * 0.9));
  }
}

const NW = new THREE.Vector3(), V = new THREE.Vector3();
function apply(u: Unit<CentaurRig>): void {
  applyRig(u, BINDS);
  const r = u.rig, P = u.P;
  r.legs.forEach((g, i) => (g.rotation.x = P['l' + i]));
  // 弓は腕を上げても縦のまま
  r.bow.rotation.x = -P.armLX;
}
function post(u: Unit<CentaurRig>): void {
  const r = u.rig;
  r.hand.getWorldPosition(NW);
  r.bow.worldToLocal(NW);
  const rest = new THREE.Vector3(0, 0, -2 * S).lerp(NW, u.P.draw);
  const pa = r.str.geometry.attributes.position as THREE.BufferAttribute;
  pa.setXYZ(0, 0, 6 * S, -2 * S); pa.setXYZ(1, rest.x, rest.y, rest.z); pa.setXYZ(2, 0, -6 * S, -2 * S);
  pa.needsUpdate = true;
}

export const centaur: UnitDef<CentaurRig> = {
  type: 'centaur', name: 'ケンタウロス', icon: '🐎', sub: '陸・遠距離', cost: 3,
  hp: 220, speed: 2.2, range: 6, aggro: 8, radius: 0.55, layer: 'land', hitAir: true, ranged: true, hitH: 1.0,
  barH: 2.0, barW: 1.0, ringR: 0.7, spawnT: 0.7, deathT: 2.0, smooth: 14,
  make,
  base: () => ({
    rootY: 0, rootRX: 0, rootRZ: 0, rootS: 1, bodyRX: 0, upRX: 0, upRY: 0, headRX: 0, headRY: 0,
    armLX: -0.3, armLZ: 0.1, armRX: -0.3, armRZ: 0, tailRX: 0.4, tailRY: 0, l0: 0, l1: 0, l2: 0, l3: 0, draw: 0,
  }),
  cycle: () => 1.3,
  pose, apply, post,
  aim(u, p, hd) { u.aimPitch = Math.atan2(p.y - u.pos.y - 1.4, hd); },
  attack(u, _dt, ok) {
    if (u.st >= 0.72 && !u.fired.shot && ok && u.target) {
      u.fired.shot = 1;
      u.rig.hand.getWorldPosition(V);
      fireShot('arrow', V, u.target, 20, u.pos);
    }
  },
};
