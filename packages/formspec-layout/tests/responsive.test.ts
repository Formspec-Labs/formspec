import { describe, it, expect } from 'vitest';
import { resolveResponsiveProps } from '../src/responsive';

// ── Single-breakpoint merge: no numeric breakpoints available ─────────

describe('resolveResponsiveProps — no breakpoints map (single-breakpoint merge)', () => {
    it('returns comp unchanged when no responsive map', () => {
        const comp = { component: 'Stack', gap: 16 };
        expect(resolveResponsiveProps(comp, 'md')).toBe(comp);
    });

    it('returns comp unchanged when activeBreakpoint is null', () => {
        const comp = { component: 'Stack', responsive: { md: { gap: 8 } } };
        expect(resolveResponsiveProps(comp, null)).toBe(comp);
    });

    it('single-breakpoint merge when no breakpoints map provided', () => {
        const comp = {
            component: 'Columns',
            widths: ['3fr', '1fr'],
            responsive: { sm: { widths: ['1fr'] } },
        };
        const result = resolveResponsiveProps(comp, 'sm');
        expect(result.widths).toEqual(['1fr']);
        expect(result).not.toBe(comp); // new object
    });

    it('returns comp unchanged when activeBreakpoint not in responsive map (no breakpoints)', () => {
        const comp = {
            component: 'Stack',
            gap: 16,
            responsive: { sm: { gap: 8 } },
        };
        expect(resolveResponsiveProps(comp, 'lg')).toBe(comp);
    });
});

// ── Mobile-first cumulative cascade (S9.3) ───────────────────────────

describe('resolveResponsiveProps — mobile-first cumulative cascade', () => {
    const breakpoints = { sm: 576, md: 768, lg: 1024 };

    it('applies only sm overrides when active breakpoint is sm', () => {
        const comp = {
            component: 'Stack',
            gap: 4,
            padding: 0,
            responsive: {
                sm: { gap: 8 },
                md: { gap: 12 },
                lg: { gap: 16 },
            },
        };
        const result = resolveResponsiveProps(comp, 'sm', breakpoints);
        expect(result.gap).toBe(8);
        expect(result.padding).toBe(0); // base value preserved
    });

    it('applies sm then md overrides when active breakpoint is md (md wins conflicts)', () => {
        const comp = {
            component: 'Stack',
            gap: 4,
            responsive: {
                sm: { gap: 8, color: 'red' },
                md: { gap: 12 },
                lg: { gap: 16 },
            },
        };
        const result = resolveResponsiveProps(comp, 'md', breakpoints);
        expect(result.gap).toBe(12);  // md overrides sm
        expect(result.color).toBe('red'); // sm override preserved (not overridden by md)
    });

    it('applies sm, md, then lg overrides cumulatively when active breakpoint is lg', () => {
        const comp = {
            component: 'Columns',
            widths: ['3fr', '1fr'],
            gap: 4,
            responsive: {
                sm: { widths: ['1fr'], gap: 8 },
                md: { gap: 12 },
                lg: { gap: 16, padding: 24 },
            },
        };
        const result = resolveResponsiveProps(comp, 'lg', breakpoints);
        expect(result.widths).toEqual(['1fr']);  // from sm, not overridden
        expect(result.gap).toBe(16);             // lg wins over sm and md
        expect(result.padding).toBe(24);         // from lg
    });

    it('returns base comp when activeBreakpoint width not found in breakpoints map', () => {
        const comp = {
            component: 'Stack',
            gap: 4,
            responsive: { sm: { gap: 8 } },
        };
        const result = resolveResponsiveProps(comp, 'xl', breakpoints);
        expect(result).toBe(comp);
    });

    it('skips breakpoints that have no overrides in responsive map', () => {
        // Only sm and lg have overrides; md does not
        const comp = {
            component: 'Stack',
            gap: 4,
            responsive: {
                sm: { gap: 8 },
                lg: { gap: 16 },
                // md deliberately absent
            },
        };
        const result = resolveResponsiveProps(comp, 'lg', breakpoints);
        expect(result.gap).toBe(16); // lg wins
    });

    it('merges breakpoints in ascending minWidth order, not definition order', () => {
        // Breakpoints defined out of order — should still cascade by minWidth
        const bps = { lg: 1024, sm: 576, md: 768 };
        const comp = {
            component: 'Stack',
            gap: 0,
            responsive: {
                lg: { gap: 16 },
                sm: { gap: 8 },
                md: { gap: 12 },
            },
        };
        const result = resolveResponsiveProps(comp, 'lg', bps);
        // sm (576) → md (768) → lg (1024): lg is last, so gap=16
        expect(result.gap).toBe(16);
    });

    it('does not apply breakpoints whose minWidth exceeds active breakpoint', () => {
        const comp = {
            component: 'Stack',
            gap: 4,
            responsive: {
                sm: { gap: 8 },
                md: { gap: 12 },
                lg: { gap: 16 },
            },
        };
        // Active is md (768) — lg (1024) must NOT apply
        const result = resolveResponsiveProps(comp, 'md', breakpoints);
        expect(result.gap).toBe(12); // md wins, not lg
    });

    it('returns comp unchanged when no responsive map even with breakpoints', () => {
        const comp = { component: 'Stack', gap: 4 };
        expect(resolveResponsiveProps(comp, 'md', breakpoints)).toBe(comp);
    });

    it('returns comp unchanged when activeBreakpoint is null even with breakpoints', () => {
        const comp = { component: 'Stack', responsive: { md: { gap: 8 } } };
        expect(resolveResponsiveProps(comp, null, breakpoints)).toBe(comp);
    });
});

// ── String (media-query) breakpoints — fall back to single-breakpoint ─

describe('resolveResponsiveProps — string media query breakpoints', () => {
    it('falls back to single-breakpoint merge when breakpoints are strings (desktop: no override → base)', () => {
        const breakpoints = {
            mobile: '(max-width: 600px)',
            tablet: '(max-width: 900px)',
            desktop: '(min-width: 901px)',
        };
        const comp = {
            component: 'Grid',
            columns: 4,
            responsive: {
                mobile: { columns: 1 },
                tablet: { columns: 2 },
            },
        };
        // desktop has no responsive override → must return base columns=4, not cascade into mobile/tablet
        const result = resolveResponsiveProps(comp, 'desktop', breakpoints as any);
        expect(result.columns).toBe(4);
    });

    it('applies single-breakpoint override at tablet with string breakpoints', () => {
        const breakpoints = {
            mobile: '(max-width: 600px)',
            tablet: '(max-width: 900px)',
            desktop: '(min-width: 901px)',
        };
        const comp = {
            component: 'Grid',
            columns: 4,
            responsive: {
                mobile: { columns: 1 },
                tablet: { columns: 2 },
            },
        };
        const result = resolveResponsiveProps(comp, 'tablet', breakpoints as any);
        expect(result.columns).toBe(2);
    });
});

// ── planner integration: cumulative cascade via ctx.componentDocument ─

describe('resolveResponsiveProps — integration with planner context', () => {
    it('does not clobber responsive key on the merged result', () => {
        const breakpoints = { sm: 576, md: 768 };
        const comp = {
            component: 'Stack',
            gap: 4,
            responsive: { sm: { gap: 8 }, md: { gap: 12 } },
        };
        const result = resolveResponsiveProps(comp, 'md', breakpoints);
        // responsive key still present on the merged object (spread preserves it)
        expect(result.responsive).toBeDefined();
    });

    it('handles null breakpoints argument (same as undefined)', () => {
        const comp = {
            component: 'Columns',
            widths: ['3fr', '1fr'],
            responsive: { sm: { widths: ['1fr'] } },
        };
        const result = resolveResponsiveProps(comp, 'sm', null);
        expect(result.widths).toEqual(['1fr']);
    });
});
