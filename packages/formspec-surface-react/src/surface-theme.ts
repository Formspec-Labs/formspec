/** @filedesc Emit a granted Theme onto a shell-owned element and clean up on change. */
import { useLayoutEffect, type RefObject } from 'react';
import { emitMergedThemeCssVars } from '@formspec-org/layout';
import type { ThemeDocument } from '@formspec-org/types';

export function useSurfaceThemeTokens(element: RefObject<HTMLElement | null>, theme: ThemeDocument | undefined) {
  useLayoutEffect(() => {
    const container = element.current;
    if (!container || !theme) return;
    emitMergedThemeCssVars(container, { themeTokens: theme.tokens ?? {} });
    return () => {
      for (let index = container.style.length - 1; index >= 0; index -= 1) {
        const property = container.style[index];
        if (property?.startsWith('--formspec-')) container.style.removeProperty(property);
      }
    };
  }, [element, theme]);
}
