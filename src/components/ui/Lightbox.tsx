'use client';

import { useEffect, useRef, useState } from 'react';

type Point = { x: number; y: number };

/**
 * 全屏图片查看器（支持多图）：
 *  - 左右切换：← → 方向键 / 左右两侧按钮 / 左右滑动手势
 *  - 双指捏合缩放（1x – 6x），单指拖拽平移（仅在放大时）
 *  - 双击切换 放大 / 还原
 *  - 右上角大号 ✕ 关闭按钮（唯一关闭方式，避免手抖误退）
 *  - Esc 关闭（键盘）
 *  - 滑动切换仅在 scale===1 时启用，避免与捏合缩放 / 放大平移互相干扰
 */
export default function Lightbox({
  images,
  index,
  onClose,
}: {
  images: string[];
  index: number;
  onClose: () => void;
}) {
  const n = images.length;
  const [i, setI] = useState(() => Math.max(0, Math.min(n - 1, index)));
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [swipeDx, setSwipeDx] = useState(0);
  // 用 ref 存指针状态，避免每次移动触发 re-render
  const pointers = useRef(new Map<number, Point>());
  const initialDist = useRef(0);
  const initialScale = useRef(1);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const swipeStartX = useRef(0);
  const lastTapAt = useRef(0);

  const safeI = Math.max(0, Math.min(n - 1, i));
  const src = images[safeI];

  function go(delta: number) {
    if (n <= 1) return;
    setI((prev) => Math.max(0, Math.min(n - 1, prev + delta)));
    reset();
  }

  // 打开时锁定 body 滚动 + Esc / 方向键
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, n]);

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
    setSwipeDx(0);
  }

  function onPointerDown(e: React.PointerEvent) {
    // 关闭 / 控制按钮的点击不进入手势处理
    if ((e.target as HTMLElement).closest('[data-lightbox-close], [data-lightbox-control]')) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      initialDist.current = distance(a, b);
      initialScale.current = scale;
    } else if (pointers.current.size === 1) {
      if (scale <= 1.02) {
        swipeStartX.current = e.clientX;
      } else {
        panStart.current = { x: e.clientX - tx, y: e.clientY - ty };
      }
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
    } else if (pointers.current.size === 1) {
      if (scale > 1.02) {
        setTx(e.clientX - panStart.current.x);
        setTy(e.clientY - panStart.current.y);
      } else {
        setSwipeDx(e.clientX - swipeStartX.current);
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);

    // 先处理未放大状态下的左右滑动切换
    if (pointers.current.size === 0 && scale <= 1.02) {
      const dx = swipeDx;
      const threshold = Math.min(80, (typeof window !== 'undefined' ? window.innerWidth : 360) * 0.2);
      if (dx <= -threshold) {
        go(1);
        return;
      }
      if (dx >= threshold) {
        go(-1);
        return;
      }
      setSwipeDx(0);
    }

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
      <img
        src={src}
        alt=""
        draggable={false}
        className="max-w-full max-h-full select-none pointer-events-none"
        style={{
          transform: `translate(${scale === 1 ? swipeDx : tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: pointers.current.size === 0 ? 'transform 0.2s ease-out' : 'none',
          willChange: 'transform',
        }}
      />

      {n > 1 && (
        <>
          <div className="absolute top-4 left-0 right-0 text-center text-xs text-white/80 pointer-events-none select-none">
            {safeI + 1} / {n}
          </div>
          <button
            data-lightbox-control="true"
            onClick={() => go(-1)}
            disabled={safeI === 0}
            aria-label="上一张"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white text-2xl flex items-center justify-center disabled:opacity-30 active:scale-95"
            style={{ touchAction: 'auto' }}
          >
            ‹
          </button>
          <button
            data-lightbox-control="true"
            onClick={() => go(1)}
            disabled={safeI === n - 1}
            aria-label="下一张"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white text-2xl flex items-center justify-center disabled:opacity-30 active:scale-95"
            style={{ touchAction: 'auto' }}
          >
            ›
          </button>
        </>
      )}

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
        {n > 1 ? '← → 切换 · ' : ''}双指缩放 · 双击放大 / 还原 · 右上角 ✕ 关闭
      </div>
    </div>
  );
}
