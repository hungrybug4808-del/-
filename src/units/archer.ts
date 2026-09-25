import * as THREE from 'three';
import { cl, eIn, eOut, kf, seg, type Key } from '../core/math';
import { Vox, eyeMat, part } from '../core/voxel';
import { fireArrowFrom } from '../battle/projectiles';
import type { Pose, Rig, Unit, UnitDef } from './types';

// 弓兵：サイクロプスの約3分の1の背丈。赤い頭巾の奥は影で、黄色い目だけが光る

const AR = {
  HOOD: 0xc8323a, HOOD_D: 0x9a2330, HOOD_L: 0xe0474f, FACE: 0x221b2d, EYE: 0xffd95a,
  TUNIC: 0xdccba2, TUNIC_D: 0xbfab80, BELT: 0x5e3b22, GOLD: 0xd4a93f, PANTS: 0x3f4a3c, BOOT: 0x4a2f22,
  GLOVE: 0x6b4428, QUIVER: 0x7a4b2a, QUIVER_D: 0x5a3519, FW: 0xf3efe6, FR: 0xc8323a,
  BOW: 0x8b4a28, BOW_D: 0x4f2a16, BOW_T: 0xd8b25a,
};
function arLeg(x0: number): Vox {
  const v = new Vox();
  v.box(x0, 0, -1, 2, 3, 2, (_x, y) => (y <= 1 ? AR.BOOT : AR.PANTS));
  v.box(x0, 0, 1, 2, 1, 1, AR.BOOT);
  return v;
}
const arT = new Vox();
arT.box(-3, 3, -2, 6, 3, 4, (_x, y) => (y === 3 ? AR.BELT : AR.TUNIC));
arT.box(-1, 3, 2, 2, 1, 1, AR.GOLD);
arT.box(-4, 2, -3, 8, 1, 6, AR.TUNIC_D);
arT.box(-3, 2, -3, 6, 4, 1, AR.HOOD_D);
[-3, -1, 1].forEach(x => arT.del(x, 2, -3));
arT.box(-5, 6, -3, 10, 1, 6, AR.HOOD);
arT.box(1, 2, -5, 2, 5, 2, (_x, y) => (y === 6 ? AR.QUIVER_D : AR.QUIVER));
arT.set(1, 7, -5, AR.FW).set(2, 7, -5, AR.FR).set(1, 8, -5, AR.FR).set(2, 8, -5, AR.FW);

const arH = new Vox();
arH.box(-4, 7, -4, 8, 7, 8, (_x, y) => (y >= 13 ? AR.HOOD_L : y === 7 ? AR.HOOD_D : AR.HOOD));
const arEyePos = new Set(['-2,9', '-2,10', '1,9', '1,10']);
for (let x = -3; x <= 2; x++)
  for (let y = 8; y <= 11; y++) {
    arH.del(x, y, 3);
    if (arEyePos.has(x + ',' + y)) arH.del(x, y, 2);
    else arH.set(x, y, 2, AR.FACE);
  }
for (let y = 7; y <= 12; y++) { arH.set(-4, y, 3, AR.HOOD_D); arH.set(3, y, 3, AR.HOOD_D); }
for (let x = -4; x <= 3; x++) { arH.set(x, 7, 3, AR.HOOD_D); arH.set(x, 12, 3, AR.HOOD_D); }
arH.box(-4, 12, 4, 8, 1, 1, AR.HOOD_D);
arH.box(-1, 14, -3, 2, 1, 3, AR.HOOD_L);
arH.box(-1, 15, -4, 2, 1, 2, AR.HOOD);
arH.box(-1, 16, -5, 2, 1, 1, AR.HOOD_D);

const arE = new Vox();
arEyePos.forEach(k => {
  const [x, y] = k.split(',').map(Number);
  arE.set(x, y, 2, AR.EYE);
});
function arArm(x0: number): Vox {
  const v = new Vox();
  v.box(x0, 3, -1, 2, 3, 2, AR.TUNIC);
  v.box(x0, 2, -1, 2, 1, 2, AR.GLOVE);
  return v;
}
const arB = new Vox();
for (let y = -5; y <= 5; y++) {
  const a = Math.abs(y), z = a <= 1 ? 1 : a <= 3 ? 0 : a === 4 ? -1 : -2;
  arB.set(0, y, z, a === 5 ? AR.BOW_T : a <= 1 ? AR.BOW_D : AR.BOW);
}
const arLL = arLeg(-3), arLR = arLeg(1), arAL = arArm(-5), arAR = arArm(3);

export interface ArcherRig extends Rig {
  legL: THREE.Group; legR: THREE.Group; torso: THREE.Group; head: THREE.Group; eyes: THREE.Group;
  armL: THREE.Group; armR: THREE.Group; hand: THREE.Object3D; bow: THREE.Group;
  str: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>; s: number;
}

function makeArcher(mat: THREE.Material): ArcherRig {
  const s = 0.075, root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const legL = part('arLL', arLL, -2, 3, 0, s, mat); legL.position.set(-2 * s, 3 * s, 0); root.add(legL);
  const legR = part('arLR', arLR, 2, 3, 0, s, mat); legR.position.set(2 * s, 3 * s, 0); root.add(legR);
  const torso = part('arT', arT, 0, 3, 0, s, mat); torso.position.set(0, 3 * s, 0); root.add(torso);
  const head = part('arH', arH, 0, 7, 0, s, mat); head.position.set(0, 4 * s, 0); torso.add(head);
  const eyes = part('arE', arE, 0, 10, 0, s, eyeMat, true); eyes.position.set(0, 3 * s, 0); head.add(eyes);
  const armL = part('arAL', arAL, -4, 6, 0, s, mat); armL.position.set(-4 * s, 3 * s, 0); torso.add(armL);
  const armR = part('arAR', arAR, 4, 6, 0, s, mat); armR.position.set(4 * s, 3 * s, 0); torso.add(armR);
  const hand = new THREE.Object3D(); hand.position.set(0, -3.5 * s, 0); armR.add(hand);
  const bow = part('arB', arB, 0.5, 0.5, 1.5, s, mat); bow.position.set(0, -3.5 * s, 0); armL.add(bow);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const str = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xf4efe2 }));
  str.frustumCulled = false;
  bow.add(str);
  return { root, legL, legR, torso, head, eyes, armL, armR, hand, bow, str, s };
}

function pose(u: Unit<ArcherRig>, T: Pose, dt: number): void {
  const t = u.st, K = (keys: Key[]) => kf(keys, t);
  if (u.state === 'move') {
    // 軽く小刻みに跳ねる
    u.walk += dt * 7.5;
    const f = u.walk, s = Math.sin(f);
    Object.assign(T, {
      legL: 0.6 * s, legR: -0.6 * s, rootY: 0.04 * Math.abs(Math.cos(f)), torsoRX: 0.12, torsoRY: 0.08 * s,
      headRZ: 0.06 * s, headRX: -0.05, armRX: -0.6 * s, armLX: -0.35 + 0.25 * s,
    });
  } else if (u.state === 'attack') {
    const ph = u.aimPitch || 0;
    Object.assign(T, {
      torsoRY: 1.35, headRY: -1.25, headRX: -0.7 * ph, torsoRX: -0.18 * cl(ph * 3), legL: -0.35, legR: 0.3,
      armLX: 0, armLZ: -1.5 - ph, bowRX: -ph, bowRY: 0,
    });
    T.armRX = K([[0, -0.6], [0.25, -1.0], [0.7, -0.45], [0.8, -0.45], [0.85, 0.1, eOut], [1.2, 0.05], [1.5, -0.6]]);
    T.armRZ = K([[0, -0.8], [0.25, -1.45], [0.7, -1.2], [0.8, -1.2], [0.85, -0.7, eOut], [1.2, -0.6], [1.5, -0.8]]) - 0.8 * ph;
    T.draw = t < 0.8 ? kf([[0, 0], [0.2, 0], [0.5, 1]], t) : 0;
    if (t > 0.8) {
      const w = t - 0.8;
      T.bowRZ = 0.14 * Math.sin(w * 45) * Math.exp(-w * 9);
    }
  } else if (u.state === 'dead') {
    T.rootRX = K([[0, 0], [0.15, -0.2], [0.6, -1.5, eIn], [0.72, -1.38, eOut], [0.82, -1.45]]);
    T.rootY = 0.18 * Math.sin(Math.PI * seg(t, 0, 0.45)) + 0.3 * seg(t, 0.2, 0.6);
    T.armLZ = -0.3 - 0.6 * seg(t, 0, 0.3);
    T.armRZ = 0.1 + 0.7 * seg(t, 0, 0.3);
    T.rootS = 1 - eIn(seg(t, 0.9, 1.6));
  } else {
    const b = Math.sin(u.life * 3.2);
    T.rootY = 0.008 * (b + 1);
    T.torsoSY = 1 + 0.02 * b;
    T.headRZ = 0.07 * Math.sin(u.life * 1.4);
  }
}

const QB = new THREE.Quaternion(), QP = new THREE.Quaternion(), EB = new THREE.Euler(), NW = new THREE.Vector3();

function apply(u: Unit<ArcherRig>): void {
  const r = u.rig, P = u.P;
  r.root.position.set(u.pos.x, P.rootY, u.pos.z);
  r.root.rotation.set(P.rootRX, u.yawS, 0);
  r.torso.rotation.set(P.torsoRX, P.torsoRY, 0);
  r.torso.scale.y = P.torsoSY;
  r.head.rotation.set(P.headRX, P.headRY, P.headRZ);
  r.legL.rotation.x = P.legL;
  r.legR.rotation.x = P.legR;
  r.armL.rotation.set(P.armLX, 0, P.armLZ);
  r.armR.rotation.set(P.armRX, 0, P.armRZ);
  // 弓は腕の回転を打ち消して、体に対する向きで持つ
  QB.setFromEuler(EB.set(P.bowRX, P.bowRY, P.bowRZ, 'YXZ'));
  QP.copy(r.torso.quaternion).multiply(r.armL.quaternion).invert();
  r.bow.quaternion.copy(QP).multiply(QB);
}

/** 弦の中央を、引いている手の位置へ */
function post(u: Unit<ArcherRig>): void {
  const r = u.rig, s = r.s;
  r.hand.getWorldPosition(NW);
  r.bow.worldToLocal(NW);
  const rest = new THREE.Vector3(0, 0, -3 * s).lerp(NW, u.P.draw);
  const pa = r.str.geometry.attributes.position as THREE.BufferAttribute;
  pa.setXYZ(0, 0, 5 * s, -3 * s);
  pa.setXYZ(1, rest.x, rest.y, rest.z);
  pa.setXYZ(2, 0, -5 * s, -3 * s);
  pa.needsUpdate = true;
}

const V = new THREE.Vector3();

export const archer: UnitDef<ArcherRig> = {
  type: 'archer', name: '弓兵', icon: '🏹', sub: '陸・遠距離', cost: 1,
  hp: 70, speed: 1.5, range: 5.5, aggro: 7.5, radius: 0.35, layer: 'land', hitAir: true, hitH: 0.6,
  barH: 1.45, barW: 0.8, ringR: 0.45, spawnT: 0.6, deathT: 1.8, smooth: 14,
  make: makeArcher,
  base: () => ({
    rootY: 0, rootRX: 0, rootS: 1, torsoRX: 0, torsoRY: 0, torsoSY: 1, headRX: 0, headRY: 0, headRZ: 0,
    legL: 0, legR: 0, armLX: -0.35, armLZ: -0.3, armRX: 0, armRZ: 0.1, bowRX: 1.15, bowRY: 0.3, bowRZ: 0, draw: 0,
  }),
  cycle: () => 1.5,
  pose, apply, post,
  aim(u, p, hd) {
    u.aimPitch = Math.atan2(p.y - 0.55, hd);
  },
  attack(u, _dt, ok) {
    if (u.st >= 0.8 && !u.fired.shot && ok && u.target) {
      u.fired.shot = 1;
      u.rig.bow.getWorldPosition(V);
      fireArrowFrom(V, u.target, 14, u.pos.x);
    }
  },
};
