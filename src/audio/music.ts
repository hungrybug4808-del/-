import { hash } from '../core/math';
import { audio, audioCtx, bgmBus, noise, tone } from './sound';

// BGM。国ごとに、音階・和音の進み・楽器・リズムを変えた曲を、その場で作って鳴らす（8小節をくり返す）。
//   草原：明るい長調の行進（四角い音の旋律、太鼓）
//   霊峰：ゆっくりした短調（鐘の音、太鼓なし）
//   湖水：浮かぶようなリディア旋法（笛と竪琴の分散和音、鈴）
//   峡谷：ヒジャーズ旋法（弦をはじく音、低い持続音、手太鼓）

type Inst = (f: number, t: number, dur: number, v: number) => void;
const B = () => bgmBus;
const INST: Record<string, Inst> = {
  square: (f, t, d, v) => tone(f, d, v * 0.5, { type: 'square', lp: 2200, at: t, bus: B() }),
  triangle: (f, t, d, v) => tone(f, d, v, { type: 'triangle', at: t, bus: B() }),
  bass: (f, t, d, v) => tone(f, d, v, { type: 'triangle', lp: 600, at: t, bus: B() }),
  bell: (f, t, d, v) => { tone(f, d * 2.5, v * 0.7, { at: t, bus: B() }); tone(f * 2.76, d * 1.2, v * 0.18, { at: t, bus: B() }); },
  flute: (f, t, d, v) => tone(f, d, v * 0.8, { attack: 0.06, at: t, bus: B() }),
  harp: (f, t, d, v) => tone(f, Math.max(0.35, d), v * 0.7, { type: 'triangle', at: t, bus: B() }),
  oud: (f, t, d, v) => tone(f, Math.max(0.3, d), v * 0.7, { type: 'sawtooth', lp: 1300, at: t, bus: B() }),
  drone: (f, t, d, v) => tone(f, d, v, { type: 'sine', attack: 0.2, at: t, bus: B() }),
};

interface Theme {
  bpm: number; root: number; scale: number[]; chords: number[];
  lead: string; arp: string | null; bass: string; drums: 'march' | 'soft' | 'hand' | 'none';
  /** 旋律の音符の密度（0〜1） */
  busy: number;
}
const THEMES: Record<string, Theme> = {
  meadow: { bpm: 116, root: 60, scale: [0, 2, 4, 5, 7, 9, 11], chords: [0, 3, 4, 0, 5, 3, 4, 0], lead: 'square', arp: 'triangle', bass: 'bass', drums: 'march', busy: 0.6 },
  frost: { bpm: 76, root: 57, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 5, 2, 6, 0, 3, 4, 0], lead: 'bell', arp: 'bell', bass: 'drone', drums: 'none', busy: 0.35 },
  lake: { bpm: 92, root: 62, scale: [0, 2, 4, 6, 7, 9, 11], chords: [0, 1, 0, 1, 5, 4, 1, 0], lead: 'flute', arp: 'harp', bass: 'drone', drums: 'soft', busy: 0.45 },
  canyon: { bpm: 100, root: 62, scale: [0, 1, 4, 5, 7, 8, 10], chords: [0, 0, 1, 0, 6, 6, 1, 0], lead: 'oud', arp: null, bass: 'drone', drums: 'hand', busy: 0.55 },
};

const mf = (m: number) => 440 * 2 ** ((m - 69) / 12);
/** 音階の段（オクターブをまたいでよい）→ MIDI */
const deg = (th: Theme, d: number) => th.root + th.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

/** 8小節の旋律（16分音符ごと、音がなければ null）。前半4小節をくり返し、最後だけ主音に落ち着かせる */
function compose(th: Theme, seed: number): (number | null)[] {
  const out: (number | null)[] = new Array(128).fill(null);
  let d = 7;
  for (let bar = 0; bar < 4; bar++) {
    const ch = th.chords[bar];
    for (let s = 0; s < 16; s += 2) {
      const r = hash(bar, s, seed);
      const strong = s % 8 === 0;
      if (!strong && r > th.busy) continue;
      // 強い拍は和音の音、それ以外は隣の音へ
      if (strong) { const tones = [ch, ch + 2, ch + 4].map(x => x + 7); d = tones.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a)); }
      else d += hash(bar, s, seed + 1) > 0.5 ? 1 : -1;
      d = Math.max(4, Math.min(12, d));
      out[bar * 16 + s] = deg(th, d);
    }
  }
  for (let i = 0; i < 64; i++) out[64 + i] = out[i];
  for (let i = 112; i < 128; i++) out[i] = null;
  out[112] = deg(th, 7);
  return out;
}

let timer: number | null = null, cur: string | null = null;

export function playTheme(id: string | null): void {
  if (id === cur) return;
  stopTheme();
  const ctx = audioCtx(), th = id ? THEMES[id] : null;
  if (!ctx || !th || !id) return;
  cur = id;
  const melody = compose(th, id.length * 97 + 13), stepT = 60 / th.bpm / 4;
  let step = 0, next = ctx.currentTime + 0.1;
  timer = window.setInterval(() => {
    if (audio.muted) { next = ctx.currentTime + 0.1; return; }
    while (next < ctx.currentTime + 0.25) {
      const s = step % 128, bar = Math.floor(s / 16), ch = th.chords[bar], t = next, beat = s % 16;
      // 旋律（次の音までの長さで伸ばす）
      const m = melody[s];
      if (m !== null) {
        let len = 1;
        while (len < 8 && melody[(s + len) % 128] === null) len++;
        INST[th.lead](mf(m), t, len * stepT * 0.9, 0.16);
      }
      // 分散和音
      if (th.arp && s % 2 === 0) {
        const k = (s / 2) % 4, d = [ch, ch + 2, ch + 4, ch + 2][k];
        INST[th.arp](mf(deg(th, d)), t, stepT * 2, 0.06);
      }
      // 低音
      if (th.bass === 'drone') { if (beat === 0) INST.drone(mf(deg(th, ch) - 24), t, stepT * 16, 0.12); }
      else if (beat === 0 || beat === 8 || beat === 10) INST[th.bass](mf(deg(th, ch) - 24), t, stepT * 2, 0.16);
      // 打楽器
      if (th.drums === 'march') {
        if (beat === 0 || beat === 8) tone(120, 0.15, 0.25, { to: 45, at: t, bus: bgmBus });
        if (beat === 4 || beat === 12) noise(0.12, 0.08, { freq: 1800, at: t, bus: bgmBus });
        if (beat % 2 === 0) noise(0.03, 0.025, { type: 'highpass', freq: 7000, at: t, bus: bgmBus });
      } else if (th.drums === 'soft') {
        if (beat % 4 === 2) noise(0.06, 0.03, { type: 'highpass', freq: 6000, at: t, bus: bgmBus });
      } else if (th.drums === 'hand') {
        if (beat === 0 || beat === 6) tone(150, 0.18, 0.22, { to: 90, at: t, bus: bgmBus });
        if (beat === 4 || beat === 10 || beat === 12) noise(0.05, 0.07, { freq: 2500, q: 2, at: t, bus: bgmBus });
      }
      next += stepT;
      step++;
    }
  }, 50);
}

export function stopTheme(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  cur = null;
}
