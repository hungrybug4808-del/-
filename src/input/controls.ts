import * as THREE from 'three';
import { cl } from '../core/math';
import { stepShake } from '../fx/effects';
import { camera, canvas, renderer, scene, stageEl } from '../render/stage';
import { playerSpawn } from '../battle/battle';
import { TEAM, game } from '../battle/world';
import { hand, toast } from '../ui/hud';

// カメラ操作（ドラッグで回す・ピンチ/ホイールで寄る）と、地面タップでの出撃

let yaw = Math.PI, pitch = 0.8, dist = 31;
const camTarget = new THREE.Vector3(0, 0, 0.5);

// 自陣のハイライト（カードを選んでいる間だけ点滅）
const zone = new THREE.Mesh(
  new THREE.PlaneGeometry(10.5, 9),
  new THREE.MeshBasicMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0, depthWrite: false }),
);
zone.rotation.x = -Math.PI / 2;
zone.position.set(0, 0.02, -6.5);
scene.add(zone);

const ptrs = new Map<number, { x: number; y: number }>();
let pinch = 0, downPos: { x: number; y: number } | null = null, dragged = false;
const ray = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), NDC = new THREE.Vector2();

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) { downPos = { x: e.clientX, y: e.clientY }; dragged = false; }
  else dragged = true;
});
canvas.addEventListener('pointermove', e => {
  const prev = ptrs.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 8) dragged = true;
  if (!dragged) return;
  if (ptrs.size === 1) {
    yaw = cl(yaw - dx * 0.006, Math.PI - 0.9, Math.PI + 0.9);
    pitch = cl(pitch + dy * 0.005, 0.35, 1.3);
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) dist = cl((dist * pinch) / d, 14, 55);
    pinch = d;
  }
});
canvas.addEventListener('pointerup', e => {
  const wasTap = ptrs.size === 1 && !dragged;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = 0;
  if (wasTap) tap(e);
});
canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch = 0; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  dist = cl(dist * (1 + e.deltaY * 0.001), 14, 55);
}, { passive: false });

function tap(e: PointerEvent): void {
  if (game.over) return;
  if (!hand.selected) { toast('先に下のカードを選んでください'); return; }
  const r = canvas.getBoundingClientRect();
  NDC.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(NDC, camera);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(groundPlane, hit)) return;
  if (hit.z < TEAM[0].zone[0] || hit.z > TEAM[0].zone[1] || Math.abs(hit.x) > 5.2) {
    toast('手前半分（自陣）に置いてください');
    return;
  }
  if (!playerSpawn(hand.selected, hit.x, hit.z)) toast('魔素が足りません');
}

function resize(): void {
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dist = camera.aspect < 1 ? 46 : 31;
}
new ResizeObserver(resize).observe(stageEl);
resize();

export function updateCamera(dt: number, time: number): void {
  zone.material.opacity = hand.selected ? 0.12 + 0.06 * Math.sin(time * 5) : 0;
  const shake = stepShake(dt);
  const cp = Math.cos(pitch);
  camera.position.set(
    camTarget.x + Math.sin(yaw) * cp * dist + (Math.random() - 0.5) * shake * 0.4,
    camTarget.y + Math.sin(pitch) * dist + (Math.random() - 0.5) * shake * 0.4,
    camTarget.z + Math.cos(yaw) * cp * dist,
  );
  camera.lookAt(camTarget);
}
