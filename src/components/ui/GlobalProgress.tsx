'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// 允许其它组件手动触发进度条（mutation 后的 router.refresh 场景）
let externalStart: (() => void) | null = null;
let externalStop: (() => void) | null = null;

export function startGlobalProgress() {
  externalStart?.();
}
export function stopGlobalProgress() {
  externalStop?.();
}

// 顶部亮粉细进度条：任何路由切换/router.refresh 期间都会亮一下
// 原理：拦截所有可能触发导航的 <a>/<Link>/<button> 点击，立刻亮起；路径变化后再淡出
export default function GlobalProgress() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    // 路径变了 → 完成 → 淡出
    if (visible) {
      setProgress(100);
      const t = window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 250);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    let animateId: number | null = null;
    let startTime = 0;

    function start() {
      setVisible(true);
      setProgress(15);
      startTime = performance.now();
      const tick = () => {
        const elapsed = performance.now() - startTime;
        // 缓慢逼近 85%（永远不到 100，等真正完成再冲过去）
        const p = 15 + (85 - 15) * (1 - Math.exp(-elapsed / 900));
        setProgress(p);
        animateId = window.requestAnimationFrame(tick);
      };
      animateId = window.requestAnimationFrame(tick);
    }

    function stopAnim() {
      if (animateId !== null) window.cancelAnimationFrame(animateId);
    }

    function onClick(e: MouseEvent) {
      // 只在左键点击且未按辅助键时触发（避免打断新标签打开等行为）
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!(e.target instanceof HTMLElement)) return;
      // 找到最近的 <a>：只对同源链接反应
      const anchor = e.target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (anchor.target && anchor.target !== '_self') return;
      // 同源判断
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
      } catch {
        return;
      }
      stopAnim();
      start();
    }

    window.addEventListener('click', onClick, true);
    externalStart = () => {
      stopAnim();
      start();
    };
    externalStop = () => {
      stopAnim();
      setProgress(100);
      window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
    };
    return () => {
      window.removeEventListener('click', onClick, true);
      externalStart = null;
      externalStop = null;
      stopAnim();
    };
  }, []);

  if (!visible && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-0.5 z-[9999] pointer-events-none"
    >
      <div
        className="h-full transition-[width,opacity] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          background: 'linear-gradient(90deg, #ff2d87, #c8a2d8)',
          boxShadow: '0 0 8px rgba(255,45,135,0.6)',
        }}
      />
    </div>
  );
}
