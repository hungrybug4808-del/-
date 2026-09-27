import { camera } from '../render/stage';

// 効果音。音のファイルは使わず、その場で合成する（Web Audio）。
// ブラウザは最初のタップまで音を出せないので、最初の操作で initAudio を呼ぶ。
// 同じ音が一度にたくさん鳴らないように、音ごとに間隔をあける。遠くの音は小さくする。

let ctx: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode;
export let bgmBus: GainNode;
let noiseBuf: AudioBuffer;

const KEY = 'maou-muted';
function loadMuted(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
export const audio = { muted: loadMuted() };

export function audioCtx(): AudioContext | null { return ctx; }

export function initAudio(): void {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = audio.muted ? 0 : 0.9;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.55;
  sfxBus.connect(master);
  bgmBus = ctx.createGain();
  bgmBus.gain.value = 0.32;
  bgmBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setMuted(m: boolean): void {
  audio.muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* 保存できなくても鳴らし分けは効く */ }
  if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}

// ---- 合成の部品 ----
interface ToneOpt { type?: OscillatorType; to?: number; attack?: number; lp?: number; at?: number; bus?: AudioNode }
/** 1音（音程を to へすべらせられる） */
export function tone(freq: number, dur: number, vol: number, o: ToneOpt = {}): void {
  if (!ctx) return;
  const t = o.at ?? ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
  const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc;
  if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
  node.connect(g).connect(o.bus ?? sfxBus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}
interface NoiseOpt { type?: BiquadFilterType; freq?: number; to?: number; q?: number; attack?: number; at?: number; bus?: AudioNode }
/** ざっという音（フィルターの帯域を to へすべらせられる） */
export function noise(dur: number, vol: number, o: NoiseOpt = {}): void {
  if (!ctx) return;
  const t = o.at ?? ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  src.loop = true;
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 1000, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  f.Q.value = o.q ?? 1;
  const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(o.bus ?? sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

// ---- 効果音 ----
export type Sfx =
  | 'summon' | 'hit' | 'heavy' | 'arrow' | 'note' | 'wind' | 'beam' | 'breath' | 'bldHit' | 'collapse'
  | 'death' | 'vein' | 'veinLost' | 'skill' | 'win' | 'lose' | 'click' | 'deny';

const GAP: Partial<Record<Sfx, number>> = { hit: 0.06, heavy: 0.12, arrow: 0.07, note: 0.1, wind: 0.12, breath: 0.25, bldHit: 0.18, death: 0.08, summon: 0.05 };
const last: Partial<Record<Sfx, number>> = {};

const PLAY: Record<Sfx, (v: number) => void> = {
  summon: v => { tone(520, 0.18, 0.25 * v, { to: 1040, type: 'triangle' }); tone(780, 0.25, 0.12 * v, { to: 1560, at: ctx!.currentTime + 0.06 }); noise(0.3, 0.05 * v, { type: 'highpass', freq: 5000 }); },
  hit: v => { noise(0.08, 0.35 * v, { type: 'lowpass', freq: 1800, to: 400 }); tone(160, 0.08, 0.2 * v, { to: 70 }); },
  heavy: v => { noise(0.2, 0.45 * v, { type: 'lowpass', freq: 900, to: 150 }); tone(110, 0.22, 0.4 * v, { to: 40 }); },
  arrow: v => noise(0.12, 0.18 * v, { freq: 3000, to: 1200, q: 3 }),
  note: v => { const f = [880, 988, 1175, 1319][Math.floor(Math.random() * 4)]; tone(f, 0.35, 0.14 * v, { type: 'sine' }); tone(f * 2, 0.2, 0.04 * v); },
  wind: v => noise(0.35, 0.22 * v, { freq: 600, to: 2400, q: 2, attack: 0.08 }),
  beam: v => { tone(1400, 0.9, 0.18 * v, { type: 'sawtooth', to: 300, lp: 3000 }); noise(0.9, 0.12 * v, { freq: 2000, to: 500, q: 4 }); },
  breath: v => noise(0.45, 0.2 * v, { type: 'lowpass', freq: 1400, to: 500, attack: 0.05 }),
  bldHit: v => { tone(90, 0.18, 0.3 * v, { to: 55 }); noise(0.12, 0.15 * v, { type: 'lowpass', freq: 700 }); },
  collapse: v => { noise(1.8, 0.5 * v, { type: 'lowpass', freq: 800, to: 80, attack: 0.02 }); tone(70, 1.6, 0.45 * v, { to: 30 }); },
  death: v => tone(420, 0.25, 0.12 * v, { to: 110, type: 'square', lp: 1500 }),
  vein: v => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 0.14 * v, { type: 'triangle', at: ctx!.currentTime + i * 0.07 })),
  veinLost: v => [784, 622, 523].forEach((f, i) => tone(f, 0.3, 0.12 * v, { type: 'triangle', at: ctx!.currentTime + i * 0.09 })),
  skill: v => { [659, 831, 988, 1319].forEach((f, i) => tone(f, 0.6, 0.1 * v, { type: 'triangle', at: ctx!.currentTime + i * 0.04 })); noise(0.6, 0.06 * v, { type: 'highpass', freq: 6000 }); },
  win: v => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.9 : 0.22, 0.2 * v, { type: 'square', lp: 2500, at: ctx!.currentTime + [0, 0.15, 0.3, 0.45, 0.65, 0.8][i] })),
  lose: v => [392, 370, 349, 262].forEach((f, i) => tone(f, i === 3 ? 1.2 : 0.35, 0.18 * v, { type: 'triangle', at: ctx!.currentTime + i * 0.35 })),
  click: v => tone(1200, 0.04, 0.08 * v, { type: 'square', lp: 3000 }),
  deny: v => tone(220, 0.12, 0.12 * v, { type: 'square', to: 160, lp: 1200 }),
};

/** 効果音を鳴らす。at を渡すと、カメラから遠いほど小さく */
export function sfx(name: Sfx, at?: { x: number; z: number }): void {
  if (!ctx || audio.muted) return;
  const now = ctx.currentTime, gap = GAP[name] ?? 0;
  if (gap && now - (last[name] ?? -1) < gap) return;
  last[name] = now;
  let v = 1;
  if (at) {
    const d = Math.hypot(camera.position.x - at.x, camera.position.z - at.z);
    v = Math.min(1, Math.max(0.12, 1.3 - d / 50));
  }
  PLAY[name](v);
}
