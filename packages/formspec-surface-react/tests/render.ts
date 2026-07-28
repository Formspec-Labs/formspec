/**
 * @filedesc Minimal React render helper — no testing-library dependency.
 *
 * `act` rather than `flushSync`: passive effects are where the shell delivers
 * diagnostics to the host and where it observes the document root, so a helper
 * that flushed only layout effects would let a test assert against a state the
 * component had not finished producing.
 */
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactNode } from 'react';

export function render(node: ReactNode): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

export function textOf(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
