import './style.css';
import { camera, renderer, scene } from './render/stage';
import { buildTerrain, updateTerrain } from './world/terrain';
import { buildSky, updateSky } from './world/sky';
import { restartBattle, stepBattle } from './battle/battle';
import { updateEffects } from './fx/effects';
import { onRestart, updateHud } from './ui/hud';
import { updateCamera } from './input/controls';
import { resetBuddy, updateBuddy } from './buddy/buddy';
import { showSelect, updateBuddyUI } from './ui/buddyUI';
import { showWorlds } from './ui/worldUI';
import { audio, initAudio, setMuted } from './audio/sound';
import { stopTheme } from './audio/music';

buildTerrain();
buildSky();
// 試合の前に、ワールド → バディの順に選ぶ（「もう一度」でも選び直す）
const pick = (): void => showWorlds(showSelect);
pick();
onRestart(() => { stopTheme(); restartBattle(); resetBuddy(); pick(); });

// 音：ブラウザは最初の操作まで鳴らせないので、最初のタップで準備する。右下のボタンで消せる
document.addEventListener('pointerdown', initAudio);
document.addEventListener('keydown', initAudio);
const soundBtn = document.getElementById('soundBtn') as HTMLButtonElement;
const showSound = () => { soundBtn.textContent = audio.muted ? '🔇' : '🔊'; soundBtn.setAttribute('aria-label', audio.muted ? '音を出す' : '音を消す'); };
soundBtn.addEventListener('click', () => { setMuted(!audio.muted); showSound(); });
showSound();

let last = performance.now(), time = 0;
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  time += dt;
  stepBattle(dt, time);
  updateTerrain(dt, time);
  updateSky(dt, time);
  updateEffects(dt);
  updateBuddy(dt);
  updateHud(dt);
  updateBuddyUI();
  updateCamera(dt, time);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(t => { last = t; frame(t); });
