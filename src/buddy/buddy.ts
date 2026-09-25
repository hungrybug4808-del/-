import * as THREE from 'three';
import { rnd } from '../core/math';
import { ring, sparkle } from '../fx/effects';
import { scene } from '../render/stage';
import { groundY, passable, cellAt, walkY } from '../terrain/grid';
import { castles, forts } from '../battle/buildings';
import { plantFlag } from '../battle/flags';
import { captureBoost, canCapture, veins } from '../battle/veins';
import { TEAM, alive, bldAlive, game, hdist, hooks, units } from '../battle/world';
import type { Unit } from '../units/types';
import { BUDDIES, type BuddyDef, type PlanKind } from './data';
import { applyBuddy, buddyPose, makeBuddy, type BuddyAnim, type BuddyId, type BuddyRig } from './models';

// バディ：試合前に1人選ぶ相棒。ゲージが溜まるとスキルを使え、戦況を見て作戦（旗）を提案する

export { BUDDIES, type BuddyDef, type PlanKind } from './data';

// ---- 状態 ----
/** ゲージ：45 秒で満タン、敵を1体倒すごとに +5（仮の値） */
export const GAUGE_SEC = 45, GAUGE_PER_KILL = 5;
const HEAL_R = 5, HEAL_RATE = 0.45, HASTE_R = 6, HASTE_SEC = 12, RANGE_SEC = 15, DIG_SEC = 20, DIG_MUL = 3;
/** 提案：最初は 15 秒後、そのあとは片づいてから 20 秒ごと。出したままなら 12 秒で引っこめる */
const PLAN_FIRST = 15, PLAN_EVERY = 20, PLAN_SHOW = 12;

export interface Plan { kind: PlanKind; text: string; x: number; y: number; z: number; units: Unit[] }

export const buddy = {
  def: null as BuddyDef | null,
  gauge: 0,
  plan: null as Plan | null,
  planT: 0,
  nextPlan: PLAN_FIRST,
  /** 場所を選ぶスキルの、場所待ち */
  targeting: false,
  /** 吹き出しのせりふ（提案以外） */
  say: '',
  sayT: 0,
  digUntil: -1,
  readySaid: false,
};

let rig: BuddyRig | null = null, anim: BuddyAnim = 'idle', animT = 0, life = 0;
const P: Record<string, number> = {};
const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });

function setAnim(a: BuddyAnim): void { anim = a; animT = 0; }
function talk(text: string, sec = 3.5): void { buddy.say = text; buddy.sayT = sec; setAnim('talk'); }

/** バディを選んで試合を始める */
export function chooseBuddy(id: BuddyId): void {
  const def = BUDDIES.find(b => b.id === id)!;
  if (rig) scene.remove(rig.root);
  rig = makeBuddy(id, mat);
  // 自軍の砦の横、道の脇の草地に立つ（戦場を見渡せる所）
  const x = -4.2, z = forts[0].pos.z - 1.5;
  rig.root.position.set(x, groundY(x, z), z);
  rig.root.traverse(o => { o.castShadow = true; });
  scene.add(rig.root);
  Object.assign(buddy, { def, gauge: 0, plan: null, planT: 0, nextPlan: PLAN_FIRST, targeting: false, digUntil: -1, readySaid: false });
  captureBoost[0] = 1;
  talk(def.lines.hello, 4);
  sparkle({ x, y: rig.root.position.y + 0.8, z }, 20, [0xffd34d, 0xffffff, 0xa98bff]);
}

hooks.onDeath = e => {
  if (e.team === 1 && buddy.def) buddy.gauge = Math.min(100, buddy.gauge + GAUGE_PER_KILL);
};

export const skillReady = () => !!buddy.def && buddy.gauge >= 100 && !game.over && game.phase === 'battle';

/** スキルを使う。場所を選ぶスキルは x,z が必要 */
export function useSkill(x?: number, z?: number): boolean {
  const def = buddy.def;
  if (!def || !skillReady()) return false;
  if (def.targeted && (x === undefined || z === undefined)) return false;
  const mine = units.filter(u => u.team === 0 && alive(u));
  if (def.id === 'uni') {
    for (const u of mine) if (Math.hypot(u.pos.x - x!, u.pos.z - z!) < HEAL_R) {
      u.hp = Math.min(u.d.hp, u.hp + u.d.hp * HEAL_RATE);
      sparkle({ x: u.pos.x, y: u.pos.y + 0.5, z: u.pos.z }, 10, [0x8ff0a0, 0xffffff, 0xf8c8e0], 1.5);
    }
    ring({ x: x!, z: z! }, 0x8ff0a0, HEAL_R * 2, 0.8);
  } else if (def.id === 'val') {
    for (const u of mine) if (Math.hypot(u.pos.x - x!, u.pos.z - z!) < HASTE_R) u.mem.haste = game.time + HASTE_SEC;
    ring({ x: x!, z: z! }, 0xffd34d, HASTE_R * 2, 0.8);
  } else if (def.id === 'leaf') {
    for (const u of mine) if (u.d.ranged) { u.mem.range = game.time + RANGE_SEC; sparkle({ x: u.pos.x, y: u.pos.y + 0.8, z: u.pos.z }, 8, [0x8ff0a0, 0xd8ffe0]); }
  } else {
    buddy.digUntil = game.time + DIG_SEC;
    captureBoost[0] = DIG_MUL;
    for (const v of veins) { ring(v.pos, 0xffd34d, 3, 0.7); sparkle({ x: v.pos.x, y: v.pos.y + 0.5, z: v.pos.z }, 16, [0xffd34d, 0xffffff]); }
  }
  buddy.gauge = 0;
  buddy.targeting = false;
  buddy.readySaid = false;
  if (rig) sparkle({ x: rig.root.position.x, y: rig.root.position.y + 1.2, z: rig.root.position.z }, 24, [0xffd34d, 0xffffff, 0xa98bff], 1.8);
  talk(def.lines.cast, 3);
  setAnim('cast');
  return true;
}

// ---- 作戦の提案 ----
const mineReady = () => units.filter(u => u.team === 0 && alive(u) && u.state !== 'spawn');
const foes = () => units.filter(u => u.team === 1 && alive(u));

function candidates(def: BuddyDef): Plan[] {
  const out: Plan[] = [], mine = mineReady(), enemies = foes();
  const mk = (kind: PlanKind, place: string, x: number, z: number, us: Unit[], y = groundY(x, z)): void => {
    if (us.length) out.push({ kind, text: def.lines[kind](place), x, y, z, units: us });
  };
  // 守り：自軍の砦・城のまわりに敵が2体以上
  for (const b of [forts[0], castles[0]]) {
    if (!bldAlive(b)) continue;
    const threat = enemies.filter(e => hdist(e, b) < 10).length;
    if (threat < 2) continue;
    const z = b.kind === 'castle' ? TEAM[0].castleZ + 3.5 : b.pos.z + 2.2;
    mk('defend', b.kind === 'castle' ? '魔王城' : '砦', b.pos.x, z, mine.filter(u => Math.hypot(u.pos.x - b.pos.x, u.pos.z - z) < 24));
    break;
  }
  // 竜脈：まだ自軍のものでない竜脈へ、占領できるモンスターを
  let bestV: Plan | null = null, bestD = Infinity;
  for (const v of veins) {
    if (v.owner === 0) continue;
    const us = mine.filter(u => canCapture(u, v) && u.flag === null).sort((a, b) => hdist(a, v) - hdist(b, v)).slice(0, 4);
    if (!us.length) continue;
    const d = us.reduce((s, u) => s + hdist(u, v), 0) / us.length;
    if (d < bestD) { bestD = d; bestV = { kind: 'vein', text: def.lines.vein(v.name), x: v.pos.x, y: v.pos.y, z: v.pos.z, units: us }; }
  }
  if (bestV) out.push(bestV);
  // 攻め：4体以上いれば、敵の砦（落ちていれば城）の前へ全員
  if (mine.length >= 4) {
    const f = forts[1];
    if (bldAlive(f)) mk('attack', '砦', f.pos.x, f.pos.z - 2.6, mine);
    else if (bldAlive(castles[1])) mk('attack', '魔王城', 0, TEAM[1].castleZ - 3.6, mine);
  }
  // 地形：陸の遠距離が2体以上いれば、前線に近い高台の縁へ
  const shooters = mine.filter(u => u.d.ranged && u.layer === 'land');
  if (shooters.length >= 2) {
    const front = enemies.length ? enemies.reduce((s, e) => s + e.pos.z, 0) / enemies.length : 0;
    const z0 = Math.max(-12, Math.min(12, front - 4));
    // 前線に近い順に、手前・奥と交互に探す
    for (let i = 0; i <= 40; i++) {
      const z = z0 + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 0.5, x = 10.75, c = cellAt(x, z);
      if (passable(c) && walkY[c] >= 3.5) { mk('terrain', '高台', x, z, shooters, walkY[c]); break; }
    }
  }
  return out;
}

function makePlan(): void {
  const def = buddy.def!, cs = candidates(def);
  if (!cs.length) return;
  const w = cs.map(c => (c.kind === def.prefer ? 4 : 1));
  let r = rnd(0, w.reduce((a, b) => a + b, 0));
  let pick = cs[0];
  for (let i = 0; i < cs.length; i++) { r -= w[i]; if (r <= 0) { pick = cs[i]; break; } }
  buddy.plan = pick;
  buddy.planT = PLAN_SHOW;
  setAnim('talk');
}

/** 提案を承認：代わりに旗を立てる */
export function approvePlan(): void {
  const p = buddy.plan;
  if (!p || !buddy.def) return;
  const us = p.units.filter(u => alive(u));
  if (us.length) plantFlag(0, p.x, p.y, p.z, us);
  buddy.plan = null;
  buddy.nextPlan = game.time + PLAN_EVERY;
  talk(buddy.def.lines.ok, 2);
  setAnim('cheer');
}
export function dismissPlan(): void {
  buddy.plan = null;
  buddy.nextPlan = game.time + PLAN_EVERY;
  setAnim('idle');
}

export function resetBuddy(): void {
  buddy.plan = null;
  buddy.say = '';
  buddy.sayT = 0;
  buddy.targeting = false;
  captureBoost[0] = 1;
}

export function updateBuddy(dt: number): void {
  life += dt;
  animT += dt;
  const def = buddy.def;
  if (def && game.phase === 'battle' && !game.over) {
    buddy.gauge = Math.min(100, buddy.gauge + (100 / GAUGE_SEC) * dt);
    if (buddy.gauge >= 100 && !buddy.readySaid && !buddy.plan) { buddy.readySaid = true; talk(def.lines.ready, 4); }
    if (buddy.digUntil > 0 && game.time > buddy.digUntil) { buddy.digUntil = -1; captureBoost[0] = 1; }
    if (buddy.plan) {
      buddy.planT -= dt;
      if (buddy.planT <= 0) dismissPlan();
    } else if (game.time >= buddy.nextPlan && buddy.sayT <= 0) {
      buddy.nextPlan = game.time + 3;
      makePlan();
    }
  }
  if (buddy.sayT > 0) buddy.sayT -= dt;
  if (!rig) return;
  if ((anim === 'cheer' && animT > 1.6) || (anim === 'cast' && animT > 1.8) || (anim === 'talk' && !buddy.plan && buddy.sayT <= 0)) setAnim('idle');
  const T: Record<string, number> = {};
  buddyPose(anim, animT, life, T);
  const k = 1 - Math.exp(-12 * dt);
  for (const key in T) P[key] = (P[key] ?? T[key]) + (T[key] - (P[key] ?? T[key])) * k;
  applyBuddy(rig, P);
  rig.root.position.y = groundY(rig.root.position.x, rig.root.position.z) + P.rootY;
}
