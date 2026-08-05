import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { UIProvider } from '@/components/ui/UIProvider';
import { DialogProvider } from '@/components/ui/Dialog';
import FloatingToolbar from '@/components/ui/FloatingToolbar';
import FxDelegator from '@/components/ui/FxDelegator';
import GlobalProgress from '@/components/ui/GlobalProgress';
import OfflineSync from '@/components/ui/OfflineSync';

export const metadata: Metadata = {
  title: '心愿便利贴',
  description: '多账本 + 心愿记录 PWA',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '心愿便利贴',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#c8a2d8',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// 应用主题前置脚本：hydrate 前就把 .dark 加上 / 不加，避免闪一下。
// 字号也在这里应用 —— hydrate 后再改 root font-size 会看到明显的重排，
// 这里提前应用就静默过去了
const THEME_INIT_SCRIPT = `
(function(){try{
  var raw = localStorage.getItem('xyd:ui:v4');
  var theme = 'system';
  var styleTheme = 'default';
  var fontScale = 'normal';
  if (raw) { try { var s = JSON.parse(raw); if (s) {
    if (s.theme) theme = s.theme;
    if (s.styleTheme) styleTheme = s.styleTheme;
    if (s.fontScale) fontScale = s.fontScale;
  } } catch(_) {} }
  var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var el = document.documentElement;
  if (isDark) el.classList.add('dark');
  if (styleTheme === 'liquid') el.classList.add('liquid');
  var sizePx = fontScale === 'small' ? '14px' : fontScale === 'large' ? '18px' : '16px';
  el.style.fontSize = sizePx;
}catch(_){}})();
`;

const SW_REGISTER_SCRIPT = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function() {});
  });
}
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // middleware 为每个请求生成 nonce —— 内联脚本带上它才能通过严格 CSP，
  // 不用退回 'unsafe-inline'
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="zh-CN">
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <UIProvider>
          <DialogProvider>
            <GlobalProgress />
            <FxDelegator />
            <FloatingToolbar />
            <OfflineSync />
            <div className="mx-auto max-w-md min-h-dvh pb-20">{children}</div>
          </DialogProvider>
        </UIProvider>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SW_REGISTER_SCRIPT }} />
      </body>
    </html>
  );
}
