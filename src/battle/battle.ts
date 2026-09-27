import * as THREE from 'three';
import { rnd } from '../core/math';
import { DEF } from '../units/registry';
import { MAP } from '../terrain/generate';
import type { Team, UnitType } from '../units/types';
import { forts, resetBuildings, updateBuildings } from './buildings';
import { clearArrows, fireArrowFrom, updateArrows } from './projectiles';
import { clearFlags, updateFlags } from './flags';
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

/** CPU が海のモンスターを出す水面（自陣の、海につながる水）。ワールドが変わったら作り直す */
let cpuSea: [number, number][] | null = null;
export function resetCpuSpots(): void { cpuSea = null; }
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

// ---- CPU の考え ----
// 魔素が足りればすぐ出し続ける（貯めてまとめて送るより、この試合では圧をかけ続ける方が強かった）。
// 自陣に敵が入っていれば、一番奥の敵の少し手前（遠距離はもう少し後ろ）に出して迎え撃つ。
// いなければ、重みつきで選んだ道（短い道ほど多め）に出す。海のモンスターは自陣の水に。

/** 空いている場所を、(x, z) のまわりから探す（自陣の中だけ） */
function findSpot(type: UnitType, x: number, z: number, r: number): [number, number] | null {
  if (canSpawnAt(type, 1, x, z)) return [x, z];
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2, d = r * Math.sqrt(Math.random());
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (canSpawnAt(type, 1, px, pz)) return [px, pz];
  }
  return null;
}
const CPU_POOL = Object.keys(DEF).filter(k => k !== 'kingslime') as UnitType[];

function cpuThink(dt: number): void {
  cpu.t -= dt;
  if (cpu.t > 0) return;
  cpu.t = 0.5;
  if (!cpu.next) cpu.next = pick(CPU_POOL);
  const type = cpu.next, d = DEF[type];
  if (cpu.mana < d.cost || Math.random() > 0.6) return;
  const foes = units.filter(u => u.team === 0 && alive(u) && u.state !== 'spawn' && u.pos.z > 0);
  const lead = foes.length ? foes.reduce((a, u) => (u.pos.z > a.pos.z ? u : a)) : null;
  let at: [number, number] | null = null;
  if (lead && d.layer !== 'sea') at = findSpot(type, lead.pos.x, Math.max(0.6, lead.pos.z + (d.ranged ? 4.5 : 2.5)), 2.5);
  const spots = MAP.def.cpuSpawns;
  for (let tries = 0; tries < 30 && !at; tries++) {
    let r = Math.random() * spots.reduce((a, s) => a + s[4], 0), sp = spots[0];
    if (d.layer === 'land') for (const s of spots) { r -= s[4]; if (r <= 0) { sp = s; break; } }
    const p: [number, number] = d.layer === 'sea' ? pick(cpuSeaSpots()) : [rnd(sp[0], sp[1]), rnd(sp[2], sp[3])];
    if (canSpawnAt(type, 1, p[0], p[1])) at = p;
  }
  if (at) { spawnUnit(type, 1, at[0], at[1]); cpu.mana -= d.cost; }
  cpu.next = null;
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
  if (game.phase !== 'battle') { drawVeins(time); return; }
  if (!game.over) {
    game.time += dt;
    player.mana = Math.min(MANA_MAX, player.mana + dt * manaRate(0));
    cpu.mana = Math.min(MANA_MAX, cpu.mana + dt * manaRate(1));
    updateForts(dt);
    updateVeins(dt);
    cpuThink(dt);
  } else game.endT += dt;
  updateUnits(dt);
  updateFlags(time);
  updateArrows(dt);
  drawVeins(time);
  updateBuildings(dt);
}

export function restartBattle(): void {
  clearFlags();
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
  game.time = 0;
  game.phase = 'select';
}
