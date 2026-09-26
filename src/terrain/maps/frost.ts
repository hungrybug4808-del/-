import { Bio } from '../biomes';
import { B } from '../grid';
import { type Col, MOAT, MOAT_X, castleYard, inMap, moat, moatRim, q, smooth, vn } from '../gen-util';
import { DS } from '../mesh';
import type { MapDef } from './types';

// 霊峰の国（寒冷・雪）：雪山の連なる造山帯。まわりは高い峰に囲まれ、2本の尾根が戦場を3本の谷に分ける。
// 陸の道：西の谷（氷河の湖と川）・中央の谷（岩の丘に陸の竜脈）・東の谷（一段高い、凍った湖）。
// 尾根は途中の鞍部（峠）だけ越えられる（旗で乗り換え）。東の尾根の頂に空の竜脈。
// 西の谷の川は氷河湖から南北に流れて、両方の魔王城の堀になる（海のモンスターの道）。

const RIDGE_X = 7.5, PASS = { z0: 11, z1: 13.5 };
/** 西の谷の川の中心の x */
const riverX = (zz: number) => {
  const w = -15.5 + 1.2 * Math.sin(zz / 3.5);
  return zz < 17 ? w : w + (-MOAT_X - w) * smooth(17, MOAT.z0, zz);
};
const RIVER_HALF = 1.25, LAKE_R = 3.2, SUMMIT = { x: RIDGE_X, z: 0, top: 12, r: 1.8 };
/** 中央の谷をふさぐ山と、それを抜けるトンネル（真ん中に天窓） */
const BARRIER = { z0: 6, z1: 10 }, TUNNEL_HALF = 1.5, TUNNEL_TOP = 3.5, SKYLIGHT = { z0: 7.5, z1: 8.5 };
/** 谷に張り出す岩の尾根 [x0, x1, |z|0, |z|1]（左右の谷で互い違い。道を曲がりくねらせ、見通しをさえぎる） */
const SPURS: [number, number, number, number][] = [
  [-12.5, -9, 2.5, 4], [-12.3, -9, 9, 11],
  [14.5, 20, 3, 5], [9, 15, 9, 11],
];
const FROZEN = { x: 13.5, z: 0, rx: 2.4, rz: 2.2 };
function spur(x: number, zz: number): number {
  for (const [x0, x1, z0, z1] of SPURS) {
    if (x < x0 || x >= x1 || zz < z0 || zz >= z1) continue;
    // 先の方ほど低く、角を丸める
    const tip = x0 > 0 ? (x1 === 20 ? x - x0 : x1 - x) : x - x0;
    return 3.5 + Math.min(3, tip * 1.2) + 1.5 * vn(x / 1.3, zz / 1.3, 319);
  }
  return 0;
}
function barrier(x: number, zz: number): number {
  if (zz < BARRIER.z0 || zz >= BARRIER.z1 || Math.abs(x) >= RIDGE_X) return 0;
  const dz = Math.min(zz - BARRIER.z0, BARRIER.z1 - zz);
  return 4.5 + dz * 2 + 1.5 * vn(x / 1.5, zz / 1.5, 321);
}

/** 尾根の高さ（x=±7.5 を走る。陣地の近くでは丘に下がる） */
function ridge(x: number, zz: number): number {
  const side = x < 0 ? 0 : 1, t = Math.abs(Math.abs(x) - RIDGE_X);
  const w = 2.6 + 0.5 * (vn(zz / 3, side, 311) - 0.5);
  const crest = (6 + 5 * vn(zz / 4.5, side * 7, 303) ** 1.4) * (1 - smooth(13, 21, zz));
  const pass = zz >= PASS.z0 && zz < PASS.z1;
  if (pass) return t < w ? 1 : 0;
  const h = crest * (1 - smooth(w - 1.1, w, t)) + (t < w - 1 ? 1.3 * vn(x / 1.2, zz / 1.2, 305) : 0);
  return Math.max(0, h);
}
/** 谷の外側の壁と、マップの外の高い峰 */
function walls(x: number, zz: number): number {
  const d = Math.max(Math.abs(x) - 19.5, zz - 36, 0);
  if (d <= 0) return 0;
  return d * 2.2 + 3 * vn(x / 3, zz / 3, 307) + Math.max(0, d - 8) * (0.6 + 1.2 * vn(x / 12, zz / 12, 309));
}

function snowy(h: number, x: number, zz: number, floor: Bio): Col {
  const hq = q(h);
  if (hq > 4.5 + 1.5 * vn(x / 2, zz / 2, 313)) return { h: hq, mat: B.SNOW, sub: B.STONE, bio: Bio.ALPINE };
  if (hq > 2.5) return { h: hq, mat: vn(x / 1.5, zz / 1.5, 315) > 0.45 ? B.STONE : B.SNOW, sub: B.STONE, bio: Bio.MOUNTAIN };
  return { h: hq, mat: B.SNOW, sub: B.DIRT, bio: floor };
}

function column(x: number, zz: number): Col {
  const out = !inMap(x, zz);
  if (!out) {
    const m = moat(x, zz);
    if (m) return m;
    if (moatRim(x, zz)) return { h: 0.5, mat: B.STONE, sub: B.STONE, bio: Bio.COAST };
    const yard = castleYard(x, zz, B.SNOW);
    if (yard) return { ...yard, mat: Math.abs(x) <= 1.5 ? B.PATH : B.SNOW };
  }
  // 東の尾根の頂（空の竜脈）
  const ds = Math.hypot(x - SUMMIT.x, zz - SUMMIT.z);
  if (ds < SUMMIT.r) return { h: SUMMIT.top, mat: B.SNOW, sub: B.STONE, bio: Bio.ALPINE };
  if (ds < SUMMIT.r + 1.5) return snowy(Math.max(ridge(x, zz), SUMMIT.top - (ds - SUMMIT.r) * 1.6), x, zz, Bio.ALPINE);

  // 西の谷：氷河湖と川（氷河から滝が落ちる）
  const dl = Math.hypot(x - riverX(0), zz);
  if (dl < LAKE_R) return { h: dl < LAKE_R - 1 ? -2 : -1, mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.GLACIER };
  if (zz < 0.9 && x < riverX(0) && x > -21.5) {
    // 氷河から段になって落ちる流れ
    if (x < -19.5) { const w = q(walls(x, zz) * 0.6); return { h: w - 0.5, mat: B.ICE, sub: B.STONE, water: w, bio: Bio.FALLS }; }
    return { h: -0.5, mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.RIVER };
  }
  const dr = Math.abs(x - riverX(zz));
  if (!out && zz < MOAT.z0 && dr < RIVER_HALF) {
    if (zz >= 18 && zz < 20.5) return { h: -0.5, mat: B.STONE, sub: B.GRAVEL, water: 0, bio: Bio.FORD };
    return { h: dr < RIVER_HALF - 0.5 ? -1.5 : -1, mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.RIVER };
  }

  // 谷の底（小さな起伏）と、尾根・外の壁
  const bump = 0.9 * vn(x / 2.5, zz / 2.5, 317) - 0.3;
  const east = x > 10 ? 1.5 * (1 - smooth(14, 20, zz)) : 0;
  const nearBase = smooth(4, 8, Math.hypot(x, zz - 20)) * smooth(2, 5, Math.hypot(Math.max(Math.abs(x) - MOAT.x1 - 0.5, 0), Math.max(MOAT.z0 - zz, 0)));
  const floor = Math.max(0, bump * smooth(2, 4, dr)) * nearBase + east;
  const h = Math.max(floor, ridge(x, zz), walls(x, zz), spur(x, zz));

  // 中央の谷をふさぐ山と、天窓のあるトンネル（入口は木の枠）
  const bh = barrier(x, zz);
  if (bh > 0) {
    if (Math.abs(x) < TUNNEL_HALF) {
      if (zz >= SKYLIGHT.z0 && zz < SKYLIGHT.z1) return { h: 0, mat: B.GRAVEL, sub: B.STONE, bio: Bio.CAVE };
      return { h: q(Math.max(bh, TUNNEL_TOP + 1.5)), mat: B.SNOW, sub: B.STONE, cave: [0, TUNNEL_TOP], bio: Bio.CAVE };
    }
    return snowy(Math.max(h, bh), x, zz, Bio.MOUNTAIN);
  }

  // 中央の谷の岩の丘（陸の竜脈）
  const dk = Math.hypot(x, zz);
  if (dk < 4.5 && h < 2) return { h: q(Math.max(h, 1 - smooth(1.5, 4.5, dk))), mat: dk < 2 ? B.STONE : B.SNOW, sub: B.STONE, bio: Bio.ALPINE };
  // 東の谷の凍った湖
  if (Math.hypot((x - FROZEN.x) / FROZEN.rx, (zz - FROZEN.z) / FROZEN.rz) < 1 && h < 2.5) return { h: q(east), mat: B.ICE, sub: B.ICE, bio: Bio.GLACIER };
  if (Math.abs(x) <= 1 && zz < MOAT.z0 && h < 1.5) return { h: q(h), mat: B.PATH, sub: B.DIRT, bio: Bio.ALPINE };
  return snowy(h, x, zz, x > 10 || x < -10 ? Bio.MOUNTAIN : Bio.ALPINE);
}

export const frost: MapDef = {
  id: 'frost', name: '霊峰の国', icon: '🏔️', climate: '寒冷・雪',
  desc: '雪山の連なる造山帯。険しい尾根が戦場を3つの谷に分け、谷には岩が張り出して見通しが悪い。中央の谷は山を抜けるトンネル（天窓つき）。西の谷（氷河湖と川）・東の谷（一段高い）。尾根は峠だけ越えられる',
  column,
  veins: [{ x: 0, z: 0, layer: 'land' }, { x: riverX(0), z: 0, layer: 'sea' }, { x: SUMMIT.x, z: SUMMIT.z, layer: 'air' }],
  waterfalls: [{ x: -19.25, z: 0, top: 2, bottom: 0 }],
  laneAt(x) {
    if (x < -10.5) return 0;
    if (Math.abs(x) < 4.5) return 1;
    if (x > 10.5) return 2;
    return -1;
  },
  laneNames: ['西の谷', '中央の谷', '東の谷'],
  cpuSpawns: [[-3.5, 3.5, 13, 23, 0.4], [-13, -10.5, 13, 16.5, 0.3], [11, 17, 13, 16.5, 0.3]],
  high: [{ x: 11.5, z: 4 }, { x: 12, z: 9 }, { x: 11.5, z: 15 }],
  weather: [{ kind: 'snow', x0: -24, x1: 24, z0: -36, z1: 36, mirror: false, count: 650 }],
  reserved(x, zz) {
    return Math.abs(x) <= 1.3 && zz < MOAT.z0;
  },
  decorate(d) {
    // トンネルの入口の木の枠と、ともしび
    const W = 0x6b4a2e, W2 = 0x4f3620, FIRE = 0xffc060;
    for (const s of [1, -1])
      for (const zz of [BARRIER.z0, BARRIER.z1]) {
        const vz = Math.round((s * zz) / DS) - (s * zz > 0 === (zz === BARRIER.z1) ? 0 : 1);
        const vx0 = Math.round(-TUNNEL_HALF / DS), vx1 = Math.round(TUNNEL_HALF / DS) - 1, top = Math.round(TUNNEL_TOP / DS);
        for (const vx of [vx0, vx1]) d.box(vx, 0, vz, 1, top, 1, W);
        d.box(vx0, top - 1, vz, vx1 - vx0 + 1, 1, 1, W2);
        for (const vx of [vx0 - 1, vx1 + 1]) { d.box(vx, 6, vz, 1, 1, 1, W2); d.box(vx, 7, vz, 1, 1, 1, FIRE); }
      }
  },
};
