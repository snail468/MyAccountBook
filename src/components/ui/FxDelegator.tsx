'use client';

import { useEffect } from 'react';
import { useUI } from './UIProvider';
import { playFx } from './fx';

// 判定这个点击目标是否应该触发 FX
function isInteractive(el: HTMLElement): boolean {
  // 沿父链找到最近的可交互元素
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
  const { theme, lightEnabled, soundEnabled, ready } = useUI();

  useEffect(() => {
    if (!ready) return;
    // 都关的话不用监听
    if (!lightEnabled && !soundEnabled) return;
    const handler = (e: PointerEvent) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (!isInteractive(e.target)) return;
      playFx(e.clientX, e.clientY, theme, {
        light: lightEnabled,
        sound: soundEnabled,
      });
    };
    // 用 pointerdown 更即时；也在触屏上工作
    window.addEventListener('pointerdown', handler, { passive: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, [theme, lightEnabled, soundEnabled, ready]);

  return null;
}
