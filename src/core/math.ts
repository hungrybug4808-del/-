// 共通の数学ユーティリティ（試作 battle.html と同じ式）

/** 座標から決まる 0〜1 の擬似乱数。ボクセルの色むらなどに使う */
export function hash(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const cl = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
export const seg = (t: number, a: number, b: number): number => cl((t - a) / (b - a));
export const lerp = (a: number, b: number, x: number): number => a + (b - a) * x;

export type Ease = (x: number) => number;
export const ease: Ease = x => x * x * (3 - 2 * x);
export const eIn: Ease = x => x * x;
export const eOut: Ease = x => 1 - (1 - x) * (1 - x);
export const easeIO: Ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** キーフレーム [時刻, 値, イージング?] */
export type Key = readonly [number, number, Ease?];

/** キーフレーム補間。区間ごとのイージングを省略すると easeIO */
export function kf(keys: readonly Key[], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1, e] = keys[i];
      return v0 + (v1 - v0) * (e || easeIO)((t - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}

export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

export interface V3 { x: number; y: number; z: number }
export interface XZ { x: number; z: number }
export const vec = (x: number, y: number, z: number): V3 => ({ x, y, z });

export const reduceMotion =
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
