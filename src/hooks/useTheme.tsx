import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ThemeMode } from '@/types/db';

// The visitor's own light/dark choice is a cosmetic preference, so it lives in the browser.
// It is the ONLY thing this app keeps in localStorage besides the Supabase auth session.
const KEY = 'ijt-theme-pref';

function readPref(): ThemeMode | null {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; }
}

interface ThemeCtx { mode: ThemeMode; toggle: () => void; setSiteDefault: (m: ThemeMode | null) => void }
const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<ThemeMode | null>(readPref);
  const [siteDefault, setSiteDefault] = useState<ThemeMode | null>(null);
  const mode: ThemeMode = pref ?? siteDefault ?? 'light';

  useEffect(() => { document.documentElement.classList.toggle('dark', mode === 'dark'); }, [mode]);

  const toggle = useCallback(() => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setPref(next);
    try { localStorage.setItem(KEY, next); } catch { /* private mode: preference lasts for this visit only */ }
  }, [mode]);

  const value = useMemo(() => ({ mode, toggle, setSiteDefault }), [mode, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
