import { generateMap, MAP } from '../terrain/generate';
import { resetLanes } from '../terrain/lanes';
import { buildTerrain } from './terrain';
import { buildSky } from './sky';
import { rebuildVeins } from '../battle/veins';
import { resetNav } from '../battle/units';
import { resetCpuSpots, restartBattle } from '../battle/battle';
import { restyleBuildings } from '../battle/buildings';

/** ワールドを切り替える（地形・空・竜脈・道・CPUの出撃地点を作り直して、試合を初めに戻す） */
export function loadWorld(id: string): void {
  if (id !== MAP.def.id) {
    generateMap(id);
    resetLanes();
    resetNav();
    buildTerrain();
    buildSky();
    rebuildVeins();
    resetCpuSpots();
    restyleBuildings();
  }
  restartBattle();
}
