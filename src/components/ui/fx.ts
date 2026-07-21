// 光效：星空涟漪
// 音效：Web Audio API（AudioContext + AudioBuffer + AudioBufferSourceNode）
//   - 冷启动首次 pointerdown 里 resume() AudioContext（iOS/Android 解锁点）
//   - 预 fetch + decodeAudioData 得到 AudioBuffer，之后每次点击都 new 一个
//     AudioBufferSourceNode 播放 —— 零延迟、可从任意 offset 播放、不会
//     "被上一次点击的播放头顶回后半段"
//   - 静音头 offset 直接在解码后的 buffer 上算出来，start(0, offset) 即精确跳过

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

const DEFAULT_GAIN = 0.5;

type Buf = { buffer: AudioBuffer; startOffsetSec: number };

let ac: AudioContext | null = null;
let masterGain: GainNode | null = null;
const buffers: Partial<Record<SoundKey, Buf>> = {};
const pendingDecodes: Partial<Record<SoundKey, Promise<void>>> = {};
let unlocked = false;

function getAC(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ac) return ac;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ac = new AC();
    masterGain = ac.createGain();
    masterGain.gain.value = DEFAULT_GAIN;
    masterGain.connect(ac.destination);
    return ac;
  } catch {
    ac = null;
    return null;
  }
}

function detectSilenceHead(buf: AudioBuffer): number {
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const windowSize = Math.max(1, Math.floor(sr * 0.008));
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
}

async function loadBuffer(key: SoundKey): Promise<void> {
  if (buffers[key]) return;
  const inflight = pendingDecodes[key];
  if (inflight) return inflight;
  const ctx = getAC();
  if (!ctx) return;
  const p = (async () => {
    try {
      const res = await fetch(AUDIO_URLS[key]);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      // Safari 老版本要求 callback 风格
      const buffer: AudioBuffer = await new Promise((resolve, reject) => {
        try {
          const maybe = ctx.decodeAudioData(
            arr,
            (b) => resolve(b),
            (e) => reject(e),
          );
          if (maybe && typeof (maybe as Promise<AudioBuffer>).then === 'function') {
            (maybe as Promise<AudioBuffer>).then(resolve, reject);
          }
        } catch (e) {
          reject(e);
        }
      });
      buffers[key] = { buffer, startOffsetSec: detectSilenceHead(buffer) };
    } catch {
      // ignore
    }
  })();
  pendingDecodes[key] = p;
  return p;
}

// iOS/Android 冷启动首次手势里：resume() AudioContext，同时启动预解码
// 关键：resume() 一定要在用户手势的同一个事件回调里执行（同步入队），
// 不能放到 async 之后。这里我们把 fetch/decode 放到 resume() 之后，
// 但因为 resume() 本身是同步入队的（返回的 Promise 会 microtask 完成），
// 只要在 pointerdown handler 里立即调用即可解锁。
export function unlockAudio() {
  if (unlocked) return;
  const ctx = getAC();
  if (!ctx) return;
  try {
    // 静音"空 buffer"启动 —— 保证 AudioContext 进入 running 状态
    const silent = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = silent;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // ignore
  }
  const p = ctx.resume();
  if (p && typeof p.then === 'function') {
    p.then(() => {
      unlocked = true;
    }).catch(() => {
      // ignore
    });
  } else {
    unlocked = true;
  }
  // 解锁的同一时刻就把两个音效预解码，避免第一次 playSound 时还在 decode
  loadBuffer('home');
  loadBuffer('global');
}

function playSound(key: SoundKey) {
  const ctx = getAC();
  if (!ctx || !masterGain) return;
  // Safari 有时候会自己 suspend；每次都尝试 resume()（无副作用）
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  const slot = buffers[key];
  if (!slot) {
    // buffer 还没加载好 —— 触发加载，本次不发声（下次点击就有了）
    loadBuffer(key);
    return;
  }
  try {
    const src = ctx.createBufferSource();
    src.buffer = slot.buffer;
    src.connect(masterGain);
    // start(when, offset) —— 精确从跳过静音头的位置开播，完全避开
    // HTMLAudioElement.currentTime = 的时序问题
    src.start(0, slot.startOffsetSec);
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

// 预加载：ready 时立即建立 AudioContext（会是 suspended 状态）+ 预解码 buffer
//   - 现代浏览器（iOS 15+ / Android Chrome）允许在无手势时 new AudioContext，
//     只是 state='suspended'。decodeAudioData 在 suspended 下也能正常工作。
//   - 这样第一次 pointerdown 里 resume() 一发出，buffer 已就绪 —— start(0, offset)
//     会在 context 恢复瞬间发声，避免"第一次静音"或"只播下半段"
export function preloadSounds() {
  if (typeof window === 'undefined') return;
  const ctx = getAC();
  if (!ctx) return;
  loadBuffer('home');
  loadBuffer('global');
}
