import type { B } from '../grid';
import type { Col } from '../gen-util';

// ワールド（マップ）の定義。地形の形・竜脈・道・天気をまとめる

export interface WeatherDef {
  kind: 'snow' | 'rain' | 'sand';
  x0: number; x1: number; z0: number; z1: number;
  /** z を反対側にも写す */
  mirror: boolean;
  count: number;
}

export interface MapDef {
  id: string;
  name: string;
  icon: string;
  climate: string;
  /** 選ぶ画面の説明 */
  desc: string;
  /** (x, |z|) の地形 */
  column(x: number, zz: number): Col;
  /** 空の竜脈を載せる浮島 */
  sky?: { x: number; z: number; top: number; r: number; top_mat?: B };
  veins: { x: number; z: number; layer: 'land' | 'sea' | 'air' }[];
  waterfalls?: { x: number; z: number; top: number; bottom: number }[];
  whirlpools?: { x: number; z: number }[];
  /** 中盤（|z| < 17）の陸の道：0・1・2、どの道でもなければ -1 */
  laneAt(x: number, z: number): -1 | 0 | 1 | 2;
  laneNames: [string, string, string];
  /** CPU が陸のモンスターを出す場所（z は正の側）[x0, x1, z0, z1, 重み]。最初が空のモンスター用 */
  cpuSpawns: [number, number, number, number, number][];
  /** 高台の目安（バディの「高台」作戦）。z は正負の両側に写す */
  high: { x: number; z: number }[];
  weather: WeatherDef[];
  /** 雨雲を置く所 */
  rainClouds?: [number, number][];
  /** 飾り（木など）を置かない所 */
  reserved?(x: number, zz: number): boolean;
}
