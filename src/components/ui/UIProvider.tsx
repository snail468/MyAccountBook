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
export type FontScale = 'small' | 'normal' | 'large';

export type UIState = {
  amountsVisible: boolean;
  lightEnabled: boolean;
  soundEnabled: boolean;
  theme: ThemeMode;
  styleTheme: StyleTheme;
  fontScale: FontScale;
};

const DEFAULT_STATE: UIState = {
  amountsVisible: false,
  lightEnabled: true,
  soundEnabled: false,
  theme: 'system',
  styleTheme: 'default',
  fontScale: 'normal',
};

type Ctx = UIState & {
  toggleAmounts: () => void;
  setLightEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setTheme: (t: ThemeMode) => void;
  setStyleTheme: (t: StyleTheme) => void;
  setFontScale: (s: FontScale) => void;
  ready: boolean;
};

const UIContext = createContext<Ctx | null>(null);

// 字号缩放：直接写 root 的 font-size，Tailwind 的 rem 尺度会等比放大 ——
// 不用改任何组件里的类名。90% / 100% / 112.5% 是 iOS/Android 系统字号
// 常用的三档，跨度足够但不至于让布局塌掉
const FONT_SCALE_PX: Record<FontScale, string> = {
  small: '14px',
  normal: '16px',
  large: '18px',
};

function applyClasses(state: UIState) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark =
    state.theme === 'dark' ||
    (state.theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
  root.classList.toggle('liquid', state.styleTheme === 'liquid');
  root.style.fontSize = FONT_SCALE_PX[state.fontScale];
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
      setFontScale: (s) => persist({ ...state, fontScale: s }),
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
