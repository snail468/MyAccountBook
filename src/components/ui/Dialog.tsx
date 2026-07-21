'use client';

// 现代化全局对话框：替代 window.confirm / alert
//   - 模糊背景 + spring 缓动 + 底部 sheet 风格（移动端）/ 居中卡片（桌面端）
//   - useConfirm() / useAlert() / useToast() —— 返回 Promise，行内 await 即可
//   - 危险操作红底、图标
//
// 用法：
//   const confirm = useConfirm();
//   const ok = await confirm({ title: '删除?', body: '不可恢复', danger: true });

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// ==== 类型 ====
type ConfirmOptions = {
  title: string;
  body?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  icon?: React.ReactNode;
};
type AlertOptions = {
  title: string;
  body?: React.ReactNode;
  okText?: string;
  icon?: React.ReactNode;
  danger?: boolean;
};
type ToastOptions = {
  message: string;
  kind?: 'info' | 'success' | 'error';
  duration?: number;
};

type DialogState =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; opts: AlertOptions; resolve: () => void }
  | null;

type ToastItem = { id: number; message: string; kind: 'info' | 'success' | 'error' };

type Ctx = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: AlertOptions) => Promise<void>;
  toast: (opts: ToastOptions) => void;
};

const DialogCtx = createContext<Ctx | null>(null);

// ==== Provider ====
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setDialog({ kind: 'confirm', opts, resolve });
      }),
    [],
  );
  const alertFn = useCallback(
    (opts: AlertOptions) =>
      new Promise<void>((resolve) => {
        setDialog({ kind: 'alert', opts, resolve });
      }),
    [],
  );
  const toast = useCallback((opts: ToastOptions) => {
    const id = ++toastId.current;
    const item: ToastItem = {
      id,
      message: opts.message,
      kind: opts.kind ?? 'info',
    };
    setToasts((prev) => [...prev, item]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, opts.duration ?? 2400);
  }, []);

  const value = useMemo(() => ({ confirm, alert: alertFn, toast }), [confirm, alertFn, toast]);

  return (
    <DialogCtx.Provider value={value}>
      {children}
      <DialogHost state={dialog} close={() => setDialog(null)} />
      <ToastHost toasts={toasts} />
    </DialogCtx.Provider>
  );
}

// ==== Hooks ====
function useCtxOrThrow(): Ctx {
  const c = useContext(DialogCtx);
  if (!c) throw new Error('useConfirm/useAlert/useToast must be used inside DialogProvider');
  return c;
}
export function useConfirm() {
  return useCtxOrThrow().confirm;
}
export function useAlert() {
  return useCtxOrThrow().alert;
}
export function useToast() {
  return useCtxOrThrow().toast;
}

// ==== 对话框 UI ====
function DialogHost({ state, close }: { state: DialogState; close: () => void }) {
  const [visible, setVisible] = useState(false);

  // 关闭逻辑放前面，避免 useEffect 里引用后面才声明的 const（TS strict TDZ）
  const finish = (ok: boolean) => {
    if (!state) return;
    const s = state; // 显式捕获，setTimeout 闭包里保住 narrow
    setVisible(false);
    window.setTimeout(() => {
      if (s.kind === 'confirm') s.resolve(ok);
      else s.resolve();
      close();
    }, 160);
  };
  const handleConfirm = () => finish(true);
  const handleCancel = () => finish(false);

  useEffect(() => {
    if (!state) {
      setVisible(false);
      return;
    }
    // 下一帧再打开，确保 transition 生效
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
      if (e.key === 'Enter') handleConfirm();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!state) return null;

  const isConfirm = state.kind === 'confirm';
  const opts = state.opts;
  const danger = 'danger' in opts && opts.danger;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center transition-[backdrop-filter,background-color] duration-200 ${
        visible ? 'bg-black/30 backdrop-blur-md' : 'bg-black/0 backdrop-blur-0 pointer-events-none'
      }`}
      onClick={handleCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`
          w-full max-w-md
          bg-white/90 dark:bg-ink-900/90 backdrop-blur-2xl
          border border-white/40 dark:border-ink-700
          rounded-t-3xl sm:rounded-3xl sm:mx-4
          shadow-[0_20px_60px_-10px_rgba(0,0,0,0.35)]
          p-6
          transition-all duration-200
          ${visible ? 'translate-y-0 opacity-100 sm:scale-100' : 'translate-y-full sm:translate-y-2 opacity-0 sm:scale-95'}
        `}
      >
        {'icon' in opts && opts.icon ? (
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-3 ${danger ? 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400' : 'bg-ink-100 dark:bg-ink-800'}`}>
            {opts.icon}
          </div>
        ) : danger ? (
          <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center text-2xl mb-3">
            ⚠
          </div>
        ) : null}

        <h3 className="text-lg font-semibold leading-tight">{opts.title}</h3>
        {opts.body && (
          <div className="mt-2 text-sm text-ink-600 dark:text-ink-300 leading-relaxed whitespace-pre-wrap">
            {opts.body}
          </div>
        )}

        <div className="mt-6 flex gap-2">
          {isConfirm && (
            <button
              onClick={handleCancel}
              className="flex-1 py-3 rounded-2xl bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-100 font-medium active:scale-[0.98] transition"
            >
              {(state.opts as ConfirmOptions).cancelText ?? '取消'}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className={`flex-1 py-3 rounded-2xl font-medium active:scale-[0.98] transition ${
              danger
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                : 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
            }`}
          >
            {isConfirm
              ? (state.opts as ConfirmOptions).confirmText ?? '确认'
              : (state.opts as AlertOptions).okText ?? '好的'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastHost({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="fixed left-0 right-0 top-4 z-[110] flex flex-col items-center gap-2 pointer-events-none px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`
            toast-in
            pointer-events-auto max-w-md w-full sm:w-auto
            px-4 py-3 rounded-2xl shadow-lg backdrop-blur-xl
            border text-sm font-medium
            ${t.kind === 'success' ? 'bg-emerald-500/90 border-emerald-400 text-white'
              : t.kind === 'error' ? 'bg-red-500/90 border-red-400 text-white'
              : 'bg-ink-900/90 border-ink-700 text-white dark:bg-ink-100/90 dark:border-ink-300 dark:text-ink-900'}
          `}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
