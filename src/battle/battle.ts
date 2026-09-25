import * as THREE from 'three';
import { rnd } from '../core/math';
import { DEF } from '../units/registry';
import type { Team, UnitType } from '../units/types';
import { forts, resetBuildings, updateBuildings } from './buildings';
import { clearArrows, fireArrowFrom, updateArrows } from './projectiles';
import { clearUnits, spawnUnit, updateUnits } from './units';
import { VEIN_BONUS, drawVeins, ownedVeins, resetVeins, updateVeins } from './veins';
import { SEA_LEVEL, XMAX, XMIN, ZMAX, ZMIN, blocked, cellAt, passable, seaLevel, walkY } from '../terrain/grid';
import { alive, bldAlive, game, hdist, inOwnHalf, units } from './world';

// 1試合の進行：魔素・砦・竜脈・CPU・勝敗

export const MANA_MAX = 10;
/** 魔素が1回復するまでの秒数 */
export const MANA_SEC = 1.7;
export const MANA_START = 4;

const FORT_RANGE = 6, FORT_CD = 1.1, FORT_DMG = 11;

export const player = { mana: MANA_START };
const cpu = { mana: MANA_START, next: null as UnitType | null, t: 1.5 };

function manaRate(team: Team): number {
  return (1 + VEIN_BONUS * ownedVeins(team)) / MANA_SEC;
}

/** 砦は近づく敵（陸も空も）を矢で撃つ */
function updateForts(dt: number): void {
  for (const f of forts) {
    if (!bldAlive(f)) continue;
    f.cd -= dt;
    if (f.cd > 0) continue;
    let best = null, bd = FORT_RANGE;
    for (const e of units) {
      if (e.team === f.team || !alive(e) || e.state === 'spawn') continue;
      const d = hdist(f, e);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      fireArrowFrom(new THREE.Vector3(f.pos.x, f.pos.y + 3.2, f.pos.z), best, FORT_DMG, f.pos);
      f.cd = FORT_CD;
    }
  }
}

function cpuThink(dt: number): void {
  cpu.t -= dt;
  if (cpu.t > 0) return;
  cpu.t = 0.7;
  if (!cpu.next) {
    // ドラゴンを出されたら弓兵を増やす
    const pDragon = units.some(u => u.team === 0 && u.type === 'dragon' && alive(u));
    const r = Math.random();
    cpu.next = pDragon && r < 0.55 ? 'archer' : r < 0.45 ? 'archer' : r < 0.75 ? 'cyclops' : 'dragon';
  }
  const cost = DEF[cpu.next].cost;
  if (cpu.mana >= cost && Math.random() < 0.6) {
    const n = cpu.next === 'archer' ? Math.min(2, Math.floor(cpu.mana)) : 1;
    // 自陣の、砦と魔王城のあいだあたりの出せる場所
    for (let tries = 0; tries < 30; tries++) {
      const x = rnd(-6, 6), z = rnd(12, 27);
      if (!canSpawnAt(cpu.next, 1, x, z)) continue;
      for (let i = 0; i < n; i++) {
        const sx = x + (i - 1) * 0.8, sz = z + rnd(-0.3, 0.3), ok = canSpawnAt(cpu.next, 1, sx, sz);
        spawnUnit(cpu.next, 1, ok ? sx : x, ok ? sz : z);
        cpu.mana -= cost;
      }
      cpu.next = null;
      break;
    }
  }
}

export type SpawnResult = 'ok' | 'mana' | 'half' | 'land' | 'sea';

/**
 * 出せる場所か。自陣であること。陸は立てる地面（深い水・尾根・浮島は不可）、
 * 海は海につながる水面（湖や高台の川は不可）、空はどこでも。
 */
function spawnCheck(type: UnitType, team: Team, x: number, z: number, hitY?: number): SpawnResult {
  if (!inOwnHalf(team, z) || x < XMIN + 0.5 || x > XMAX - 0.5 || z < ZMIN + 0.5 || z > ZMAX - 0.5) return 'half';
  const layer = DEF[type].layer, c = cellAt(x, z);
  if (layer === 'air') return 'ok';
  if (layer === 'sea') return seaLevel[c] === SEA_LEVEL && !blocked[c] && (hitY === undefined || Math.abs(hitY) < 0.6) ? 'ok' : 'sea';
  return passable(c) && (hitY === undefined || Math.abs(hitY - walkY[c]) < 1.2) ? 'ok' : 'land';
}
export function canSpawnAt(type: UnitType, team: Team, x: number, z: number): boolean {
  return spawnCheck(type, team, x, z) === 'ok';
}

/** プレイヤーの出撃 */
export function playerSpawn(type: UnitType, x: number, z: number, hitY: number): SpawnResult {
  const d = DEF[type], where = spawnCheck(type, 0, x, z, hitY);
  if (where !== 'ok') return where;
  if (player.mana < d.cost) return 'mana';
  player.mana -= d.cost;
  spawnUnit(type, 0, x, z);
  return 'ok';
}

export function stepBattle(dt: number, time: number): void {
  if (!game.over) {
    player.mana = Math.min(MANA_MAX, player.mana + dt * manaRate(0));
    cpu.mana = Math.min(MANA_MAX, cpu.mana + dt * manaRate(1));
    updateForts(dt);
    updateVeins(dt);
    cpuThink(dt);
  } else game.endT += dt;
  updateUnits(dt);
  updateArrows(dt);
  drawVeins(time);
  updateBuildings(dt);
}

export function restartBattle(): void {
  clearUnits();
  clearArrows();
  resetBuildings();
  resetVeins();
  player.mana = MANA_START;
  cpu.mana = MANA_START;
  cpu.next = null;
  cpu.t = 1.5;
  game.over = false;
  game.winner = -1;
  game.endT = 0;
}
