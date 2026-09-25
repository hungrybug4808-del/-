import * as THREE from 'three';
import { eOut, hash, seg } from '../core/math';
import { Vox } from '../core/voxel';
import { K, anchor, joint, newRoot, type Piv } from '../units/kit';
import type { Pose } from '../units/types';

// バディ4人のボクセルモデル。大きな頭の2頭身の女の子

export type BuddyId = 'uni' | 'mina' | 'val' | 'leaf';

interface Look {
  skin: number; skinD: number; hair: number; hairD: number; eye: number;
  top: number; topD: number; skirt: number; shoe: number;
  /** 髪型・服の飾り・持ち物を足す */
  extra(head: Vox, torso: Vox, legs: Vox): void;
  prop: Vox | null;
  scale: number;
}

const BLUSH = 0xf4b0b4, MOUTH = 0xd8707c, WHITE = 0xffffff, GOLD = 0xe8c050, GOLD_D = 0xc8a030;

function build(L: Look): { legs: Vox; torso: Vox; head: Vox; armL: Vox; armR: Vox } {
  const legs = new Vox().box(-2, 0, -1, 2, 3, 2, (_x, y) => (y === 0 ? L.shoe : L.skin)).box(0, 0, -1, 2, 3, 2, (_x, y) => (y === 0 ? L.shoe : L.skin));
  const torso = new Vox().box(-3, 5, -2, 6, 3, 4, L.top).box(-4, 2, -3, 8, 3, 6, (x, y, z) => (y === 2 && (x + z) % 2 ? L.topD : L.skirt));
  const head = new Vox().box(-4, 8, -3, 8, 8, 7, L.skin);
  // 髪：上と後ろと横、前髪
  head.box(-4, 14, -4, 8, 3, 8, (x, y, z) => (hash(x, y, z) > 0.7 ? L.hairD : L.hair))
    .box(-4, 8, -4, 8, 7, 1, L.hair).box(-5, 9, -3, 1, 7, 6, L.hair).box(4, 9, -3, 1, 7, 6, L.hair)
    .box(-4, 13, 4, 3, 1, 1, L.hair).box(1, 13, 4, 3, 1, 1, L.hair).set(-1, 14, 4, L.hairD).set(0, 14, 4, L.hair);
  // 顔は面の中に描く（目・ほっぺ・小さな口）
  head.set(-4, 9, 3, BLUSH).set(3, 9, 3, BLUSH).box(-1, 9, 3, 2, 1, 1, MOUTH);
  head.box(-3, 10, 3, 2, 2, 1, L.eye).box(1, 10, 3, 2, 2, 1, L.eye).set(-3, 11, 3, WHITE).set(1, 11, 3, WHITE);
  const arm = (x0: number) => new Vox().box(x0, 5, -1, 2, 3, 2, L.top).box(x0, 4, -1, 2, 1, 2, L.skin);
  const armL = arm(-5), armR = arm(3);
  L.extra(head, torso, legs);
  return { legs, torso, head, armL, armR };
}

const LOOKS: Record<BuddyId, Look> = {
  // ユニ（ユニコーン）：額に小さな角飾り、白いローブ、たてがみ風の長い髪
  uni: {
    skin: 0xf8e0d4, skinD: 0xe8c8b8, hair: 0xf0eefc, hairD: 0xd8d4f0, eye: 0x8a6ad8, top: 0xf8f6ff, topD: 0xe0dcf0, skirt: 0xf8f6ff, shoe: 0xe0c8f0, scale: 0.08,
    extra(head, torso, legs) {
      head.box(-4, 3, -4, 8, 6, 1, (x, y) => [0xf0eefc, 0xf8c8e0, 0xc8e0f8, 0xe0d0f8][(x + y + 8) % 4]);
      head.box(-5, 4, -3, 1, 5, 2, 0xf8c8e0).box(4, 4, -3, 1, 5, 2, 0xc8e0f8);
      head.box(-1, 16, 3, 2, 1, 1, GOLD_D).box(-1, 17, 3, 1, 1, 1, GOLD).set(-1, 18, 3, 0xfff4c0);
      torso.box(-3, 5, 2, 6, 1, 1, GOLD).box(-4, 0, -3, 8, 2, 6, 0xf8f6ff);
      legs.box(-2, 0, -1, 4, 1, 2, 0xe0c8f0);
    },
    prop: null,
  },
  // ミナ（ドワーフ）：ランプ付きヘルメット、小さなツルハシ、背が低い
  mina: {
    skin: 0xf8d8c0, skinD: 0xe8c0a0, hair: 0xe87a3a, hairD: 0xc8602a, eye: 0x3a8a4a, top: 0x3f6aa8, topD: 0x2f5288, skirt: 0x7a5a3a, shoe: 0x4a3020, scale: 0.07,
    extra(head, torso) {
      head.box(-5, 14, -4, 10, 3, 9, (x, _y, z) => ((x + z) % 5 === 0 ? 0xc89020 : 0xe8b030)).box(-4, 17, -3, 8, 1, 7, 0xe8b030);
      head.box(-1, 15, 5, 2, 2, 1, 0x8a6a30);
      head.box(-6, 6, -1, 2, 4, 2, 0xe87a3a).box(4, 6, -1, 2, 4, 2, 0xe87a3a).set(-6, 5, 0, 0xc8602a).set(5, 5, 0, 0xc8602a);
      torso.box(-2, 5, 2, 4, 3, 1, 0x3f6aa8).set(-2, 7, 2, GOLD).set(1, 7, 2, GOLD).box(-3, 7, -2, 6, 1, 4, 0x7a5a3a);
    },
    prop: new Vox().box(0, -1, 0, 1, 6, 1, 0x8a5a30).box(-2, 5, 0, 5, 1, 1, 0x8a8f99).set(-3, 4, 0, 0x6e737c).set(3, 4, 0, 0x6e737c),
  },
  // ヴァル（ワルキューレ）：羽根付きの兜、小ぶりな鎧と槍
  val: {
    skin: 0xf8dcc8, skinD: 0xe8c4a8, hair: 0xf0d060, hairD: 0xd8b040, eye: 0x2f6ad8, top: 0xb8c0cc, topD: 0x8a929e, skirt: 0x3050a0, shoe: 0x6a4428, scale: 0.08,
    extra(head, torso) {
      head.box(-5, 14, -4, 10, 2, 9, (x, _y, z) => ((x + z) % 4 === 0 ? 0x9aa3ad : 0xc8d0da)).box(-4, 16, -3, 8, 1, 7, 0xc8d0da).box(-1, 12, 4, 2, 3, 1, 0xc8d0da);
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) head.box(sx > 0 ? 5 + i : -6 - i, 14 + i, -1 - i, 1, 2, 3, i === 3 ? 0xe8eef4 : WHITE);
      head.box(-1, 2, -5, 2, 7, 1, 0xf0d060).set(-1, 1, -5, 0x3050a0);
      torso.box(-3, 5, 2, 6, 3, 1, 0xc8d0da).box(-1, 6, 3, 2, 1, 1, GOLD);
    },
    prop: new Vox().box(0, -3, 0, 1, 14, 1, 0x8a5a30).box(0, 11, 0, 1, 3, 1, 0xd8e0ea).box(-1, 10, 0, 3, 1, 1, GOLD),
  },
  // リーフ（エルフ）：とがった耳、緑のマント、長弓
  leaf: {
    skin: 0xf8e4d0, skinD: 0xe8ccb0, hair: 0xe0e8a0, hairD: 0xc8d488, eye: 0x2f8a4a, top: 0x8ac87a, topD: 0x6aa85a, skirt: 0x4a8a4a, shoe: 0x5a3e28, scale: 0.08,
    extra(head, torso) {
      head.box(-6, 11, 0, 1, 1, 1, 0xf8e4d0).box(-7, 12, 0, 1, 2, 1, 0xf8e4d0).box(5, 11, 0, 1, 1, 1, 0xf8e4d0).box(6, 12, 0, 1, 2, 1, 0xf8e4d0);
      head.box(-4, 4, -4, 8, 5, 1, 0xe0e8a0);
      torso.box(-4, 1, -4, 8, 7, 1, (x, y) => (y === 7 ? 0x3f7a3f : (x + y) % 5 === 0 ? 0x357035 : 0x3f8a4a)).set(-1, 7, 2, GOLD);
    },
    prop: (() => { const v = new Vox(); for (let y = -7; y <= 7; y++) { const a = Math.abs(y); v.set(0, y, a <= 2 ? 1 : a <= 5 ? 0 : -1, a === 7 ? GOLD : 0x8a5a30); } return v; })(),
  },
};

export interface BuddyRig {
  root: THREE.Group; legs: THREE.Group; torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; hand: THREE.Object3D;
}
const P0: Piv = [0, 0, 0], PT: Piv = [0, 3, 0], PH: Piv = [0, 8, 0];

export function makeBuddy(id: BuddyId, mat: THREE.Material): BuddyRig {
  const L = LOOKS[id], S = L.scale, v = build(L), root = newRoot();
  const legs = joint(root, P0, 'bd' + id + 'L', v.legs, P0, S, mat);
  const torso = joint(root, P0, 'bd' + id + 'T', v.torso, PT, S, mat);
  const head = joint(torso, PT, 'bd' + id + 'H', v.head, PH, S, mat);
  const armL = joint(torso, PT, 'bd' + id + 'AL', v.armL, [-4, 8, 0], S, mat);
  const armR = joint(torso, PT, 'bd' + id + 'AR', v.armR, [4, 8, 0], S, mat);
  const hand = anchor(armR, [4, 8, 0], [4, 4, 0], S);
  if (L.prop) {
    const pr = joint(armR, [4, 8, 0], 'bd' + id + 'P', L.prop, [0, 0, 0], S, mat);
    pr.position.set(0, -4 * S, 0.5 * S);
    if (id === 'leaf') { armL.add(pr); pr.position.set(0, -4 * S, 0.5 * S); }
  }
  return { root, legs, torso, head, armL, armR, hand };
}

export type BuddyAnim = 'idle' | 'talk' | 'cheer' | 'cast';

/** バディのポーズ。t はそのアニメーションが始まってからの時間 */
export function buddyPose(anim: BuddyAnim, t: number, life: number, T: Pose): void {
  const k = K(t);
  T.rootY = 0; T.torsoRX = 0; T.headRX = 0; T.headRZ = 0; T.headRY = 0; T.armLX = 0; T.armLZ = -0.15; T.armRX = 0; T.armRZ = 0.15;
  if (anim === 'talk') {
    T.headRZ = 0.12 * Math.sin(life * 3);
    T.armRX = -1.2 + 0.4 * Math.sin(life * 8); T.armRZ = 0.3;
    T.rootY = 0.03 * Math.abs(Math.sin(life * 6));
  } else if (anim === 'cheer') {
    // ぴょんと跳ねて両手を上げる（腕は顔の外側を通す）
    T.rootY = 0.35 * Math.abs(Math.sin(t * 7)) * (1 - seg(t, 1.2, 1.6));
    T.armLZ = -2.4; T.armRZ = 2.4; T.headRX = -0.2;
  } else if (anim === 'cast') {
    T.armLX = k([[0, 0], [0.3, -2.6], [1.0, -2.6], [1.3, -1.5, eOut], [1.8, 0]]);
    T.armRX = T.armLX; T.armLZ = -0.5; T.armRZ = 0.5;
    T.torsoRX = k([[0, 0], [0.3, -0.15], [1.0, -0.15], [1.3, 0.1], [1.8, 0]]);
    T.headRX = -0.25;
    T.rootY = k([[0, 0], [0.3, 0.15], [1.0, 0.25], [1.3, 0], [1.8, 0]]);
  } else {
    const b = Math.sin(life * 2);
    T.rootY = 0.01 * (b + 1); T.headRZ = 0.08 * Math.sin(life * 0.9); T.headRY = 0.3 * Math.sin(life * 0.4);
  }
}

export function applyBuddy(r: BuddyRig, P: Pose): void {
  r.torso.rotation.x = P.torsoRX;
  r.head.rotation.set(P.headRX, P.headRY, P.headRZ);
  r.armL.rotation.set(P.armLX, 0, P.armLZ);
  r.armR.rotation.set(P.armRX, 0, P.armRZ);
}
