import { canyon } from './canyon';
import { frost } from './frost';
import { lake } from './lake';
import { meadow } from './meadow';
import type { MapDef } from './types';

/** ワールドの一覧（最初が既定） */
export const WORLDS: MapDef[] = [meadow, frost, lake, canyon];
