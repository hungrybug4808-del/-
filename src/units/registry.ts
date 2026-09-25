import { archer } from './archer';
import { centaur } from './centaur';
import { cyclops } from './cyclops';
import { dragon } from './dragon';
import { goblin } from './goblin';
import { griffon } from './griffon';
import { harpy } from './harpy';
import { kappa } from './kappa';
import { kraken } from './kraken';
import { oni } from './oni';
import { siren } from './siren';
import { kingslime, slime } from './slime';
import { tengu } from './tengu';
import type { UnitDef, UnitType } from './types';

/** モンスターの一覧。追加するときはここに足す */
export const DEF: Record<UnitType, UnitDef<any>> = {
  slime, kingslime, goblin, archer, harpy, kappa, siren, griffon, oni, centaur, kraken, tengu, cyclops, dragon,
};

/** 手札の並び順（魔素の安い順）。キングスライムはスライムの合体でだけ生まれる */
export const HAND: UnitType[] = ['slime', 'goblin', 'archer', 'harpy', 'kappa', 'siren', 'griffon', 'oni', 'centaur', 'kraken', 'tengu', 'cyclops', 'dragon'];
