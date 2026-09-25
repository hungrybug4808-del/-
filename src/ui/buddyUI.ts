import { BUDDIES, approvePlan, buddy, chooseBuddy, dismissPlan, skillReady, useSkill } from '../buddy/buddy';
import { game } from '../battle/world';

// バディの画面：試合前の選択、ゲージとスキル、提案の吹き出し

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const selectEl = $('select'), listEl = $('buddies'), bar = $('buddyBar'), icon = $('buddyIcon'), fill = $('gaugeFill');
const skillBtn = $<HTMLButtonElement>('skillBtn'), bubble = $('bubble'), who = $('bubbleWho'), text = $('bubbleText'), btns = $('bubbleBtns');

/** 他の操作（カード・旗モード）を始めたら、スキルの場所待ちをやめる */
export const buddyUI = { onSkillAim: (): void => {} };

for (const b of BUDDIES) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'buddy';
  el.innerHTML = `<span class="bh"><span>${b.icon}</span><b>${b.name}</b></span><small>元ネタ：${b.origin}</small><small class="look">${b.look}</small>`
    + `<em>スキル「${b.skillName}」：${b.skillDesc}</em><small>${b.personality}</small>`;
  el.addEventListener('click', () => {
    chooseBuddy(b.id);
    selectEl.hidden = true;
    game.phase = 'battle';
  });
  listEl.appendChild(el);
}

export function showSelect(): void {
  selectEl.hidden = false;
}

skillBtn.addEventListener('click', () => {
  const def = buddy.def;
  if (!def || !skillReady()) return;
  if (!def.targeted) { useSkill(); return; }
  buddy.targeting = !buddy.targeting;
  if (buddy.targeting) buddyUI.onSkillAim();
});
$('approve').addEventListener('click', approvePlan);
$('dismiss').addEventListener('click', dismissPlan);

export function updateBuddyUI(): void {
  const def = buddy.def;
  bar.hidden = !def || game.phase !== 'battle';
  if (!def) { bubble.hidden = true; return; }
  icon.textContent = def.icon;
  fill.style.width = buddy.gauge.toFixed(0) + '%';
  const ready = skillReady();
  skillBtn.disabled = !ready;
  skillBtn.classList.toggle('ready', ready && !buddy.targeting);
  skillBtn.classList.toggle('aim', buddy.targeting);
  skillBtn.textContent = buddy.targeting ? '場所をタップ' : def.skillName;
  // 吹き出し：提案（承認できる）か、ひとこと
  const plan = buddy.plan;
  const line = plan ? plan.text : buddy.sayT > 0 ? buddy.say : '';
  bubble.hidden = !line || game.phase !== 'battle';
  btns.hidden = !plan;
  who.textContent = def.icon + ' ' + def.name;
  if (text.textContent !== line) text.textContent = line;
}
