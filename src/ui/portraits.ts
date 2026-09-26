import * as THREE from 'three';
import { DEF } from '../units/registry';
import type { UnitType } from '../units/types';

// 手札のカードに使う、モンスターの姿の小さな絵。ゲームの始めに一度だけ、別の小さなキャンバスに描いて画像にする

const SIZE = 112;

export function makePortraits(types: UnitType[]): Record<string, string> {
  const out: Record<string, string> = {};
  const canvas = document.createElement('canvas');
  let r: THREE.WebGLRenderer;
  try {
    r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  r.setSize(SIZE, SIZE, false);
  r.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x5b6b4a, 0.95 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.7 * Math.PI);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const box = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
  for (const k of types) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const rig = DEF[k].make(mat);
    scene.add(rig.root);
    rig.root.updateMatrixWorld(true);
    box.setFromObject(rig.root);
    box.getCenter(c);
    box.getSize(sz);
    // 斜め前から、姿がちょうど収まる距離で
    const d = (Math.max(sz.x, sz.y, sz.z) * 0.62) / Math.tan((cam.fov * Math.PI) / 360) + sz.z * 0.3;
    cam.position.set(c.x + d * 0.45, c.y + d * 0.25, c.z + d * 0.86);
    cam.lookAt(c);
    r.render(scene, cam);
    out[k] = canvas.toDataURL();
    scene.remove(rig.root);
    mat.dispose();
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
