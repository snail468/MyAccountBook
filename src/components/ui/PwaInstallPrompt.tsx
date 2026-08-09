'use client';

import { useEffect, useState } from 'react';

// Chrome 的 beforeinstallprompt 事件在 lib.dom 里没有完整类型，这里做最小声明。
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'xyd:pwaInstallDismissed';

function isIOPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iPhoneOrPad = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ 会伪装成 Mac，用触摸点数区分
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iPhoneOrPad || iPadOS;
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return window.matchMedia('(display-mode: standalone)').matches || standalone;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // 已经装成独立 App（从主屏幕打开）就不必再提示
    if (isStandaloneMode()) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    const onPrompt = (e: Event) => {
      // 拦下 Chrome 自带的迷你安装条，改用自己的引导
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setShow(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt as EventListener);
    window.addEventListener('appinstalled', onInstalled);

    // 进页面稍等一下再出现，避免一进来就弹
    const timer = window.setTimeout(() => {
      if (isIOPlatform() || deferredPrompt) setShow(true);
    }, 1500);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt as EventListener);
      window.removeEventListener('appinstalled', onInstalled);
      window.clearTimeout(timer);
    };
  }, [deferredPrompt]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    setDeferredPrompt(null);
    setShow(false);
    // 调起系统安装确认；无论接受/拒绝，本次会话不再弹（同会话事件不会重发）
    await prompt.prompt().catch(() => {});
  };

  if (!show) return null;

  const isIOS = !deferredPrompt;

  return (
    <div className="toast-in fixed inset-x-3 bottom-4 z-30 sm:inset-x-auto sm:right-4 sm:max-w-sm">
      <div className="rounded-3xl bg-white dark:bg-ink-900 border border-ink-200/70 dark:border-ink-700/70 shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div
            className="shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(200,162,216,0.18)' }}
          >
            <PlusAppGlyph />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink-900 dark:text-ink-100">
              {isIOS ? '添加到主屏幕' : '安装到主屏幕'}
            </div>
            <div className="text-xs text-ink-500 mt-1 leading-relaxed">
              {isIOS ? (
                <>
                  打开 Safari 底部的 <ShareGlyph /> 分享菜单，选择「添加到主屏幕」，即可像 App
                  一样全屏使用。
                </>
              ) : (
                <>把「心愿便利贴」装成 App：全屏打开、随时记账，不占浏览器标签。</>
              )}
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="关闭"
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800 active:scale-95 transition"
          >
            <CloseGlyph />
          </button>
        </div>

        <button
          onClick={isIOS ? dismiss : install}
          className={
            isIOS
              ? 'mt-3 w-full py-2.5 rounded-2xl bg-ink-50 dark:bg-ink-800 text-sm text-ink-900 dark:text-ink-100 active:scale-[0.98] transition'
              : 'mt-3 w-full py-2.5 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm font-medium active:scale-[0.98] transition'
          }
        >
          {isIOS ? '知道了' : '安装'}
        </button>
      </div>
    </div>
  );
}

function PlusAppGlyph() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#8a5fb0"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block align-[-2px]"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
