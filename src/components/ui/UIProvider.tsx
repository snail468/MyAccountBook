'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const STORAGE_KEY = 'xyd:ui:v3';

export type ThemeMode = 'light' | 'dark' | 'system';

export type UIState = {
  amountsVisible: boolean;
  lightEnabled: boolean;
  soundEnabled: boolean;
  theme: ThemeMode;
};

const DEFAULT_STATE: UIState = {
  amountsVisible: false,
  lightEnabled: true,
  soundEnabled: false,
  theme: 'system',
};

type Ctx = UIState & {
  toggleAmounts: () => void;
  setLightEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setTheme: (t: ThemeMode) => void;
  ready: boolean;
};

const UIContext = createContext<Ctx | null>(null);

function applyThemeClass(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UIState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);

  // 首次挂载：从 localStorage 读，应用主题
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged = { ...DEFAULT_STATE, ...parsed };
        setState(merged);
        applyThemeClass(merged.theme);
      } else {
        applyThemeClass(DEFAULT_STATE.theme);
      }
    } catch {
      applyThemeClass(DEFAULT_STATE.theme);
    }
    setReady(true);
  }, []);

  // system 模式下监听系统偏好变化
  useEffect(() => {
    if (state.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeClass('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [state.theme]);

  const persist = useCallback((next: UIState) => {
    setState(next);
    applyThemeClass(next.theme);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const value: Ctx = useMemo(
    () => ({
      ...state,
      ready,
      toggleAmounts: () => persist({ ...state, amountsVisible: !state.amountsVisible }),
      setLightEnabled: (v) => persist({ ...state, lightEnabled: v }),
      setSoundEnabled: (v) => persist({ ...state, soundEnabled: v }),
      setTheme: (t) => persist({ ...state, theme: t }),
    }),
    [state, ready, persist],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside UIProvider');
  return ctx;
}
