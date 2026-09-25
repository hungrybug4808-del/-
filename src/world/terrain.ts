import * as THREE from 'three';
import { hash, rnd, vec } from '../core/math';
import { glow, solid } from '../fx/effects';
import { scene } from '../render/stage';
import { buildDecor } from '../terrain/decor';
import { MAP } from '../terrain/generate';
import { NX, NZ, XMAX, XMIN, ZMAX, ZMIN } from '../terrain/grid';
import { CHUNK, buildChunk } from '../terrain/mesh';

// 地形・水・飾りをシーンに置き、水の動き（流れ・滝・渦潮）を毎フレーム更新する

/** タップ判定用（地面と水面） */
export const pickables: THREE.Object3D[] = [];

function waterTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 16;
  const g = cv.getContext('2d')!;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const h = hash(x, y, 3), v = h > 0.9 ? 255 : h > 0.55 ? 236 : 222;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1, 1);
    }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const wtex = waterTexture();
const landMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const decorMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const waterMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: wtex, transparent: true, opacity: 0.8 });
const seaMat = new THREE.MeshLambertMaterial({ color: 0x2f7fc4, map: wtex, transparent: true, opacity: 0.85 });

// ---- 渦潮 ----
interface Whirl { g: THREE.Group; x: number; z: number }
const whirls: Whirl[] = [];
function makeWhirl(x: number, z: number): Whirl {
  const g = new THREE.Group();
  g.position.set(x, -0.06, z);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.8, 32), new THREE.MeshBasicMaterial({ color: 0x0f3560, transparent: true, opacity: 0.45, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  g.add(disc);
  const n = 54, arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  const D = new THREE.Object3D(), C = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const arm = i % 3, t = Math.floor(i / 3) / (n / 3), a = arm * (Math.PI * 2 / 3) + t * 5.5, r = 0.25 + t * 1.55;
    D.position.set(Math.cos(a) * r, 0.02 - (1 - t) * 0.12, Math.sin(a) * r);
    D.rotation.y = -a;
    D.scale.setScalar(0.6 + t * 0.8);
    D.updateMatrix();
    arms.setMatrixAt(i, D.matrix);
    arms.setColorAt(i, C.setHex(t < 0.3 ? 0x8fc8f0 : 0xe8f6ff));
  }
  g.add(arms);
  scene.add(g);
  return { g, x, z };
}

export function buildTerrain(): void {

  for (let z0 = 0; z0 < NZ; z0 += CHUNK)
    for (let x0 = 0; x0 < NX; x0 += CHUNK) {
      const { land, water } = buildChunk(x0, z0);
      if (land) {
        const m = new THREE.Mesh(land, landMat);
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
        pickables.push(m);
      }
      if (water) {
        const m = new THREE.Mesh(water, waterMat);
        m.receiveShadow = true;
        m.renderOrder = 1;
        scene.add(m);
        pickables.push(m);
      }
    }
  for (const geo of buildDecor().build()) {
    const m = new THREE.Mesh(geo, decorMat);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  // マップの外に広がる海
  const W = 400;
  for (const [x0, x1, z0, z1] of [[XMIN - W, XMAX + W, ZMAX, ZMAX + W], [XMIN - W, XMAX + W, ZMIN - W, ZMIN], [XMIN - W, XMIN, ZMIN, ZMAX], [XMAX, XMAX + W, ZMIN, ZMAX]]) {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, -0.08, (z0 + z1) / 2);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
    const m = new THREE.Mesh(geo, seaMat);
    m.receiveShadow = true;
    scene.add(m);
  }
  for (const w of MAP.whirlpools) whirls.push(makeWhirl(w.x, w.z));
}

export function updateTerrain(dt: number, t: number): void {
  // 水の流れ
  wtex.offset.y = (wtex.offset.y - dt * 0.35) % 1;
  wtex.offset.x = 0.05 * Math.sin(t * 0.7);
  // 渦潮
  for (const w of whirls) {
    w.g.rotation.y -= dt * 1.6;
    if (Math.random() < 0.4) {
      const a = Math.random() * Math.PI * 2, r = rnd(0.6, 1.7);
      glow.spawn(vec(w.x + Math.cos(a) * r, 0.05, w.z + Math.sin(a) * r), vec(-Math.sin(a) * 1.2, 0.2, Math.cos(a) * 1.2), 0.6, 0.06, 0xdff4ff, 0, 0.5);
    }
  }
  // 滝のしぶき
  for (const f of MAP.waterfalls) {
    for (let k = 0; k < 2; k++)
      solid.spawn(vec(f.x + rnd(-0.6, 0.2), f.bottom + 0.1, f.z + rnd(-1, 1)), vec(rnd(-1.2, 0.2), rnd(1.2, 2.2), rnd(-0.6, 0.6)), rnd(0.5, 0.9), rnd(0.08, 0.15), 0xeaf6ff, 4);
    if (Math.random() < 0.5)
      glow.spawn(vec(f.x + rnd(-1, 0), f.bottom + rnd(0.2, 1.2), f.z + rnd(-1.2, 1.2)), vec(rnd(-0.4, 0), rnd(0.3, 0.8), rnd(-0.2, 0.2)), rnd(1, 1.6), rnd(0.1, 0.18), 0x9fc4e0, -0.1, 0.5, { gr: 1.5 });
  }
}
