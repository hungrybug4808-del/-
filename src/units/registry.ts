import { archer } from './archer';
import { cyclops } from './cyclops';
import { dragon } from './dragon';
import type { UnitDef, UnitType } from './types';

/** モンスターの一覧。追加するときはここに足す */
export const DEF: Record<UnitType, UnitDef<any>> = { archer, cyclops, dragon };

/** 手札の並び順 */
export const HAND: UnitType[] = ['archer', 'cyclops', 'dragon'];
