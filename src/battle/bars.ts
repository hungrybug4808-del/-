import * as THREE from 'three';

/** 頭上のHPバー・占領ゲージで共有するジオメトリと背景 */
export const BAR_GEO = new THREE.PlaneGeometry(1, 0.13);
export const BAR_BG = new THREE.MeshBasicMaterial({ color: 0x10161c, transparent: true, opacity: 0.75, depthTest: false });
