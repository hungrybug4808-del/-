import './style.css';
import { camera, renderer, scene } from './render/stage';
import { buildGround } from './world/ground';
import { restartBattle, stepBattle } from './battle/battle';
import { updateEffects } from './fx/effects';
import { onRestart, updateHud } from './ui/hud';
import { updateCamera } from './input/controls';

buildGround();
onRestart(restartBattle);

let last = performance.now(), time = 0;
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  time += dt;
  stepBattle(dt, time);
  updateEffects(dt);
  updateHud(dt);
  updateCamera(dt, time);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(t => { last = t; frame(t); });
