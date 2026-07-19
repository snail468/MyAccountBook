import type { Metadata, Viewport } from 'next';
import './globals.css';
import { UIProvider } from '@/components/ui/UIProvider';
import FloatingToolbar from '@/components/ui/FloatingToolbar';
import FxDelegator from '@/components/ui/FxDelegator';

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

// 应用主题前置脚本：hydrate 前就把 .dark 加上 / 不加，避免闪一下
const THEME_INIT_SCRIPT = `
(function(){try{
  var raw = localStorage.getItem('xyd:ui:v3');
  var theme = 'system';
  if (raw) { try { var s = JSON.parse(raw); if (s && s.theme) theme = s.theme; } catch(_) {} }
  var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (isDark) document.documentElement.classList.add('dark');
}catch(_){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <UIProvider>
          <FxDelegator />
          <FloatingToolbar />
          <div className="mx-auto max-w-md min-h-dvh pb-20">{children}</div>
        </UIProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
