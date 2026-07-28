/** @filedesc Vitest setup — act-environment flag plus per-test React root cleanup. */
import { act } from 'react';
import { afterEach, vi } from 'vitest';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Unmount every root each test creates. Leaked roots accumulate in
// document.body and make React's teardown warnings race vitest's worker RPC.
const trackedRoots: Array<{ unmount: () => void }> = [];

vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      const root = actual.createRoot(...args);
      trackedRoots.push(root);
      return root;
    },
  };
});

afterEach(() => {
  act(() => {
    while (trackedRoots.length > 0) {
      try {
        trackedRoots.pop()?.unmount();
      } catch {
        // Already unmounted by the test. Fine.
      }
    }
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('style');
  });
});
