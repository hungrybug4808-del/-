import { NX, NZ, cellAt, colOf, cx, cz, level, passable } from './grid';

// 陸のモンスターの移動ルール：
//  - 隣のマスへは段差1ブロックまで（坂・階段）。2ブロック以上は崖なので通れない
//  - 深さ2ブロック以上の水には入れない（浅瀬・渡河点は通れる）
//  - 斜めに進むときは角を削らない（両側のどちらのマスを経由しても通れること）

const NC = NX * NZ;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export function canStep(a: number, b: number): boolean {
  return passable(a) && passable(b) && Math.abs(level[a] - level[b]) <= 1;
}

/** マス c から方向 k へ進めるなら行き先のマス、進めなければ -1 */
function neighbor(c: number, k: number): number {
  const ix = c % NX, iz = (c / NX) | 0, [dx, dz] = DIRS[k];
  const nx = ix + dx, nz = iz + dz;
  if (nx < 0 || nx >= NX || nz < 0 || nz >= NZ) return -1;
  const n = colOf(nx, nz);
  if (!canStep(c, n)) return -1;
  if (dx && dz && !cornerOk(c, colOf(nx, iz), colOf(ix, nz), n)) return -1;
  return n;
}
function cornerOk(a: number, o1: number, o2: number, b: number): boolean {
  return canStep(a, o1) && canStep(o1, b) && canStep(a, o2) && canStep(o2, b);
}

/** 道しるべ。center はマスの中心へ寄り直すための点 */
export interface Waypoint { x: number; z: number; center?: boolean }

// ---- 二分ヒープ ----
class Heap {
  private k: number[] = [];
  private p: number[] = [];
  get size(): number { return this.k.length; }
  push(key: number, pri: number): void {
    const k = this.k, p = this.p;
    let i = k.length;
    k.push(key); p.push(pri);
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (p[j] <= pri) break;
      k[i] = k[j]; p[i] = p[j]; i = j;
    }
    k[i] = key; p[i] = pri;
  }
  pop(): number {
    const k = this.k, p = this.p, top = k[0], lk = k.pop()!, lp = p.pop()!;
    const n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && p[c + 1] < p[c]) c++;
        if (p[c] >= lp) break;
        k[i] = k[c]; p[i] = p[c]; i = c;
      }
      k[i] = lk; p[i] = lp;
    }
    return top;
  }
}

/** 目的地（複数のマス）までの距離の地図。動かない目的地（建物）に使う */
export class FlowField {
  readonly dist = new Float32Array(NC).fill(Infinity);
  constructor(goals: number[]) {
    const h = new Heap();
    for (const g of goals) if (passable(g)) { this.dist[g] = 0; h.push(g, 0); }
    while (h.size) {
      const c = h.pop(), dc = this.dist[c];
      for (let k = 0; k < 8; k++) {
        const n = neighbor(c, k);
        if (n < 0) continue;
        const nd = dc + DIRS[k][2];
        if (nd < this.dist[n]) { this.dist[n] = nd; h.push(n, nd); }
      }
    }
  }
  /**
   * 坂を下るように最短の方向をたどり、まっすぐ歩ける一番先のマスの中心を返す。
   * 今の位置からは1歩目もまっすぐ歩けないときは、いまのマスの中心へ寄り直す。
   */
  next(x: number, z: number): Waypoint | null {
    let c = cellAt(x, z);
    if (c < 0 || this.dist[c] === Infinity) return null;
    const start = c;
    let best = c;
    for (let s = 0; s < 8; s++) {
      let bn = -1, bd = this.dist[c];
      for (let k = 0; k < 8; k++) {
        const n = neighbor(c, k);
        if (n >= 0 && this.dist[n] < bd) { bd = this.dist[n]; bn = n; }
      }
      if (bn < 0) break;
      c = bn;
      if (walkable(start, x, z, cx(c % NX), cz((c / NX) | 0))) best = c;
      else break;
    }
    if (best === start) return { x: cx(start % NX), z: cz((start / NX) | 0), center: true };
    return { x: cx(best % NX), z: cz((best / NX) | 0) };
  }
}

/** (x0,z0) から (x1,z1) へまっすぐ歩けるか（通るマスを順に調べる） */
export function walkable(c0: number, x0: number, z0: number, x1: number, z1: number): boolean {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 0.2);
  let prev = c0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, c = cellAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
    if (c === prev) continue;
    if (c < 0 || !canStep(prev, c)) return false;
    // 斜めにマスをまたいだときは角も確認
    const pix = prev % NX, piz = (prev / NX) | 0, ix = c % NX, iz = (c / NX) | 0;
    if (pix !== ix && piz !== iz && !cornerOk(prev, colOf(ix, piz), colOf(pix, iz), c)) return false;
    prev = c;
  }
  return true;
}

/** 近くの目的地（動く敵・竜脈）への経路。探索するマスの数に上限をつける */
export function findPath(x0: number, z0: number, x1: number, z1: number, maxNodes = 3000): { x: number; z: number }[] | null {
  const s = cellAt(x0, z0), g = cellAt(x1, z1);
  if (s < 0 || g < 0 || !passable(s)) return null;
  const gx = g % NX, gz = (g / NX) | 0;
  const hfn = (c: number) => { const dx = Math.abs(c % NX - gx), dz = Math.abs(((c / NX) | 0) - gz); return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz); };
  const gs = new Map<number, number>(), from = new Map<number, number>();
  const h = new Heap();
  gs.set(s, 0); h.push(s, hfn(s));
  let best = s, bestH = hfn(s), count = 0;
  while (h.size && count++ < maxNodes) {
    const c = h.pop();
    const hc = hfn(c);
    if (hc < bestH) { bestH = hc; best = c; }
    if (c === g) break;
    const gc = gs.get(c)!;
    for (let k = 0; k < 8; k++) {
      const n = neighbor(c, k);
      if (n < 0) continue;
      const ng = gc + DIRS[k][2];
      if (ng < (gs.get(n) ?? Infinity)) { gs.set(n, ng); from.set(n, c); h.push(n, ng + hfn(n)); }
    }
  }
  // たどり着けなければ、一番近づけたマスまで
  const path: { x: number; z: number }[] = [];
  for (let c = best; c !== s; c = from.get(c)!) path.push({ x: cx(c % NX), z: cz((c / NX) | 0) });
  path.reverse();
  return path;
}
