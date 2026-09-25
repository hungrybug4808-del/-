import type * as THREE from 'three';

/** ポーズ（関節ごとの角度など）。毎フレーム目標値へなめらかに近づける */
export type Pose = Record<string, number>;

export type UnitType = 'archer' | 'cyclops' | 'dragon';
export type Team = 0 | 1;
/** 動ける場所。海は第3段階で追加 */
export type Layer = 'land' | 'air';
export type UnitState = 'spawn' | 'move' | 'attack' | 'idle' | 'dead';

export interface Rig {
  root: THREE.Group;
}

export interface Building {
  isBld: true;
  kind: 'castle' | 'fort';
  team: Team;
  g: THREE.Group;
  mat: THREE.MeshLambertMaterial;
  hp: number;
  max: number;
  flash: number;
  /** 崩れ始めてからの時間。-1 は健在 */
  fallT: number;
  pos: THREE.Vector3;
  radius: number;
  /** 砦の矢の再装填 */
  cd: number;
}

export interface Unit<R extends Rig = Rig> {
  isBld: false;
  type: UnitType;
  team: Team;
  d: UnitDef<R>;
  rig: R;
  mat: THREE.MeshLambertMaterial;
  hp: number;
  pos: THREE.Vector3;
  /** 向きたい方向と、実際に表示している（なめらかに追従する）向き */
  yaw: number;
  yawS: number;
  state: UnitState;
  /** 今の状態になってからの時間 */
  st: number;
  life: number;
  atk: 'unit' | 'castle' | null;
  target: Target | null;
  P: Pose;
  /** 状態中に一度だけ起こすイベント（攻撃の当たりなど）の記録 */
  fired: Record<string, number>;
  walk: number;
  flash: number;
  /** 羽ばたき・尻尾の位相（ドラゴン） */
  fp: number;
  tp: number;
  air: boolean;
  radius: number;
  retarget: number;
  aimPitch: number;
  inhale: number;
  prevC?: number;
  remove?: boolean;
  ringM: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  bar: THREE.Group;
  fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

export type Target = Unit | Building;

/** モンスター1種類の定義。数値・モデル・モーション・攻撃をまとめる */
export interface UnitDef<R extends Rig = Rig> {
  type: UnitType;
  name: string;
  icon: string;
  sub: string;
  cost: number;
  hp: number;
  speed: number;
  range: number;
  /** 敵に気づく距離 */
  aggro: number;
  radius: number;
  layer: Layer;
  /** 空の敵を攻撃できるか（遠距離なら true） */
  hitAir: boolean;
  /** 地上にいるときに狙われる高さ */
  hitH: number;
  barH: number;
  barW: number;
  ringR: number;
  spawnT: number;
  deathT: number;
  /** ポーズの追従の速さ */
  smooth: number;
  make(mat: THREE.Material): R;
  base(): Pose;
  /** 攻撃1回の長さ */
  cycle(u: Unit<R>): number;
  /** 状態に応じた目標ポーズを T に書く */
  pose(u: Unit<R>, T: Pose, dt: number): void;
  /** ポーズを関節に反映する */
  apply(u: Unit<R>, dt: number): void;
  /** 行列更新後の処理（弓の弦・手綱など） */
  post?(u: Unit<R>): void;
  /** 攻撃中の狙いの角度を決める。p は狙う点、hd は水平距離 */
  aim?(u: Unit<R>, p: THREE.Vector3, hd: number): void;
  /** 攻撃中の毎フレーム処理。ok は狙いがまだ有効か */
  attack(u: Unit<R>, dt: number, ok: boolean): void;
  dispose?(u: Unit<R>): void;
}

/** ポーズのうち、なめらかにせず直接反映するキー */
export const RAW_KEYS: Record<string, true> = { draw: true };
