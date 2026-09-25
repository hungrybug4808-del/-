import * as THREE from 'three';
import { ring, sparkle } from '../fx/effects';
import { scene } from '../render/stage';
import type { Flag, Team, Unit } from '../units/types';
import { TEAM, alive, units } from './world';

// 旗：選んだモンスターを向かわせる目印。外すと自動進軍に戻る

export const flags: Flag[] = [];
/** 旗モードの状態と、旗で動かすために選んだモンスター */
export const flagMode = { on: false, selected: new Set<Unit>() };

const poleGeo = new THREE.BoxGeometry(0.08, 2.2, 0.08), knobGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16), clothGeo = new THREE.BoxGeometry(0.75, 0.46, 0.04);
const poleMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e }), knobMat = new THREE.MeshLambertMaterial({ color: 0xd4a93f });

function flagMesh(team: Team): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 1.1;
  const knob = new THREE.Mesh(knobGeo, knobMat);
  knob.position.y = 2.25;
  // 布は付け根を軸にはためかせる
  const cloth = new THREE.Group();
  cloth.position.set(0.04, 1.9, 0);
  const c = new THREE.Mesh(clothGeo, new THREE.MeshLambertMaterial({ color: TEAM[team].color }));
  c.position.x = 0.375;
  cloth.add(c);
  g.add(pole, knob, cloth);
  g.traverse(o => { o.castShadow = true; });
  g.userData.cloth = cloth;
  return g;
}

/** 旗を立て、モンスターを割り当てる（前の旗からは外す） */
export function plantFlag(team: Team, x: number, y: number, z: number, members: Unit[]): Flag {
  const g = flagMesh(team);
  g.position.set(x, y, z);
  scene.add(g);
  const f: Flag = { team, x, y, z, g, fields: [] };
  flags.push(f);
  for (const u of members) { u.flag = f; u.path = []; u.pathT = 0; }
  ring({ x, y, z }, TEAM[team].color, 1.6, 0.5);
  sparkle({ x, y: y + 1.8, z }, 10, [TEAM[team].color, 0xffffff]);
  return f;
}

/** 旗を外す。従っていたモンスターは自動進軍に戻る */
export function removeFlag(f: Flag): void {
  for (const u of units) if (u.flag === f) { u.flag = null; u.path = []; u.pathT = 0; }
  scene.remove(f.g);
  const i = flags.indexOf(f);
  if (i >= 0) flags.splice(i, 1);
}

export function clearFlags(): void {
  while (flags.length) removeFlag(flags[0]);
  flagMode.selected.clear();
}

// 旗モードの間、従っているモンスターと旗を線で結ぶ
const MAX_LINES = 64;
const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LINES * 6), 3));
const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.7, depthTest: false }));
lines.frustumCulled = false;
lines.renderOrder = 12;
scene.add(lines);
function drawLines(): void {
  const pa = lineGeo.attributes.position as THREE.BufferAttribute;
  let n = 0;
  if (flagMode.on)
    for (const u of units) {
      if (n >= MAX_LINES || !u.flag || u.team !== 0 || !alive(u)) continue;
      pa.setXYZ(n * 2, u.pos.x, u.pos.y + 0.15, u.pos.z);
      pa.setXYZ(n * 2 + 1, u.flag.x, u.flag.y + 0.15, u.flag.z);
      n++;
    }
  lineGeo.setDrawRange(0, n * 2);
  pa.needsUpdate = true;
}

/** 従うモンスターがいなくなった旗は消す。布をはためかせる */
export function updateFlags(t: number): void {
  for (const u of flagMode.selected) if (!alive(u)) flagMode.selected.delete(u);
  drawLines();
  for (const f of [...flags]) {
    if (!units.some(u => u.flag === f && alive(u))) { removeFlag(f); continue; }
    (f.g.userData.cloth as THREE.Group).rotation.y = 0.35 * Math.sin(t * 3 + f.x);
  }
}
