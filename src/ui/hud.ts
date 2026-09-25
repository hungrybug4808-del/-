import { cl } from '../core/math';
import { castles } from '../battle/buildings';
import { MANA_MAX, player } from '../battle/battle';
import { ownedVeins, VEIN_BONUS } from '../battle/veins';
import { game, notify } from '../battle/world';
import { DEF, HAND } from '../units/registry';
import type { UnitType } from '../units/types';

// 画面上の表示（魔王城のHP・魔素・手札・メッセージ・勝敗）

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const cardsEl = $('cards'), cellsEl = $('cells'), manaN = $('manaN'), veinN = $('veinN');
const toastEl = $('toast'), endEl = $('end'), endTitle = $('endTitle');
const hpMine = $('hpMine'), hpFoe = $('hpFoe'), hpMineN = $('hpMineN'), hpFoeN = $('hpFoeN');

/** 選んでいるカード。選んだままの間は連続で出せる */
export const hand = { selected: null as UnitType | null };

const cellFills: HTMLElement[] = [];
for (let i = 0; i < MANA_MAX; i++) {
  const c = document.createElement('div');
  c.className = 'cell';
  const f = document.createElement('i');
  c.appendChild(f);
  cellsEl.appendChild(c);
  cellFills.push(f);
}

const cardBtns = {} as Record<UnitType, HTMLButtonElement>;
for (const k of HAND) {
  const d = DEF[k], b = document.createElement('button');
  b.type = 'button';
  b.className = 'card';
  b.innerHTML = `<span class="ic">${d.icon}</span><span><b>${d.name}</b><small>${d.sub}</small></span><span class="cost">${d.cost}</span>`;
  b.addEventListener('click', () => { hand.selected = hand.selected === k ? null : k; });
  cardsEl.appendChild(b);
  cardBtns[k] = b;
}

let toastT = 0;
export function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  toastT = 1.4;
}
notify.toast = toast;

export function onRestart(fn: () => void): void {
  $('again').addEventListener('click', () => {
    fn();
    hand.selected = null;
    endEl.hidden = true;
  });
}

export function updateHud(dt: number): void {
  const m = player.mana;
  cellFills.forEach((f, i) => { f.style.width = (cl(m - i) * 100).toFixed(0) + '%'; });
  manaN.textContent = String(Math.floor(m));
  for (const k of HAND) {
    cardBtns[k].classList.toggle('sel', hand.selected === k);
    cardBtns[k].classList.toggle('poor', m < DEF[k].cost);
  }
  const vc = ownedVeins(0);
  veinN.textContent = vc ? '竜脈 +' + vc * VEIN_BONUS * 100 + '%' : '';
  veinN.hidden = !vc;
  hpMine.style.width = (castles[0].hp / castles[0].max) * 100 + '%';
  hpFoe.style.width = (castles[1].hp / castles[1].max) * 100 + '%';
  hpMineN.textContent = String(Math.ceil(castles[0].hp));
  hpFoeN.textContent = String(Math.ceil(castles[1].hp));
  if (toastT > 0) {
    toastT -= dt;
    if (toastT <= 0) toastEl.classList.remove('on');
  }
  if (game.over && game.endT > 2.0 && endEl.hidden) {
    endTitle.textContent = game.winner === 0 ? '勝利！' : '敗北…';
    endEl.hidden = false;
  }
}
