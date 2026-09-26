import { hash } from '../core/math';
import { Vox } from '../core/voxel';
import type { Team } from '../units/types';

// ワールドごとの魔王城と砦のデザイン（草原の国は buildings.ts の石の城）。
// 魔王城は x -12〜11・z -7〜2（正面が +z）、砦は x・z とも -4〜3 に収める（通れない範囲と合わせる）。
//   霊峰の国：白い壁が上へすぼまる山の僧院の城塞。陣営の色の帯、雪をかぶった金の屋根、祈りの旗
//   湖水の国：白い石の宮殿。青い丸屋根と細い塔、先に光る結晶（陣営の色）。砦は灯台の塔
//   峡谷の国：日干しレンガのカスバ。四隅の塔、ぎざぎざの胸壁、突き出た梁、陣営の色の幕

export type CastleStyle = 'frost' | 'lake' | 'canyon';

const teamC = (team: Team) => (team === 0 ? 0x3d5fb8 : 0xb83d3d);
const teamD = (team: Team) => (team === 0 ? 0x2c4690 : 0x8e2c2c);
const teamGlow = (team: Team) => (team === 0 ? 0x8fd8ff : 0xff9a8a);
const noisy = (a: number, b: number, c: number, seed: number) => (x: number, y: number, z: number) => {
  const h = hash(x + seed, y, z);
  return h > 0.8 ? b : h < 0.15 ? c : a;
};
/** (x0,z0)-(x1,z1) の線に沿って点を置く（祈りの旗など） */
function line(v: Vox, a: [number, number, number], b: [number, number, number], color: (i: number) => number, sag = 0): void {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    v.set(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t)), Math.round(a[2] + (b[2] - a[2]) * t), color(i));
  }
}
/** 半球（y >= cy の側） */
function dome(v: Vox, cx: number, cy: number, cz: number, r: number, c: (x: number, y: number, z: number) => number): void {
  for (let x = Math.floor(cx - r); x <= cx + r; x++)
    for (let y = cy; y <= cy + r; y++)
      for (let z = Math.floor(cz - r); z <= cz + r; z++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 + (z + 0.5 - cz) ** 2 < r * r) v.set(x, y, z, c(x, y, z));
}
/** 円柱 */
function cyl(v: Vox, cx: number, cz: number, y0: number, h: number, r: number, c: (x: number, y: number, z: number) => number): void {
  for (let x = Math.floor(cx - r); x <= cx + r; x++)
    for (let z = Math.floor(cz - r); z <= cz + r; z++)
      if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 < r * r) for (let y = y0; y < y0 + h; y++) v.set(x, y, z, c(x, y, z));
}

// ---- 霊峰の国 ----
const WHITE = 0xf1ece0, WHITE2 = 0xe2dccd, STONE = 0x8a8f99, STONE2 = 0x6e737c, SNOW = 0xfafcff, GOLD = 0xd8a830, GOLD2 = 0xb8882a;
const WOOD = 0x4a2e1c, DARK = 0x2a1e18;
const FLAGS = [0x3a6fd8, 0xffffff, 0xd83a3a, 0x3aa85a, 0xf0c830];

function frostCastle(team: Team): Vox {
  const v = new Vox(), T = teamC(team), w = noisy(WHITE, WHITE2, WHITE, 3), st = noisy(STONE, STONE2, 0x9da3ad, 5);
  v.box(-11, 0, -7, 22, 2, 10, st);
  // 上へすぼまる白い壁（4段ごとに1ずつ内へ）と、上の陣営の色の帯
  for (let y = 2; y < 14; y++) {
    const i = Math.floor((y - 2) / 4);
    v.box(-9 + i, y, -6, 18 - 2 * i, 1, 8 - i, y >= 12 ? T : w);
  }
  // 窓（黒い台形の窓に木の枠）と門
  for (const [y, i] of [[4, 0], [8, 1]])
    for (const x of [-6, -3, 3, 6]) {
      const zf = 1 - i;
      v.box(x, y, zf, 1, 2, 1, DARK).set(x, y + 2, zf, T);
    }
  v.box(-1, 2, 1, 2, 4, 1, WOOD).box(-2, 6, 1, 4, 1, 1, T);
  v.box(-2, 0, 2, 4, 1, 1, st).box(-2, 1, 2, 4, 1, 1, st);
  // 平らな雪の屋上と、金の屋根の堂
  v.box(-6, 14, -5, 12, 1, 5, SNOW);
  v.box(-3, 15, -4, 6, 3, 4, teamD(team));
  v.box(-4, 18, -5, 8, 1, 6, GOLD).box(-3, 19, -4, 6, 1, 4, GOLD2).box(-2, 20, -3, 4, 1, 2, GOLD).box(-1, 21, -3, 2, 3, 2, GOLD);
  for (let x = -4; x < 4; x++) if (x & 1) v.set(x, 19, -5, SNOW), v.set(x, 19, 0, SNOW);
  // 左右の石の塔（雪の三角屋根と陣営の旗）
  for (const x0 of [-12, 8]) {
    v.box(x0, 0, -6, 4, 12, 5, st).box(x0, 12, -6, 4, 5, 5, w);
    v.box(x0 - 1, 17, -7, 6, 1, 7, SNOW).box(x0, 18, -6, 4, 1, 5, SNOW).box(x0 + 1, 19, -5, 2, 1, 3, SNOW);
    v.box(x0 + 1, 13, -1, 2, 2, 1, DARK);
    v.box(x0 + 2, 20, -4, 1, 4, 1, WOOD).box(x0 + 3, 22, -4, 2, 2, 1, T);
  }
  // 祈りの旗（塔から金の屋根へ）
  line(v, [-10, 19, -1], [-1, 23, -1], i => FLAGS[i % 5], 1);
  line(v, [10, 19, -1], [1, 23, -1], i => FLAGS[i % 5], 1);
  return v;
}
function frostFort(team: Team): Vox {
  const v = new Vox(), T = teamC(team), st = noisy(STONE, STONE2, 0x9da3ad, 41), w = noisy(WHITE, WHITE2, WHITE, 43);
  for (let y = 0; y < 11; y++) {
    const i = Math.floor(y / 4);
    v.box(-4 + i, y, -4 + i, 8 - 2 * i, 1, 8 - 2 * i, y < 4 ? st : y >= 9 ? T : w);
  }
  v.box(-3, 11, -3, 6, 1, 6, SNOW).box(-2, 12, -2, 4, 1, 4, SNOW).box(-1, 13, -1, 2, 1, 2, GOLD);
  v.box(-1, 0, 3, 2, 3, 1, WOOD);
  v.box(-1, 5, 2, 2, 2, 1, DARK);
  v.box(0, 14, 0, 1, 4, 1, WOOD).box(1, 16, 0, 3, 2, 1, T);
  line(v, [0, 17, 0], [3, 12, 3], i => FLAGS[i % 5], 0);
  return v;
}

// ---- 湖水の国 ----
const MARBLE = 0xeaf1f5, MARBLE2 = 0xd8e4ec, AZURE = 0x4fb8e0, AZURE2 = 0x3aa2cc, GLOW = 0x9ff0ff;

function lakeCastle(team: Team): Vox {
  const v = new Vox(), T = teamC(team), m = noisy(MARBLE, MARBLE2, MARBLE, 7);
  // 青い縁どりの白い台
  v.box(-12, 0, -7, 24, 1, 10, m);
  for (let x = -12; x < 12; x++) v.set(x, 1, 2, AZURE).set(x, 1, -7, AZURE);
  v.box(-3, 0, 3, 6, 1, 1, m);
  // 楕円の広間（青い帯と、光る縦長の窓）
  for (let x = -8; x <= 7; x++)
    for (let z = -7; z <= 2; z++)
      if (((x + 0.5) / 7.5) ** 2 + ((z + 0.5 + 2.5) / 4.6) ** 2 < 1)
        for (let y = 1; y < 10; y++) v.set(x, y, z, y === 5 || y === 9 ? AZURE : m(x, y, z));
  // 窓と扉は、広間の丸い壁の表面に
  const front = (x: number) => Math.floor(-2.5 - 0.5 + 4.6 * Math.sqrt(Math.max(0, 1 - ((x + 0.5) / 7.5) ** 2)));
  for (const x of [-5, -3, 2, 4]) v.box(x, 3, front(x), 1, 4, 1, GLOW);
  for (const x of [-1, 0]) v.box(x, 1, front(x), 1, 4, 1, AZURE2).set(x, 5, front(x), GLOW);
  // 大きな丸屋根（青、下に陣営の色の輪）と尖塔、先の光る結晶
  dome(v, 0, 10, -2.5, 5.5, (x, y, z) => (y === 10 ? T : (x + z + y) % 5 === 0 ? AZURE2 : AZURE));
  v.box(-1, 15, -3, 2, 4, 2, m).box(0, 19, -3, 1, 3, 1, m);
  v.box(-1, 22, -3, 2, 2, 2, teamGlow(team)).set(0, 24, -3, teamGlow(team));
  // 左右の細い塔と、貝のような帽子
  for (const cx of [-10, 10]) {
    cyl(v, cx, -3.5, 1, 15, 1.6, (x, y, z) => (y % 4 === 0 ? AZURE : m(x, y, z)));
    dome(v, cx, 16, -3.5, 2.3, (_x, y) => (y === 16 ? AZURE : T));
    v.set(cx < 0 ? cx - 1 : cx, 19, -4, GLOW);
    // 広間へ渡る白い弓なりの梁
    line(v, [cx < 0 ? cx + 1 : cx - 2, 12, -4], [cx < 0 ? -5 : 4, 9, -4], () => MARBLE, -1.5);
  }
  return v;
}
function lakeFort(team: Team): Vox {
  const v = new Vox(), m = noisy(MARBLE, MARBLE2, MARBLE, 47);
  cyl(v, -0.5, -0.5, 0, 2, 4, m);
  for (let a = 0; a < 16; a++) v.set(Math.round(-0.5 + Math.cos(a * 0.39) * 3.4 - 0.5), 2, Math.round(-0.5 + Math.sin(a * 0.39) * 3.4 - 0.5), AZURE);
  cyl(v, -0.5, -0.5, 2, 11, 2.2, (x, y, z) => (y % 3 === 0 ? AZURE : m(x, y, z)));
  v.box(-1, 2, 1, 2, 3, 1, AZURE2);
  cyl(v, -0.5, -0.5, 13, 1, 3.1, () => AZURE);
  cyl(v, -0.5, -0.5, 14, 3, 1.3, () => teamGlow(team));
  dome(v, -0.5, 17, -0.5, 2, () => teamC(team));
  v.set(-1, 19, -1, GLOW);
  return v;
}

// ---- 峡谷の国 ----
const ADOBE = 0xc98a55, ADOBE2 = 0xb97a48, ADOBE3 = 0xd49a62, BEAM = 0x5a3a22, CREAM = 0xe6cf9e;

/** ぎざぎざの胸壁（外周に1つおき、角は2段） */
function merlons(v: Vox, x0: number, z0: number, w: number, d: number, y: number, c: number): void {
  for (let x = x0; x < x0 + w; x++)
    for (let z = z0; z < z0 + d; z++) {
      const edge = x === x0 || x === x0 + w - 1 || z === z0 || z === z0 + d - 1;
      if (!edge || (x + z) & 1) continue;
      v.set(x, y, z, c);
      const corner = (x === x0 || x === x0 + w - 1) && (z === z0 || z === z0 + d - 1);
      if (corner) v.set(x, y + 1, z, c);
    }
}
function canyonCastle(team: Team): Vox {
  const v = new Vox(), T = teamC(team), a = noisy(ADOBE, ADOBE2, ADOBE3, 11);
  // 中の壁
  v.box(-8, 0, -6, 16, 10, 8, a);
  merlons(v, -8, -6, 16, 8, 10, ADOBE2);
  // 四隅の塔（上へすぼまり、上の方にひし形の浮き彫り）
  for (const x0 of [-12, 8])
    for (const z0 of [-7, -2]) {
      for (let y = 0; y < 14; y++) {
        const i = y >= 10 ? 1 : 0;
        v.box(x0 + i, y, z0 + i, 4 - 2 * i, 1, 5 - 2 * i, (x, yy, z) => (yy >= 7 && yy < 10 && (x + yy + z) % 3 === 0 ? ADOBE2 : a(x, yy, z)));
      }
      merlons(v, x0 + 1, z0 + 1, 2, 3, 14, ADOBE2);
      v.box(x0 + 1, 11, z0 + 4, 2, 1, 1, BEAM);
      v.box(x0 + 1, 8, z0 + 4, 1, 2, 1, 0x2a1a10);
    }
  // 突き出た梁
  for (let x = -7; x < 8; x += 3) v.set(x, 8, 2, BEAM).set(x, 8, -7, BEAM);
  // 馬蹄形の門と、陣営の色の日よけの幕
  v.box(-2, 0, 2, 4, 5, 1, CREAM);
  v.box(-1, 0, 2, 2, 4, 1, 0x3a2414).set(-2, 4, 2, CREAM).set(1, 4, 2, CREAM);
  v.box(-3, 6, 2, 6, 1, 2, T).box(-3, 5, 3, 6, 1, 1, teamD(team));
  // 真ん中の館と旗
  v.box(-3, 10, -5, 6, 5, 5, a);
  merlons(v, -3, -5, 6, 5, 15, ADOBE2);
  v.box(-1, 12, 0, 2, 2, 1, 0x2a1a10);
  v.box(0, 15, -3, 1, 5, 1, BEAM).box(1, 18, -3, 3, 2, 1, T);
  // 塔から下がる陣営の色の垂れ幕
  for (const x of [-11, 9]) v.box(x, 6, 3, 2, 5, 1, T).set(x, 5, 3, teamD(team));
  return v;
}
function canyonFort(team: Team): Vox {
  const v = new Vox(), T = teamC(team), a = noisy(ADOBE, ADOBE2, ADOBE3, 53);
  for (let y = 0; y < 10; y++) {
    const i = Math.floor(y / 5);
    v.box(-4 + i, y, -4 + i, 8 - 2 * i, 1, 8 - 2 * i, (x, yy, z) => (yy >= 6 && (x + yy + z) % 3 === 0 ? ADOBE2 : a(x, yy, z)));
  }
  merlons(v, -3, -3, 6, 6, 10, ADOBE2);
  v.box(-1, 0, 3, 2, 3, 1, 0x3a2414);
  for (const x of [-3, 0, 2]) v.set(x, 7, 3, BEAM);
  v.box(-1, 4, 3, 2, 2, 1, T);
  v.box(0, 10, 0, 1, 4, 1, BEAM).box(1, 12, 0, 3, 2, 1, T);
  return v;
}

export function styledCastle(team: Team, style: CastleStyle): Vox {
  return style === 'frost' ? frostCastle(team) : style === 'lake' ? lakeCastle(team) : canyonCastle(team);
}
export function styledFort(team: Team, style: CastleStyle): Vox {
  return style === 'frost' ? frostFort(team) : style === 'lake' ? lakeFort(team) : canyonFort(team);
}
