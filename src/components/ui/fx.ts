// 光效：只保留星空涟漪
// 音效：HTMLAudioElement 直接播放两段 mp3
//   - 走系统"通知音"通道，音量随用户设备设置
//   - 手势里 .play() 直接生效，不再依赖 Web Audio unlock
//   - .volume = 0.35 保守默认，避免 iOS 首次媒体会话时音量突然被拉到最大
//   - Web Audio 仅用于一次性探测头部静音的偏移量，探完就释放

// —— 光效 ——
const RIPPLE_COLOR = 'rgba(139, 109, 208, 0.7)';
const RIPPLE_DURATION = 700;
const RIPPLE_SCALE = 6;

function spawnRipple(x: number, y: number) {
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
    background: radial-gradient(circle, ${RIPPLE_COLOR} 0%, transparent 70%);
    transform: scale(1);
    opacity: 1;
    transition: transform ${RIPPLE_DURATION}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${RIPPLE_DURATION}ms ease-out;
    will-change: transform, opacity;
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = `scale(${RIPPLE_SCALE})`;
    el.style.opacity = '0';
  });
  window.setTimeout(() => el.remove(), RIPPLE_DURATION + 60);

  // 星芒
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

// —— 音效 ——
export type SoundKey = 'home' | 'global';

const AUDIO_URLS: Record<SoundKey, string> = {
  home: '/audio/home.mp3',
  global: '/audio/global.mp3',
};

const DEFAULT_VOLUME = 0.35;

type Slot = {
  el: HTMLAudioElement;
  startOffsetSec: number;
  detected: boolean;
};

const slots: Partial<Record<SoundKey, Slot>> = {};

function ensureSlot(key: SoundKey): Slot | null {
  if (typeof window === 'undefined') return null;
  if (slots[key]) return slots[key]!;
  const el = new Audio(AUDIO_URLS[key]);
  el.preload = 'auto';
  el.volume = DEFAULT_VOLUME;
  // iOS: playsinline 保险
  el.setAttribute('playsinline', '');
  // 静音段探测：拉一份解码看首个非静音位置
  const slot: Slot = { el, startOffsetSec: 0, detected: false };
  slots[key] = slot;
  detectSilenceHead(AUDIO_URLS[key]).then((offset) => {
    slot.startOffsetSec = offset;
    slot.detected = true;
  });
  return slot;
}

// 用一次性 AudioContext 探测头部静音，探完立刻 close 释放
async function detectSilenceHead(url: string): Promise<number> {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return 0;
    const res = await fetch(url);
    if (!res.ok) return 0;
    const arr = await res.arrayBuffer();
    const ctx = new AC();
    const buffer = await ctx.decodeAudioData(arr).finally(() => {
      // decodeAudioData 完成后关闭 context
    });
    await ctx.close();
    const data = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    const windowSize = Math.max(1, Math.floor(sr * 0.008)); // 8ms 窗
    const threshold = 0.02;
    for (let i = 0; i < data.length - windowSize; i += windowSize) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) sum += data[i + j] * data[i + j];
      const rms = Math.sqrt(sum / windowSize);
      if (rms > threshold) {
        const back = Math.floor(sr * 0.005);
        return Math.max(0, (i - back) / sr);
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

// iOS/Android 冷启动首次点击"解锁"：在用户手势里做一次 muted play + pause
// 这样让系统把这个 <audio> 元素标记为 user-gestured，后续 .play() 无 autoplay 阻拦
let unlocked = false;
export function unlockAudio() {
  if (unlocked) return;
  const homeSlot = ensureSlot('home');
  const globalSlot = ensureSlot('global');
  const els = [homeSlot?.el, globalSlot?.el].filter(Boolean) as HTMLAudioElement[];
  let unlockedCount = 0;
  for (const el of els) {
    try {
      el.muted = true;
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          el.pause();
          el.currentTime = 0;
          el.muted = false;
          unlockedCount++;
          if (unlockedCount >= els.length) unlocked = true;
        }).catch(() => {
          // 某些浏览器会 reject（比如用户没真正手势）；下次再试
          el.muted = false;
        });
      } else {
        // 老浏览器同步返回
        el.pause();
        el.currentTime = 0;
        el.muted = false;
        unlockedCount++;
        if (unlockedCount >= els.length) unlocked = true;
      }
    } catch {
      // ignore
    }
  }
}

function playSound(key: SoundKey) {
  const slot = ensureSlot(key);
  if (!slot) return;
  const { el, startOffsetSec } = slot;
  try {
    // 每次点击都从静音段之后重新播放
    el.pause();
    // 只在音频已经有 metadata 时才 seek（避免 NotSupportedError）
    if (el.readyState >= 1 /* HAVE_METADATA */ && startOffsetSec > 0) {
      try {
        el.currentTime = startOffsetSec;
      } catch {
        el.currentTime = 0;
      }
    } else {
      el.currentTime = 0;
    }
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // 静默失败：可能未解锁或者 tab 挂起
      });
    }
  } catch {
    // ignore
  }
}

// —— 对外 API ——
export function playFx(
  x: number,
  y: number,
  soundKey: SoundKey,
  opts: { light: boolean; sound: boolean },
) {
  if (opts.light) spawnRipple(x, y);
  if (opts.sound) playSound(soundKey);
}

export function previewFx(opts: { light: boolean; sound: boolean }) {
  if (typeof window === 'undefined') return;
  playFx(window.innerWidth / 2, window.innerHeight / 2, 'global', opts);
}

// 预加载：mount 后就把两个 <audio> 元素创建 + 开始 preload
export function preloadSounds() {
  ensureSlot('home');
  ensureSlot('global');
}
