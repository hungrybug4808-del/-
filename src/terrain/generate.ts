import { hash } from '../core/math';
import { B, NX, NY, NZ, biome, blocks, colOf, computeColumns, cx, cz, iyOf, setB, yTop } from './grid';
import { CASTLE_Z, type Col, FORT_Z, q } from './gen-util';
import { WORLDS } from './maps';
import type { MapDef } from './maps/types';

// 選んだワールドの地形をブロックで作る。どのワールドも z=0 を境に左右対称で、両端（z=±30）に魔王城

export const MAP = {
  castleZ: CASTLE_Z,
  fortZ: FORT_Z,
  def: WORLDS[0] as MapDef,
  get veins() { return this.def.veins; },
  get waterfalls() { return this.def.waterfalls ?? []; },
  get whirlpools() { return this.def.whirlpools ?? []; },
};

/**
 * マップの外（遠景）の地形。粗いマス（大きさ s）の中心で1回だけ地形の関数を呼び、同じマスの中は同じ高さにする。
 * マップのふちの面を出すかどうかも、これで外側の高さを見る。
 */
const outerCache = new Map<number, Col>();
export function outerCol(x: number, z: number, s = 1): Col {
  const gx = Math.floor(x / s), gz = Math.floor(z / s), k = ((gx + 4096) * 8192 + (gz + 4096)) * 8 + s;
  let c = outerCache.get(k);
  if (!c) outerCache.set(k, (c = MAP.def.column((gx + 0.5) * s, Math.abs((gz + 0.5) * s))));
  return c;
}

export function generateMap(id: string = MAP.def.id): void {
  const def = WORLDS.find(w => w.id === id) ?? WORLDS[0];
  MAP.def = def;
  outerCache.clear();
  blocks.fill(0);
  for (let iz = 0; iz < NZ; iz++)
    for (let ix = 0; ix < NX; ix++) {
      const x = cx(ix), z = cz(iz), zz = Math.abs(z);
      const c = def.column(x, zz);
      biome[colOf(ix, iz)] = c.bio;
      const top = iyOf(c.h);
      for (let iy = 0; iy <= top && iy < NY; iy++)
        setB(ix, iy, iz, iy === top ? c.mat : c.strata ? c.strata(yTop(iy)) : top - iy <= 2 ? c.sub : B.STONE);
      if (c.water !== undefined) for (let iy = top + 1; iy <= iyOf(c.water); iy++) setB(ix, iy, iz, B.WATER);
      if (c.cave) {
        const f = iyOf(c.cave[0]);
        setB(ix, f, iz, B.GRAVEL);
        for (let iy = f + 1; iy <= iyOf(c.cave[1]); iy++) setB(ix, iy, iz, B.AIR);
      }
      if (c.arch) for (let iy = iyOf(c.arch[0]) + 1; iy <= iyOf(c.arch[1]); iy++) setB(ix, iy, iz, iy === iyOf(c.arch[1]) ? c.mat : c.strata ? c.strata(yTop(iy)) : c.sub);
      if (c.falls) for (let iy = iyOf(c.falls[0]) + 1; iy <= iyOf(c.falls[1]); iy++) setB(ix, iy, iz, B.WATER);
    }
  // 空の竜脈を載せる浮島：上は草地（ワールドによって雪や砂）、下は岩の円錐
  const I = def.sky;
  if (I)
    for (let iz = 0; iz < NZ; iz++)
      for (let ix = 0; ix < NX; ix++) {
        const x = cx(ix), z = cz(iz), d = Math.hypot(x - I.x, z - I.z);
        if (d >= I.r) continue;
        const bottom = q(I.top - 1 - 3.2 * (1 - d / I.r) - 0.6 * hash(ix, 7, Math.abs(iz - NZ / 2 + 0.5) | 0));
        const top = iyOf(d > I.r - 0.6 ? I.top - 0.5 : I.top);
        for (let iy = iyOf(bottom); iy <= top; iy++) setB(ix, iy, iz, iy === top ? (I.top_mat ?? B.GRASS) : top - iy <= 1 ? B.DIRT : B.STONE);
      }
  computeColumns();
}

// 地形はほかのモジュール（建物の配置など）より先に必要なので、読み込んだ時点で最初のワールドを作る
generateMap();
