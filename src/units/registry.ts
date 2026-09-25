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
import { tengu } from './tengu';
import type { UnitDef, UnitType } from './types';

/** モンスターの一覧。追加するときはここに足す */
export const DEF: Record<UnitType, UnitDef<any>> = {
  goblin, archer, harpy, kappa, siren, griffon, oni, centaur, kraken, tengu, cyclops, dragon,
};

/** 手札の並び順（魔素の安い順） */
export const HAND: UnitType[] = ['goblin', 'archer', 'harpy', 'kappa', 'siren', 'griffon', 'oni', 'centaur', 'kraken', 'tengu', 'cyclops', 'dragon'];
