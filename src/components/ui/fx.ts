// 5 主题的点击光效 + 音效（Web Audio 合成，不依赖任何音频文件）
import type { FxTheme } from './UIProvider';

type ThemeSpec = {
  ripple: {
    color: string; // 主色（rgba 或 hex）
    duration: number; // ms
    scale: number; // 最终放大倍数（相对起始大小 20px）
  };
  sound: (ctx: AudioContext) => void;
};

// ————— 声音生成器 —————

function envelope(ctx: AudioContext, gain: GainNode, t0: number, attack: number, sustain: number, release: number, peak: number) {
  gain.gain.cancelScheduledValues(t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.gain.setValueAtTime(peak, t0 + attack + sustain);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + sustain + release);
}

function noteSound(ctx: AudioContext) {
  // 白噪声脉冲，像纸敲桌
  const t0 = ctx.currentTime;
  const bufferSize = 0.05 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2200;
  filter.Q.value = 1.2;
  const gain = ctx.createGain();
  envelope(ctx, gain, t0, 0.002, 0.015, 0.05, 0.28);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + 0.08);
}

function coinSound(ctx: AudioContext) {
  // 两下叮铃：正弦 1400Hz + 1866Hz（大三度）
  const t0 = ctx.currentTime;
  const notes = [
    { f: 1400, at: 0, dur: 0.15 },
    { f: 1866, at: 0.06, dur: 0.2 },
  ];
  for (const n of notes) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = n.f;
    const g = ctx.createGain();
    envelope(ctx, g, t0 + n.at, 0.005, 0.01, n.dur, 0.25);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.05);
  }
}

function bellSound(ctx: AudioContext) {
  // 单音钟：基频 + 泛音，长衰减
  const t0 = ctx.currentTime;
  const partials = [
    { f: 880, gain: 0.35, dur: 0.9 },
    { f: 1760, gain: 0.14, dur: 0.6 },
    { f: 2637, gain: 0.06, dur: 0.4 },
  ];
  for (const p of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = p.f;
    const g = ctx.createGain();
    envelope(ctx, g, t0, 0.002, 0.02, p.dur, p.gain);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + p.dur + 0.1);
  }
}

function forestSound(ctx: AudioContext) {
  // 木鱼：低频正弦快速衰减 + 高频短打点
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 260;
  osc.frequency.exponentialRampToValueAtTime(180, t0 + 0.12);
  const g = ctx.createGain();
  envelope(ctx, g, t0, 0.002, 0.005, 0.12, 0.35);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.18);

  // 高频短打
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = 2400;
  const g2 = ctx.createGain();
  envelope(ctx, g2, t0, 0.001, 0.005, 0.03, 0.08);
  osc2.connect(g2).connect(ctx.destination);
  osc2.start(t0);
  osc2.stop(t0 + 0.05);
}

function starrySound(ctx: AudioContext) {
  // 高频上滑泛音
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1600, t0);
  osc.frequency.exponentialRampToValueAtTime(3200, t0 + 0.18);
  const g = ctx.createGain();
  envelope(ctx, g, t0, 0.005, 0.02, 0.2, 0.2);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.25);

  // 泛音
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(2400, t0 + 0.03);
  osc2.frequency.exponentialRampToValueAtTime(4800, t0 + 0.22);
  const g2 = ctx.createGain();
  envelope(ctx, g2, t0 + 0.03, 0.005, 0.02, 0.15, 0.08);
  osc2.connect(g2).connect(ctx.destination);
  osc2.start(t0 + 0.03);
  osc2.stop(t0 + 0.28);
}

// ————— 主题定义 —————

const THEMES: Record<FxTheme, ThemeSpec> = {
  note: {
    ripple: { color: 'rgba(247, 215, 116, 0.55)', duration: 500, scale: 5 },
    sound: noteSound,
  },
  coin: {
    ripple: { color: 'rgba(232, 182, 74, 0.6)', duration: 600, scale: 6 },
    sound: coinSound,
  },
  bell: {
    ripple: { color: 'rgba(143, 196, 216, 0.6)', duration: 800, scale: 7 },
    sound: bellSound,
  },
  forest: {
    ripple: { color: 'rgba(127, 184, 122, 0.55)', duration: 550, scale: 5 },
    sound: forestSound,
  },
  starry: {
    ripple: { color: 'rgba(139, 109, 208, 0.7)', duration: 700, scale: 6 },
    sound: starrySound,
  },
};

// ————— AudioContext 单例 —————

let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

// ————— 涟漪光效 —————

function spawnRipple(x: number, y: number, theme: FxTheme) {
  const spec = THEMES[theme];
  const el = document.createElement('span');
  el.setAttribute('aria-hidden', 'true');
  const size = 20;
  el.style.cssText = `
    position: fixed;
    left: ${x - size / 2}px;
    top: ${y - size / 2}px;
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    pointer-events: none;
    z-index: 9999;
    background: radial-gradient(circle, ${spec.ripple.color} 0%, transparent 70%);
    transform: scale(1);
    opacity: 1;
    transition: transform ${spec.ripple.duration}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${spec.ripple.duration}ms ease-out;
    will-change: transform, opacity;
  `;
  document.body.appendChild(el);
  // 强制 reflow 后再触发过渡
  requestAnimationFrame(() => {
    el.style.transform = `scale(${spec.ripple.scale})`;
    el.style.opacity = '0';
  });
  window.setTimeout(() => {
    el.remove();
  }, spec.ripple.duration + 60);

  // 星空主题：额外加一颗星芒
  if (theme === 'starry') {
    const s = document.createElement('span');
    s.style.cssText = `
      position: fixed;
      left: ${x - 6}px;
      top: ${y - 6}px;
      width: 12px;
      height: 12px;
      pointer-events: none;
      z-index: 9999;
      background: rgba(255,255,255,0.9);
      clip-path: polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%);
      transition: transform 700ms cubic-bezier(0.16,1,0.3,1), opacity 700ms ease-out;
      transform: scale(1) rotate(0deg);
      opacity: 1;
    `;
    document.body.appendChild(s);
    requestAnimationFrame(() => {
      s.style.transform = 'scale(3) rotate(90deg)';
      s.style.opacity = '0';
    });
    window.setTimeout(() => s.remove(), 800);
  }
}

// ————— 对外 API —————

export function playFx(
  x: number,
  y: number,
  theme: FxTheme,
  opts: { light: boolean; sound: boolean },
) {
  if (opts.light) spawnRipple(x, y, theme);
  if (opts.sound) {
    const ctx = getCtx();
    if (ctx) {
      try {
        THEMES[theme].sound(ctx);
      } catch {
        // ignore
      }
    }
  }
}

// 试听/试看：以屏幕中间作为源点
export function previewFx(theme: FxTheme, opts: { light: boolean; sound: boolean }) {
  if (typeof window === 'undefined') return;
  playFx(window.innerWidth / 2, window.innerHeight / 2, theme, opts);
}
