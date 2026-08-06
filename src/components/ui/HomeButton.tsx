'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 全局左上角"回首页"按钮。定位、样式与右上 FloatingToolbar 对称。
// 首页与鉴权/邀请落地页不显示 —— 那些页面要么就是首页本身，要么需要
// 视觉聚焦在表单，不该被漂浮按钮干扰。
export default function HomeButton() {
  const pathname = usePathname();
  if (!pathname) return null;
  if (pathname === '/') return null;
  if (pathname.startsWith('/login')) return null;
  if (pathname.startsWith('/register')) return null;
  if (pathname.startsWith('/invite/')) return null;

  return (
    <div className="fixed top-3 left-3 z-40">
      <Link
        href="/"
        aria-label="回到主页"
        className="w-10 h-10 rounded-full bg-white/80 dark:bg-ink-800/80 backdrop-blur border border-ink-200/70 dark:border-ink-700/70 shadow-sm flex items-center justify-center active:scale-95 transition"
      >
        <HomeIcon />
      </Link>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 11.5L12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}
