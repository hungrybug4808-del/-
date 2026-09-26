import { cl } from '../core/math';
import { castles } from '../battle/buildings';
import { MANA_MAX, player } from '../battle/battle';
import { ownedVeins, VEIN_BONUS } from '../battle/veins';
import { game, notify } from '../battle/world';
import { flagMode } from '../battle/flags';
import { buddy } from '../buddy/buddy';
import { DEF, HAND } from '../units/registry';
import type { UnitType } from '../units/types';
import { makePortraits } from './portraits';

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
const portraits = makePortraits(HAND);
/** カードに入りきらない名前の短い呼び名 */
const SHORT: Partial<Record<UnitType, string>> = { dragon: 'ドラゴン' };
for (const k of HAND) {
  const d = DEF[k], b = document.createElement('button');
  b.type = 'button';
  b.className = 'card';
  b.title = `${d.name}（${d.sub}）`;
  b.setAttribute('aria-label', `${d.name} 魔素${d.cost}`);
  b.innerHTML = portraits[k] ? `<img src="${portraits[k]}" alt="">` : `<span class="ic">${d.icon}</span>`;
  b.innerHTML += `<b>${SHORT[k] ?? d.name}</b><span class="cost">${d.cost}</span>`;
  b.addEventListener('click', () => {
    hand.selected = hand.selected === k ? null : k;
    if (hand.selected) { setFlagMode(false); buddy.targeting = false; }
  });
  cardsEl.appendChild(b);
  cardBtns[k] = b;
}

// 旗モード：モンスターをタップして選び、地面をタップして旗を立てる。旗をタップすると外す
const flagBtn = $<HTMLButtonElement>('flagBtn');
export function setFlagMode(on: boolean): void {
  flagMode.on = on;
  if (!on) flagMode.selected.clear();
  else {
    hand.selected = null;
    buddy.targeting = false;
    toast('動かすモンスターをタップ → 地面をタップで旗。旗をタップで外す', 3);
  }
}
flagBtn.addEventListener('click', () => setFlagMode(!flagMode.on));

let toastT = 0;
export function toast(msg: string, sec = 1.4): void {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  toastT = sec;
}
notify.toast = toast;

export function onRestart(fn: () => void): void {
  $('again').addEventListener('click', () => {
    fn();
    hand.selected = null;
    setFlagMode(false);
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
  flagBtn.classList.toggle('on', flagMode.on);
  flagBtn.textContent = flagMode.on ? (flagMode.selected.size ? `🚩 ${flagMode.selected.size}体を選択中` : '🚩 旗モード') : '🚩 旗';
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
