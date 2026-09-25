import { MAP } from './generate';
import { NX, NZ, cx, cz } from './grid';

// 陸の道（レーン）。ワールドごとに3本（草原の国なら南・中央・北）。
// 中盤（|z| < BASE_Z）では、自動で進むモンスターは今いる道の中だけで進路を探す。
// 両軍の陣地（|z| >= BASE_Z）では道が合流する。道の乗り換えは、旗で指示したときだけ。

export const BASE_Z = 17;
export type Lane = -1 | 0 | 1 | 2;

/** その場所の道。陣地の中や、道と道のあいだ（峠など）は -1 */
export function laneAt(x: number, z: number): Lane {
  if (Math.abs(z) >= BASE_Z) return -1;
  return MAP.def.laneAt(x, z);
}

let masks: Uint8Array[] = [];
/** ワールドが変わったら作り直す */
export function resetLanes(): void { masks = []; }

/** その道と、両軍の陣地だけを通れるマスの印 */
export function laneMask(lane: 0 | 1 | 2): Uint8Array {
  if (!masks[lane]) {
    const m = new Uint8Array(NX * NZ);
    for (let iz = 0; iz < NZ; iz++)
      for (let ix = 0; ix < NX; ix++) {
        const z = cz(iz);
        m[ix + iz * NX] = Math.abs(z) >= BASE_Z || laneAt(cx(ix), z) === lane ? 1 : 0;
      }
    masks[lane] = m;
  }
  return masks[lane];
}
