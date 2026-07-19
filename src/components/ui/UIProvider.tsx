'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const STORAGE_KEY = 'xyd:ui:v2';

export type UIState = {
  amountsVisible: boolean;
  lightEnabled: boolean;
  soundEnabled: boolean;
};

const DEFAULT_STATE: UIState = {
  amountsVisible: false,
  lightEnabled: true,
  soundEnabled: false,
};

type Ctx = UIState & {
  toggleAmounts: () => void;
  setLightEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
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
