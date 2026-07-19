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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
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
