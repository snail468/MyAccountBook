'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

// 心愿便利贴 UI 偏好：金额可见性 + 光效/音效主题
const STORAGE_KEY = 'xyd:ui';

export type FxTheme = 'note' | 'coin' | 'bell' | 'forest' | 'starry';

export type UIState = {
  amountsVisible: boolean;
  lightEnabled: boolean;
  soundEnabled: boolean;
  theme: FxTheme;
};

const DEFAULT_STATE: UIState = {
  amountsVisible: false,
  lightEnabled: true,
  soundEnabled: false,
  theme: 'note',
};

type Ctx = UIState & {
  toggleAmounts: () => void;
  setLightEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setTheme: (t: FxTheme) => void;
  ready: boolean;
};

const UIContext = createContext<Ctx | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UIState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setState({ ...DEFAULT_STATE, ...parsed });
      }
    } catch {
      // ignore
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: UIState) => {
    setState(next);
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
