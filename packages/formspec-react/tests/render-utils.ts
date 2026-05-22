/** @filedesc Shared React test render helpers — act + flushSync for engine-driven updates. */
import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

/**
 * Render into a detached container inside act + flushSync.
 *
 * FormEngine signal writes and useSyncExternalStore subscriptions can schedule
 * React updates after the initial paint; act() keeps those inside the test boundary.
 */
export function actRender(element: ReactElement): HTMLElement {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        flushSync(() => {
            root.render(element);
        });
    });
    return container;
}

/** Flush microtasks and passive effects still pending after actRender. */
export async function settleAct(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
    });
}

/** actRender followed by settleAct for tests that observe post-mount engine work. */
export async function actRenderAsync(element: ReactElement): Promise<HTMLElement> {
    const container = actRender(element);
    await settleAct();
    return container;
}
