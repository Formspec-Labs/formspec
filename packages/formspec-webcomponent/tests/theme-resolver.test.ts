import { describe, it, expect, vi } from 'vitest';
import { resolvePresentation, resolveWidget } from '@formspec-org/layout';
import type { ThemeDocument, PresentationBlock, ItemDescriptor, Tier1Hints } from '@formspec-org/layout';
import { minimalTheme } from './helpers/engine-fixtures';

const field = (key = 'f1', dataType?: string): ItemDescriptor => ({
    key,
    type: 'field',
    ...(dataType ? { dataType: dataType as any } : {}),
});

const group = (key = 'g1'): ItemDescriptor => ({ key, type: 'group' });
const display = (key = 'd1'): ItemDescriptor => ({ key, type: 'display' });

describe('resolvePresentation', () => {
    it('returns {} when theme is null and no tier1 hints', () => {
        expect(resolvePresentation(null, field())).toEqual({});
    });

    it('returns tier1 formPresentation labelPosition when theme is null', () => {
        const tier1: Tier1Hints = { formPresentation: { labelPosition: 'start' } };
        const result = resolvePresentation(null, field(), tier1);
        expect(result.labelPosition).toBe('start');
    });

    it('returns tier1 itemPresentation widgetHint as widget', () => {
        const tier1: Tier1Hints = { itemPresentation: { widgetHint: 'Slider' } };
        const result = resolvePresentation(null, field(), tier1);
        expect(result.widget).toBe('Slider');
    });

    it('applies theme defaults over tier1 form hints', () => {
        const theme = minimalTheme({
            defaults: { labelPosition: 'hidden', widget: 'TextInput' },
        });
        const tier1: Tier1Hints = { formPresentation: { labelPosition: 'start' } };
        const result = resolvePresentation(theme, field(), tier1);
        // Theme defaults (level 3) override tier1 form (level 1)
        expect(result.labelPosition).toBe('hidden');
        expect(result.widget).toBe('TextInput');
    });

    it('applies matching type selector', () => {
        const theme = minimalTheme({
            selectors: [
                { match: { type: 'group' }, apply: { widget: 'Panel' } },
            ],
        });
        expect(resolvePresentation(theme, group()).widget).toBe('Panel');
        expect(resolvePresentation(theme, field()).widget).toBeUndefined();
    });

    it('applies matching dataType selector', () => {
        const theme = minimalTheme({
            selectors: [
                { match: { dataType: 'boolean' }, apply: { widget: 'Toggle' } },
            ],
        });
        expect(resolvePresentation(theme, field('f', 'boolean')).widget).toBe('Toggle');
        expect(resolvePresentation(theme, field('f', 'string')).widget).toBeUndefined();
    });

    it('applies conjunction selector (type AND dataType)', () => {
        const theme = minimalTheme({
            selectors: [
                { match: { type: 'field', dataType: 'integer' }, apply: { widget: 'Slider' } },
            ],
        });
        expect(resolvePresentation(theme, field('f', 'integer')).widget).toBe('Slider');
        // Wrong type
        expect(resolvePresentation(theme, group()).widget).toBeUndefined();
    });

    it('rejects empty match objects', () => {
        const theme = minimalTheme({
            selectors: [
                { match: {} as any, apply: { widget: 'Oops' } },
            ],
        });
        expect(resolvePresentation(theme, field()).widget).toBeUndefined();
    });

    it('later selectors override earlier for scalars (doc order)', () => {
        const theme = minimalTheme({
            selectors: [
                { match: { type: 'field' }, apply: { widget: 'First', labelPosition: 'top' } },
                { match: { type: 'field' }, apply: { widget: 'Second' } },
            ],
        });
        const result = resolvePresentation(theme, field());
        expect(result.widget).toBe('Second');
        expect(result.labelPosition).toBe('top'); // not overridden by second
    });

    it('items[key] overrides selectors and defaults', () => {
        const theme = minimalTheme({
            defaults: { widget: 'DefaultWidget' },
            selectors: [
                { match: { type: 'field' }, apply: { widget: 'SelectorWidget' } },
            ],
            items: { f1: { widget: 'ItemWidget' } },
        });
        expect(resolvePresentation(theme, field('f1')).widget).toBe('ItemWidget');
    });

    // ── cssClass union semantics ─────────────────────────────

    it('unions cssClass across cascade levels (no replacement)', () => {
        const theme = minimalTheme({
            defaults: { cssClass: ['base'] },
            selectors: [
                { match: { type: 'field' }, apply: { cssClass: ['sel-class'] } },
            ],
            items: { f1: { cssClass: ['item-class'] } },
        });
        const result = resolvePresentation(theme, field('f1'));
        const classes = result.cssClass as string[];
        expect(classes).toContain('base');
        expect(classes).toContain('sel-class');
        expect(classes).toContain('item-class');
    });

    it('deduplicates cssClass entries', () => {
        const theme = minimalTheme({
            defaults: { cssClass: ['shared'] },
            items: { f1: { cssClass: ['shared', 'unique'] } },
        });
        const result = resolvePresentation(theme, field('f1'));
        const classes = result.cssClass as string[];
        expect(classes.filter(c => c === 'shared')).toHaveLength(1);
        expect(classes).toContain('unique');
    });

    it('normalizes whitespace in cssClass strings', () => {
        const theme = minimalTheme({
            defaults: { cssClass: '  foo   bar  ' },
        });
        const result = resolvePresentation(theme, field());
        expect(result.cssClass).toEqual(['foo', 'bar']);
    });

    it('handles mixed string/array cssClass', () => {
        const theme = minimalTheme({
            defaults: { cssClass: 'a b' },
            items: { f1: { cssClass: ['c', 'd'] } },
        });
        const result = resolvePresentation(theme, field('f1'));
        expect(result.cssClass).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd']));
    });

    // ── Shallow merge for objects ────────────────────────────

    it('shallow-merges style across levels', () => {
        const theme = minimalTheme({
            defaults: { style: { color: 'red', fontSize: '14px' } },
            items: { f1: { style: { color: 'blue' } } },
        });
        const result = resolvePresentation(theme, field('f1'));
        expect(result.style).toEqual({ color: 'blue', fontSize: '14px' });
    });

    it('shallow-merges widgetConfig', () => {
        const theme = minimalTheme({
            defaults: { widgetConfig: { rows: 3 } },
            items: { f1: { widgetConfig: { placeholder: 'hi' } } },
        });
        const result = resolvePresentation(theme, field('f1'));
        expect(result.widgetConfig).toEqual({ rows: 3, placeholder: 'hi' });
    });

    it('merges widgetConfig x-classes maps across cascade levels', () => {
        const theme = minimalTheme({
            defaults: {
                widgetConfig: {
                    'x-classes': { root: 'base-root', control: 'base-control' },
                },
            },
            selectors: [
                {
                    match: { type: 'field' },
                    apply: {
                        widgetConfig: {
                            'x-classes': { label: 'sel-label' },
                        },
                    },
                },
            ],
            items: {
                f1: {
                    widgetConfig: {
                        'x-classes': { control: 'item-control' },
                    },
                },
            },
        });
        const result = resolvePresentation(theme, field('f1'));
        expect(result.widgetConfig).toEqual({
            'x-classes': {
                root: 'base-root',
                label: 'sel-label',
                control: 'item-control',
            },
        });
    });

    it('shallow-merges accessibility', () => {
        const theme = minimalTheme({
            defaults: { accessibility: { liveRegion: 'off' } },
            items: { f1: { accessibility: { role: 'textbox' } } },
        });
        const result = resolvePresentation(theme, field('f1'));
        expect(result.accessibility).toEqual({ liveRegion: 'off', role: 'textbox' });
    });

    // ── Scalar replacement ───────────────────────────────────

    it('replaces fallback outright (not merged)', () => {
        const theme = minimalTheme({
            defaults: { fallback: ['A', 'B'] },
            items: { f1: { fallback: ['C'] } },
        });
        const result = resolvePresentation(theme, field('f1'));
        expect(result.fallback).toEqual(['C']);
    });
});

describe('resolveWidget', () => {
    const available = (type: string) => ['TextInput', 'Select', 'Toggle'].includes(type);

    it('returns null when no widget specified', () => {
        expect(resolveWidget({}, available)).toBeNull();
    });

    it('returns preferred widget when available', () => {
        expect(resolveWidget({ widget: 'TextInput' }, available)).toBe('TextInput');
    });

    it('falls back when preferred unavailable', () => {
        const pres: PresentationBlock = { widget: 'Slider', fallback: ['Toggle'] };
        expect(resolveWidget(pres, available)).toBe('Toggle');
    });

    it('tries fallbacks in order', () => {
        const pres: PresentationBlock = { widget: 'X', fallback: ['Y', 'Select', 'Toggle'] };
        expect(resolveWidget(pres, available)).toBe('Select');
    });

    it('returns null and warns when all unavailable', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const pres: PresentationBlock = { widget: 'X', fallback: ['Y', 'Z'] };
        expect(resolveWidget(pres, available)).toBeNull();
        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0][0]).toContain('X');
        warn.mockRestore();
    });
});
