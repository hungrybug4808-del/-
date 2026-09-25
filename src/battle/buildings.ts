import * as THREE from 'three';
import { eIn, hash, rnd, seg } from '../core/math';
import { Vox, part } from '../core/voxel';
import { addShake, dust } from '../fx/effects';
import { scene } from '../render/stage';
import type { Building, Team } from '../units/types';
import { MAP } from '../terrain/generate';
import { CELL, NX, NZ, blocked, colOf, cx, cz, groundY } from '../terrain/grid';
import { TEAM, blds } from './world';

const S1 = 0x8a8f99, S2 = 0x6e737c, S3 = 0x9da3ad;

function castleVox(team: Team): Vox {
  const v = new Vox();
  const stone = (x: number, y: number, z: number) => {
    const h = hash(x, y, z);
    return h > 0.8 ? S2 : h < 0.15 ? S3 : S1;
  };
  const roof = team === 0 ? 0x3d5fb8 : 0xb83d3d, roofD = team === 0 ? 0x2c4690 : 0x8e2c2c;
  v.box(-8, 0, -6, 16, 10, 8, stone);
  for (let x = -8; x < 8; x += 2) {
    v.set(x, 10, 1, stone(x, 10, 1));
    v.set(x, 10, -6, stone(x, 10, -6));
  }
  for (let y = 0; y < 5; y++)
    for (let x = -2; x < 2; x++) {
      v.del(x, y, 1);
      v.set(x, y, 0, 0x3a2a1e);
    }
  v.box(-3, 5, 1, 6, 1, 1, S2);
  [[-12, -6], [8, -6]].forEach(([x0, z0]) => {
    v.box(x0, 0, z0, 4, 15, 5, stone);
    for (let k = 0; k < 3; k++) v.box(x0 - 1 + k, 15 + k, z0 - 1 + k, 6 - 2 * k, 1, 7 - 2 * k, k % 2 ? roofD : roof);
    v.box(x0 + 1, 18, z0 + 2, 2, 1, 1, roofD);
  });
  v.box(-3, 10, -5, 6, 6, 5, stone);
  for (let k = 0; k < 3; k++) v.box(-4 + k, 16 + k, -6 + k, 8 - 2 * k, 1, 7 - 2 * k, k % 2 ? roofD : roof);
  v.box(0, 19, -4, 1, 4, 1, 0x5a391f);
  v.box(1, 21, -4, 3, 2, 1, roof);
  v.box(-7, 6, 2, 2, 3, 1, roof);
  v.box(5, 6, 2, 2, 3, 1, roof);
  return v;
}

function fortVox(team: Team): Vox {
  const v = new Vox();
  const stone = (x: number, y: number, z: number) => {
    const h = hash(x + 40, y, z);
    return h > 0.8 ? S2 : h < 0.15 ? S3 : S1;
  };
  const flag = team === 0 ? 0x3d5fb8 : 0xb83d3d;
  v.box(-4, 0, -4, 8, 9, 8, stone);
  for (let x = -4; x < 4; x++)
    for (let z = -4; z < 4; z++)
      if ((x === -4 || x === 3 || z === -4 || z === 3) && (x + z) & 1) v.set(x, 9, z, stone(x, 9, z));
  for (let y = 0; y < 3; y++)
    for (let x = -1; x < 1; x++) {
      v.del(x, y, 3);
      v.set(x, y, 2, 0x3a2a1e);
    }
  v.box(-1, 4, 4, 2, 1, 1, S2);
  v.box(0, 9, 0, 1, 5, 1, 0x5a391f);
  v.box(1, 12, 0, 3, 2, 1, flag);
  v.box(-4, 5, 4, 1, 2, 1, flag);
  v.box(3, 5, 4, 1, 2, 1, flag);
  return v;
}

export const CASTLE_HP = 2500;
export const FORT_HP = 900;

const CASTLE_S = 0.45, FORT_S = 0.3;

function makeBuilding(kind: Building['kind'], team: Team, z: number): Building {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const castle = kind === 'castle';
  const g = castle
    ? part('castle' + team, castleVox(team), 0, 0, 0, CASTLE_S, mat)
    : part('fort' + team, fortVox(team), 0, 0, 0, FORT_S, mat);
  const y = groundY(0, z);
  g.position.set(0, y, z);
  if (team === 1) g.rotation.y = Math.PI;
  scene.add(g);
  const max = castle ? CASTLE_HP : FORT_HP;
  // 魔王城は正面（中央側）が z の +2、背中が -6（ボクセル単位）
  const back = z - TEAM[team].dir * 6 * CASTLE_S, front = z + TEAM[team].dir * 2 * CASTLE_S;
  const b: Building = {
    isBld: true, kind, team, g, mat, hp: max, max, flash: 0, fallT: -1,
    pos: new THREE.Vector3(0, y, z), radius: castle ? 3 : 1.25, cd: 1,
    box: castle ? { x0: -12 * CASTLE_S, x1: 12 * CASTLE_S, z0: Math.min(back, front), z1: Math.max(back, front) } : undefined,
    aimH: castle ? 2.3 : 1.7, cells: [],
  };
  // 敷地のマスを塞ぐ
  for (let iz = 0; iz < NZ; iz++)
    for (let ix = 0; ix < NX; ix++) {
      const x = cx(ix), zz = cz(iz);
      const inside = b.box
        ? x > b.box.x0 - CELL * 0.4 && x < b.box.x1 + CELL * 0.4 && zz > b.box.z0 - CELL * 0.4 && zz < b.box.z1 + CELL * 0.4
        : Math.hypot(x, zz - z) < b.radius + 0.1;
      if (inside) b.cells.push(colOf(ix, iz));
    }
  blds.push(b);
  return b;
}

export const castles = ([0, 1] as const).map(team => makeBuilding('castle', team, TEAM[team].castleZ));
export const forts = ([0, 1] as const).map(team => makeBuilding('fort', team, team === 0 ? -MAP.fortZ : MAP.fortZ));

/** 建物の変化（崩れた・建て直した）を経路探索に知らせる */
export const bldEvents = { changed: (): void => {} };

function applyBlocked(): void {
  blocked.fill(0);
  for (const b of blds) if (b.hp > 0) for (const c of b.cells) blocked[c] = 1;
  bldEvents.changed();
}
applyBlocked();

/** 被弾の光と、落ちたときに崩れて沈む演出 */
export function updateBuildings(dt: number): void {
  for (const c of blds) {
    c.flash = Math.max(0, c.flash - dt * 3);
    c.mat.emissive.setRGB(0.5 * c.flash, 0.1 * c.flash, 0.05 * c.flash);
    if (c.fallT < 0) continue;
    c.fallT += dt;
    const depth = c.kind === 'castle' ? 4.5 : 3;
    if (c.fallT === dt) applyBlocked();
    c.g.position.y = c.pos.y - depth * eIn(seg(c.fallT, 0, 1.8));
    c.g.rotation.z = 0.05 * Math.sin(c.fallT * 30) * (1 - seg(c.fallT, 0, 1.8));
    if (c.fallT < 1.8) {
      addShake(c.kind === 'castle' ? 0.15 : 0.06);
      if (Math.random() < 0.6) {
        const w = c.kind === 'castle' ? 3 : 1.2;
        const fz = c.box ? (c.team === 0 ? c.box.z1 : c.box.z0) : c.pos.z;
        dust({ x: c.pos.x + rnd(-w, w), z: fz + rnd(-1, 1) }, 3, 1.5);
      }
    } else c.g.visible = false;
  }
}

export function resetBuildings(): void {
  for (const c of blds) {
    c.hp = c.max;
    c.fallT = -1;
    c.g.position.y = c.pos.y;
    c.g.rotation.z = 0;
    c.flash = 0;
    c.g.visible = true;
    c.cd = 1;
  }
  applyBlocked();
}
