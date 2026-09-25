import * as THREE from 'three';
import { rnd } from '../core/math';
import { DEF, HAND } from '../units/registry';
import type { Team, UnitType } from '../units/types';
import { forts, resetBuildings, updateBuildings } from './buildings';
import { clearArrows, fireArrowFrom, updateArrows } from './projectiles';
import { clearUnits, spawnUnit, updateUnits } from './units';
import { VEIN_BONUS, drawVeins, ownedVeins, resetVeins, updateVeins } from './veins';
import { NX, NZ, SEA_LEVEL, XMAX, XMIN, ZMAX, ZMIN, blocked, cellAt, cx, cz, passable, seaLevel, walkY } from '../terrain/grid';
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

/** CPU が海のモンスターを出す水面（自陣の、海につながる水） */
let cpuSea: [number, number][] | null = null;
function cpuSeaSpots(): [number, number][] {
  if (!cpuSea) {
    cpuSea = [];
    for (let iz = 0; iz < NZ; iz++)
      for (let ix = 0; ix < NX; ix++) {
        const x = cx(ix), z = cz(iz);
        if (z > 12 && canSpawnAt('kappa', 1, x, z)) cpuSea.push([x, z]);
      }
  }
  return cpuSea;
}
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

function cpuThink(dt: number): void {
  cpu.t -= dt;
  if (cpu.t > 0) return;
  cpu.t = 0.7;
  if (!cpu.next) {
    // 空の敵が多ければ、空を撃てる遠距離を増やす
    const airFoes = units.filter(u => u.team === 0 && u.air && alive(u)).length;
    cpu.next = airFoes >= 2 && Math.random() < 0.55 ? pick<UnitType>(['archer', 'centaur', 'siren', 'tengu']) : pick(HAND);
  }
  const d = DEF[cpu.next], cost = d.cost;
  if (cpu.mana >= cost && Math.random() < 0.6) {
    const n = cost === 1 ? Math.min(2, Math.floor(cpu.mana)) : 1;
    for (let tries = 0; tries < 30; tries++) {
      // 自陣の、砦と魔王城のあいだあたり（海のモンスターは自陣の海）
      const [x, z] = d.layer === 'sea' ? pick(cpuSeaSpots()) : [rnd(-6, 6), rnd(12, 27)];
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
