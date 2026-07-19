'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const STORAGE_KEY = 'xyd:ui:v4';

export type ThemeMode = 'light' | 'dark' | 'system';
export type StyleTheme = 'default' | 'liquid';

export type UIState = {
  amountsVisible: boolean;
  lightEnabled: boolean;
  soundEnabled: boolean;
  theme: ThemeMode;
  styleTheme: StyleTheme;
};

const DEFAULT_STATE: UIState = {
  amountsVisible: false,
  lightEnabled: true,
  soundEnabled: false,
  theme: 'system',
  styleTheme: 'default',
};

type Ctx = UIState & {
  toggleAmounts: () => void;
  setLightEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setTheme: (t: ThemeMode) => void;
  setStyleTheme: (t: StyleTheme) => void;
  ready: boolean;
};

const UIContext = createContext<Ctx | null>(null);

function applyClasses(state: UIState) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark =
    state.theme === 'dark' ||
    (state.theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
  root.classList.toggle('liquid', state.styleTheme === 'liquid');
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UIState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let merged = DEFAULT_STATE;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) merged = { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch {
      // ignore
    }
    setState(merged);
    applyClasses(merged);
    setReady(true);
  }, []);

  useEffect(() => {
    if (state.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyClasses(state);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [state]);

  const persist = useCallback((next: UIState) => {
    setState(next);
    applyClasses(next);
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
      setStyleTheme: (t) => persist({ ...state, styleTheme: t }),
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
