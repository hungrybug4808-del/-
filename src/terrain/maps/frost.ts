import { Bio } from '../biomes';
import { B } from '../grid';
import { type Col, backSea, castleYard, fbm, q, vn } from '../gen-util';
import type { MapDef } from './types';

// 霊峰の国（寒冷）：真ん中に大きな雪山。
// 陸の道は、山の西をまわる雪原・山を貫く氷の洞窟・山の東をまわる雪原の3本。
// 陸の竜脈は洞窟の奥の広間、空の竜脈は東の凍った湖の上の浮島、海の竜脈は西の海。
// 東の雪原の外側は一段高い雪の段丘（高台）で、陣地の近くの坂から上がれる。

const shoreX = (zz: number) => -18.5 + 0.8 * (vn(zz / 3, 0, 11) - 0.5);
/** 雪山（楕円）の中なら 0〜1 未満 */
const peak = (x: number, zz: number) => (x / 9.5) ** 2 + (zz / 12) ** 2;
const TUNNEL = 2, HALL = { r: 4, zz: 3.5 };

function column(x: number, zz: number): Col {
  const sea = backSea(zz);
  if (sea) return sea;
  const sx = shoreX(zz);
  // 西の海（流氷が浮かぶ）
  if (x < sx) {
    if (vn(x / 1.6, zz / 1.6, 7) > 0.8 && x < sx - 1.5) return { h: 0, mat: B.ICE, sub: B.ICE, bio: Bio.ISLAND };
    return { h: q(Math.max(-3, -0.5 - (sx - x) * 0.8)), mat: B.GRAVEL, sub: B.GRAVEL, water: 0, bio: Bio.SEA };
  }
  const yard = castleYard(x, zz, B.SNOW);
  if (yard) return { ...yard, bio: Bio.ALPINE };
  // 真ん中の雪山と、それを貫く氷の洞窟（奥は広間）
  const e = peak(x, zz);
  if (e < 1) {
    const h = q(4 + 9 * (1 - e) + 1.5 * fbm(x, zz, 17));
    const hall = Math.abs(x) < HALL.r && zz < HALL.zz;
    if (Math.abs(x) < TUNNEL || hall) return { h: Math.max(h, 7), mat: B.SNOW, sub: B.STONE, cave: [0, 4.5], bio: Bio.CAVE };
    return { h, mat: e < 0.75 ? B.SNOW : B.STONE, sub: B.STONE, bio: e < 0.75 ? Bio.ALPINE : Bio.MOUNTAIN };
  }
  // 東の端の山並み（海へ下る）
  if (x >= 20.5) {
    const m = q(Math.min(11, 5 + (x - 20.5) * 1.6 + 2 * fbm(x, zz, 91), (24.2 - x) * 4 - 0.5));
    if (m < 0) return { h: m, mat: B.GRAVEL, sub: B.STONE, water: 0, bio: Bio.SEA };
    return { h: m, mat: B.SNOW, sub: B.STONE, bio: Bio.ALPINE };
  }
  // 東の雪の段丘（高台）。陣地側の坂から上がる
  if (x >= 16.5) {
    if (zz < 18) return { h: 2, mat: B.SNOW, sub: B.STONE, bio: Bio.HIGHLAND };
    if (zz < 21) return { h: q(2 * (21 - zz) / 3), mat: B.SNOW, sub: B.DIRT, bio: Bio.HIGHLAND };
  }
  // 東の雪原の凍った湖（歩ける氷）
  if (((x - 13) / 2.6) ** 2 + (zz / 3.4) ** 2 < 1) return { h: 0, mat: B.ICE, sub: B.ICE, bio: Bio.LAKE };
  // 西の海岸
  if (x < sx + 2) return { h: 0.5, mat: B.STONE, sub: B.STONE, bio: Bio.COAST };
  // 雪原（ところどころ岩）
  if (!(zz > 15 && Math.abs(x) < 6) && vn(x / 1.3, zz / 1.3, 29) > 0.83) return { h: 1.0, mat: B.STONE, sub: B.STONE, bio: Bio.MOUNTAIN };
  return { h: 0, mat: Math.abs(x) <= 1.5 && zz > 12 ? B.PATH : B.SNOW, sub: B.DIRT, bio: Bio.ALPINE };
}

export const frost: MapDef = {
  id: 'frost', name: '霊峰の国', icon: '🏔️', climate: '寒冷・雪',
  desc: '真ん中に大きな雪山。山の左右をまわる雪原の道と、山を貫く氷の洞窟（奥の広間に陸の竜脈）。東には一段高い雪の段丘',
  column,
  sky: { x: 13, z: 0, top: 9, r: 2.6, top_mat: B.SNOW },
  veins: [{ x: 0, z: 0, layer: 'land' }, { x: -21.5, z: 0, layer: 'sea' }, { x: 13, z: 0, layer: 'air' }],
  laneAt(x) { return Math.abs(x) < HALL.r ? 1 : x < 0 ? 0 : 2; },
  laneNames: ['西の雪原', '氷の洞窟', '東の雪原'],
  cpuSpawns: [[-2.5, 2.5, 13.5, 24, 0.4], [-16, -11, 17, 24, 0.3], [10, 15, 17, 24, 0.3]],
  high: [{ x: 18, z: 4 }, { x: 18, z: 10 }, { x: 18, z: 15 }],
  weather: [{ kind: 'snow', x0: -24, x1: 24, z0: -36, z1: 36, mirror: false, count: 650 }],
};
