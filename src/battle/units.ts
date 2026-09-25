import * as THREE from 'three';
import { cl, eOut, seg } from '../core/math';
import { MAGIC, ring, sparkle } from '../fx/effects';
import { camera, scene } from '../render/stage';
import { DEF } from '../units/registry';
import { RAW_KEYS, type Building, type Team, type Unit, type UnitType } from '../units/types';
import { BAR_BG, BAR_GEO } from './bars';
import { bldEvents } from './buildings';
import { veinFor } from './veins';
import { NX, XMAX, XMIN, ZMAX, ZMIN, cellAt, groundY, passable, surfaceY } from '../terrain/grid';
import { FlowField, canStep, findPath, walkable } from '../terrain/nav';
import {
  TEAM, aimPoint, alive, bldAlive, bldDist, bldPoint, blds, canHit, game, hdist, inRange, setState, units, validTarget,
} from './world';

export function spawnUnit(type: UnitType, team: Team, x: number, z: number): Unit {
  const d = DEF[type];
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const rig = d.make(mat);
  scene.add(rig.root);
  const yaw = team === 0 ? 0 : Math.PI;
  const air = d.layer === 'air';
  // 足元の陣営リング
  const ringM = new THREE.Mesh(new THREE.RingGeometry(d.ringR * 0.8, d.ringR, 32), new THREE.MeshBasicMaterial({
    color: TEAM[team].color, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide,
  }));
  ringM.rotation.x = -Math.PI / 2;
  const y = air ? surfaceY(x, z) : groundY(x, z);
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
    state: 'spawn', st: 0, life: 0, atk: null, target: null, P: d.base(), fired: {},
    walk: Math.random() * 6, flash: 0, fp: Math.random() * 6, tp: 0, air, radius: d.radius,
    retarget: 0, aimPitch: 0, inhale: 0, ringM, bar, fill, path: [], pathT: 0, pathGoal: null,
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
  for (const b of blds) {
    if (b.team === u.team || !bldAlive(b)) continue;
    const d = bldDist(u, b);
    if (d < bbd) { bbd = d; bb = b; }
  }
  u.target = bb;
}

// ---- 移動 ----

/** 建物へ向かう距離の地図（建物ごとに1つ。建物が崩れたら作り直す） */
const fields = new Map<Building, FlowField>();
bldEvents.changed = () => fields.clear();
function fieldFor(b: Building): FlowField {
  let f = fields.get(b);
  if (!f) {
    // 敷地のすぐ外のマスがゴール
    const goals: number[] = [];
    const inside = new Set(b.cells);
    for (const c of b.cells)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = c + dx + dz * NX;
        if (!inside.has(n) && passable(n)) goals.push(n);
      }
    fields.set(b, (f = new FlowField(goals)));
  }
  return f;
}

/** 陸：地形で通れない方向へは進まず、壁に沿って滑る */
function tryMove(u: Unit, nx: number, nz: number): void {
  const c0 = cellAt(u.pos.x, u.pos.z);
  const ok = (x: number, z: number) => {
    const c = cellAt(x, z);
    if (c < 0) return false;
    if (c === c0) return true;
    return passable(c0) ? canStep(c0, c) : passable(c);
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
        u.path = walkable(c, u.pos.x, u.pos.z, tx, tz) ? [] : findPath(u.pos.x, u.pos.z, tx, tz) ?? [];
        u.pathGoal = { x: tx, z: tz };
        u.pathT = 0.8;
      }
      while (u.path.length > 1 && cellAt(u.path[0].x, u.path[0].z) === c) u.path.shift();
    }
    if (u.path.length) { wx = u.path[0].x; wz = u.path[0].z; }
  }
  const dx = wx - u.pos.x, dz = wz - u.pos.z, L = Math.hypot(dx, dz);
  if (L < 1e-4) return;
  const step = Math.min(L, u.d.speed * dt);
  if (u.air) { u.pos.x += (dx / L) * step; u.pos.z += (dz / L) * step; }
  else tryMove(u, u.pos.x + (dx / L) * step, u.pos.z + (dz / L) * step);
  u.yaw = Math.atan2(dx, dz);
}

/** 高さ：陸は足元の地面へ、空は下と少し先の地形より上を保つ */
function followHeight(u: Unit, dt: number): void {
  if (u.air) {
    const fx = Math.sin(u.yaw) * 1.5, fz = Math.cos(u.yaw) * 1.5;
    const base = Math.max(surfaceY(u.pos.x, u.pos.z), surfaceY(u.pos.x + fx, u.pos.z + fz), surfaceY(u.pos.x + fx * 2, u.pos.z + fz * 2));
    u.pos.y += (base - u.pos.y) * Math.min(1, dt * (base > u.pos.y ? 4 : 1.5));
  } else {
    u.pos.y += (groundY(u.pos.x, u.pos.z) - u.pos.y) * Math.min(1, dt * 12);
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
      if (validTarget(u) && inRange(u)) { u.st = 0; u.fired = {}; }
      else setState(u, 'move');
    }
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
    return;
  }
  if (u.state !== 'move') setState(u, 'move');
  if (t.isBld) {
    const p = bldPoint(t, u.pos.x, u.pos.z);
    moveToward(u, p.x, p.z, dt, u.air ? undefined : fieldFor(t));
  } else moveToward(u, t.pos.x, t.pos.z, dt);
}

/** 同じ場所（陸どうし・空どうし）のモンスターが重ならないように押し合う */
function separate(): void {
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (!alive(a)) continue;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (!alive(b) || a.air !== b.air) continue;
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

export function updateUnits(dt: number): void {
  for (const u of units) unitLogic(u, dt);
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
  u.ringM.material.opacity = u.state === 'dead' ? 0.6 * (1 - seg(u.st, 0, 0.5)) : 0.6;
  u.bar.visible = u.state !== 'dead';
  u.bar.position.set(u.pos.x, u.pos.y + (u.air ? u.P.rootY + 1.8 : d.barH), u.pos.z);
  u.bar.quaternion.copy(camera.quaternion);
  const ratio = u.hp / d.hp;
  u.fill.scale.x = d.barW * ratio;
  u.fill.position.x = (-(1 - ratio) * d.barW) / 2;
}
