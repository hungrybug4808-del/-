import * as THREE from 'three';
import { hash } from '../core/math';
import { SIDE_COLOR, TOP_COLOR, waterColor, type Bio } from './biomes';
import { B, CELL, NX, NY, NZ, X0, Y0, Z0, biome, colOf, getB, isSolid, yTop } from './grid';

// ブロックを、外から見える面だけの1つのメッシュにまとめる。
// 角の陰（アンビエントオクルージョン）を頂点色に入れて、ブロックの段差を見やすくする。

const FACES = [
  { d: [-1, 0, 0], c: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]] },
  { d: [1, 0, 0], c: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]] },
  { d: [0, -1, 0], c: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]] },
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]] },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]] },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] },
] as const;
const AO = [0.52, 0.7, 0.86, 1];

/** 面を貯めて BufferGeometry にする */
export class FaceBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  private C = new THREE.Color();

  /**
   * (x,y,z) はブロックの最小の角のワールド座標、s は大きさ。
   * occ(dx,dy,dz) はこのブロックから見た隣のブロックが陰を落とすか。
   */
  face(f: number, x: number, y: number, z: number, s: number, color: number,
    occ: ((dx: number, dy: number, dz: number) => boolean) | null, topDrop = 0, uvs = false): void {
    const F = FACES[f], n = this.pos.length / 3;
    const ax = F.d[0] !== 0 ? 0 : F.d[1] !== 0 ? 1 : 2;
    const ao: number[] = [];
    this.C.setHex(color);
    for (const c of F.c) {
      const vy = y + c[1] * s - (c[1] === 1 ? topDrop : 0);
      this.pos.push(x + c[0] * s, vy, z + c[2] * s);
      this.nor.push(F.d[0], F.d[1], F.d[2]);
      let a = 3;
      if (occ) {
        // 面の外側の層で、この頂点に接する2つの辺と1つの角のブロックを見る
        const o = [F.d[0], F.d[1], F.d[2]], u = [0, 0, 0], v = [0, 0, 0];
        const [b1, b2] = ax === 0 ? [1, 2] : ax === 1 ? [0, 2] : [0, 1];
        u[b1] = c[b1] ? 1 : -1;
        v[b2] = c[b2] ? 1 : -1;
        const s1 = occ(o[0] + u[0], o[1] + u[1], o[2] + u[2]);
        const s2 = occ(o[0] + v[0], o[1] + v[1], o[2] + v[2]);
        const cc = occ(o[0] + u[0] + v[0], o[1] + u[1] + v[1], o[2] + u[2] + v[2]);
        a = s1 && s2 ? 0 : 3 - (+s1 + +s2 + +cc);
      }
      ao.push(a);
      const k = AO[a];
      this.col.push(this.C.r * k, this.C.g * k, this.C.b * k);
      if (uvs) {
        const wx = x + c[0] * s, wz = z + c[2] * s;
        if (ax === 1) this.uv.push(wx / 2, wz / 2);
        else this.uv.push((wx + wz) / 2, vy / 2);
      }
    }
    if (ao[0] + ao[3] > ao[1] + ao[2]) this.idx.push(n, n + 1, n + 3, n, n + 3, n + 2);
    else this.idx.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

function pick(list: number[], x: number, y: number, z: number): number {
  const h = hash(x, y, z);
  return list[h > 0.8 ? Math.min(2, list.length - 1) : h > 0.45 ? Math.min(1, list.length - 1) : 0];
}

/** マップの外は、海面より下なら埋まっている扱い（海の断面を見せない） */
function solidAt(ix: number, iy: number, iz: number): boolean {
  if (iy < 0) return true;
  if (ix < 0 || ix >= NX || iz < 0 || iz >= NZ) return yTop(iy) <= 0;
  return isSolid(getB(ix, iy, iz));
}
function waterOrSolid(ix: number, iy: number, iz: number): boolean {
  if (ix < 0 || ix >= NX || iz < 0 || iz >= NZ) return yTop(iy) <= 0;
  return getB(ix, iy, iz) !== B.AIR;
}

export const CHUNK = 16;

/** 地形のひとかたまり（CHUNK×CHUNK 列）の、地面と水のメッシュ */
export function buildChunk(cx0: number, cz0: number): { land: THREE.BufferGeometry | null; water: THREE.BufferGeometry | null } {
  const land = new FaceBuilder(), water = new FaceBuilder();
  const C = new THREE.Color();
  for (let iz = cz0; iz < Math.min(NZ, cz0 + CHUNK); iz++)
    for (let ix = cx0; ix < Math.min(NX, cx0 + CHUNK); ix++) {
      const bio = biome[colOf(ix, iz)] as Bio;
      for (let iy = 0; iy < NY; iy++) {
        const b = getB(ix, iy, iz);
        if (b === B.AIR) continue;
        const x = X0 + ix * CELL, y = Y0 + iy * CELL, z = Z0 + iz * CELL;
        if (b === B.WATER) {
          const above = getB(ix, iy + 1, iz) === B.AIR;
          for (let f = 0; f < 6; f++) {
            if (f === 2) continue;
            const d = FACES[f].d;
            if (waterOrSolid(ix + d[0], iy + d[1], iz + d[2])) continue;
            C.setHex(waterColor(bio));
            if (f !== 3) C.lerp(new THREE.Color(0xe8f6ff), 0.35);
            C.offsetHSL(0, 0, (hash(ix, iy, iz) - 0.5) * 0.04);
            water.face(f, x, y, z, CELL, C.getHex(), null, above ? 0.08 : 0, true);
          }
          continue;
        }
        const occ = (dx: number, dy: number, dz: number) => solidAt(ix + dx, iy + dy, iz + dz);
        for (let f = 0; f < 6; f++) {
          const d = FACES[f].d;
          if (solidAt(ix + d[0], iy + d[1], iz + d[2])) continue;
          const exposedTop = f === 3 || !solidAt(ix, iy + 1, iz);
          const list = f === 3 ? TOP_COLOR[b] : f === 2 ? SIDE_COLOR[B.DIRT] : exposedTop && b !== B.GRASS && b !== B.MEADOW ? TOP_COLOR[b] : SIDE_COLOR[b];
          land.face(f, x, y, z, CELL, pick(list, ix, iy + f * 7, iz), occ);
        }
      }
    }
  return { land: land.build(), water: water.build() };
}

// ---- 飾り（木・岩・草花など）。0.25 の細かいボクセルで、動きには影響しない ----
export const DS = 0.25;
const key = (x: number, y: number, z: number) => ((y + 64) * 1024 + (z + 512)) * 1024 + (x + 512);

export class Decor {
  m = new Map<number, number>();
  set(x: number, y: number, z: number, c: number): void { this.m.set(key(x, y, z), c); }
  has(x: number, y: number, z: number): boolean { return this.m.has(key(x, y, z)); }
  box(x: number, y: number, z: number, w: number, h: number, d: number, c: number | ((x: number, y: number, z: number) => number)): void {
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) for (let k = z; k < z + d; k++) this.set(i, j, k, typeof c === 'function' ? c(i, j, k) : c);
  }

  /** 32×32 ボクセルごとにまとめてメッシュにする */
  build(): THREE.BufferGeometry[] {
    const groups = new Map<number, [number, number, number, number][]>();
    for (const [k, c] of this.m) {
      const x = (k % 1024) - 512, z = (Math.floor(k / 1024) % 1024) - 512, y = Math.floor(k / 1048576) - 64;
      const g = ((x >> 5) + 64) * 256 + ((z >> 5) + 64);
      let arr = groups.get(g);
      if (!arr) groups.set(g, (arr = []));
      arr.push([x, y, z, c]);
    }
    const out: THREE.BufferGeometry[] = [];
    const C = new THREE.Color();
    for (const arr of groups.values()) {
      const fb = new FaceBuilder();
      for (const [x, y, z, c] of arr) {
        const occ = (dx: number, dy: number, dz: number) => this.has(x + dx, y + dy, z + dz);
        C.setHex(c).offsetHSL(0, 0, (hash(x, y, z) - 0.5) * 0.07);
        for (let f = 0; f < 6; f++) {
          const d = FACES[f].d;
          if (this.has(x + d[0], y + d[1], z + d[2])) continue;
          fb.face(f, x * DS, y * DS, z * DS, DS, C.getHex(), occ);
        }
      }
      const g = fb.build();
      if (g) out.push(g);
    }
    return out;
  }
}
