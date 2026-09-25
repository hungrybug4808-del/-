import './style.css';
import * as THREE from 'three';
import { eOut, hash, seg } from '../core/math';
import { Vox, part } from '../core/voxel';
import { MAGIC, glow, ring, sparkle, stepShake, updateEffects } from '../fx/effects';
import { camera, canvas, renderer, scene, stageEl } from '../render/stage';
import { aimPoint } from '../battle/world';
import { updateArrows } from '../battle/projectiles';
import { DEF, HAND } from '../units/registry';
import { RAW_KEYS, type Building, type Unit, type UnitType } from '../units/types';
import { BUDDIES } from '../buddy/data';
import { applyBuddy, buddyPose, makeBuddy, type BuddyAnim, type BuddyId, type BuddyRig } from '../buddy/models';

// キャラ図鑑：モンスターとバディを1体ずつ出して、モーションを1つずつ再生する（試作の cyclops.html と同じ使い方）

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const LAYER = { land: '陸', sea: '海', air: '空' };

/** キャラごとの説明 */
const MEMO: Record<string, string> = {
  slime: '青いしずく形のぷるぷるした体。跳ねて進み、縮んでためてから体当たりする。攻撃を受けるとときどき分裂し、8体集まるとキングスライムに合体する。倒れるとべちゃっとつぶれて消える。',
  kingslime: 'スライムが8体集まって合体した王様。金の王冠をかぶった大きな体で、大きく跳ねて着地の衝撃で前の地上の敵をまとめて押しつぶす。手札からは出せない。',
  goblin: '緑の肌にとがった大きな耳と鼻、黄色い目、ぼろの服。背を丸めてちょこまか走り、小刻みに踏み込んで短剣で突く。',
  archer: 'サイクロプスの約3分の1の背丈。赤い頭巾の奥は影で、黄色い目だけが光る。軽くすばやく動き、空の敵は動きを先読みして撃つ。',
  harpy: '人の顔に紫の羽の腕、黄色い鳥の脚。翼をたたんで急降下し、脚の爪で裂く。',
  kappa: '緑の肌、頭に水の入った皿、黄色いくちばし、背中に甲羅。平泳ぎのように水をかき、水から身を乗り出して爪で引っかく。',
  siren: '紫の長い髪と貝殻の飾り、水に沈んだ青緑の魚の尾。尾で水をかいて泳ぎ、胸を張って両腕を広げて歌い、音符を飛ばす。',
  griffon: '白いワシの頭と翼に、金色のライオンの体。一度舞い上がってから、爪を前に出して急降下で襲う。',
  oni: '赤い肌に2本のツノ、ぼさぼさの黒髪、虎皮の腰布。トゲ付きの金棒を肩の外から振り上げ、全身で叩きつける。',
  centaur: '栗毛の馬の体に、緑の服の射手の上半身。4本脚で駆け、止まって弓を構えて引き絞って放つ。',
  kraken: '赤紫の大ダコ。黄色い目に横長の瞳、8本の触手。前の2本を高く振り上げてためてから叩きつけ、周りをまとめて打つ。',
  tengu: '赤い顔に長い鼻、白い髪と黒い頭襟、白い山伏の装束と橙の梵天、黒い翼、一本歯の下駄。羽団扇を振りかぶり、あおいで風の刃を飛ばす。',
  cyclops: '約2頭身、水色の肌、黄色い虹彩に縦長の瞳の一つ目、ツノ1本、トゲ付き棍棒。モンスターへは左右に重く振り回し、城へは振り上げて溜めてから全力で振り下ろす。ごくまれに目からピンクのビームを撃ち、前方をなぎ払う。',
  dragon: 'オレンジのドラゴンに青いマントの騎士が乗る。S字の長い首、3本の指骨の翼、刃のような尻尾。首を引いて息を吸い、狙いへ首を伸ばしてブレスを吐く。',
};

interface Move { key: string; label: string; desc: string }

// ---- 足場と的 ----
function platform(sea: boolean): THREE.Group {
  const g = new THREE.Group(), v = new Vox();
  const top = sea ? -3 : -1;
  for (let x = -12; x < 12; x++)
    for (let z = -12; z < 16; z++) {
      if (Math.hypot(x + 0.5, (z + 0.5 - 2) * 0.85) > 12) continue;
      const h = hash(x, 3, z);
      v.set(x, top, z, sea ? (h > 0.6 ? 0xd8c285 : 0xe3cf94) : h > 0.86 ? 0x94c86e : h > 0.4 ? 0x7bb45b : 0x6ba350);
      v.set(x, top - 1, z, 0x7a5a3c);
    }
  const m = part('viewerGround' + sea, v, 0, 0, 0, 0.5, new THREE.MeshLambertMaterial({ color: 0xffffff }));
  g.add(m);
  if (sea) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(6.2, 48), new THREE.MeshLambertMaterial({ color: 0x2f7fc4, transparent: true, opacity: 0.72 }));
    w.rotation.x = -Math.PI / 2;
    w.position.set(0, -0.05, 1);
    w.receiveShadow = true;
    g.add(w);
  }
  return g;
}
function dummyVox(): Vox {
  const v = new Vox();
  v.box(0, 0, 0, 1, 9, 1, 0x7a5130).box(-2, 6, 0, 5, 1, 1, 0x7a5130);
  for (let x = -2; x <= 2; x++) for (let y = 7; y <= 11; y++) {
    const r = Math.hypot(x, y - 9);
    if (r <= 2.4) v.set(x, y, 1, r < 0.8 ? 0xd8303a : r < 1.7 ? 0xf2ead8 : 0xd8303a);
  }
  v.box(-1, 12, 0, 3, 2, 1, 0xd8b45a);
  return v;
}

// ---- 表示中のキャラ ----
let ground: THREE.Group | null = null;
let dummyG: THREE.Group | null = null;
let dummy: Building | null = null;
let u: Unit | null = null;
let bud: { id: BuddyId; rig: BuddyRig; P: Record<string, number>; anim: BuddyAnim; t: number } | null = null;
let mode = 'spawn', hitT = 0, hidden = false, life = 0;
let camTarget = new THREE.Vector3(0, 1, 1), dist = 7, yaw = 0.6, pitch = 0.3;

function clear(): void {
  if (u) { scene.remove(u.rig.root); u.d.dispose?.(u); u.mat.dispose(); u = null; }
  if (bud) { scene.remove(bud.rig.root); bud = null; }
  if (ground) { scene.remove(ground); ground = null; }
  if (dummyG) { scene.remove(dummyG); dummyG = null; }
  dummy = null;
}

function makeUnit(type: UnitType): Unit {
  const d = DEF[type], mat = new THREE.MeshLambertMaterial({ color: 0xffffff }), rig = d.make(mat);
  scene.add(rig.root);
  const ringM = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.2), new THREE.MeshBasicMaterial());
  const bar = new THREE.Group(), fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  return {
    isBld: false, type, team: 0, d, rig, mat, hp: d.hp, pos: new THREE.Vector3(0, 0, 0), yaw: 0, yawS: 0,
    state: 'spawn', st: 0, life: 0, atk: null, target: null, P: d.base(), mem: {}, fired: {}, walk: 0, flash: 0,
    fp: 0, tp: 0, layer: d.layer, air: d.layer === 'air', radius: d.radius, retarget: 0, aimPitch: 0, inhale: 0,
    ringM, bar, fill, path: [], pathT: 0, pathGoal: null, flag: null,
  };
}

function showMonster(type: UnitType): void {
  clear();
  const d = DEF[type], sea = d.layer === 'sea';
  ground = platform(sea);
  scene.add(ground);
  u = makeUnit(type);
  // 攻撃が届く距離に的を立てる（遠距離は見やすいように近めに）
  const D = (d.ranged ? Math.min(d.range, 3.2) : d.range) + 0.2;
  dummyG = part('viewerDummy', dummyVox(), 0.5, 0, 0.5, 0.12, new THREE.MeshLambertMaterial({ color: 0xffffff }));
  dummyG.position.set(0, 0, D);
  dummyG.rotation.y = Math.PI;
  scene.add(dummyG);
  const dm = (dummyG.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
  dummy = {
    isBld: true, kind: 'fort', team: 1, g: dummyG, mat: dm, hp: 1e12, max: 1e12, flash: 0, fallT: -1,
    pos: new THREE.Vector3(0, 0, D), radius: 0.3, cd: 0, aimH: 1.1, cells: [],
  };
  u.target = dummy;
  // キャラの高さ（頭上のバーの高さ）と的までの距離から、全体が入るカメラの距離を決める
  const tall = u.air ? 3.4 : d.barH;
  camTarget = new THREE.Vector3(0, u.air ? 2.2 : tall * 0.45, D * 0.4);
  dist = Math.max(D * 1.35, tall * 2.1) + 2;
  const moves: Move[] = [
    { key: 'spawn', label: '召喚', desc: '魔法陣と光の粒から現れる' },
    { key: 'idle', label: '待機', desc: 'その場で待つ' },
    { key: 'move', label: '移動', desc: d.layer === 'sea' ? '泳いで進む' : d.layer === 'air' ? '飛んで進む' : '歩いて進む' },
    { key: 'attack', label: '攻撃', desc: type === 'cyclops' ? 'モンスターへ：左右に重く振り回す' : `正面の的へ${d.ranged ? '撃つ' : '攻撃'}` },
  ];
  if (type === 'cyclops') {
    moves.push({ key: 'castle', label: '城への攻撃', desc: '振り上げて溜め、全力で振り下ろす' });
    moves.push({ key: 'beam', label: '必殺：アイビーム', desc: '目からピンクの光線で前方をなぎ払う（ごくまれに）' });
  }
  moves.push({ key: 'hit', label: '被弾', desc: '攻撃を受けて光る' }, { key: 'dead', label: '撃破', desc: '倒れて魔素の粒になって消える' });
  const tags = [LAYER[d.layer], d.ranged ? (type === 'dragon' ? 'ブレス' : '遠距離') : '近接', `魔素 ${d.cost}`, `HP ${d.hp}`];
  if (type === 'kingslime') tags[2] = 'スライム8体の合体';
  render(d.name, tags, MEMO[type] ?? '', moves);
  play('spawn');
}

function showBuddy(id: BuddyId): void {
  clear();
  const b = BUDDIES.find(x => x.id === id)!;
  ground = platform(false);
  scene.add(ground);
  const rig = makeBuddy(id, new THREE.MeshLambertMaterial({ color: 0xffffff }));
  rig.root.traverse(o => { o.castShadow = true; });
  scene.add(rig.root);
  bud = { id, rig, P: {}, anim: 'idle', t: 0 };
  camTarget = new THREE.Vector3(0, 0.75, 0);
  dist = 4.2;
  render(b.name, ['バディ', `元ネタ：${b.origin}`, `スキル：${b.skillName}`], `${b.look}。${b.personality}。スキル「${b.skillName}」：${b.skillDesc}。`, [
    { key: 'idle', label: '待機', desc: 'あいさつ' },
    { key: 'talk', label: '作戦の提案', desc: '性格に合った作戦を話す' },
    { key: 'cheer', label: '喜ぶ', desc: '提案を承認されたとき' },
    { key: 'cast', label: 'スキル', desc: `「${b.skillName}」を使う` },
  ]);
  play('idle');
}

// ---- 画面 ----
let moveBtns: Record<string, HTMLButtonElement> = {};
function render(name: string, tags: string[], memo: string, moves: Move[]): void {
  $('name').textContent = name;
  document.title = name + '｜魔王軍略 キャラ図鑑';
  $('tags').innerHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');
  $('memo').textContent = memo;
  const el = $('moves');
  el.innerHTML = '';
  moveBtns = {};
  for (const m of moves) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<b>${m.label}</b><span>${m.desc}</span>`;
    b.addEventListener('click', () => play(m.key));
    el.appendChild(b);
    moveBtns[m.key] = b;
  }
  el.dataset.labels = JSON.stringify(Object.fromEntries(moves.map(m => [m.key, m.label])));
}

let sayLines: string[] = [], sayI = 0;
function play(key: string): void {
  mode = key;
  const labels = JSON.parse($('moves').dataset.labels || '{}');
  $('label').textContent = labels[key] ?? '';
  for (const k in moveBtns) moveBtns[k].classList.toggle('active', k === key);
  const say = $('say');
  say.hidden = true;
  if (bud) {
    bud.anim = key as BuddyAnim;
    bud.t = 0;
    const b = BUDDIES.find(x => x.id === bud!.id)!;
    sayLines = key === 'talk' ? (['defend', 'vein', 'attack', 'terrain'] as const).map(k => b.lines[k](k === 'vein' ? '空' : '砦'))
      : key === 'cheer' ? [b.lines.ok] : key === 'cast' ? [b.lines.cast] : [b.lines.hello];
    sayI = 0;
    say.textContent = sayLines[0];
    say.hidden = false;
    if (key === 'cast') sparkleAround(0xffd34d);
    return;
  }
  if (!u) return;
  if (hidden || key === 'spawn') {
    hidden = false;
    u.rig.root.visible = true;
    u.state = 'spawn'; u.st = 0; u.fired = {};
    u.P = u.d.base();
    ring({ x: 0, y: 0, z: 0 }, 0x4aa3ff, u.d.ringR * 2, 0.5);
    sparkle({ x: 0, y: u.air ? 2.6 : 0.3, z: 0 }, 18, MAGIC);
    if (key !== 'spawn') { pendingAfterSpawn = key; mode = 'spawn'; }
    return;
  }
  u.st = 0; u.fired = {};
  if (key === 'hit') { hitT = 0.6; u.flash = 1; }
}
let pendingAfterSpawn: string | null = null;

function sparkleAround(color: number): void {
  ring({ x: 0, y: 0, z: 0 }, color, 3, 0.8);
  sparkle({ x: 0, y: 1.2, z: 0 }, 30, [color, 0xffffff, 0xa98bff], 1.8);
}

// ---- 1コマ ----
function stepMonster(dt: number): void {
  if (!u || hidden) return;
  const d = u.d;
  u.life += dt; u.st += dt;
  if (mode === 'spawn') {
    u.state = 'spawn';
    if (u.st >= d.spawnT) { const next = pendingAfterSpawn ?? 'idle'; pendingAfterSpawn = null; u.state = 'idle'; play(next); }
  } else if (mode === 'idle' || mode === 'hit') u.state = 'idle';
  else if (mode === 'move') u.state = 'move';
  else if (mode === 'dead') {
    u.state = 'dead';
    if (u.st >= d.deathT) { hidden = true; u.rig.root.visible = false; }
  } else {
    // 攻撃：くり返し再生する
    u.state = 'attack';
    u.atk = mode === 'beam' ? 'beam' : mode === 'castle' ? 'castle' : u.type === 'cyclops' ? 'unit' : 'castle';
    const p = aimPoint(dummy!, u.pos);
    u.yaw = Math.atan2(p.x - u.pos.x, p.z - u.pos.z);
    d.aim?.(u, p, Math.hypot(p.x - u.pos.x, p.z - u.pos.z));
    d.attack(u, dt, true);
    if (u.st >= d.cycle(u)) { u.st = 0; u.fired = {}; }
  }
  const T = d.base();
  d.pose(u, T, dt);
  if (u.state === 'spawn') T.rootS = Math.max(0.02, eOut(seg(u.st, 0, d.spawnT)));
  if (hitT > 0) { hitT -= dt; T.rootRX = (T.rootRX ?? 0) - 0.3 * Math.max(0, hitT / 0.6); }
  const k = 1 - Math.exp(-d.smooth * dt);
  for (const key in T) {
    if (RAW_KEYS[key]) u.P[key] = T[key];
    else u.P[key] = (u.P[key] ?? T[key]) + (T[key] - (u.P[key] ?? T[key])) * k;
  }
  let dy = u.yaw - u.yawS;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  u.yawS += dy * (1 - Math.exp(-6 * dt));
  d.apply(u, dt);
  u.rig.root.scale.setScalar(Math.max(u.P.rootS, 0.001));
  u.flash = Math.max(0, u.flash - dt * 2.5);
  const sp = u.state === 'spawn' ? 1 - seg(u.st, 0, d.spawnT) : 0;
  const dd = u.state === 'dead' ? seg(u.st, d.deathT * 0.5, d.deathT) : 0;
  const inh = u.state === 'attack' ? u.inhale || 0 : 0;
  u.mat.emissive.setRGB(0.8 * u.flash + 0.1 * sp + 0.1 * dd + 0.35 * inh, 0.1 * u.flash + 0.45 * sp + 0.45 * dd + 0.12 * inh, 0.1 * u.flash + 0.6 * sp + 0.6 * dd);
  if (u.state === 'dead' && dd > 0 && dd < 1 && Math.random() < 0.7) sparkle({ x: 0, y: u.pos.y + (u.air ? u.P.rootY : 0.6), z: 0 }, 2, MAGIC);
  u.rig.root.updateMatrixWorld(true);
  d.post?.(u);
  if (dummy) {
    dummy.flash = Math.max(0, dummy.flash - dt * 3);
    dummy.mat.emissive.setRGB(0.5 * dummy.flash, 0.1 * dummy.flash, 0.05 * dummy.flash);
  }
}

let sayT = 0;
function stepBuddy(dt: number): void {
  if (!bud) return;
  bud.t += dt;
  const T: Record<string, number> = {};
  buddyPose(bud.anim, bud.t, life, T);
  const k = 1 - Math.exp(-12 * dt);
  for (const key in T) bud.P[key] = (bud.P[key] ?? T[key]) + (T[key] - (bud.P[key] ?? T[key])) * k;
  applyBuddy(bud.rig, bud.P);
  bud.rig.root.position.y = bud.P.rootY;
  bud.rig.root.rotation.y = 0;
  // 作戦の提案は、4種類のせりふを順に
  if (bud.anim === 'talk') {
    sayT += dt;
    if (sayT > 3) { sayT = 0; sayI = (sayI + 1) % sayLines.length; $('say').textContent = sayLines[sayI]; }
  }
  if (bud.anim === 'cast' && Math.random() < 0.3) glow.spawn({ x: (Math.random() - 0.5) * 1.2, y: 1.2 + Math.random(), z: (Math.random() - 0.5) * 1.2 }, { x: 0, y: 1, z: 0 }, 0.8, 0.06, 0xffd34d, -0.3);
  if ((bud.anim === 'cheer' && bud.t > 1.8) || (bud.anim === 'cast' && bud.t > 2.2)) { bud.anim = 'idle'; bud.t = 0; }
}

// ---- キャラの切り替え ----
const IDS: string[] = [...HAND, 'kingslime', ...BUDDIES.map(b => b.id)];
const picker = $('picker');
for (const id of IDS) {
  if (id === 'uni') { const s = document.createElement('span'); s.className = 'sep'; picker.appendChild(s); }
  const a = document.createElement('a');
  a.href = '#' + id;
  const b = BUDDIES.find(x => x.id === id);
  a.textContent = b ? `${b.icon} ${b.name}` : `${DEF[id as UnitType].icon} ${DEF[id as UnitType].name}`;
  a.dataset.id = id;
  picker.appendChild(a);
}
function show(): void {
  const want = location.hash.slice(1) || (window as unknown as { CHARA?: string }).CHARA || 'cyclops';
  const id = IDS.includes(want) ? want : 'cyclops';
  picker.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.id === id));
  hidden = false;
  if (BUDDIES.some(b => b.id === id)) showBuddy(id as BuddyId);
  else showMonster(id as UnitType);
}
window.addEventListener('hashchange', show);

// ---- カメラ操作（ドラッグで回転／ホイール・ピンチで拡大） ----
const ptrs = new Map<number, { x: number; y: number }>();
let pinch = 0;
const cl = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
canvas.addEventListener('pointermove', e => {
  const prev = ptrs.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) { yaw -= dx * 0.008; pitch = cl(pitch + dy * 0.006, 0.03, 1.25); }
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], dd = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) dist = cl((dist * pinch) / dd, 2.5, 30);
    pinch = dd;
  }
});
const endPtr = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; };
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', e => { e.preventDefault(); dist = cl(dist * (1 + e.deltaY * 0.001), 2.5, 30); }, { passive: false });
function resize(): void {
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stageEl);
resize();

show();
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  life += dt;
  stepMonster(dt);
  stepBuddy(dt);
  updateArrows(dt);
  updateEffects(dt);
  const shake = stepShake(dt), cp = Math.cos(pitch);
  camera.position.set(
    camTarget.x + Math.sin(yaw) * cp * dist + (Math.random() - 0.5) * shake * 0.3,
    camTarget.y + Math.sin(pitch) * dist + (Math.random() - 0.5) * shake * 0.3,
    camTarget.z + Math.cos(yaw) * cp * dist,
  );
  camera.lookAt(camTarget);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(t => { last = t; frame(t); });
