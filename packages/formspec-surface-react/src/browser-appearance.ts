/** @filedesc Remember the browser appearance and honor a host's scheme. */
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

const STORAGE_KEY = 'formspec:surface-appearance:v1';
const HOST_APPEARANCE = 'data-fs-appearance';
type Scheme = 'light' | 'dark';
type Appearance = 'system' | Scheme;

function explicitScheme(value: string | null): Scheme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}

function readPreference(): Appearance {
  if (typeof window === 'undefined') return 'system';
  try { return explicitScheme(window.localStorage.getItem(STORAGE_KEY)) ?? 'system'; }
  catch { return 'system'; }
}

/** Inline in the page head so the browser can paint the saved scheme before React mounts. */
export const SURFACE_APPEARANCE_SCRIPT = `try {
  const saved = window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-fs-saved-appearance', saved);
  }
} catch {}`;

export function useBrowserAppearance() {
  const [preference, setPreference] = useState(readPreference);
  const [dark, setDark] = useState(() => typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => setDark(media?.matches === true);
    media?.addEventListener('change', update);
    update();
    return () => media?.removeEventListener('change', update);
  }, []);

  function choose(value: string) {
    const next = explicitScheme(value) ?? 'system';
    setPreference(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); }
    catch { /* The current visit still uses the choice when storage is unavailable. */ }
  }

  const appearance = explicitScheme(preference) ?? (dark ? 'dark' : 'light');
  return { preference, appearance, choose };
}

export function useHostAppearance(root: RefObject<HTMLElement | null>, enabled: boolean): Scheme | undefined {
  const [scheme, setScheme] = useState<Scheme>();
  useLayoutEffect(() => {
    if (!enabled) return;
    const parent = root.current?.parentElement;
    if (!parent) return;
    const update = () => {
      const host = parent.closest(`[${HOST_APPEARANCE}="light"], [${HOST_APPEARANCE}="dark"]`);
      setScheme(explicitScheme(host?.getAttribute(HOST_APPEARANCE) ?? null));
    };
    const observer = new MutationObserver(update);
    for (let ancestor: HTMLElement | null = parent; ancestor; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, { attributes: true, attributeFilter: [HOST_APPEARANCE] });
    }
    update();
    return () => observer.disconnect();
  }, [enabled, root]);
  return enabled ? scheme : undefined;
}
