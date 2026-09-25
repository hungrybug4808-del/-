import * as THREE from 'three';
import { eIn, eOut, hash, kf, rnd, seg, vec, type Key } from '../core/math';
import { Vox, part } from '../core/voxel';
import { addShake, dust, glow, ring, solid } from '../fx/effects';
import { alive, bldAlive, bldDist, blds, canHit, hurt, hurtBld, units } from '../battle/world';
import { groundY } from '../terrain/grid';
import type { Pose, Rig, Unit, UnitDef } from './types';

// サイクロプス：約2頭身、水色の肌、黄色い虹彩に縦長の瞳の一つ目、ツノ1本、トゲ付き棍棒。
// 巨体でとても遅い切り札。ごくまれに目からピンクのビームを撃つ

const CY = {
  SKIN: 0x7fd0e8, SKIN_D: 0x58aac8, SKIN_L: 0xb2e8f5, HORN: 0xf2e8cf, HORN_D: 0xc9b894,
  EYE: 0xfbfaf2, EYE_D: 0xdfe4e2, IRIS: 0xe3b12c, PUPIL: 0x18202e, MOUTH: 0x243049, TOOTH: 0xf6f1e2,
  BROW: 0x3a7f9e, FUR: 0x8c5b34, FUR_D: 0x6a4225, BELT: 0x4b2f1d, GOLD: 0xd4a93f,
  WOOD: 0x7c5130, WOOD_D: 0x5a391f, IRON: 0x6f7883, SPIKE: 0xb4bdc6,
};
const cyFur = (x: number, y: number, z: number) => (hash(x, y, z) > 0.5 ? CY.FUR : CY.FUR_D);

function cyLeg(x0: number): Vox {
  const v = new Vox();
  v.box(x0, 0, -2, 4, 5, 4, (_x, y) => (y === 0 ? CY.SKIN_D : CY.SKIN));
  v.box(x0, 0, 2, 4, 1, 1, CY.SKIN_D);
  return v;
}
const cyT = new Vox();
cyT.box(-6, 4, -3, 12, 8, 7, (x, y, z) => (z === 3 && x >= -3 && x <= 2 && y >= 7 && y <= 10 ? CY.SKIN_L : CY.SKIN));
cyT.box(-7, 3, -4, 14, 3, 9, cyFur);
cyT.box(-7, 6, -4, 14, 1, 9, CY.BELT);
cyT.box(-1, 6, 5, 2, 1, 1, CY.GOLD);
cyT.box(-3, 1, 5, 6, 3, 1, cyFur);
cyT.box(-3, 1, -5, 6, 3, 1, cyFur);

const cyH = new Vox();
cyH.box(-7, 12, -5, 14, 11, 10, (x, y, z) => (y >= 21 && hash(x, y, z) > 0.7 ? CY.SKIN_D : CY.SKIN));
cyH.box(-4, 15, 4, 8, 5, 1, (_x, y) => (y === 19 ? CY.EYE_D : CY.EYE));
cyH.box(-5, 20, 4, 10, 1, 2, CY.BROW);
cyH.set(-1, 19, 5, CY.BROW).set(0, 19, 5, CY.BROW);
cyH.box(-1, 14, 5, 2, 1, 1, CY.SKIN_D);
cyH.box(-4, 13, 4, 8, 1, 1, CY.MOUTH);
cyH.box(-4, 13, 5, 1, 2, 1, CY.TOOTH);
cyH.box(3, 13, 5, 1, 2, 1, CY.TOOTH);
cyH.box(-8, 15, -1, 1, 3, 2, CY.SKIN_D);
cyH.box(7, 15, -1, 1, 3, 2, CY.SKIN_D);
cyH.box(-2, 23, -2, 4, 2, 4, (_x, y) => (y === 23 ? CY.HORN_D : CY.HORN));
cyH.box(-1, 25, -1, 2, 2, 2, CY.HORN);
cyH.box(-1, 27, 0, 2, 1, 2, CY.HORN);
cyH.box(-1, 28, 1, 2, 1, 1, CY.HORN_D);

const cyP = new Vox();
cyP.box(-2, 16, 5, 4, 3, 1, CY.IRIS);
cyP.box(-1, 16, 5, 2, 3, 1, CY.PUPIL);
cyP.set(1, 18, 5, CY.EYE);

function cyArm(side: number): Vox {
  const v = new Vox(), ax = side < 0 ? -10 : 6, fx = side < 0 ? -11 : 6;
  v.box(ax, 6, -2, 4, 6, 4, CY.SKIN);
  v.box(ax, 5, -2, 4, 1, 4, CY.BELT);
  v.box(fx, 1, -3, 5, 4, 6, (_x, y, z) => (z === 2 && y >= 2 ? CY.SKIN_D : CY.SKIN));
  return v;
}
const cyAL = cyArm(-1), cyAR = cyArm(1);

const cyC = new Vox();
cyC.box(7, 2, -3, 3, 2, 13, (_x, _y, z) => (z % 3 === 0 ? CY.WOOD_D : CY.WOOD));
cyC.box(7, 2, -4, 3, 2, 1, CY.IRON);
cyC.box(6, 1, 10, 5, 5, 7, (x, y, z) => (z === 10 || z === 16 ? CY.IRON : hash(x, y, z) > 0.6 ? CY.WOOD_D : CY.WOOD));
[11, 12, 13, 14, 15].forEach((z, i) => {
  const a = i % 2 === 0;
  cyC.set(a ? 7 : 9, 6, z, CY.SPIKE).set(a ? 9 : 7, 0, z, CY.SPIKE).set(5, a ? 2 : 4, z, CY.SPIKE).set(11, a ? 4 : 2, z, CY.SPIKE);
});
cyC.set(7, 2, 17, CY.SPIKE).set(9, 4, 17, CY.SPIKE).set(8, 5, 17, CY.SPIKE);

const cyLL = cyLeg(-5), cyLR = cyLeg(1);

export interface CyclopsRig extends Rig {
  legL: THREE.Group; legR: THREE.Group; torso: THREE.Group; head: THREE.Group; pupil: THREE.Group;
  armL: THREE.Group; armR: THREE.Group; tip: THREE.Object3D;
  beam: THREE.Group; beamO: THREE.Mesh; beamI: THREE.Mesh; flare: THREE.Mesh;
}
/** 見た目の大きさ（1ボクセル） */
const S = 0.14;

// ---- 目からのビーム（試作 cyclops.html と同じ作り） ----
const BEAM_GEO = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
BEAM_GEO.rotateX(Math.PI / 2);
BEAM_GEO.translate(0, 0, 0.5);
const addMat = (c: number, o: number, side: THREE.Side = THREE.FrontSide) =>
  new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side });
const BEAM_O = addMat(0xff4fbf, 0.6, THREE.DoubleSide), BEAM_I = addMat(0xffeaf7, 0.95), FLARE = addMat(0xff7fd4, 0.8);
const FLARE_GEO = new THREE.BoxGeometry(1, 1, 1);

function makeCyclops(mat: THREE.Material): CyclopsRig {
  const s = S, root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const legL = part('cyLL', cyLL, -3, 5, 0, s, mat); legL.position.set(-3 * s, 5 * s, 0); root.add(legL);
  const legR = part('cyLR', cyLR, 3, 5, 0, s, mat); legR.position.set(3 * s, 5 * s, 0); root.add(legR);
  const torso = part('cyT', cyT, 0, 5, 0, s, mat); torso.position.set(0, 5 * s, 0); root.add(torso);
  const head = part('cyH', cyH, 0, 12, 0, s, mat); head.position.set(0, 7 * s, 0); torso.add(head);
  const pupil = part('cyP', cyP, 0, 12, 0, s, mat); head.add(pupil);
  const armL = part('cyAL', cyAL, -8, 11, 0, s, mat); armL.position.set(-8 * s, 6 * s, 0); torso.add(armL);
  const armR = part('cyAR', cyAR, 8, 11, 0, s, mat); armR.position.set(8 * s, 6 * s, 0); torso.add(armR);
  const club = part('cyC', cyC, 8.5, 3, 0, s, mat); club.position.set(0.5 * s, -8 * s, 0); armR.add(club);
  const tip = new THREE.Object3D(); tip.position.set(0, 0.5 * s, 13.5 * s); club.add(tip);
  const eye = new THREE.Object3D(); eye.position.set(0, 5.5 * s, 6.2 * s); head.add(eye);
  const beam = new THREE.Group(); beam.visible = false; eye.add(beam);
  const beamO = new THREE.Mesh(BEAM_GEO, BEAM_O), beamI = new THREE.Mesh(BEAM_GEO, BEAM_I), flare = new THREE.Mesh(FLARE_GEO, FLARE);
  beam.add(beamO, beamI, flare);
  return { root, legL, legR, torso, head, pupil, armL, armR, tip, beam, beamO, beamI, flare };
}

function pose(u: Unit<CyclopsRig>, T: Pose, dt: number): void {
  const t = u.st, K = (keys: Key[]) => kf(keys, t);
  if (u.state === 'move') {
    // 重い足取り。着地ごとに土煙と小さな揺れ
    u.walk += dt * 3.0;
    const f = u.walk, s = Math.sin(f), a = Math.abs(s), imp = Math.pow(a, 6);
    Object.assign(T, {
      legL: 0.5 * s, legR: -0.5 * s, rootY: -0.09 * Math.pow(a, 1.5), torsoRZ: 0.09 * s, torsoRY: 0.06 * s,
      torsoRX: 0.14, torsoSY: 1 - 0.035 * imp, headRX: -0.1 + 0.06 * imp,
      armLX: -0.3 * Math.sin(f - 0.6), armRX: -0.05 + 0.1 * Math.sin(f - 0.6), armLZ: -0.1, armRZ: 0.1,
    });
    const c = Math.cos(f);
    if (u.prevC !== undefined && Math.sign(c) !== Math.sign(u.prevC)) {
      dust({ x: u.pos.x + rnd(-0.3, 0.3), y: u.pos.y, z: u.pos.z }, 5, 0.7);
      addShake(0.02);
    }
    u.prevC = c;
  } else if (u.state === 'attack' && u.atk === 'beam') {
    // 必殺：目を光らせて溜め、光線で前方を左右になぎ払う
    const aim = Math.min(0.9, Math.max(0.1, u.aimPitch || 0.33));
    T.headRX = K([[0, 0], [1.2, -0.22], [1.35, aim, eOut], [2.9, aim], [3.8, 0]]);
    T.headRY = K([[0, 0], [1.35, -0.42], [2.85, 0.42], [3.8, 0]]);
    T.torsoRY = 0.35 * T.headRY;
    T.torsoRX = K([[0, 0], [1.2, -0.12], [1.35, 0.1, eOut], [2.9, 0.08], [3.8, 0]]);
    T.armLZ = K([[0, -0.05], [0.6, -0.5], [3.0, -0.5], [3.8, -0.05]]);
    T.armRZ = K([[0, 0.05], [0.6, 0.5], [3.0, 0.5], [3.8, 0.05]]);
    T.armLX = K([[0, 0], [0.6, 0.2], [3.0, 0.2], [3.8, 0]]);
    T.legL = K([[0, 0], [0.5, -0.3], [3.2, -0.3], [3.8, 0]]);
    T.legR = K([[0, 0], [0.5, 0.25], [3.2, 0.25], [3.8, 0]]);
    T.rootY = K([[0, 0], [0.5, -0.05], [3.2, -0.05], [3.8, 0]]);
    if (t < 1.2) T.torsoRZ = 0.015 * Math.sin(t * 50) * seg(t, 0, 1.2) ** 2;
    else if (t < 2.9) T.torsoRZ = 0.01 * Math.sin(t * 70);
  } else if (u.state === 'attack' && u.atk === 'unit') {
    // モンスターへ：左右にゆっくり重く振り回し、勢いに体を持っていかれる
    T.torsoRY = K([[0, 0], [0.55, 1.0], [0.8, -1.2, eOut], [1.0, -1.25], [1.5, 0]]);
    T.armRX = K([[0, 0], [0.55, -0.8], [0.8, -0.3], [1.5, 0]]);
    T.armRZ = 0.3;
    T.armLZ = K([[0, -0.05], [0.8, -0.5], [1.5, -0.05]]);
    T.headRY = -0.45 * T.torsoRY;
    T.torsoRX = 0.08; T.legL = -0.2; T.legR = 0.15;
    T.rootY = K([[0, 0], [0.8, -0.07], [1.5, 0]]);
  } else if (u.state === 'attack') {
    // 城へ：振り上げて1.5秒溜め、全力で振り下ろす
    T.armRX = K([[0, 0], [0.3, 0.25], [1.3, -2.8], [1.5, -2.95], [1.66, 0.2, eIn], [2.2, 0.15], [2.6, 0]]);
    T.armRZ = K([[0, 0.05], [0.3, 0.1], [1.3, 0.3], [1.5, 0.32], [1.66, 0.15, eIn], [2.6, 0.05]]);
    T.armLX = K([[0, 0], [0.3, 0.1], [1.3, -0.6], [1.5, -0.65], [1.66, 0.6, eIn], [2.2, 0.5], [2.6, 0]]);
    T.armLZ = K([[0, -0.05], [1.3, -0.35], [1.66, -0.2, eIn], [2.6, -0.05]]);
    T.torsoRX = K([[0, 0], [0.3, 0.12], [1.3, -0.35], [1.5, -0.4], [1.66, 0.45, eIn], [1.9, 0.38, eOut], [2.2, 0.4], [2.6, 0]]);
    T.torsoRY = K([[0, 0], [1.3, 0.25], [1.5, 0.27], [1.66, -0.15, eIn], [2.6, 0]]);
    T.headRX = K([[0, 0], [1.3, -0.3], [1.66, 0.3, eIn], [2.2, 0.25], [2.6, 0]]);
    T.torsoSY = K([[0, 1], [0.3, 0.95], [1.3, 1.06], [1.66, 0.9, eIn], [1.95, 0.98], [2.6, 1]]);
    T.rootY = K([[0, 0], [0.3, -0.08], [1.3, 0.04], [1.66, -0.12, eIn], [2.1, -0.07], [2.6, 0]]);
    T.legL = -0.3; T.legR = 0.25;
    if (t > 1.2 && t < 1.5) T.torsoRZ = 0.02 * Math.sin(t * 55);
  } else if (u.state === 'dead') {
    T.rootRX = K([[0, 0], [0.3, -0.2], [1.0, 1.45, eIn], [1.12, 1.35, eOut], [1.25, 1.42]]);
    T.rootY = 0.4 * seg(t, 0.3, 1.0) + 0.3 * seg(t, 1.3, 2.0);
    T.torsoRX = K([[0, 0], [0.3, -0.25], [1.0, 0.15]]);
    T.armLX = -0.7 * seg(t, 0.3, 1.0);
    T.armRX = -0.4 * seg(t, 0.3, 1.0);
    T.rootS = 1 - eIn(seg(t, 1.3, 2.1));
    if (t >= 1.0 && !u.fired.thud) {
      u.fired.thud = 1;
      addShake(0.2);
      dust(u.pos, 16, 1.2);
    }
  } else {
    const b = Math.sin(u.life * 1.5);
    T.torsoSY = 1 + 0.03 * b;
    T.torsoRX = 0.03 * b;
    T.pupil = [0, -1, 0, 1][Math.floor(u.life / 1.7) % 4];
  }
}

function apply(u: Unit<CyclopsRig>): void {
  const r = u.rig, P = u.P;
  r.root.position.set(u.pos.x, u.pos.y + P.rootY, u.pos.z);
  r.root.rotation.set(P.rootRX, u.yawS, 0);
  r.torso.rotation.set(P.torsoRX, P.torsoRY, P.torsoRZ);
  r.torso.scale.y = P.torsoSY;
  r.head.rotation.set(P.headRX, P.headRY, 0);
  r.legL.rotation.x = P.legL;
  r.legR.rotation.x = P.legR;
  r.armL.rotation.set(P.armLX, 0, P.armLZ);
  r.armR.rotation.set(P.armRX, 0, P.armRZ);
  r.pupil.position.x = P.pupil * S;
  if (!(u.state === 'attack' && u.atk === 'beam')) r.beam.visible = false;
}

const V = new THREE.Vector3();
const DMG = 60, CASTLE_DMG = 230;

const E = new THREE.Vector3(), DIR = new THREE.Vector3(), QW = new THREE.Quaternion(), A = new THREE.Vector3();
const BEAM_LEN = 12, BEAM_DPS = 140, BEAM_BLD_DPS = 110;
/** 必殺技は攻撃のたびに 8% の確率。一度撃ったら 15 秒は撃たない */
const BEAM_CHANCE = 0.08, BEAM_COOL = 15;

function beamTick(u: Unit<CyclopsRig>, dt: number): void {
  const r = u.rig, t = u.st;
  if (t < 1.2) {
    // 溜め：目に光の粒が吸い込まれる
    if (Math.random() < 0.8) {
      r.beam.getWorldPosition(E);
      const a = Math.random() * Math.PI * 2, b = rnd(-0.8, 0.8), rr = rnd(0.7, 1.2);
      const o = { x: Math.cos(a) * rr, y: b, z: Math.sin(a) * rr };
      glow.spawn(vec(E.x + o.x, E.y + o.y, E.z + o.z), vec(-o.x * 1.7, -o.y * 1.7, -o.z * 1.7), 0.55, rnd(0.04, 0.07), Math.random() < 0.6 ? 0xff5fc8 : 0xffffff, 0);
    }
  }
  if (t >= 1.3 && !u.fired.fire) { u.fired.fire = 1; addShake(0.2); }
  const firing = t >= 1.3 && t < 2.9;
  r.beam.visible = firing;
  if (!firing) return;
  addShake(0.06);
  const f = seg(t, 1.3, 1.4) * (1 - seg(t, 2.75, 2.9));
  r.beam.getWorldPosition(E);
  DIR.set(0, 0, 1).applyQuaternion(r.beam.getWorldQuaternion(QW));
  // 地形に当たるところまで
  let L = BEAM_LEN;
  for (let d = 0.5; d <= BEAM_LEN; d += 0.25) {
    A.copy(E).addScaledVector(DIR, d);
    if (A.y <= groundY(A.x, A.z)) { L = d; break; }
  }
  const pulse = 1 + 0.18 * Math.sin(t * 45);
  r.beamO.scale.set(0.2 * pulse * f, 0.2 * pulse * f, L);
  r.beamI.scale.set(0.08 * f, 0.08 * f, L);
  r.flare.scale.setScalar(0.5 * pulse * f + 0.001);
  // 光線に触れた敵（陸・海・空どれでも）と建物
  for (const e of units) {
    if (e.team === u.team || !alive(e)) continue;
    A.set(e.pos.x, e.pos.y + (e.air ? 2.6 : e.d.hitH), e.pos.z).sub(E);
    const along = Math.max(0, Math.min(L, A.dot(DIR)));
    if (A.addScaledVector(DIR, -along).length() < 0.7 + e.radius * 0.6) hurt(e, BEAM_DPS * dt);
  }
  for (const b of blds) {
    if (b.team === u.team || !bldAlive(b)) continue;
    for (let d = 1; d <= L; d += 0.5) {
      A.copy(E).addScaledVector(DIR, d);
      if (bldDist({ pos: A }, b) < 0.4 && A.y < b.pos.y + 4) { hurtBld(b, BEAM_BLD_DPS * dt); break; }
    }
  }
  if (L < BEAM_LEN) {
    A.copy(E).addScaledVector(DIR, L);
    for (let i = 0; i < 3; i++) glow.spawn(vec(A.x, A.y + 0.05, A.z), vec(rnd(-1.5, 1.5), rnd(1, 3), rnd(-1.5, 1.5)), rnd(0.3, 0.6), rnd(0.05, 0.1), Math.random() < 0.7 ? 0xff5fc8 : 0xffffff, 6);
    if (Math.random() < 0.5) dust({ x: A.x, z: A.z }, 1, 0.8);
    u.mem.ringT = (u.mem.ringT ?? 0) - dt;
    if (u.mem.ringT <= 0) { ring({ x: A.x, z: A.z }, 0xff5fc8, 1.2, 0.35); u.mem.ringT = 0.12; }
  }
}

function attack(u: Unit<CyclopsRig>, dt: number, ok: boolean): void {
  if (u.atk === 'beam') { beamTick(u, dt); return; }
  if (u.atk === 'unit' && u.st >= 0.72 && !u.fired.hit) {
    // 振り回しは前方の地上の敵をまとめて叩く
    u.fired.hit = 1;
    const px = u.pos.x + Math.sin(u.yaw) * 1.8, pz = u.pos.z + Math.cos(u.yaw) * 1.8;
    for (const e of units)
      if (e.team !== u.team && alive(e) && canHit(u, e) && Math.hypot(e.pos.x - px, e.pos.z - pz) < 2.2 + e.radius) hurt(e, DMG);
    dust({ x: px, y: u.pos.y, z: pz }, 8, 0.9);
    addShake(0.05);
  }
  if (u.atk === 'castle' && u.st >= 1.66 && !u.fired.hit) {
    u.fired.hit = 1;
    if (ok && u.target?.isBld) hurtBld(u.target, CASTLE_DMG);
    u.rig.tip.getWorldPosition(V);
    const p = { x: V.x, y: u.pos.y, z: V.z };
    ring(p, 0xffffff, 3, 0.55);
    dust(p, 20, 1.5);
    addShake(0.3);
    for (let k = 0; k < 20; k++)
      solid.spawn(vec(p.x, p.y + 0.2, p.z), vec(rnd(-2.5, 2.5), rnd(2, 4), rnd(-2.5, 2.5)), rnd(0.7, 1.1), rnd(0.08, 0.15), Math.random() < 0.5 ? 0x8a8f99 : 0x7a5a3c, 9);
  }
}

export const cyclops: UnitDef<CyclopsRig> = {
  type: 'cyclops', name: 'サイクロプス', icon: '👁️', sub: '陸・近接', cost: 5,
  hp: 1300, speed: 0.55, range: 2.0, aggro: 5.5, radius: 1.2, layer: 'land', hitAir: false, ranged: false, hitH: 2.2,
  barH: 4.9, barW: 1.8, ringR: 1.4, spawnT: 0.8, deathT: 2.2, smooth: 14,
  make: makeCyclops,
  base: () => ({
    rootY: 0, rootRX: 0, rootS: 1, torsoRX: 0, torsoRY: 0, torsoRZ: 0, torsoSY: 1, headRX: 0, headRY: 0,
    legL: 0, legR: 0, armLX: 0, armLZ: -0.05, armRX: 0, armRZ: 0.05, pupil: 0,
  }),
  cycle: u => (u.atk === 'beam' ? 3.9 : u.atk === 'castle' ? 2.6 : 1.5),
  startAttack(u) {
    u.rig.beam.visible = false;
    if (u.life - (u.mem.beamAt ?? -BEAM_COOL) >= BEAM_COOL && Math.random() < BEAM_CHANCE) {
      u.atk = 'beam';
      u.mem.beamAt = u.life;
    }
  },
  aim(u, p, hd) { u.aimPitch = Math.atan2(u.pos.y + 2.45 - p.y, Math.max(hd, 0.5)); },
  pose, apply, attack,
};
