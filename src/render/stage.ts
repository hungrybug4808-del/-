import * as THREE from 'three';

// 試作は three.js r128。現行版で同じ見た目にするため、色管理を切り、
// ライトの強さを旧来の換算（×π）にそろえる。
THREE.ColorManagement.enabled = false;
const LEGACY_LIGHT = Math.PI;

export const canvas = document.getElementById('c') as HTMLCanvasElement;
export const stageEl = document.getElementById('stage') as HTMLDivElement;

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

export const scene = new THREE.Scene();
export const fog = new THREE.Fog(0xcfe6f0, 40, 80);
scene.fog = fog;

export const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);

// ライトは空の光と太陽の2つ
scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x5b6b4a, 0.75 * LEGACY_LIGHT));
export const sun = new THREE.DirectionalLight(0xffffff, 0.85 * LEGACY_LIGHT);
sun.position.set(8, 20, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 20, bottom: -20, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

/** 背景と霧の色を、ページのテーマ（ライト/ダーク）の --stage に合わせる */
function applyTheme(): void {
  const c = getComputedStyle(document.documentElement).getPropertyValue('--stage').trim() || '#cfe6f0';
  scene.background = new THREE.Color(c);
  fog.color.set(c);
}
applyTheme();
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
