import { Bio } from '../biomes';
import { B } from '../grid';
import { type Col, backSea, castleYard, fbm, q, smooth, vn } from '../gen-util';
import type { MapDef } from './types';

// 湖水の国（温暖・雨）：真ん中に大きな湖。
// 陸の道は、湖の西岸（沼地・足が遅い）・湖の中の島へ渡る浅瀬の道（竜脈の島、四方から撃たれる）・
// 湖の東岸（森の丘・高台）の3本。湖は西の海と水路でつながり、海のモンスターは湖の中まで入れる。
// 水路には浅瀬があり、西岸の道はそこで水路を渡る。

const shoreX = (zz: number) => -18.5 + 0.8 * (vn(zz / 3, 0, 13) - 0.5);
const lakeE = (x: number, zz: number) => (x / 10) ** 2 + (zz / 12.5) ** 2;
const ISLAND_R = 3, CAUSEWAY = 1.5;

function column(x: number, zz: number): Col {
  const sea = backSea(zz);
  if (sea) return sea;
  const sx = shoreX(zz);
  if (x < sx) return { h: q(Math.max(-3, -0.5 - (sx - x) * 0.8)), mat: B.SAND, sub: B.GRAVEL, water: 0, bio: Bio.SEA };
  const yard = castleYard(x, zz);
  if (yard) return yard;
  // 湖と海をつなぐ水路（西岸の道が渡る浅瀬つき）
  if (zz < 1.5 && x < -9) {
    if (x >= -15.5 && x < -12.5) return { h: -0.5, mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.FORD };
    return { h: -1.5, mat: B.SAND, sub: B.GRAVEL, water: 0, bio: Bio.RIVER };
  }
  // 湖：真ん中の島と、そこへ渡る浅瀬の道
  const e = lakeE(x, zz);
  if (e < 1) {
    if (Math.hypot(x, zz) < ISLAND_R) return { h: 0, mat: B.GRASS, sub: B.SAND, bio: Bio.ISLAND };
    if (Math.abs(x) < CAUSEWAY) return { h: -0.5, mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.FORD };
    return { h: q(-1.0 - 2 * (1 - e)), mat: B.SAND, sub: B.GRAVEL, water: 0, bio: Bio.LAKE };
  }
  // 東の端の山
  if (x >= 19) {
    const m = q(Math.min(10, 4 + (x - 19) * 1.5 + 2 * fbm(x, zz, 91), (24.2 - x) * 4 - 0.5));
    if (m < 0) return { h: m, mat: B.GRAVEL, sub: B.STONE, water: 0, bio: Bio.SEA };
    return { h: m, mat: m > 7 ? B.SNOW : B.STONE, sub: B.STONE, bio: Bio.MOUNTAIN };
  }
  // 東岸：森の丘（ゆるやかに高くなる高台）
  if (x >= 9) {
    const h = q(2.5 * smooth(0.3, 0.75, fbm(x, zz, 61)) * smooth(9, 12, x));
    return { h, mat: B.GRASS, sub: B.DIRT, bio: vn(x / 3, zz / 3, 81) > 0.4 ? Bio.FOREST : Bio.HILLS };
  }
  // 西岸：沼地（浅い水たまりで足が遅い）と砂浜
  if (x < -9) {
    if (x < sx + 2) return { h: 0, mat: B.SAND, sub: B.SAND, bio: Bio.BEACH };
    return vn(x / 1.8, zz / 1.8, 51) > 0.5
      ? { h: -0.5, mat: B.MUD, sub: B.MUD, water: 0, bio: Bio.SWAMP }
      : { h: 0, mat: B.MUD, sub: B.DIRT, bio: Bio.SWAMP };
  }
  // 湖の手前の草地と道
  return { h: 0, mat: Math.abs(x) <= 1.5 ? B.PATH : zz > 16 ? B.MEADOW : B.GRASS, sub: B.DIRT, bio: zz > 16 ? Bio.GRASSLAND : Bio.PLAIN };
}

export const lake: MapDef = {
  id: 'lake', name: '湖水の国', icon: '🏞️', climate: '温暖・雨',
  desc: '真ん中に大きな湖。西岸の沼地の道・湖の島へ渡る浅瀬の道（島に陸の竜脈）・東岸の森の丘の道。海のモンスターは湖の中まで入れる',
  column,
  sky: { x: 6, z: 0, top: 8, r: 2.4 },
  veins: [{ x: 0, z: 0, layer: 'land' }, { x: -6, z: 0, layer: 'sea' }, { x: 6, z: 0, layer: 'air' }],
  laneAt(x) { return Math.abs(x) < 3.5 ? 1 : x < 0 ? 0 : 2; },
  laneNames: ['西の沼の岸', '湖の浅瀬', '東の森の岸'],
  cpuSpawns: [[-2.5, 2.5, 13.5, 24, 0.4], [-16, -11, 16, 24, 0.3], [11, 16, 16, 24, 0.3]],
  high: [{ x: 15, z: 5 }, { x: 15, z: 11 }, { x: 15, z: 16 }],
  weather: [{ kind: 'rain', x0: -18, x1: 10, z0: -12, z1: 12, mirror: false, count: 320 }],
  rainClouds: [[-12, -4], [-4, 3], [3, -5], [-14, 6], [7, 4]],
  reserved(x) { return Math.abs(x) <= 1.8; },
};
