import * as THREE from 'three';
import { hash, rnd, vec } from '../core/math';
import { Vox, part } from '../core/voxel';
import { glow, ring, sparkle } from '../fx/effects';
import { camera, scene } from '../render/stage';
import { MAP } from '../terrain/generate';
import { groundY, surfaceY } from '../terrain/grid';
import type { Layer, Team, Unit } from '../units/types';
import { BAR_BG, BAR_GEO } from './bars';
import { TEAM, alive, hdist, notify, units } from './world';

// 竜脈：上にしばらくいると占領でき、占領中は魔素の回復が速くなる

export interface Vein {
  /** 竜脈の場所（陸＝中央の丘、海＝海の真ん中、空＝浮島） */
  layer: Layer;
  name: string;
  pos: THREE.Vector3;
  g: THREE.Group;
  mat: THREE.MeshLambertMaterial;
  rm: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  bar: THREE.Group;
  fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** -1（敵が占領）〜 +1（自軍が占領） */
  meter: number;
  owner: -1 | Team;
}

/** 占領中の竜脈1か所あたりの魔素回復の上乗せ */
export const VEIN_BONUS = 0.5;
const CAPTURE_R = 1.6;
/** 戦う相手がいないとき、この距離までの竜脈には寄り道する */
const DETOUR_R = 7.5;
const VEIN_NAME: Record<Layer, string> = { land: '陸', sea: '海', air: '空' };

/** その竜脈を占領できるか：空のモンスターはどこでも、陸・海は同じ場所の竜脈だけ */
export function canCapture(u: Unit, v: Vein): boolean {
  return u.air || u.layer === v.layer;
}
const CAPTURE_SPEED = 0.35;

const veinV = new Vox();
[[0, 0, 0, 5], [-2, 0, -1, 3], [1, 0, -2, 4], [2, 0, 1, 3], [-1, 0, 2, 2], [-3, 0, 1, 2]].forEach(([x, y, z, h]) => {
  for (let k = 0; k < h; k++) veinV.set(x, y + k, z, k === h - 1 ? 0xf2e6ff : 0xb48cff);
});
for (let x = -4; x <= 3; x++)
  for (let z = -4; z <= 3; z++) {
    const r = Math.hypot(x + 0.5, z + 0.5);
    if (r > 2.6 && r < 4.2) veinV.set(x, -1, z, hash(x, 9, z) > 0.5 ? 0x6e737c : 0x8a8f99);
  }

export const veins: Vein[] = MAP.veins.map(({ x, z, layer }) => {
  // 海の竜脈は水面から、空の竜脈は浮島の上から生える
  const y = layer === 'sea' ? 0 : layer === 'air' ? surfaceY(x, z) : groundY(x, z);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const g = part('vein', veinV, 0, -1, 0, 0.14, mat);
  g.position.set(x, y, z);
  scene.add(g);
  const rm = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.5, 40), new THREE.MeshBasicMaterial({
    color: 0xd9c8ff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
  }));
  rm.rotation.x = -Math.PI / 2;
  rm.position.set(x, y + 0.03, z);
  scene.add(rm);
  const bar = new THREE.Group(), bg = new THREE.Mesh(BAR_GEO, BAR_BG);
  const fill = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
  bg.scale.set(1.2, 1, 1);
  fill.scale.set(0.001, 0.65, 1);
  fill.position.z = 0.001;
  bg.renderOrder = 10;
  fill.renderOrder = 11;
  bar.add(bg, fill);
  bar.position.set(x, y + 1.3, z);
  scene.add(bar);
  return { layer, name: VEIN_NAME[layer], pos: new THREE.Vector3(x, y, z), g, mat, rm, bar, fill, meter: 0, owner: -1 as const };
});

export function ownedVeins(team: Team): number {
  return veins.filter(v => v.owner === team).length;
}

/** 進軍中のモンスターが寄り道する竜脈（まだ自軍のものでなく、進む先にあるもの） */
export function veinFor(u: Unit): Vein | null {
  let best: Vein | null = null, bd = DETOUR_R;
  for (const v of veins) {
    if (!canCapture(u, v)) continue;
    if (u.team === 0 ? v.meter >= 1 : v.meter <= -1) continue;
    const ahead = u.team === 0 ? v.pos.z > u.pos.z - 1.5 : v.pos.z < u.pos.z + 1.5;
    if (!ahead) continue;
    const d = hdist(u, v);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

export function updateVeins(dt: number): void {
  for (const v of veins) {
    let c0 = 0, c1 = 0;
    for (const u of units) {
      if (!alive(u) || u.state === 'spawn') continue;
      if (canCapture(u, v) && hdist(u, v) < CAPTURE_R) { if (u.team === 0) c0++; else c1++; }
    }
    const prev = v.owner;
    // 数が多いほど速い（3体まで）。両軍がいると止まる
    if (c0 && !c1) v.meter = Math.min(1, v.meter + dt * CAPTURE_SPEED * Math.min(c0, 3));
    if (c1 && !c0) v.meter = Math.max(-1, v.meter - dt * CAPTURE_SPEED * Math.min(c1, 3));
    if (v.meter >= 1) v.owner = 0;
    else if (v.meter <= -1) v.owner = 1;
    else if ((v.owner === 0 && v.meter <= 0) || (v.owner === 1 && v.meter >= 0)) v.owner = -1;
    const own = v.owner;
    if (own !== prev) {
      if (own !== -1) {
        ring(v.pos, TEAM[own].color, 3, 0.6);
        sparkle({ x: v.pos.x, y: v.pos.y + 0.5, z: v.pos.z }, 24, [TEAM[own].color, 0xffffff], 1.5);
      }
      if (own === 0) notify.toast(v.name + 'の竜脈を占領！ 魔素の回復が速くなった');
      else if (own === 1) notify.toast('敵に' + v.name + 'の竜脈を占領された');
    }
  }
}

const VEIN_COL = [new THREE.Color(0x4aa3ff), new THREE.Color(0xff5a5a)], VEIN_N = new THREE.Color(0xd9c8ff);

export function drawVeins(t: number): void {
  for (const v of veins) {
    const col = v.owner === -1 ? VEIN_N : VEIN_COL[v.owner];
    v.rm.material.color.copy(col);
    const k = 0.25 + 0.15 * Math.sin(t * 3 + v.pos.x);
    v.mat.emissive.setRGB(col.r * k, col.g * k, col.b * k);
    const m = Math.abs(v.meter), side = v.meter >= 0 ? 0 : 1;
    v.fill.material.color.copy(m > 0.001 ? VEIN_COL[side] : VEIN_N);
    v.fill.scale.x = Math.max(0.001, 1.2 * m);
    v.fill.position.x = -(1 - m) * 0.6;
    v.bar.quaternion.copy(camera.quaternion);
    if (Math.random() < 0.3)
      glow.spawn(vec(v.pos.x + rnd(-0.5, 0.5), v.pos.y + 0.3, v.pos.z + rnd(-0.5, 0.5)), vec(0, rnd(0.6, 1.2), 0), rnd(0.6, 1.0), rnd(0.03, 0.06), col.getHex(), -0.3);
  }
}

export function resetVeins(): void {
  for (const v of veins) { v.meter = 0; v.owner = -1; }
}
