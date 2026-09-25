import * as THREE from 'three';
import { hash } from '../core/math';
import { scene } from '../render/stage';

// 試作と同じ平らな地面。第2段階でブロック地形に置き換える。
export function buildGround(): void {
  const gcv = document.createElement('canvas');
  gcv.width = gcv.height = 16;
  const gx = gcv.getContext('2d')!;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const h = hash(x, y, 7);
      gx.fillStyle = h > 0.86 ? '#94c86e' : h > 0.4 ? '#7bb45b' : '#6ba350';
      gx.fillRect(x, y, 1, 1);
    }
  const gtex = new THREE.CanvasTexture(gcv);
  gtex.magFilter = THREE.NearestFilter;
  gtex.minFilter = THREE.NearestFilter;
  gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
  gtex.repeat.set(16, 40);
  const dirt = new THREE.MeshLambertMaterial({ color: 0x7a5a3c });
  const ground = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 40), [
    dirt, dirt, new THREE.MeshLambertMaterial({ map: gtex }), dirt, dirt, dirt,
  ]);
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);
  // 中央線
  const mid = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
  );
  mid.rotation.x = -Math.PI / 2;
  mid.position.y = 0.01;
  scene.add(mid);
}
