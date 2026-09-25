import * as THREE from 'three';
import { hash, rnd } from '../core/math';
import { Vox, part } from '../core/voxel';
import { camera, scene } from '../render/stage';
import { groundY } from '../terrain/grid';
import { MAP } from '../terrain/generate';

// 空の気候：流れる雲、高山の雪、沼地の雨雲と雨、砂漠の砂嵐

// ---- 雲 ----
function cloudVox(seed: number, dark: boolean): Vox {
  const v = new Vox(), W = dark ? 0x9aa3ad : 0xffffff, S = dark ? 0x7d8690 : 0xe9eff4;
  const n = 4 + Math.floor(hash(seed, 1, 1) * 3);
  for (let i = 0; i < n; i++) {
    const w = 3 + Math.floor(hash(seed, i, 2) * 4), d = 2 + Math.floor(hash(seed, i, 3) * 3);
    const x = Math.floor((hash(seed, i, 4) - 0.5) * 8), z = Math.floor((hash(seed, i, 5) - 0.5) * 5);
    v.box(x, 0, z, w, 1, d, S);
    v.box(x + 1, 1, z, w - 2, 1 + (i % 2), d, W);
  }
  return v;
}
interface Cloud { g: THREE.Group; speed: number }
const clouds: Cloud[] = [];
const CLOUD_X = 45, CLOUD_Z = 60;

// ---- 降るもの（雪・雨・砂） ----
interface Region { x0: number; x1: number; z0: number; z1: number; mirror: boolean }
interface Fall {
  mesh: THREE.InstancedMesh;
  p: Float32Array;
  region: Region;
  top: number;
  vy: number;
  drift: number;
  sway: number;
}

function makeFall(n: number, region: Region, size: [number, number, number], color: number, top: number, vy: number, drift: number, sway: number, opacity: number): Fall {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), n);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const f: Fall = { mesh, p: new Float32Array(n * 4), region, top, vy, drift, sway };
  for (let i = 0; i < n; i++) respawn(f, i, true);
  return f;
}
function respawn(f: Fall, i: number, anyY: boolean): void {
  const r = f.region, x = rnd(r.x0, r.x1);
  let z = rnd(r.z0, r.z1);
  if (r.mirror && Math.random() < 0.5) z = -z;
  const g = groundY(x, z);
  f.p[i * 4] = x;
  f.p[i * 4 + 1] = anyY ? rnd(g, g + f.top) : g + f.top * rnd(0.8, 1);
  f.p[i * 4 + 2] = z;
  f.p[i * 4 + 3] = Math.random() * 6;
}
function stepFall(f: Fall, dt: number, t: number): void {
  const n = f.mesh.count, a = f.mesh.instanceMatrix.array as Float32Array;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    f.p[o + 1] -= f.vy * dt;
    f.p[o] += f.drift * dt;
    const x = f.p[o] + f.sway * Math.sin(t * 1.3 + f.p[o + 3]), z = f.p[o + 2] + f.sway * Math.cos(t * 1.1 + f.p[o + 3]);
    if (f.p[o + 1] < groundY(x, z) || f.p[o] > f.region.x1 + 2) respawn(f, i, false);
    const m = i * 16;
    a.fill(0, m, m + 16);
    a[m] = a[m + 5] = a[m + 10] = a[m + 15] = 1;
    a[m + 12] = x; a[m + 13] = f.p[o + 1]; a[m + 14] = z;
  }
  f.mesh.instanceMatrix.needsUpdate = true;
}

const falls: Fall[] = [];

const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });

const FALL_LOOK = {
  snow: { size: [0.09, 0.09, 0.09] as [number, number, number], color: 0xffffff, top: 10, vy: 1.1, drift: 0, sway: 0.35, opacity: 0.95 },
  rain: { size: [0.03, 0.45, 0.03] as [number, number, number], color: 0xb8d4ec, top: 10, vy: 11, drift: 0, sway: 0, opacity: 0.7 },
  sand: { size: [0.07, 0.07, 0.07] as [number, number, number], color: 0xd9bf85, top: 2.2, vy: 0.25, drift: 2.4, sway: 0.3, opacity: 0.85 },
};
let rainClouds: THREE.Group[] = [];

export function buildSky(): void {
  if (!clouds.length)
    for (let i = 0; i < 12; i++) {
      const g = part('cloud' + (i % 5), cloudVox(i % 5, false), 0, 0, 0, 0.9, cloudMat);
      g.position.set(rnd(-CLOUD_X, CLOUD_X), rnd(20, 24), rnd(-CLOUD_Z, CLOUD_Z));
      g.rotation.y = Math.floor(Math.random() * 4) * Math.PI / 2;
      scene.add(g);
      clouds.push({ g, speed: rnd(0.5, 0.9) });
    }
  // ワールドの気候：雨雲と、降るもの（雪・雨・砂）
  for (const g of rainClouds) scene.remove(g);
  rainClouds = [];
  for (const f of falls) { scene.remove(f.mesh); f.mesh.geometry.dispose(); (f.mesh.material as THREE.Material).dispose(); }
  falls.length = 0;
  const rainCloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
  (MAP.def.rainClouds ?? []).forEach(([x, z], i) => {
    const g = part('rainCloud' + (i % 4), cloudVox(20 + (i % 4), true), 0, 0, 0, 0.9, rainCloudMat);
    g.position.set(x, 11, z);
    scene.add(g);
    rainClouds.push(g);
  });
  for (const w of MAP.def.weather) {
    const L = FALL_LOOK[w.kind];
    falls.push(makeFall(w.count, { x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1, mirror: w.mirror }, L.size, L.color, L.top, L.vy, L.drift, L.sway, L.opacity));
  }
}

export function updateSky(dt: number, t: number): void {
  // 高い所から見下ろすときは、雲で戦場が隠れないよう薄くする
  cloudMat.opacity = 0.9 * Math.min(1, Math.max(0.12, 1 - (camera.position.y - 22) / 30));
  cloudMat.depthWrite = cloudMat.opacity > 0.5;
  for (const c of clouds) {
    c.g.position.x += c.speed * dt;
    if (c.g.position.x > CLOUD_X) c.g.position.x = -CLOUD_X;
  }
  for (const f of falls) stepFall(f, dt, t);
}
