import * as THREE from 'three';
import { cl, eOut, seg } from '../core/math';
import { MAGIC, ring, sparkle } from '../fx/effects';
import { camera, scene } from '../render/stage';
import { DEF } from '../units/registry';
import { RAW_KEYS, type Building, type Team, type Unit, type UnitType } from '../units/types';
import { BAR_BG, BAR_GEO } from './bars';
import { forts } from './buildings';
import { veinFor } from './veins';
import {
  TEAM, aimPoint, alive, bldAlive, bldDist, blds, game, hdist, inRange, setState, units, validTarget,
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
  ringM.position.set(x, 0.03, z);
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
    isBld: false, type, team, d, rig, mat, hp: d.hp, pos: new THREE.Vector3(x, 0, z), yaw, yawS: yaw,
    state: 'spawn', st: 0, life: 0, atk: null, target: null, P: d.base(), fired: {},
    walk: Math.random() * 6, flash: 0, fp: Math.random() * 6, tp: 0, air, radius: d.radius,
    retarget: 0, aimPitch: 0, inhale: 0, ringM, bar, fill,
  };
  units.push(u);
  // 召喚：魔法陣の輪と光の粒
  ring({ x, z }, TEAM[team].color, d.ringR * 2, 0.5);
  sparkle({ x, y: air ? 2.6 : 0.3, z }, 18, MAGIC);
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

/** 近くの敵モンスター → いなければ一番近い建物 */
function chooseTarget(u: Unit): void {
  let best: Unit | null = null, bd = u.d.aggro;
  for (const e of units) {
    if (e.team === u.team || !alive(e) || e.state === 'spawn') continue;
    if (e.air && !u.d.hitAir) continue;
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

function unitLogic(u: Unit, dt: number): void {
  const d = u.d;
  u.life += dt;
  u.st += dt;
  if (u.state === 'spawn') { if (u.st >= d.spawnT) setState(u, 'move'); return; }
  if (u.state === 'dead') { if (u.st >= d.deathT) u.remove = true; return; }
  if (game.over) { if (u.state !== 'idle') setState(u, 'idle'); return; }

  if (u.state === 'attack') {
    const ok = validTarget(u);
    if (ok) {
      const p = aimPoint(u.target!, u.pos.x);
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
      const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, L = Math.hypot(dx, dz);
      if (L > 0.7) {
        if (u.state !== 'move') setState(u, 'move');
        u.pos.x += (dx / L) * d.speed * dt;
        u.pos.z += (dz / L) * d.speed * dt;
        u.yaw = Math.atan2(dx, dz);
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
  let tx: number, tz: number;
  if (t.isBld && t.kind === 'castle') { tx = cl(u.pos.x, -3.2, 3.2); tz = TEAM[t.team].front; }
  else { tx = t.pos.x; tz = t.pos.z; }
  const dx = tx - u.pos.x, dz = tz - u.pos.z, L = Math.hypot(dx, dz) || 1, step = d.speed * dt;
  u.pos.x += (dx / L) * step;
  u.pos.z += (dz / L) * step;
  u.yaw = Math.atan2(dx, dz);
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
        const push = (min - dd) * 0.5, nx = dx / dd, nz = dz / dd;
        a.pos.x -= nx * push * 0.5; a.pos.z -= nz * push * 0.5;
        b.pos.x += nx * push * 0.5; b.pos.z += nz * push * 0.5;
      } else if (dd <= 1e-4) a.pos.x += 0.05;
    }
  }
  for (const u of units) {
    if (!u.air)
      for (const f of forts) {
        if (!bldAlive(f)) continue;
        const dx = u.pos.x - f.pos.x, dz = u.pos.z - f.pos.z, dd = Math.hypot(dx, dz), min = f.radius + u.radius * 0.7;
        if (dd < min) {
          const n = dd > 1e-4 ? 1 / dd : 0;
          u.pos.x = f.pos.x + (dd > 1e-4 ? dx * n : 1) * min;
          u.pos.z = f.pos.z + (dd > 1e-4 ? dz * n : 0) * min;
        }
      }
    u.pos.x = cl(u.pos.x, -5.5, 5.5);
    u.pos.z = cl(u.pos.z, TEAM[0].front + 0.4, TEAM[1].front - 0.4);
  }
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
    sparkle({ x: u.pos.x, y: u.air ? u.P.rootY : 0.6, z: u.pos.z }, 2, MAGIC);
  u.rig.root.updateMatrixWorld(true);
  d.post?.(u);

  u.ringM.position.set(u.pos.x, 0.03, u.pos.z);
  u.ringM.material.opacity = u.state === 'dead' ? 0.6 * (1 - seg(u.st, 0, 0.5)) : 0.6;
  u.bar.visible = u.state !== 'dead';
  u.bar.position.set(u.pos.x, u.air ? u.P.rootY + 1.8 : d.barH, u.pos.z);
  u.bar.quaternion.copy(camera.quaternion);
  const ratio = u.hp / d.hp;
  u.fill.scale.x = d.barW * ratio;
  u.fill.position.x = (-(1 - ratio) * d.barW) / 2;
}
