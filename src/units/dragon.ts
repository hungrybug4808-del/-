import * as THREE from 'three';
import { eIn, eOut, hash, kf, rnd, seg, vec, type Key } from '../core/math';
import { Vox, eyeMat, part } from '../core/voxel';
import { FIRE, addShake, dust, glow, ring, solid } from '../fx/effects';
import { scene } from '../render/stage';
import { aimPoint, alive, hurt, hurtBld, units } from '../battle/world';
import type { Pose, Rig, Unit, UnitDef } from './types';

// ドラゴンライダー：オレンジのドラゴンに青いマントの騎士。S字の長い首、3本の指骨の翼、刃のような尻尾

const DR = {
  BODY: 0xe0702a, BODY_D: 0xb4521c, BODY_L: 0xf0883c, BELLY: 0xf4d9a0, BELLY_D: 0xe2bf7e,
  HORN: 0x2e2a2e, HORN_T: 0xe8dcc0, SPIKE: 0x2e2a2e, WING: 0x9c2f1c, WING_D: 0x7a2214, WBONE: 0xc25a20,
  EYE: 0xfff06a, TOOTH: 0xf6f1e2, MOUTH: 0x5a1420, NOSE: 0x3a1a10, SADDLE: 0x6b3a1e, SADDLE_D: 0x4a2612,
  GOLD: 0xd4a93f, STEEL: 0x9aa4b0, STEEL_D: 0x5d6670, VISOR: 0x1c2230, BLUE: 0x2d4a8c, BLUE_D: 0x223a70,
  GLOVE: 0x5e3b22, WOOD: 0x8b5a30,
};
const drScale = (x: number, y: number, z: number) => {
  const h = hash(x, y, z);
  return h > 0.82 ? DR.BODY_D : h < 0.12 ? DR.BODY_L : DR.BODY;
};
const drBelly = (z: number) => (z & 1 ? DR.BELLY : DR.BELLY_D);

const drBody = new Vox();
for (let z = -7; z <= 6; z++) {
  const chest = z >= 1, h = chest ? 5 : 4, y0 = chest ? -4 : -3, y1 = chest || z <= -4 ? 3 : 2;
  for (let x = -h; x < h; x++)
    for (let y = y0; y <= y1; y++) {
      if ((x === -h || x === h - 1) && (y === y0 || y === y1)) continue;
      drBody.set(x, y, z, y === y0 ? drBelly(z) : z === 6 && y <= 0 ? DR.BELLY : drScale(x, y, z));
    }
}
[[-6, 2], [-4, 2], [-2, 1], [5, 2]].forEach(([z, hgt]) => {
  for (let k = 0; k < hgt; k++) drBody.box(-1, 4 + k, z, 2, 1, 1, DR.SPIKE);
});
drBody.box(-3, 3, -1, 6, 1, 5, DR.SADDLE);
drBody.box(-2, 4, -1, 4, 1, 1, DR.SADDLE_D);
drBody.box(-1, 4, 3, 2, 1, 1, DR.GOLD);
drBody.box(-3, 3, -1, 6, 1, 1, DR.GOLD);

const drN1 = new Vox();
drN1.box(-3, -2, 7, 6, 6, 4, (x, y, z) => (y === -2 ? drBelly(z) : drScale(x, y, z)));
drN1.box(-1, 4, 8, 2, 1, 1, DR.SPIKE);
drN1.box(-1, 4, 10, 2, 1, 1, DR.SPIKE);
const drN2 = new Vox();
drN2.box(-2, -2, 11, 4, 5, 4, (x, y, z) => (y === -2 ? drBelly(z) : drScale(x, y, z)));
drN2.box(-1, 3, 12, 2, 1, 1, DR.SPIKE);
drN2.box(-1, 3, 14, 2, 1, 1, DR.SPIKE);
const drN3 = new Vox();
drN3.box(-2, -1, 15, 4, 4, 3, (x, y, z) => (y === -1 ? drBelly(z) : drScale(x, y, z)));
drN3.box(-1, 3, 16, 2, 1, 1, DR.SPIKE);

const drHd = new Vox();
drHd.box(-3, -1, 18, 6, 5, 5, drScale);
drHd.box(-2, -1, 23, 4, 3, 4, drScale);
drHd.box(-2, -1, 27, 4, 2, 1, drScale);
drHd.set(-2, 0, 27, DR.NOSE).set(1, 0, 27, DR.NOSE);
drHd.box(-1, 2, 24, 2, 1, 1, DR.HORN).box(-1, 3, 23, 2, 1, 1, DR.HORN_T);
drHd.box(-4, 3, 20, 2, 1, 3, DR.BODY_D);
drHd.box(2, 3, 20, 2, 1, 3, DR.BODY_D);
drHd.del(-3, 2, 22).del(2, 2, 22);
[[-3, 4, 19], [-3, 4, 18], [-4, 5, 17], [-4, 5, 16], [-4, 6, 15], [-5, 6, 14], [-5, 7, 13], [-5, 7, 12]].forEach(([x, y, z], i) => {
  const c = i >= 6 ? DR.HORN_T : DR.HORN;
  drHd.set(x, y, z, c);
  drHd.set(-1 - x, y, z, c);
});
[[-4, 1, 19], [-4, 1, 18], [-5, 1, 17], [-5, 2, 16]].forEach(([x, y, z]) => {
  drHd.set(x, y, z, DR.SPIKE);
  drHd.set(-1 - x, y, z, DR.SPIKE);
});
drHd.set(-3, -1, 25, DR.TOOTH).set(-3, -2, 25, DR.TOOTH).set(2, -1, 25, DR.TOOTH).set(2, -2, 25, DR.TOOTH);
const drEye = new Vox();
drEye.set(-3, 2, 22, DR.EYE).set(2, 2, 22, DR.EYE);
const drJ = new Vox();
drJ.box(-2, -3, 19, 4, 2, 8, (x, y, z) =>
  y === -3 ? drBelly(z) : x === -2 || x === 1 ? (z & 1 && z >= 21 ? DR.TOOTH : DR.BODY) : DR.MOUTH);
drJ.box(-1, -4, 20, 2, 1, 1, DR.SPIKE);

const drFL = new Vox();
drFL.box(-6, -5, 2, 3, 3, 4, drScale);
drFL.box(-6, -8, 3, 3, 3, 3, drScale);
drFL.box(-6, -9, 3, 3, 1, 4, DR.BODY_D);
for (let x = -6; x <= -4; x++) drFL.set(x, -9, 7, DR.SPIKE);
const drBL = new Vox();
drBL.box(-7, -5, -7, 4, 4, 5, drScale);
drBL.box(-6, -8, -6, 3, 3, 3, drScale);
drBL.box(-6, -9, -6, 3, 1, 5, DR.BODY_D);
for (let x = -6; x <= -4; x++) drBL.set(x, -9, -1, DR.SPIKE);
const drFR = drFL.mirror(), drBR = drBL.mirror();

// ---- 翼（内側と外側の2枚。膜の縁は波形に削る） ----
type P2 = readonly [number, number];
function vline(v: Vox, x0: number, z0: number, x1: number, z1: number, c: number): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), z = Math.round(z0 + ((z1 - z0) * i) / n);
    v.set(x, 0, z, c);
    v.set(x, 1, z, c);
  }
}
function inPoly(px: number, pz: number, poly: readonly P2[]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
function scallop(px: number, pz: number, edges: readonly (readonly [P2, P2, number])[]): boolean {
  for (const [a, b, depth] of edges) {
    const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez;
    const u = ((px - a[0]) * ex + (pz - a[1]) * ez) / L2;
    if (u <= 0 || u >= 1) continue;
    const dist = Math.abs((px - a[0]) * ez - (pz - a[1]) * ex) / Math.sqrt(L2);
    if (dist < depth * Math.sin(Math.PI * u)) return true;
  }
  return false;
}
const drWI = new Vox(), drWO = new Vox();
{
  const polyI: P2[] = [[0, 1], [11, 1], [11, -9], [0, -10]];
  for (let x = 0; x <= 10; x++)
    for (let z = -10; z <= 0; z++) {
      const px = x + 0.5, pz = z + 0.5;
      if (inPoly(px, pz, polyI) && !scallop(px, pz, [[[11, -9], [0, -10], 1.3]]))
        drWI.set(x, 0, z, hash(x, 3, z) > 0.7 ? DR.WING_D : DR.WING);
    }
  vline(drWI, 0, 0, 10, 0, DR.WBONE);
  drWI.box(0, 0, 1, 4, 2, 1, DR.WBONE);
  const A: P2 = [11, 0], B: P2 = [9, -7], Cc: P2 = [4, -11], J: P2 = [0, -9];
  const poly: P2[] = [[0, 1], A, B, Cc, J];
  for (let x = 0; x <= 12; x++)
    for (let z = -12; z <= 1; z++) {
      const px = x + 0.5, pz = z + 0.5;
      if (inPoly(px, pz, poly) && !scallop(px, pz, [[A, B, 2], [B, Cc, 2.4], [Cc, J, 2]]))
        drWO.set(x, 0, z, hash(x, 5, z) > 0.7 ? DR.WING_D : DR.WING);
    }
  vline(drWO, 0, 0, 11, 0, DR.WBONE);
  vline(drWO, 0, 0, 9, -7, DR.WBONE);
  vline(drWO, 0, 0, 4, -11, DR.WBONE);
  drWO.set(12, 0, 0, DR.SPIKE).set(12, 1, 0, DR.SPIKE);
  drWO.set(0, 2, 1, DR.SPIKE);
}
const drWIm = drWI.mirror(), drWOm = drWO.mirror();

// ---- 尻尾（6節。先端は刃） ----
const TWd = [6, 6, 4, 4, 2, 2], THd = [5, 4, 4, 3, 2, 2];
const drTail = TWd.map((w, i) => {
  const v = new Vox(), h = THd[i], y0 = -Math.floor(h / 2), z0 = -7 - 4 * (i + 1);
  v.box(-w / 2, y0, z0, w, h, 4, (x, y, z) => (y === y0 ? drBelly(z) : drScale(x, y, z)));
  if (i < 5) v.box(-1, y0 + h, z0 + 1, 2, i < 3 ? 2 : 1, 1, DR.SPIKE);
  if (i === 5) {
    v.box(-3, -1, z0, 6, 1, 1, DR.SPIKE);
    v.box(-2, -1, z0 - 1, 4, 1, 1, DR.SPIKE);
    v.box(-2, -1, z0 - 2, 4, 1, 1, DR.SPIKE);
    v.box(-1, -1, z0 - 3, 2, 1, 1, DR.SPIKE);
  }
  return v;
});

// ---- 騎士 ----
const rLeg = new Vox();
rLeg.box(-7, 0, -1, 5, 2, 3, DR.STEEL_D);
rLeg.box(-8, -5, 0, 2, 5, 2, DR.STEEL);
rLeg.box(-8, -6, 0, 2, 1, 3, DR.GLOVE);
const rLegM = rLeg.mirror();
const rPel = new Vox();
rPel.box(-2, 0, -1, 4, 2, 3, DR.STEEL_D);
const rTor = new Vox();
rTor.box(-3, 2, -2, 6, 4, 4, (_x, y) => (y === 2 ? DR.GOLD : DR.STEEL));
rTor.box(-1, 4, 2, 2, 1, 1, DR.GOLD);
rTor.box(-5, 5, -2, 2, 2, 4, DR.STEEL_D);
rTor.box(3, 5, -2, 2, 2, 4, DR.STEEL_D);
rTor.box(-3, 1, -3, 6, 5, 1, (_x, y) => (y === 1 ? DR.BLUE_D : DR.BLUE));
const rHd = new Vox();
rHd.box(-3, 6, -3, 6, 6, 6, DR.STEEL);
rHd.box(-2, 8, 2, 4, 1, 1, DR.VISOR);
rHd.box(-1, 7, 2, 2, 1, 1, DR.VISOR);
rHd.box(-1, 12, -3, 2, 1, 6, DR.GOLD);
rHd.box(-1, 13, -2, 2, 1, 4, DR.BLUE);
rHd.box(-1, 10, -4, 2, 3, 1, DR.BLUE);
rHd.box(-1, 12, -4, 2, 1, 1, DR.BLUE);
const rAL = new Vox();
rAL.box(-5, 2, -1, 2, 3, 2, DR.STEEL);
rAL.box(-5, 1, -1, 2, 1, 2, DR.GLOVE);
const rAR = rAL.mirror();
const rSp = new Vox();
rSp.box(0, 0, -6, 1, 1, 22, DR.WOOD);
rSp.box(-1, -1, 1, 3, 3, 1, DR.STEEL_D);
rSp.box(-1, 0, 16, 3, 1, 1, DR.STEEL);
rSp.box(0, 0, 17, 1, 1, 3, DR.STEEL);
rSp.box(0, 1, 11, 1, 3, 4, (_x, y) => (y === 2 ? DR.GOLD : DR.BLUE));

interface Wing { gi: THREE.Group; go: THREE.Group }
export interface DragonRig extends Rig {
  body: THREE.Group; n1: THREE.Group; n2: THREE.Group; n3: THREE.Group; head: THREE.Group; jaw: THREE.Group;
  mouth: THREE.Object3D; bitL: THREE.Object3D; bitR: THREE.Object3D; legs: THREE.Group[];
  wR: Wing; wL: Wing; tails: THREE.Group[];
  rT: THREE.Group; rH: THREE.Group; rL: THREE.Group; rR: THREE.Group; rHand: THREE.Object3D; sp: THREE.Group;
  reins: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
}

function makeDragon(mat: THREE.Material): DragonRig {
  const S = 0.1, SR = 0.07, root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = part('drBody', drBody, 0, 0, 0, S, mat); root.add(body);
  const n1 = part('drN1', drN1, 0, 1, 7, S, mat); n1.position.set(0, S, 7 * S); body.add(n1);
  const n2 = part('drN2', drN2, 0, 1, 11, S, mat); n2.position.set(0, 0, 4 * S); n1.add(n2);
  const n3 = part('drN3', drN3, 0, 1, 15, S, mat); n3.position.set(0, 0, 4 * S); n2.add(n3);
  const head = part('drHd', drHd, 0, 1, 18, S, mat); head.position.set(0, 0, 3 * S); n3.add(head);
  head.add(part('drEye', drEye, 0, 1, 18, S, eyeMat, true));
  const jaw = part('drJ', drJ, 0, -1, 19, S, mat); jaw.position.set(0, -2 * S, S); head.add(jaw);
  const mouth = new THREE.Object3D(); mouth.position.set(0, -2.5 * S, 9.5 * S); head.add(mouth);
  const bitL = new THREE.Object3D(); bitL.position.set(-2.3 * S, -1.8 * S, 6 * S); head.add(bitL);
  const bitR = new THREE.Object3D(); bitR.position.set(2.3 * S, -1.8 * S, 6 * S); head.add(bitR);
  const legs = ([['drFL', drFL, -4.5, 4], ['drFR', drFR, 4.5, 4], ['drBL', drBL, -5, -5], ['drBR', drBR, 5, -5]] as const).map(([k, v, x, z]) => {
    const g = part(k, v, x, -2, z, S, mat);
    g.position.set(x * S, -2 * S, z * S);
    body.add(g);
    return g;
  });
  function wing(sign: number): Wing {
    const gi = part(sign > 0 ? 'drWI' : 'drWIm', sign > 0 ? drWI : drWIm, 0, 0.5, 0.5, S, mat);
    const go = part(sign > 0 ? 'drWO' : 'drWOm', sign > 0 ? drWO : drWOm, 0, 0.5, 0.5, S, mat);
    gi.rotation.order = 'YZX';
    gi.position.set(5 * sign * S, 2.5 * S, 3.5 * S);
    go.position.set(11 * sign * S, 0, 0);
    gi.add(go);
    body.add(gi);
    return { gi, go };
  }
  const wR = wing(1), wL = wing(-1);
  const tails: THREE.Group[] = [];
  drTail.forEach((v, i) => {
    const g = part('drT' + i, v, 0, 0, -7 - 4 * i, S, mat);
    if (i === 0) { g.position.set(0, 0, -7 * S); body.add(g); }
    else { g.position.set(0, 0, -4 * S); tails[i - 1].add(g); }
    tails.push(g);
  });
  const rider = new THREE.Group(); rider.position.set(0, 4 * S, 1.5 * S); body.add(rider);
  rider.add(part('rLeg', rLeg, 0, 0, 0, SR, mat));
  rider.add(part('rLegM', rLegM, 0, 0, 0, SR, mat));
  rider.add(part('rPel', rPel, 0, 0, 0, SR, mat));
  const rT = part('rTor', rTor, 0, 2, 0, SR, mat); rT.position.set(0, 2 * SR, 0); rider.add(rT);
  const rH = part('rHd', rHd, 0, 6, 0, SR, mat); rH.position.set(0, 4 * SR, 0); rT.add(rH);
  const rL = part('rAL', rAL, -4, 5, 0, SR, mat); rL.position.set(-4 * SR, 3 * SR, 0); rT.add(rL);
  const rR = part('rAR', rAR, 4, 5, 0, SR, mat); rR.position.set(4 * SR, 3 * SR, 0); rT.add(rR);
  const rHand = new THREE.Object3D(); rHand.position.set(0, -3.5 * SR, 0); rL.add(rHand);
  const sp = part('rSp', rSp, 0.5, 0.5, 0.5, SR, mat); sp.position.set(0, -3.5 * SR, 0); rR.add(sp);
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const reins = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: 0x3a2412 }));
  reins.frustumCulled = false;
  scene.add(reins);
  return { root, body, n1, n2, n3, head, jaw, mouth, bitL, bitR, legs, wR, wL, tails, rT, rH, rL, rR, rHand, sp, reins };
}

function pose(u: Unit<DragonRig>, T: Pose): void {
  const t = u.st, K = (keys: Key[]) => kf(keys, t);
  if (u.state === 'move') {
    Object.assign(T, {
      rootRX: 0.12, flapF: 7, flapA: 0.9, n1: -0.12, n2: -0.02, n3: 0.08, headRX: 0.0, legF: 1.3, legB: 1.4,
      tailRX: 0.08, tailA: 0.08, tailF: 2.4, rLean: 0.4, rArmR: -0.7, rSpear: -0.1,
    });
    T.rootRZ = 0.08 * Math.sin(u.life * 1.1);
  } else if (u.state === 'attack') {
    // 首を引いて息を吸い、狙いへ首を伸ばしてブレス
    const back = K([[0, 0], [0.6, 1], [0.8, 0, eOut]]);
    const strike = K([[0, 0], [0.6, 0], [0.8, 1, eOut], [2.1, 1], [2.8, 0]]);
    const need = (u.aimPitch || 0.6) + 0.08;
    T.n1 += -0.3 * back + 0.3 * need * strike;
    T.n2 += -0.3 * back + 0.25 * need * strike;
    T.n3 += -0.2 * back + 0.2 * need * strike;
    T.headRX += -0.2 * back + 0.25 * need * strike;
    T.rootRX += -0.25 * back;
    T.jaw = K([[0, 0], [0.6, 0.15], [0.8, 0.8, eOut], [2.1, 0.8], [2.4, 0]]);
    T.rArmR = K([[0, -0.35], [0.4, -1.5], [2.3, -1.5], [2.8, -0.35]]);
    T.rSpear = K([[0, -1.2], [0.4, 0.1], [2.3, 0.1], [2.8, -1.2]]);
    u.inhale = seg(t, 0, 0.6) * (1 - seg(t, 0.75, 0.9));
  } else if (u.state === 'dead') {
    T.rootY = K([[0, 2.6], [0.3, 2.8], [1.1, 0.7, eIn]]);
    T.rootRZ = K([[0, 0], [0.3, -0.2], [1.1, 1.2, eIn], [1.25, 1.1], [1.4, 1.15]]);
    T.rootRX = K([[0, -0.1], [0.3, -0.4], [1.1, 0.15]]);
    T.flapA = K([[0, 0.72], [0.3, 1.2], [0.6, 0.2], [1.1, 0]]);
    T.flapF = 8;
    T.wingBase = K([[0, 0.15], [1.1, -0.3]]);
    T.wingOut = K([[0, 0], [1.1, -0.4]]);
    T.n1 = K([[0, -0.28], [0.3, -0.8], [1.1, -0.1], [1.4, 0.2]]);
    T.jaw = K([[0, 0], [0.3, 0.7], [1.4, 0.3]]);
    T.legF = K([[0, 1], [1.1, 0.3]]);
    T.legB = K([[0, 1.15], [1.1, 0.3]]);
    T.tailA = 0.03;
    T.rLean = K([[0, 0.1], [0.3, -0.5], [1.1, 0.4]]);
    T.rArmR = K([[0, -0.35], [0.3, -2.2], [1.1, -0.8]]);
    T.rArmL = K([[0, -1], [0.3, -2.0], [1.1, -0.6]]);
    T.rootS = 1 - eIn(seg(t, 1.6, 2.6));
    if (t >= 1.1 && !u.fired.crash) {
      u.fired.crash = 1;
      addShake(0.3);
      ring(u.pos, 0xd9cdb5, 3.5, 0.7);
      dust(u.pos, 30, 1.8);
    }
  } else {
    T.rootRZ = 0.04 * Math.sin(u.life * 1.3);
    T.rootY += 0.1 * Math.sin(u.life * 0.9);
  }
}

function apply(u: Unit<DragonRig>, dt: number): void {
  const r = u.rig, P = u.P;
  // 羽ばたきに合わせて体が上下する
  u.fp += dt * P.flapF;
  u.tp += dt * P.tailF;
  const sf = Math.sin(u.fp);
  r.root.position.set(u.pos.x, P.rootY - 0.1 * P.flapA * sf, u.pos.z);
  r.root.rotation.set(P.rootRX, u.yawS, P.rootRZ);
  r.n1.rotation.x = P.n1;
  r.n2.rotation.x = P.n2;
  r.n3.rotation.x = P.n3;
  r.head.rotation.set(P.headRX, P.headRY, 0);
  r.jaw.rotation.x = P.jaw;
  r.legs[0].rotation.x = r.legs[1].rotation.x = P.legF;
  r.legs[2].rotation.x = r.legs[3].rotation.x = P.legB;
  const wz = P.wingBase + P.flapA * sf, wo = P.wingOut + P.flapA * 0.55 * Math.sin(u.fp - 0.7);
  r.wR.gi.rotation.set(0, 0, wz);
  r.wR.go.rotation.set(0, 0, wo);
  r.wL.gi.rotation.set(0, 0, -wz);
  r.wL.go.rotation.set(0, 0, -wo);
  r.tails.forEach((g, i) => g.rotation.set(P.tailRX, P.tailA * Math.sin(u.tp - i * 0.7), 0));
  // 騎士はドラゴンの動きに合わせて体を傾ける
  r.rT.rotation.set(P.rLean - 0.5 * P.rootRX + 0.04 * P.flapA * sf, 0, -0.4 * P.rootRZ);
  r.rL.rotation.x = P.rArmL;
  r.rR.rotation.x = P.rArmR;
  r.sp.rotation.x = P.rSpear;
}

const V = new THREE.Vector3();
/** 手綱を、くつわと騎士の手の間に張る */
function post(u: Unit<DragonRig>): void {
  const r = u.rig, pa = r.reins.geometry.attributes.position as THREE.BufferAttribute;
  r.reins.visible = u.P.rootS > 0.5;
  r.bitL.getWorldPosition(V); pa.setXYZ(0, V.x, V.y, V.z);
  r.rHand.getWorldPosition(V); pa.setXYZ(1, V.x, V.y, V.z);
  r.bitR.getWorldPosition(V); pa.setXYZ(2, V.x, V.y, V.z);
  pa.needsUpdate = true;
}

const FQ = new THREE.Quaternion(), FD = new THREE.Vector3(), FP = new THREE.Vector3();
function breatheFx(u: Unit<DragonRig>): void {
  u.rig.mouth.getWorldPosition(FP);
  u.rig.mouth.getWorldQuaternion(FQ);
  FD.set(0, 0, 1).applyQuaternion(FQ);
  for (let i = 0; i < 6; i++) {
    const sp = rnd(6.5, 9);
    glow.spawn(
      vec(FP.x, FP.y, FP.z),
      vec((FD.x + rnd(-0.12, 0.12)) * sp, (FD.y + rnd(-0.12, 0.12)) * sp, (FD.z + rnd(-0.12, 0.12)) * sp),
      rnd(0.45, 0.6), rnd(0.13, 0.2), FIRE[(Math.random() * FIRE.length) | 0], -1.5, 0.6, { gr: 2.2, fl: true },
    );
  }
}

const DPS = 55, CASTLE_DPS = 65;

export const dragon: UnitDef<DragonRig> = {
  type: 'dragon', name: 'ドラゴンライダー', icon: '🐉', sub: '空・ブレス', cost: 5,
  hp: 420, speed: 1.1, range: 5, aggro: 7.5, radius: 1.3, layer: 'air', hitAir: true, hitH: 2.6,
  barH: 4.4, barW: 1.6, ringR: 1.4, spawnT: 1.2, deathT: 2.8, smooth: 8,
  make: makeDragon,
  base: () => ({
    rootY: 2.6, rootRX: -0.1, rootRZ: 0, rootS: 1, n1: -0.28, n2: -0.1, n3: 0.15, headRX: 0.25, headRY: 0, jaw: 0,
    legF: 1.0, legB: 1.15, wingBase: 0.15, wingOut: 0, flapA: 0.72, flapF: 5.8, tailRX: 0.04, tailA: 0.15, tailF: 1.8,
    rLean: 0.15, rArmL: -1.0, rArmR: -0.35, rSpear: -1.2,
  }),
  cycle: () => 3.0,
  pose, apply, post,
  aim(u, p, hd) {
    u.aimPitch = Math.atan2(3.3 - p.y, Math.max(hd - 2.3, 0.5));
  },
  attack(u, dt, ok) {
    const tgt = u.target;
    if (!(u.st >= 0.8 && u.st < 2.1 && ok && tgt)) return;
    breatheFx(u);
    if (tgt.isBld) hurtBld(tgt, CASTLE_DPS * dt);
    else {
      // ブレスは範囲攻撃。狙った相手と同じ場所（空か地上）の敵を焼く
      const p = aimPoint(tgt, u.pos.x);
      for (const e of units)
        if (e.team !== u.team && alive(e) && e.air === tgt.air && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 1.9 + e.radius * 0.5)
          hurt(e, DPS * dt);
      if (!tgt.air && Math.random() < 0.5)
        solid.spawn(vec(p.x + rnd(-0.4, 0.4), 0.2, p.z + rnd(-0.4, 0.4)), vec(0, rnd(0.6, 1.2), 0), rnd(1, 1.5), rnd(0.15, 0.25), 0x5e5750, -0.3, 0.8, { gr: 1.5 });
    }
    addShake(0.03);
  },
  dispose(u) {
    scene.remove(u.rig.reins);
    u.rig.reins.geometry.dispose();
    u.rig.reins.material.dispose();
  },
};
