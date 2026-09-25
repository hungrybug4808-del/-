// 地形データ。ブロック（0.5 四方の立方体）単位で持つ。
// 後から「壊す」「作る」を足せるように、ブロックの3次元配列を元データにし、
// 歩ける高さなどの列ごとの情報はそこから計算する（computeColumns）。

/** 1ブロックの大きさ（ワールド単位） */
export const CELL = 0.5;
export const NX = 96, NZ = 144, NY = 40;
/** グリッドの原点のワールド座標 */
export const X0 = -24, Z0 = -36, Y0 = -4;
export const XMIN = X0, XMAX = X0 + NX * CELL, ZMIN = Z0, ZMAX = Z0 + NZ * CELL;

/** ブロックの種類 */
export const enum B {
  AIR = 0, GRASS, MEADOW, DIRT, PATH, STONE, SNOW, SAND, DRY, MUD, GRAVEL, WATER,
}

export const blocks = new Uint8Array(NX * NY * NZ);
const bi = (ix: number, iy: number, iz: number) => (iz * NX + ix) * NY + iy;

export function inGrid(ix: number, iy: number, iz: number): boolean {
  return ix >= 0 && ix < NX && iz >= 0 && iz < NZ && iy >= 0 && iy < NY;
}
export function getB(ix: number, iy: number, iz: number): B {
  return inGrid(ix, iy, iz) ? blocks[bi(ix, iy, iz)] : B.AIR;
}
export function setB(ix: number, iy: number, iz: number, b: B): void {
  if (inGrid(ix, iy, iz)) blocks[bi(ix, iy, iz)] = b;
}
export const isSolid = (b: B) => b !== B.AIR && b !== B.WATER;

/** ブロック iy の上面のワールド y */
export const yTop = (iy: number) => Y0 + (iy + 1) * CELL;
/** ワールド y（上面）→ そのブロックの iy */
export const iyOf = (y: number) => Math.round((y - Y0) / CELL) - 1;

export const colOf = (ix: number, iz: number) => iz * NX + ix;
export const ixOf = (x: number) => Math.floor((x - X0) / CELL);
export const izOf = (z: number) => Math.floor((z - Z0) / CELL);
export const cx = (ix: number) => X0 + (ix + 0.5) * CELL;
export const cz = (iz: number) => Z0 + (iz + 0.5) * CELL;
export function cellAt(x: number, z: number): number {
  const ix = ixOf(x), iz = izOf(z);
  if (ix < 0 || ix >= NX || iz < 0 || iz >= NZ) return -1;
  return colOf(ix, iz);
}

// ---- 列ごとの情報 ----
const NC = NX * NZ;
/** 陸のモンスターが立つ面の段（ブロック数）。-1 は立てない */
export const level = new Int16Array(NC);
/** 陸のモンスターが立つ面の y（渡河点では水の底） */
export const walkY = new Float32Array(NC);
/** 一番上の面の y（水面を含む）。空のモンスターや演出が使う */
export const topY = new Float32Array(NC);
/** 立つ面の上の水の深さ（ブロック数） */
export const waterDepth = new Uint8Array(NC);
/** 建物などで塞がれている */
export const blocked = new Uint8Array(NC);
/** 地形の種類（Biome） */
export const biome = new Uint8Array(NC);

/** 頭上に必要な空き（ブロック数）。洞窟の天井の高さの判定に使う */
const HEADROOM = 6;

export function computeColumns(): void {
  for (let iz = 0; iz < NZ; iz++)
    for (let ix = 0; ix < NX; ix++) {
      const c = colOf(ix, iz);
      let top = -1;
      for (let iy = NY - 1; iy >= 0; iy--) if (getB(ix, iy, iz) !== B.AIR) { top = iy; break; }
      topY[c] = top >= 0 ? yTop(top) : Y0;
      // 下から見て、頭上が十分空いている最初の地面が立つ面（洞窟では洞窟の床）
      let lv = -1, depth = 0;
      for (let iy = 0; iy < NY; iy++) {
        if (!isSolid(getB(ix, iy, iz))) continue;
        let ok = true, w = 0;
        for (let k = 1; k <= HEADROOM; k++) {
          const b = getB(ix, iy + k, iz);
          if (isSolid(b)) { ok = false; break; }
          if (b === B.WATER && w === k - 1) w++;
        }
        if (ok) { lv = iy + 1; depth = w; break; }
      }
      waterDepth[c] = depth;
      // 深さ2以上の水には入れない
      level[c] = lv >= 0 && depth <= 1 ? lv : -1;
      walkY[c] = lv >= 0 ? yTop(lv - 1) : topY[c];
    }
}

export function passable(c: number): boolean {
  return c >= 0 && level[c] >= 0 && !blocked[c];
}

/** 陸のモンスターが立つ（または演出を置く）地面の高さ */
export function groundY(x: number, z: number): number {
  const c = cellAt(x, z);
  if (c < 0) return 0;
  return level[c] >= 0 ? walkY[c] : topY[c];
}
/** 一番上の面の高さ（水面・山頂を含む） */
export function surfaceY(x: number, z: number): number {
  const c = cellAt(x, z);
  return c < 0 ? 0 : Math.max(0, topY[c]);
}
