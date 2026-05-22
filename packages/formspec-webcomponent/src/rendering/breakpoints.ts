/** @filedesc Responsive breakpoint matching via matchMedia listeners. */
import { signal } from '@preact/signals-core';

import { mergeBreakpointNamespace } from '@formspec-org/types';
import type { BreakpointMap } from '@formspec-org/types';

export interface BreakpointHost {
    _componentDocument: { breakpoints?: BreakpointMap } | null;
    _themeDocument: { breakpoints?: BreakpointMap } | null;
    scheduleRender(): void;
}

export interface BreakpointState {
    activeBreakpointSignal: ReturnType<typeof signal<string | null>>;
    cleanups: Array<() => void>;
}

export function createBreakpointState(): BreakpointState {
    return {
        activeBreakpointSignal: signal<string | null>(null),
        cleanups: [],
    };
}

export function setupBreakpoints(host: BreakpointHost, state: BreakpointState): void {
    for (const fn of state.cleanups) fn();
    state.cleanups = [];
    state.activeBreakpointSignal.value = null;

    const breakpoints = mergeBreakpointNamespace(
        host._themeDocument?.breakpoints,
        host._componentDocument?.breakpoints,
    );
    if (!breakpoints) return;

    const entries = Object.entries(breakpoints)
        .map(([name, val]) => {
            const query = `(min-width: ${val}px)`;
            return { name, query, width: val };
        })
        .sort((a, b) => a.width - b.width);

    for (const { name, query } of entries) {
        const mql = window.matchMedia(query);
        const handler = () => {
            let active: string | null = null;
            for (const entry of entries) {
                if (window.matchMedia(entry.query).matches) active = entry.name;
            }
            if (active !== state.activeBreakpointSignal.value) {
                state.activeBreakpointSignal.value = active;
                host.scheduleRender();
            }
        };
        mql.addEventListener('change', handler);
        state.cleanups.push(() => mql.removeEventListener('change', handler));
        if (mql.matches) state.activeBreakpointSignal.value = name;
    }
}

export function cleanupBreakpoints(state: BreakpointState): void {
    for (const fn of state.cleanups) fn();
    state.cleanups = [];
}
