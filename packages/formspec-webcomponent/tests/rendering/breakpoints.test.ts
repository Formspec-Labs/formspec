import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBreakpointState, setupBreakpoints } from '../../src/rendering/breakpoints.js';

type MatchListener = () => void;

const listeners: MatchListener[] = [];
const listenerMinWidths: number[] = [];

function installMatchMedia(matches: Record<number, boolean>) {
    listeners.length = 0;
    listenerMinWidths.length = 0;
    vi.stubGlobal('matchMedia', (query: string) => {
        const minWidth = Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);
        return {
            media: query,
            matches: Boolean(matches[minWidth]),
            addEventListener: (_event: string, listener: MatchListener) => {
                listeners.push(listener);
                listenerMinWidths.push(minWidth);
            },
            removeEventListener: vi.fn(),
        };
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
    listeners.length = 0;
    listenerMinWidths.length = 0;
});

describe('setupBreakpoints', () => {
    it('listens to the merged theme and component breakpoint namespace', () => {
        installMatchMedia({ 480: true, 768: true });
        const state = createBreakpointState();
        const scheduleRender = vi.fn();

        setupBreakpoints({
            _themeDocument: { breakpoints: { tablet: 768 } },
            _componentDocument: { breakpoints: { compact: 480 } },
            scheduleRender,
        }, state);

        expect(state.activeBreakpointSignal.value).toBe('tablet');
        expect(listeners).toHaveLength(2);
    });

    it('keeps the theme value when component breakpoints reuse the same name', () => {
        installMatchMedia({ 480: true, 768: true, 900: false });
        const state = createBreakpointState();
        const scheduleRender = vi.fn();

        setupBreakpoints({
            _themeDocument: { breakpoints: { tablet: 768 } },
            _componentDocument: { breakpoints: { tablet: 900, compact: 480 } },
            scheduleRender,
        }, state);

        expect(state.activeBreakpointSignal.value).toBe('tablet');
        expect([...listenerMinWidths].sort((a, b) => a - b)).toEqual([480, 768]);
    });
});
