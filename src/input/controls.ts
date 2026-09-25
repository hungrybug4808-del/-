import * as THREE from 'three';
import { cl } from '../core/math';
import { stepShake } from '../fx/effects';
import { camera, canvas, fog, renderer, scene, stageEl, sun } from '../render/stage';
import { playerSpawn } from '../battle/battle';
import { TEAM, alive, game, units } from '../battle/world';
import { flagMode, flags, plantFlag, removeFlag } from '../battle/flags';
import { XMAX, XMIN, ZMAX, ZMIN, surfaceY } from '../terrain/grid';
import { pickables } from '../world/terrain';
import { hand, toast } from '../ui/hud';

// カメラ操作と、地面タップでの出撃
//  - 1本指ドラッグ / マウス左ドラッグ：視点を動かす
//  - 2本指：ひねって回転、上下で傾き、ピンチでズーム / マウス右ドラッグで回転、ホイールでズーム

let yaw = Math.PI, pitch = 0.85, dist = 34;
const camTarget = new THREE.Vector3(0, 0, -18);

// 自陣の境目（カードを選んでいる間だけ光る）
const line = new THREE.Mesh(
  new THREE.PlaneGeometry(XMAX - XMIN, 16),
  new THREE.MeshBasicMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
);
line.position.set((XMIN + XMAX) / 2, 6, TEAM[0].half);
scene.add(line);

const ptrs = new Map<number, { x: number; y: number }>();
let downPos: { x: number; y: number } | null = null, dragged = false, rotating = false;
let prevPair: { d: number; a: number; cy: number } | null = null;
const ray = new THREE.Raycaster(), NDC = new THREE.Vector2();

function pan(dx: number, dy: number): void {
  const k = dist * 0.0022, s = Math.sin(yaw), c = Math.cos(yaw);
  // 画面の上 = (-sin, -cos)、右 = (cos, -sin)
  camTarget.x += -s * dy * k - c * dx * k;
  camTarget.z += -c * dy * k + s * dx * k;
  camTarget.x = cl(camTarget.x, XMIN + 2, XMAX - 2);
  camTarget.z = cl(camTarget.z, ZMIN + 2, ZMAX - 2);
}
function pairInfo(): { d: number; a: number; cy: number } {
  const [a, b] = [...ptrs.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), cy: (a.y + b.y) / 2 };
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) {
    downPos = { x: e.clientX, y: e.clientY };
    dragged = false;
    rotating = e.pointerType === 'mouse' && (e.button === 2 || e.ctrlKey || e.shiftKey);
  } else {
    dragged = true;
    if (ptrs.size === 2) prevPair = pairInfo();
  }
});
canvas.addEventListener('pointermove', e => {
  const prev = ptrs.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 8) dragged = true;
  if (!dragged) return;
  if (ptrs.size === 1) {
    if (rotating) {
      yaw -= dx * 0.006;
      pitch = cl(pitch + dy * 0.005, 0.35, 1.4);
    } else pan(dx, dy);
  } else if (ptrs.size === 2 && prevPair) {
    const now = pairInfo();
    dist = cl((dist * prevPair.d) / Math.max(now.d, 1), 12, 80);
    let da = now.a - prevPair.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    yaw -= da;
    pitch = cl(pitch + (now.cy - prevPair.cy) * 0.004, 0.35, 1.4);
    prevPair = now;
  }
});
function release(e: PointerEvent): void {
  const wasTap = ptrs.size === 1 && !dragged && ptrs.has(e.pointerId);
  ptrs.delete(e.pointerId);
  prevPair = ptrs.size === 2 ? pairInfo() : null;
  if (wasTap && e.type === 'pointerup') tap(e);
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  dist = cl(dist * (1 + e.deltaY * 0.001), 12, 80);
}, { passive: false });

/** 画面上の点 (px,py) に一番近いもの。近さは画面のピクセルで測る */
const SP = new THREE.Vector3();
function nearestOnScreen<T>(items: T[], at: (t: T) => THREE.Vector3, px: number, py: number, maxPx: number): T | null {
  const r = canvas.getBoundingClientRect();
  let best: T | null = null, bd = maxPx;
  for (const it of items) {
    SP.copy(at(it)).project(camera);
    if (SP.z > 1) continue;
    const d = Math.hypot((SP.x + 1) / 2 * r.width + r.left - px, (1 - SP.y) / 2 * r.height + r.top - py);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}

function flagTap(e: PointerEvent, ground: THREE.Vector3 | null): void {
  // 旗をタップ → 外す
  const f = nearestOnScreen(flags.filter(f => f.team === 0), f => new THREE.Vector3(f.x, f.y + 1.4, f.z), e.clientX, e.clientY, 34);
  if (f) { removeFlag(f); toast('旗を外しました。自動で進軍に戻ります'); return; }
  // モンスターをタップ → 選ぶ／選ぶのをやめる
  const u = nearestOnScreen(units.filter(u => u.team === 0 && alive(u)), u => new THREE.Vector3(u.pos.x, u.pos.y + (u.air ? u.P.rootY : u.d.hitH), u.pos.z), e.clientX, e.clientY, 40);
  if (u) {
    if (flagMode.selected.has(u)) flagMode.selected.delete(u);
    else flagMode.selected.add(u);
    return;
  }
  // 地面をタップ → 選んだモンスターの旗を立てる
  if (!ground) return;
  if (!flagMode.selected.size) { toast('先に、旗で動かすモンスターをタップして選んでください'); return; }
  plantFlag(0, ground.x, ground.y, ground.z, [...flagMode.selected]);
  flagMode.selected.clear();
}

function tap(e: PointerEvent): void {
  if (flagMode.on && !game.over) {
    flagTap(e, groundHit(e));
    return;
  }
  if (game.over || !hand.selected) {
    if (!game.over) toast('先に下のカードを選んでください');
    return;
  }
  const p = groundHit(e);
  if (!p) return;
  const res = playerSpawn(hand.selected, p.x, p.z, p.y);
  if (res === 'half') toast('自陣（光る線より手前）に置いてください');
  else if (res === 'land') toast('陸のモンスターは、立てる地面に置いてください');
  else if (res === 'sea') toast('海のモンスターは、海や川の水の上に置いてください');
  else if (res === 'mana') toast('魔素が足りません');
}

/** タップした所の地面（水面を含む） */
function groundHit(e: PointerEvent): THREE.Vector3 | null {
  const r = canvas.getBoundingClientRect();
  NDC.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(NDC, camera);
  return ray.intersectObjects(pickables, false)[0]?.point ?? null;
}

function resize(): void {
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dist = camera.aspect < 1 ? 50 : 34;
}
new ResizeObserver(resize).observe(stageEl);
resize();

let shadowHalf = 0;
export function updateCamera(dt: number, time: number): void {
  line.material.opacity = hand.selected ? 0.16 + 0.08 * Math.sin(time * 5) : 0;
  // 注視点の高さを地形に合わせる（高台を見るときに見やすく）
  camTarget.y += (surfaceY(camTarget.x, camTarget.z) * 0.6 - camTarget.y) * Math.min(1, dt * 3);
  const shake = stepShake(dt);
  const cp = Math.cos(pitch);
  camera.position.set(
    camTarget.x + Math.sin(yaw) * cp * dist + (Math.random() - 0.5) * shake * 0.4,
    camTarget.y + Math.sin(pitch) * dist + (Math.random() - 0.5) * shake * 0.4,
    camTarget.z + Math.cos(yaw) * cp * dist,
  );
  camera.lookAt(camTarget);
  // 霧と影を、見ている範囲に合わせる
  fog.near = dist * 1.2;
  fog.far = dist * 3 + 30;
  sun.target.position.copy(camTarget);
  sun.position.set(camTarget.x + 16, camTarget.y + 40, camTarget.z + 12);
  const half = Math.round(cl(dist * 0.9, 18, 60));
  if (half !== shadowHalf) {
    shadowHalf = half;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 120 });
    sun.shadow.camera.updateProjectionMatrix();
  }
}
