import * as THREE from 'three';
import { cl, rnd } from '../core/math';
import { DEF } from '../units/registry';
import type { Team, UnitType } from '../units/types';
import { forts, resetBuildings, updateBuildings } from './buildings';
import { clearArrows, fireArrowFrom, updateArrows } from './projectiles';
import { clearUnits, spawnUnit, updateUnits } from './units';
import { VEIN_BONUS, drawVeins, ownedVeins, resetVeins, updateVeins } from './veins';
import { alive, bldAlive, game, hdist, units } from './world';

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
      fireArrowFrom(new THREE.Vector3(f.pos.x, 2.6, f.pos.z), best, FORT_DMG, f.pos.x);
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
    const x = rnd(-3.5, 3.5), z = rnd(4, 10);
    const n = cpu.next === 'archer' ? Math.min(2, Math.floor(cpu.mana)) : 1;
    for (let i = 0; i < n; i++) {
      spawnUnit(cpu.next, 1, cl(x + (i - 1) * 0.8, -5, 5), z + rnd(-0.3, 0.3));
      cpu.mana -= cost;
    }
    cpu.next = null;
  }
}

/** プレイヤーの出撃。魔素が足りなければ false */
export function playerSpawn(type: UnitType, x: number, z: number): boolean {
  const d = DEF[type];
  if (player.mana < d.cost) return false;
  player.mana -= d.cost;
  spawnUnit(type, 0, x, z);
  return true;
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
