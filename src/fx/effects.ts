import * as THREE from 'three';
import { reduceMotion, rnd, vec, type V3, type XZ } from '../core/math';
import { scene } from '../render/stage';

const D = new THREE.Object3D();
const TC = new THREE.Color();

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  l: number; L: number; s: number;
  g: number; dr: number; gr: number; fl: boolean;
  r: number; rs: number; dead: boolean;
}

export interface ParticleOpt {
  /** 寿命に合わせて大きくなる割合（煙・炎） */
  gr?: number;
  /** 地面に沿って這う（ブレスの炎） */
  fl?: boolean;
}

/** 小さな立方体の粒を InstancedMesh 1つで使い回すプール */
export class Pool {
  private k = 0;
  private q: Particle[] = [];
  readonly m: THREE.InstancedMesh;

  constructor(readonly n: number, mat: THREE.Material) {
    this.m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
    this.m.frustumCulled = false;
    this.m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    TC.set(0xffffff);
    for (let i = 0; i < n; i++) {
      this.q.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, l: 0, L: 1, s: 0, g: 0, dr: 0, gr: 0, fl: false, r: 0, rs: 0, dead: false });
      D.position.set(0, -99, 0);
      D.scale.setScalar(0.0001);
      D.updateMatrix();
      this.m.setMatrixAt(i, D.matrix);
      this.m.setColorAt(i, TC);
    }
    scene.add(this.m);
  }

  spawn(p: V3, v: V3, life: number, size: number, color: number, g = 0, dr = 0, opt?: ParticleOpt): void {
    const i = this.k;
    this.k = (this.k + 1) % this.n;
    Object.assign(this.q[i], {
      x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, l: life, L: life, s: size, g, dr,
      gr: opt?.gr || 0, fl: opt?.fl || false, r: Math.random() * 6, rs: (Math.random() - 0.5) * 6, dead: false,
    });
    TC.setHex(color);
    this.m.setColorAt(i, TC);
    this.m.instanceColor!.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      const q = this.q[i];
      if (q.l <= 0) {
        if (q.dead) continue;
        q.dead = true;
        D.position.set(0, -99, 0);
        D.rotation.set(0, 0, 0);
        D.scale.setScalar(0.0001);
      } else {
        q.l -= dt;
        q.vy -= q.g * dt;
        if (q.dr) {
          const m = Math.exp(-q.dr * dt);
          q.vx *= m;
          q.vz *= m;
          q.vy *= Math.exp(-q.dr * 0.5 * dt);
        }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.z += q.vz * dt;
        if (q.fl && q.y < 0.12) {
          q.y = 0.12;
          q.vy = Math.abs(q.vy) * 0.15 + 0.6;
          q.vx *= 1.1;
          q.vz *= 1.1;
        } else if (q.g > 0 && q.y < q.s * 0.5) {
          q.y = q.s * 0.5;
          q.vy *= -0.25;
          q.vx *= 0.6;
          q.vz *= 0.6;
        }
        q.r += q.rs * dt;
        const f = Math.max(q.l / q.L, 0);
        const sc = q.gr ? q.s * (0.35 + q.gr * (1 - f)) * Math.min(1, f * 4) : q.s * Math.sqrt(f);
        D.position.set(q.x, q.y, q.z);
        D.rotation.set(q.r, q.r * 0.7, 0);
        D.scale.setScalar(sc + 0.0001);
      }
      D.updateMatrix();
      this.m.setMatrixAt(i, D.matrix);
    }
    this.m.instanceMatrix.needsUpdate = true;
  }
}

/** 光を受ける粒（土煙・破片） */
export const solid = new Pool(1200, new THREE.MeshLambertMaterial({ color: 0xffffff }));
/** 光る粒（魔素・火花・炎） */
export const glow = new Pool(1600, new THREE.MeshBasicMaterial({
  color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));

export const MAGIC = [0x6fe3ff, 0xa98bff];
export const FIRE = [0xfff3b0, 0xffd060, 0xffa030, 0xff6a1a, 0xff4a12];

// ---------- 画面の揺れ ----------
let shake = 0;
export function addShake(a: number): void {
  if (!reduceMotion) shake = Math.max(shake, a);
}
/** 揺れを減衰させ、今フレームの揺れ量を返す */
export function stepShake(dt: number): number {
  shake *= Math.exp(-dt * 6);
  return shake;
}

// ---------- よく使う演出 ----------
export function dust(p: XZ, n: number, spread = 1, size = 1): void {
  const cols = [0xd9cdb5, 0xc7b797, 0xb3a283];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(0.4, spread * 1.6);
    solid.spawn(
      vec(p.x + rnd(-0.2, 0.2), 0.08, p.z + rnd(-0.2, 0.2)),
      vec(Math.cos(a) * s, rnd(0.2, 0.7), Math.sin(a) * s),
      rnd(0.8, 1.3), rnd(0.1, 0.22) * size, cols[i % 3], 0.15, 2.3,
    );
  }
}

interface Ring { m: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; t: number; dur: number; max: number }
const rings: Ring[] = [];
const RING_GEO = new THREE.RingGeometry(0.85, 1, 40);

/** 地面に広がって消える輪（着地・召喚・占領など） */
export function ring(p: XZ, color: number, max: number, dur: number): void {
  const m = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({
    color, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(p.x, 0.04, p.z);
  scene.add(m);
  rings.push({ m, t: 0, dur, max });
}

export function sparkle(p: V3, n: number, cols: number[], up = 1): void {
  for (let i = 0; i < n; i++)
    glow.spawn(
      vec(p.x + rnd(-0.3, 0.3), p.y + rnd(-0.2, 0.3), p.z + rnd(-0.3, 0.3)),
      vec(rnd(-0.4, 0.4), rnd(0.6, 1.6) * up, rnd(-0.4, 0.4)),
      rnd(0.5, 0.9), rnd(0.04, 0.08), cols[i % cols.length], -0.6,
    );
}

export function updateEffects(dt: number): void {
  solid.update(dt);
  glow.update(dt);
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    const q = r.t / r.dur;
    r.m.scale.setScalar(0.3 + q * r.max);
    r.m.material.opacity = Math.max(0, 1 - q);
    if (q >= 1) {
      scene.remove(r.m);
      r.m.material.dispose();
      rings.splice(i, 1);
    }
  }
}
