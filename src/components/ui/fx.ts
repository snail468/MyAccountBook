// 光效：只保留星空
// 音效：加载 /audio/home.mp3 与 /audio/global.mp3，运行时自动裁掉头部静音段
// 首页触发 home，其它页面触发 global

// —— 光效 ——
const RIPPLE_COLOR = 'rgba(139, 109, 208, 0.7)';
const RIPPLE_DURATION = 700; // ms
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

let sharedCtx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

// iOS Safari: AudioContext 冷启动是 suspended 状态；必须在用户手势回调里 resume + 播一次静音才算解锁
// 解锁完成前调 start() 也没声。这个函数应该在第一次 pointerdown / touchstart 时同步触发
export function unlockAudio() {
  if (unlocked) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    ctx.resume().catch(() => {});
    // 播一个 1 sample 的静音 buffer，iOS 认这个动作完成了解锁契约
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    unlocked = true;
  } catch {
    // ignore
  }
  // 同步顺手把两段声音的下载解码也踢一下
  void preloadSounds();
}

type Loaded = { buffer: AudioBuffer; startOffset: number };
const cache: Map<SoundKey, Loaded> = new Map();
const inflight: Map<SoundKey, Promise<Loaded | null>> = new Map();

// RMS 窗口探测：找到首个"有声"的时间点
function findAudioStart(buffer: AudioBuffer, threshold = 0.02, windowMs = 8): number {
  const data = buffer.getChannelData(0);
  const windowSize = Math.max(1, Math.floor((buffer.sampleRate * windowMs) / 1000));
  for (let i = 0; i < data.length - windowSize; i += windowSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      const v = data[i + j];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / windowSize);
    if (rms > threshold) {
      // 略微回退一点，避免切太狠削掉起音
      const back = Math.floor(buffer.sampleRate * 0.005);
      return Math.max(0, (i - back) / buffer.sampleRate);
    }
  }
  return 0;
}

async function loadSound(key: SoundKey): Promise<Loaded | null> {
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const ctx = getCtx();
  if (!ctx) return null;
  const url = key === 'home' ? '/audio/home.mp3' : '/audio/global.mp3';
  const p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arr);
      const startOffset = findAudioStart(buffer);
      const loaded: Loaded = { buffer, startOffset };
      cache.set(key, loaded);
      return loaded;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

function playBuffer(loaded: Loaded) {
  const ctx = getCtx();
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = loaded.buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.9;
  src.connect(gain).connect(ctx.destination);
  try {
    src.start(0, loaded.startOffset);
  } catch {
    // ignore
  }
}

async function playSound(key: SoundKey) {
  const l = await loadSound(key);
  if (l) playBuffer(l);
}

// —— 对外 API ——
export function playFx(
  x: number,
  y: number,
  soundKey: SoundKey,
  opts: { light: boolean; sound: boolean },
) {
  if (opts.light) spawnRipple(x, y);
  if (opts.sound) void playSound(soundKey);
}

export function previewFx(opts: { light: boolean; sound: boolean }) {
  if (typeof window === 'undefined') return;
  playFx(window.innerWidth / 2, window.innerHeight / 2, 'global', opts);
}

// 预加载：应用启动就把两段声音解码好，避免首次点击有延迟
export function preloadSounds() {
  void loadSound('home');
  void loadSound('global');
}
