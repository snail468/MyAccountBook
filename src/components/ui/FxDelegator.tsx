'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useUI } from './UIProvider';
import { playFx, preloadSounds } from './fx';

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

  // 用户开启声音后就预加载两段音频
  useEffect(() => {
    if (ready && soundEnabled) preloadSounds();
  }, [ready, soundEnabled]);

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
