'use client';

import { useState } from 'react';
import { useUI } from './UIProvider';
import { previewFx } from './fx';

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
            <h3 className="text-lg font-medium mb-4">光效 · 音效</h3>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-2xl bg-ink-50 dark:bg-ink-800 cursor-pointer">
                <div>
                  <div className="text-sm">点击光效</div>
                  <div className="text-xs text-ink-500 mt-0.5">星空风格：紫色涟漪 + 星芒</div>
                </div>
                <Switch checked={ui.lightEnabled} onChange={ui.setLightEnabled} />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-ink-50 dark:bg-ink-800 cursor-pointer">
                <div>
                  <div className="text-sm">点击音效</div>
                  <div className="text-xs text-ink-500 mt-0.5">
                    首页用一段声，其它页面用另一段
                  </div>
                </div>
                <Switch checked={ui.soundEnabled} onChange={ui.setSoundEnabled} />
              </label>
            </div>

            <div className="mt-4">
              <button
                onClick={() =>
                  previewFx({ light: ui.lightEnabled, sound: ui.soundEnabled })
                }
                className="w-full py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 text-sm"
              >
                试听 / 试看
              </button>
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
