import { WORLDS } from '../terrain/maps';
import { loadWorld } from '../world/load';

// 試合前のワールド選び（選んだら、バディ選びへ進む）

const el = document.getElementById('worlds')!, list = document.getElementById('worldList')!;
let next: () => void = () => {};

for (const w of WORLDS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'buddy';
  b.innerHTML = `<span class="bh"><span>${w.icon}</span><b>${w.name}</b></span><small>${w.climate}</small>`
    + `<em>${w.desc}</em><small>道：${w.laneNames.join('／')}・海路</small>`;
  b.addEventListener('click', () => {
    loadWorld(w.id);
    el.hidden = true;
    next();
  });
  list.appendChild(b);
}

/** ワールド選びを出す。選んだら then を呼ぶ */
export function showWorlds(then: () => void): void {
  next = then;
  el.hidden = false;
}
