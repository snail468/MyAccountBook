'use client';

import { useEffect, useRef, useState } from 'react';

type Point = { x: number; y: number };

/**
 * 全屏图片查看器：
 *  - 双指捏合缩放（1x – 6x）
 *  - 单指拖拽平移（仅在放大时）
 *  - 双击切换 放大 / 还原
 *  - 右上角大号 ✕ 关闭按钮（唯一关闭方式，避免手抖误退）
 *  - Esc 关闭（键盘）
 */
export default function Lightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  // 用 ref 存指针状态，避免每次移动触发 re-render
  const pointers = useRef(new Map<number, Point>());
  const initialDist = useRef(0);
  const initialScale = useRef(1);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const lastTapAt = useRef(0);

  // 打开时锁定 body 滚动 + Esc 关闭
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function distance(a: Point, b: Point) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clampScale(s: number) {
    return Math.min(6, Math.max(1, s));
  }

  function reset() {
    setScale(1);
    setTx(0);
    setTy(0);
  }

  function onPointerDown(e: React.PointerEvent) {
    // 关闭按钮的点击不进入手势处理
    if ((e.target as HTMLElement).closest('[data-lightbox-close]')) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      initialDist.current = distance(a, b);
      initialScale.current = scale;
    } else if (pointers.current.size === 1) {
      panStart.current = { x: e.clientX - tx, y: e.clientY - ty };
      // 双击检测：300ms 内的第二次单指按下
      const now = Date.now();
      if (now - lastTapAt.current < 300) {
        if (scale === 1) {
          setScale(2.5);
        } else {
          reset();
        }
        lastTapAt.current = 0;
      } else {
        lastTapAt.current = now;
      }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = distance(a, b);
      if (initialDist.current > 0) {
        setScale(clampScale(initialScale.current * (d / initialDist.current)));
      }
    } else if (pointers.current.size === 1 && scale > 1.02) {
      setTx(e.clientX - panStart.current.x);
      setTy(e.clientY - panStart.current.y);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);

    // 缩放后如果小于 1.05 视为回到 1x，顺手复位平移
    if (pointers.current.size === 0 && scale < 1.05) {
      reset();
    }
    // 不做背景 tap-to-close：手势与双击缩放会互相干扰，
    // 也避免手抖误退。要退请点右上 ✕ 或按 Esc。
  }

  return (
    <div
      data-lightbox-backdrop="true"
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: 'none' }}
    >
      { }
      <img
        src={src}
        alt=""
        draggable={false}
        className="max-w-full max-h-full select-none pointer-events-none"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: pointers.current.size === 0 ? 'transform 0.2s ease-out' : 'none',
          willChange: 'transform',
        }}
      />

      <button
        data-lightbox-close="true"
        onClick={onClose}
        aria-label="关闭"
        className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white text-black text-2xl font-medium flex items-center justify-center shadow-lg active:scale-95"
        style={{ touchAction: 'auto' }}
      >
        ✕
      </button>

      <div className="absolute bottom-6 left-0 right-0 text-center text-xs text-white/60 pointer-events-none select-none">
        双指缩放 · 双击放大 / 还原 · 右上角 ✕ 关闭
      </div>
    </div>
  );
}
