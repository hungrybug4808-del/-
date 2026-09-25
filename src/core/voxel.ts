import * as THREE from 'three';
import { hash } from './math';

/** ボクセルの色。固定色か、座標から色を決める関数 */
export type VoxColor = number | ((x: number, y: number, z: number) => number);

/** ボクセル配置。キーは "x,y,z" */
export class Vox {
  m = new Map<string, VoxColor>();

  box(x: number, y: number, z: number, w: number, h: number, d: number, c: VoxColor): this {
    for (let i = x; i < x + w; i++)
      for (let j = y; j < y + h; j++)
        for (let k = z; k < z + d; k++) this.m.set(i + ',' + j + ',' + k, c);
    return this;
  }
  set(x: number, y: number, z: number, c: VoxColor): this {
    this.m.set(x + ',' + y + ',' + z, c);
    return this;
  }
  del(x: number, y: number, z: number): this {
    this.m.delete(x + ',' + y + ',' + z);
    return this;
  }
  /** x を左右反転したコピー */
  mirror(): Vox {
    const v = new Vox();
    for (const [key, c] of this.m) {
      const [x, y, z] = key.split(',').map(Number);
      v.m.set(-1 - x + ',' + y + ',' + z, c);
    }
    return v;
  }
}

interface Tpl {
  geo: THREE.BoxGeometry;
  m: THREE.InstancedBufferAttribute;
  c: THREE.InstancedBufferAttribute;
  n: number;
}

const tplCache: Record<string, Tpl> = {};
const DM = new THREE.Object3D();
const DC = new THREE.Color();
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;

/**
 * ボクセル配置を一度だけインスタンス行列と色に変換してキャッシュする。
 * 外から見えない（6方向すべて埋まった）ボクセルは省く。
 * (px,py,pz) は回転の中心（関節）、s は1ボクセルの大きさ。
 */
export function tpl(key: string, v: Vox, px: number, py: number, pz: number, s: number, flat = false): Tpl {
  const hit = tplCache[key];
  if (hit) return hit;
  const surf: [number, number, number, VoxColor][] = [];
  for (const [k, c] of v.m) {
    const [x, y, z] = k.split(',').map(Number);
    if (!N6.every(([a, b, e]) => v.m.has(x + a + ',' + (y + b) + ',' + (z + e)))) surf.push([x, y, z, c]);
  }
  const n = surf.length;
  const mA = new Float32Array(n * 16);
  const cA = new Float32Array(n * 3);
  surf.forEach(([x, y, z, c], i) => {
    DM.position.set((x + 0.5 - px) * s, (y + 0.5 - py) * s, (z + 0.5 - pz) * s);
    DM.updateMatrix();
    DM.matrix.toArray(mA, i * 16);
    DC.setHex(typeof c === 'function' ? c(x, y, z) : c);
    if (!flat) DC.offsetHSL(0, 0, (hash(x, y, z) - 0.5) * 0.07);
    DC.toArray(cA, i * 3);
  });
  return (tplCache[key] = {
    geo: new THREE.BoxGeometry(s, s, s),
    m: new THREE.InstancedBufferAttribute(mA, 16),
    c: new THREE.InstancedBufferAttribute(cA, 3),
    n,
  });
}

/** キャッシュ済みのボクセル配置から、関節として動かせるパーツ（Group）を作る */
export function part(
  key: string, v: Vox, px: number, py: number, pz: number, s: number,
  mat: THREE.Material, flat = false,
): THREE.Group {
  const t = tpl(key, v, px, py, pz, s, flat);
  const mesh = new THREE.InstancedMesh(t.geo, mat, t.n);
  mesh.instanceMatrix = t.m;
  mesh.instanceColor = t.c;
  mesh.frustumCulled = false;
  const lit = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
  mesh.castShadow = lit;
  mesh.receiveShadow = lit;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

/** 目など、光の影響を受けずに光って見せるパーツ用 */
export const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
