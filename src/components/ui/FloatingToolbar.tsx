'use client';

import { useState } from 'react';
import { useUI, type FxTheme } from './UIProvider';
import { previewFx } from './fx';

const THEMES: {
  key: FxTheme;
  name: string;
  desc: string;
  swatch: string;
}[] = [
  { key: 'note', name: '便签', desc: '米黄墨点 · 纸敲桌', swatch: '#f7d774' },
  { key: 'coin', name: '硬币', desc: '金色圆环 · 叮铃', swatch: '#e8b64a' },
  { key: 'bell', name: '银铃', desc: '银蓝涟漪 · 单音钟', swatch: '#8fc4d8' },
  { key: 'forest', name: '森林', desc: '抹茶绿扩散 · 木鱼', swatch: '#7fb87a' },
  { key: 'starry', name: '星空', desc: '深紫星芒 · 高频泛音', swatch: '#8b6dd0' },
];

export default function FloatingToolbar() {
  const ui = useUI();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="fixed top-3 right-3 z-40 flex items-center gap-2">
        <button
          onClick={ui.toggleAmounts}
          aria-label={ui.amountsVisible ? '隐藏金额' : '显示金额'}
          className="w-10 h-10 rounded-full bg-white/80 dark:bg-ink-800/80 backdrop-blur border border-ink-200/70 dark:border-ink-700/70 shadow-sm flex items-center justify-center active:scale-95 transition"
        >
          {ui.amountsVisible ? <EyeOpen /> : <EyeClosed />}
        </button>
        <button
          onClick={() => setOpen(true)}
          aria-label="设置"
          className="w-10 h-10 rounded-full bg-white/80 dark:bg-ink-800/80 backdrop-blur border border-ink-200/70 dark:border-ink-700/70 shadow-sm flex items-center justify-center active:scale-95 transition"
        >
          <SparkleIcon />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium mb-4">外观 · 光效 · 音效</h3>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-2xl bg-ink-50 dark:bg-ink-800 cursor-pointer">
                <div>
                  <div className="text-sm">点击光效</div>
                  <div className="text-xs text-ink-500 mt-0.5">按下时的涟漪 / 星芒</div>
                </div>
                <Switch checked={ui.lightEnabled} onChange={ui.setLightEnabled} />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-ink-50 dark:bg-ink-800 cursor-pointer">
                <div>
                  <div className="text-sm">点击音效</div>
                  <div className="text-xs text-ink-500 mt-0.5">短促合成音，无音频文件下载</div>
                </div>
                <Switch checked={ui.soundEnabled} onChange={ui.setSoundEnabled} />
              </label>
            </div>

            <div className="mt-5">
              <div className="text-xs text-ink-500 mb-2">主题</div>
              <div className="space-y-2">
                {THEMES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      ui.setTheme(t.key);
                      previewFx(t.key, {
                        light: ui.lightEnabled,
                        sound: ui.soundEnabled,
                      });
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl transition ${
                      ui.theme === t.key
                        ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                        : 'bg-ink-50 dark:bg-ink-800'
                    }`}
                  >
                    <span
                      className="w-8 h-8 rounded-full shrink-0"
                      style={{ backgroundColor: t.swatch }}
                    />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">{t.name}</div>
                      <div className={`text-xs ${ui.theme === t.key ? 'opacity-80' : 'text-ink-500'}`}>
                        {t.desc}
                      </div>
                    </div>
                    {ui.theme === t.key && <span className="text-xs">✓</span>}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-ink-400">
                点击可试听/试看。切换后全局生效。
              </div>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="mt-5 w-full py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900"
            >
              完成
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition relative ${
        checked ? 'bg-ink-900 dark:bg-ink-100' : 'bg-ink-300 dark:bg-ink-600'
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition ${
          checked ? 'left-5' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function EyeOpen() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeClosed() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6 0-10-7-10-7a19.79 19.79 0 0 1 4.06-5.06" />
      <path d="M1 1l22 22" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6 0 10 7 10 7a19.5 19.5 0 0 1-3.16 4.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2zM5 15l.9 2.6L8.5 18.5 5.9 19.4 5 22l-.9-2.6L1.5 18.5l2.6-.9L5 15zM19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7L19 15z" />
    </svg>
  );
}
