import * as THREE from 'three';
import { cl, eOut, seg } from '../core/math';
import { MAGIC, ring, sparkle } from '../fx/effects';
import { camera, scene } from '../render/stage';
import { DEF } from '../units/registry';
import { RAW_KEYS, type Building, type Flag, type Target, type Team, type Unit, type UnitType } from '../units/types';
import { BAR_BG, BAR_GEO } from './bars';
import { bldEvents } from './buildings';
import { flagMode } from './flags';
import { veinFor } from './veins';
import { Bio } from '../terrain/biomes';
import {
  NX, NZ, SEA_LEVEL, XMAX, XMIN, ZMAX, ZMIN, biome, cellAt, cx, cz, groundY, passable, seaLevel, seaY, surfaceY, type NavLayer,
} from '../terrain/grid';
import { FlowField, canStep, findPath, walkable } from '../terrain/nav';
import {
  TEAM, aimPoint, alive, bldAlive, bldDist, bldPoint, blds, canHit, game, hdist, hooks, inRange, notify, rangeOf, setState, units, validTarget,
} from './world';

/** 場所ごとの高さ：陸は地面、海は水面、空は下の地形（その上を飛ぶ） */
function heightFor(layer: Unit['layer'], x: number, z: number): number {
  return layer === 'air' ? surfaceY(x, z) : layer === 'sea' ? seaY(x, z) : groundY(x, z);
}
const navOf = (u: Unit): NavLayer => (u.layer === 'sea' ? 1 : 0);

export function spawnUnit(type: UnitType, team: Team, x: number, z: number): Unit {
  const d = DEF[type];
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const rig = d.make(mat);
  scene.add(rig.root);
  const yaw = team === 0 ? 0 : Math.PI;
  const layer = d.layer, air = layer === 'air';
  // 足元の陣営リング
  const ringM = new THREE.Mesh(new THREE.RingGeometry(d.ringR * 0.8, d.ringR, 32), new THREE.MeshBasicMaterial({
    color: TEAM[team].color, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide,
  }));
  ringM.rotation.x = -Math.PI / 2;
  const y = heightFor(layer, x, z);
  ringM.position.set(x, y + 0.03, z);
  scene.add(ringM);
  // 頭上のHPバー
  const bar = new THREE.Group(), bg = new THREE.Mesh(BAR_GEO, BAR_BG);
  const fill = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ color: TEAM[team].color, depthTest: false, transparent: true }));
  bg.scale.set(d.barW, 1, 1);
  fill.scale.set(d.barW, 0.65, 1);
  fill.position.z = 0.001;
  bg.renderOrder = 10;
  fill.renderOrder = 11;
  bar.add(bg, fill);
  scene.add(bar);

  const u: Unit = {
    isBld: false, type, team, d, rig, mat, hp: d.hp, pos: new THREE.Vector3(x, y, z), yaw, yawS: yaw,
    state: 'spawn', st: 0, life: 0, atk: null, target: null, P: d.base(), fired: {}, mem: {},
    walk: Math.random() * 6, flash: 0, fp: Math.random() * 6, tp: 0, layer, air, radius: d.radius,
    retarget: 0, aimPitch: 0, inhale: 0, ringM, bar, fill, path: [], pathT: 0, pathGoal: null, flag: null,
  };
  units.push(u);
  // 召喚：魔法陣の輪と光の粒
  ring({ x, y, z }, TEAM[team].color, d.ringR * 2, 0.5);
  sparkle({ x, y: y + (air ? 2.6 : 0.3), z }, 18, MAGIC);
  return u;
}

function removeUnit(u: Unit): void {
  scene.remove(u.rig.root, u.ringM, u.bar);
  u.d.dispose?.(u);
  u.mat.dispose();
  u.ringM.geometry.dispose();
  u.ringM.material.dispose();
  u.fill.material.dispose();
}

export function clearUnits(): void {
  units.forEach(removeUnit);
  units.length = 0;
}

/** 近くの敵モンスター（攻撃が届くもの）→ いなければ一番近い建物 */
function chooseTarget(u: Unit): void {
  let best: Unit | null = null, bd = u.d.aggro;
  for (const e of units) {
    if (e.team === u.team || !alive(e) || e.state === 'spawn' || !canHit(u, e)) continue;
    const d = hdist(u, e) - e.radius;
    if (d < bd) { bd = d; best = e; }
  }
  if (best) { u.target = best; return; }
  let bb: Building | null = null, bbd = 1e9;
  const c = cellAt(u.pos.x, u.pos.z);
  for (const b of blds) {
    if (b.team === u.team || !bldAlive(b)) continue;
    // 陸・海のモンスターは、たどり着けない建物（海から届かない砦など）は狙わない
    if (!u.air && fieldFor(b, navOf(u)).dist[c] === Infinity && bldDist(u, b) > u.d.range) continue;
    const d = bldDist(u, b);
    if (d < bbd) { bbd = d; bb = b; }
  }
  u.target = bb;
}

// ---- 移動 ----

/** 建物へ向かう距離の地図（建物ごと・陸と海ごとに1つ。建物が崩れたら作り直す） */
const fields: [Map<Building, FlowField>, Map<Building, FlowField>] = [new Map(), new Map()];
bldEvents.changed = () => { fields[0].clear(); fields[1].clear(); };
function fieldFor(b: Building, lay: NavLayer): FlowField {
  let f = fields[lay].get(b);
  if (!f) {
    // 敷地のすぐ外がゴール。海は、建物に一番近い水面の並び
    const near: [number, number][] = [];
    for (let iz = 0; iz < NZ; iz++)
      for (let ix = 0; ix < NX; ix++) {
        const c = ix + iz * NX, x = cx(ix), z = cz(iz), p = bldPoint(b, x, z), d = Math.hypot(x - p.x, z - p.z);
        if (d <= 1.6 && passable(c, lay)) near.push([c, d]);
      }
    const reach = lay === 0 ? 0.8 : Math.min(...near.map(n => n[1])) + 0.35;
    const goals = near.filter(n => n[1] <= reach).map(n => n[0]);
    fields[lay].set(b, (f = new FlowField(goals, lay)));
  }
  return f;
}

/** 旗へ向かう距離の地図。旗のマスへ行けない場所（海のモンスターと陸の旗など）は、一番近い行ける所 */
function flagField(f: Flag, lay: NavLayer): FlowField | undefined {
  if (!(lay in f.fields)) {
    const near: [number, number][] = [];
    const c0x = Math.floor((f.x - XMIN) / 0.5), c0z = Math.floor((f.z - ZMIN) / 0.5);
    for (let iz = Math.max(0, c0z - 16); iz < Math.min(NZ, c0z + 17); iz++)
      for (let ix = Math.max(0, c0x - 16); ix < Math.min(NX, c0x + 17); ix++) {
        const c = ix + iz * NX, d = Math.hypot(cx(ix) - f.x, cz(iz) - f.z);
        // 海のモンスターは、海とつながった水面だけ（高台の川や湖には行けない）
        if (d <= 8 && passable(c, lay) && (lay === 0 || seaLevel[c] === SEA_LEVEL)) near.push([c, d]);
      }
    const min = Math.min(...near.map(n => n[1]));
    f.fields[lay] = near.length ? new FlowField(near.filter(n => n[1] <= min + 0.5).map(n => n[0]), lay) : undefined;
  }
  return f.fields[lay];
}

/** 旗に従う：向かう途中は攻撃が届く相手とだけ戦い、着いたらその場を守る */
const GUARD_R = 4;
function followFlag(u: Unit, f: Flag, dt: number): void {
  const d = u.d, dFlag = Math.hypot(f.x - u.pos.x, f.z - u.pos.z), arrived = dFlag < 1.5;
  let best: Target | null = null, bd = Infinity;
  for (const e of units) {
    if (e.team === u.team || !alive(e) || e.state === 'spawn' || !canHit(u, e)) continue;
    const dd = hdist(u, e) - e.radius;
    // 着くまでは届く相手だけ、着いたら気づく範囲（旗から離れすぎない）
    const ok = arrived ? dd < d.aggro && Math.hypot(e.pos.x - f.x, e.pos.z - f.z) < GUARD_R + d.range : dd - u.radius * 0.5 <= rangeOf(u, e);
    if (ok && dd < bd) { bd = dd; best = e; }
  }
  if (!best) for (const b of blds) if (b.team !== u.team && bldAlive(b) && canHit(u, b) && bldDist(u, b) <= rangeOf(u, b) + 0.1) { best = b; break; }
  u.target = best;
  if (best && inRange(u)) {
    setState(u, 'attack');
    u.atk = best.isBld ? 'castle' : 'unit';
    d.startAttack?.(u);
    return;
  }
  if (best && !best.isBld) {
    if (u.state !== 'move') setState(u, 'move');
    moveToward(u, best.pos.x, best.pos.z, dt);
    return;
  }
  if (dFlag > 0.8) {
    if (u.state !== 'move') setState(u, 'move');
    moveToward(u, f.x, f.z, dt, u.air ? undefined : flagField(f, navOf(u)));
  } else if (u.state !== 'idle') setState(u, 'idle');
}

/** 陸・海：地形で通れない方向へは進まず、壁に沿って滑る */
function tryMove(u: Unit, nx: number, nz: number): void {
  const c0 = cellAt(u.pos.x, u.pos.z), lay = navOf(u);
  const ok = (x: number, z: number) => {
    const c = cellAt(x, z);
    if (c < 0) return false;
    if (c === c0) return true;
    return passable(c0, lay) ? canStep(c0, c, lay) : passable(c, lay);
  };
  if (ok(nx, nz)) { u.pos.x = nx; u.pos.z = nz; }
  else if (ok(nx, u.pos.z)) u.pos.x = nx;
  else if (ok(u.pos.x, nz)) u.pos.z = nz;
}

/**
 * (tx,tz) へ向かって1フレーム分進む。
 * field があれば距離の地図に沿って、なければまっすぐ（塞がれていれば経路を探す）。
 */
function moveToward(u: Unit, tx: number, tz: number, dt: number, field?: FlowField): void {
  let wx = tx, wz = tz;
  const lay = navOf(u);
  if (!u.air) {
    u.pathT -= dt;
    const c = cellAt(u.pos.x, u.pos.z);
    if (field) {
      // 道しるべのマスに入ったら（中心へ寄り直す点なら、中心に着いたら）次の道しるべへ
      const wp = u.path[0];
      const reached = !!wp && cellAt(wp.x, wp.z) === c && (!wp.center || Math.hypot(wp.x - u.pos.x, wp.z - u.pos.z) < 0.15);
      if (u.pathT <= 0 || !wp || reached) {
        const n = field.next(u.pos.x, u.pos.z);
        u.path = n ? [n] : [];
        u.pathT = 0.25;
      }
    } else {
      const moved = !u.pathGoal || Math.hypot(u.pathGoal.x - tx, u.pathGoal.z - tz) > 1.5;
      if (u.pathT <= 0 || moved) {
        u.path = walkable(c, u.pos.x, u.pos.z, tx, tz, lay) ? [] : findPath(u.pos.x, u.pos.z, tx, tz, lay) ?? [];
        u.pathGoal = { x: tx, z: tz };
        u.pathT = 0.8;
      }
      while (u.path.length > 1 && cellAt(u.path[0].x, u.path[0].z) === c) u.path.shift();
    }
    if (u.path.length) { wx = u.path[0].x; wz = u.path[0].z; }
  }
  const dx = wx - u.pos.x, dz = wz - u.pos.z, L = Math.hypot(dx, dz);
  if (L < 1e-4) return;
  const step = Math.min(L, u.d.speed * speedMul(u) * dt);
  if (u.air) { u.pos.x += (dx / L) * step; u.pos.z += (dz / L) * step; }
  else tryMove(u, u.pos.x + (dx / L) * step, u.pos.z + (dz / L) * step);
  u.yaw = Math.atan2(dx, dz);
}

/** 沼地と砂漠では陸の移動が遅くなる */
export const SLOW_BIOME_MUL = 0.7;
function speedMul(u: Unit): number {
  if (u.layer !== 'land') return 1;
  const b = biome[cellAt(u.pos.x, u.pos.z)];
  return b === Bio.SWAMP || b === Bio.DESERT ? SLOW_BIOME_MUL : 1;
}

/** 高さ：陸は足元の地面、海は水面、空は下と少し先の地形より上を保つ */
function followHeight(u: Unit, dt: number): void {
  if (u.air) {
    const fx = Math.sin(u.yaw) * 1.5, fz = Math.cos(u.yaw) * 1.5;
    const base = Math.max(surfaceY(u.pos.x, u.pos.z), surfaceY(u.pos.x + fx, u.pos.z + fz), surfaceY(u.pos.x + fx * 2, u.pos.z + fz * 2));
    u.pos.y += (base - u.pos.y) * Math.min(1, dt * (base > u.pos.y ? 4 : 1.5));
  } else {
    u.pos.y += (heightFor(u.layer, u.pos.x, u.pos.z) - u.pos.y) * Math.min(1, dt * 12);
  }
}

function unitLogic(u: Unit, dt: number): void {
  const d = u.d;
  u.life += dt;
  u.st += dt;
  followHeight(u, dt);
  if (u.state === 'spawn') { if (u.st >= d.spawnT) setState(u, 'move'); return; }
  if (u.state === 'dead') { if (u.st >= d.deathT) u.remove = true; return; }
  if (game.over) { if (u.state !== 'idle') setState(u, 'idle'); return; }

  if (u.state === 'attack') {
    const ok = validTarget(u);
    if (ok) {
      const p = aimPoint(u.target!, u.pos);
      u.yaw = Math.atan2(p.x - u.pos.x, p.z - u.pos.z);
      d.aim?.(u, p, Math.hypot(p.x - u.pos.x, p.z - u.pos.z));
    }
    d.attack(u, dt, ok);
    if (u.st >= d.cycle(u)) {
      if (validTarget(u) && inRange(u)) { u.st = 0; u.fired = {}; u.atk = u.target!.isBld ? 'castle' : 'unit'; d.startAttack?.(u); }
      else setState(u, 'move');
    }
    return;
  }

  // 旗に従う。その場所から旗へたどり着けなければ（陸の奥の旗と海のモンスターなど）、旗は無視して自動で進軍
  if (u.flag && (u.air || (flagField(u.flag, navOf(u))?.dist[cellAt(u.pos.x, u.pos.z)] ?? Infinity) < Infinity)) {
    followFlag(u, u.flag, dt);
    return;
  }

  // 進軍・待機
  u.retarget -= dt;
  if (u.retarget <= 0 || !validTarget(u)) { chooseTarget(u); u.retarget = 0.4; }
  const t = u.target;
  if (!t) return;
  if (t.isBld) {
    // 戦う相手がいなければ、近くの竜脈に寄り道する
    const v = veinFor(u);
    if (v) {
      if (Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z) > 0.7) {
        if (u.state !== 'move') setState(u, 'move');
        moveToward(u, v.pos.x, v.pos.z, dt);
      } else if (u.state !== 'idle') setState(u, 'idle');
      return;
    }
  }
  if (inRange(u)) {
    setState(u, 'attack');
    u.atk = t.isBld ? 'castle' : 'unit';
    d.startAttack?.(u);
    return;
  }
  if (u.state !== 'move') setState(u, 'move');
  if (t.isBld) {
    const p = bldPoint(t, u.pos.x, u.pos.z);
    moveToward(u, p.x, p.z, dt, u.air ? undefined : fieldFor(t, navOf(u)));
  } else moveToward(u, t.pos.x, t.pos.z, dt);
}

/** 同じ場所（陸どうし・海どうし・空どうし）のモンスターが重ならないように押し合う */
function separate(): void {
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (!alive(a)) continue;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (!alive(b) || a.layer !== b.layer) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dd = Math.hypot(dx, dz), min = (a.radius + b.radius) * 0.85;
      if (dd < min && dd > 1e-4) {
        const push = (min - dd) * 0.25, nx = dx / dd, nz = dz / dd;
        push2(a, a.pos.x - nx * push, a.pos.z - nz * push);
        push2(b, b.pos.x + nx * push, b.pos.z + nz * push);
      } else if (dd <= 1e-4) push2(a, a.pos.x + 0.05, a.pos.z);
    }
  }
}
function push2(u: Unit, x: number, z: number): void {
  x = cl(x, XMIN + 0.3, XMAX - 0.3);
  z = cl(z, ZMIN + 0.3, ZMAX - 0.3);
  if (u.air) { u.pos.x = x; u.pos.z = z; } else tryMove(u, x, z);
}

// ---- スライム：分裂と合体 ----
/** 攻撃を受けたときに分裂する確率。分裂したスライムは 3 秒は分裂しない */
const SPLIT_CHANCE = 0.15, SPLIT_COOL = 3, SLIME_MAX = 12;
/** この数のスライムが集まるとキングスライムに合体する */
export const KING_COUNT = 8;
const KING_R = 2.5;

hooks.onHurt = (e: Unit) => {
  if (e.type !== 'slime' || e.hp < 8 || Math.random() >= SPLIT_CHANCE) return;
  if (e.life - (e.mem.split ?? -SPLIT_COOL) < SPLIT_COOL) return;
  if (units.filter(o => o.team === e.team && o.type === 'slime' && alive(o)).length >= SLIME_MAX) return;
  // 体力を半分ずつ分けて、隣にもう1体
  const a = Math.random() * Math.PI * 2;
  let x = e.pos.x + Math.cos(a) * 0.6, z = e.pos.z + Math.sin(a) * 0.6;
  if (!passable(cellAt(x, z))) { x = e.pos.x; z = e.pos.z; }
  e.hp /= 2;
  e.mem.split = e.life;
  const n = spawnUnit('slime', e.team, x, z);
  n.hp = e.hp;
  n.mem.split = 0;
  n.flag = e.flag;
};

let mergeT = 0;
function mergeSlimes(dt: number): void {
  mergeT -= dt;
  if (mergeT > 0) return;
  mergeT = 0.5;
  for (const team of [0, 1] as const) {
    const ss = units.filter(u => u.team === team && u.type === 'slime' && alive(u) && u.state !== 'spawn');
    if (ss.length < KING_COUNT) continue;
    for (const s of ss) {
      const near = ss.filter(o => hdist(o, s) < KING_R).sort((a, b) => hdist(a, s) - hdist(b, s));
      if (near.length < KING_COUNT) continue;
      const group = near.slice(0, KING_COUNT);
      let x = 0, z = 0;
      for (const g of group) { x += g.pos.x / KING_COUNT; z += g.pos.z / KING_COUNT; sparkle({ x: g.pos.x, y: g.pos.y + 0.4, z: g.pos.z }, 8, [0x4ab8e8, 0xbfeaff, 0xffffff]); g.remove = true; }
      if (!passable(cellAt(x, z))) { x = s.pos.x; z = s.pos.z; }
      const king = spawnUnit('kingslime', team, x, z);
      king.flag = s.flag;
      ring({ x, z }, 0xf0c030, 4, 0.8);
      sparkle({ x, y: king.pos.y + 1, z }, 40, [0xf0c030, 0xffffff, 0x4ab8e8], 1.8);
      notify.toast(team === 0 ? 'スライムが集まって、キングスライムが誕生！' : '敵のキングスライムが誕生した！');
      return;
    }
  }
}

export function updateUnits(dt: number): void {
  for (const u of units) unitLogic(u, dt);
  mergeSlimes(dt);
  separate();
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i];
    if (u.remove) { removeUnit(u); units.splice(i, 1); continue; }
    drawUnit(u, dt);
  }
}

function drawUnit(u: Unit, dt: number): void {
  const d = u.d;
  const T = d.base();
  d.pose(u, T, dt);
  if (u.state === 'spawn') T.rootS = Math.max(0.02, eOut(seg(u.st, 0, d.spawnT)));
  const k = 1 - Math.exp(-d.smooth * dt);
  for (const key in T) {
    if (RAW_KEYS[key]) u.P[key] = T[key];
    else u.P[key] += (T[key] - u.P[key]) * k;
  }
  let dy = u.yaw - u.yawS;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  u.yawS += dy * (1 - Math.exp(-6 * dt));
  d.apply(u, dt);
  u.rig.root.scale.setScalar(Math.max(u.P.rootS, 0.001));

  // 被弾は赤く、召喚と撃破は魔素の色に光る
  u.flash = Math.max(0, u.flash - dt * 4);
  const sp = u.state === 'spawn' ? 1 - seg(u.st, 0, d.spawnT) : 0;
  const dd = u.state === 'dead' ? seg(u.st, d.deathT * 0.5, d.deathT) : 0;
  const inh = u.state === 'attack' ? u.inhale || 0 : 0;
  u.mat.emissive.setRGB(
    0.8 * u.flash + 0.1 * sp + 0.1 * dd + 0.35 * inh,
    0.1 * u.flash + 0.45 * sp + 0.45 * dd + 0.12 * inh,
    0.1 * u.flash + 0.6 * sp + 0.6 * dd,
  );
  // 撃破：倒れてから魔素の粒になって消える
  if (u.state === 'dead' && dd > 0 && dd < 1 && Math.random() < 0.7)
    sparkle({ x: u.pos.x, y: u.pos.y + (u.air ? u.P.rootY : 0.6), z: u.pos.z }, 2, MAGIC);
  u.rig.root.updateMatrixWorld(true);
  d.post?.(u);

  u.ringM.position.set(u.pos.x, (u.air ? surfaceY(u.pos.x, u.pos.z) : u.pos.y) + 0.03, u.pos.z);
  // 旗で動かすために選んでいるモンスターは、足元の輪を黄色に
  const sel = flagMode.selected.has(u);
  u.ringM.material.color.setHex(sel ? 0xffd34d : TEAM[u.team].color);
  u.ringM.material.opacity = u.state === 'dead' ? 0.6 * (1 - seg(u.st, 0, 0.5)) : sel ? 0.95 : 0.6;
  u.bar.visible = u.state !== 'dead';
  u.bar.position.set(u.pos.x, u.pos.y + (u.air ? u.P.rootY + 1.8 : d.barH), u.pos.z);
  u.bar.quaternion.copy(camera.quaternion);
  const ratio = u.hp / d.hp;
  u.fill.scale.x = d.barW * ratio;
  u.fill.position.x = (-(1 - ratio) * d.barW) / 2;
}
