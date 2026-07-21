'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useUI } from './UIProvider';
import { playFx, preloadSounds, unlockAudio } from './fx';

function isInteractive(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const tag = node.tagName;
    if (tag === 'BUTTON' || tag === 'A' || tag === 'LABEL' || tag === 'SUMMARY') {
      return true;
    }
    if (tag === 'INPUT') {
      const t = (node as HTMLInputElement).type;
      if (t === 'button' || t === 'submit' || t === 'checkbox' || t === 'radio') {
        return true;
      }
    }
    if (node.hasAttribute('role')) {
      const role = node.getAttribute('role');
      if (
        role === 'button' ||
        role === 'link' ||
        role === 'switch' ||
        role === 'menuitem' ||
        role === 'tab'
      ) {
        return true;
      }
    }
    if (node.dataset.fx === 'true') return true;
    node = node.parentElement;
  }
  return false;
}

export default function FxDelegator() {
  const pathname = usePathname();
  const { lightEnabled, soundEnabled, ready } = useUI();

  // App 一 ready 就把 AudioContext 建起来 + 预解码两段 mp3
  //   - 建 AudioContext 会是 suspended 状态（无手势时浏览器规定）
  //   - decodeAudioData 在 suspended 下也能跑完 —— 冷启动时提前把 buffer 备好
  useEffect(() => {
    if (ready) preloadSounds();
  }, [ready]);

  // iOS/Android 冷启动：捕获阶段最早接管首次手势 —— 同步调用 resume() 让
  // AudioContext 进入 running 状态。同一 pointerdown 后续在冒泡阶段触发的
  // playFx 会拿到已经 resume 的 context，start(0, offset) 立即出声。
  useEffect(() => {
    if (!ready) return;
    let done = false;
    const unlock = () => {
      if (done) return;
      done = true;
      unlockAudio();
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
      document.removeEventListener('click', unlock, true);
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('touchstart', unlock, true);
    document.addEventListener('click', unlock, true);
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
      document.removeEventListener('click', unlock, true);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (!lightEnabled && !soundEnabled) return;
    const handler = (e: PointerEvent) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (!isInteractive(e.target)) return;
      const isHome = pathname === '/';
      playFx(e.clientX, e.clientY, isHome ? 'home' : 'global', {
        light: lightEnabled,
        sound: soundEnabled,
      });
    };
    window.addEventListener('pointerdown', handler, { passive: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, [pathname, lightEnabled, soundEnabled, ready]);

  return null;
}
