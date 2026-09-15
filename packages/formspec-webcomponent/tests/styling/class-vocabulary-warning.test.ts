/** @filedesc ADR 0064 decision 2: the renderer warns once per (adapter name, class) on a Theme cssClass an adapter's declared vocabulary does not contain — theme-spec §2.4 escape-hatch ladder. */
import { describe, it, expect, vi } from 'vitest';
import { applyCssClass } from '../../src/styling/classes';
import type { StylingHost } from '../../src/styling/index';

function mockHost(overrides: Partial<StylingHost> = {}): StylingHost {
    return {
        _componentDocument: null,
        _definition: null,
        _themeDocument: null,
        stylesheetHrefs: [],
        stylesheetRoot: null,
        getRootNode: () => document,
        resolvedAdapterName: 'uswds-test',
        adapterStylesheets: () => [],
        adapterClassVocabulary: () => new Set(['usa-input', 'usa-legend']),
        getEffectiveTheme: () => ({ $formspecTheme: '1.0', version: '1.0.0', targetDefinition: { url: 'urn:test' } }) as any,
        findItemByKey: () => null,
        ...overrides,
    };
}

describe('applyCssClass warns on an unknown Theme cssClass', () => {
    it('warns once, naming the class, the item path, and the adapter', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const host = mockHost();
        const el = document.createElement('div');

        applyCssClass(host, el, { cssClass: 'nj-callout' }, 'applicant.orgName');

        expect(warn).toHaveBeenCalledTimes(1);
        const [message] = warn.mock.calls[0];
        expect(message).toContain('nj-callout');
        expect(message).toContain('applicant.orgName');
        expect(message).toContain('uswds-test');
        expect(el.classList.contains('nj-callout')).toBe(true); // still applied — a warning, not a refusal.
        warn.mockRestore();
    });

    it('does not warn for a class the vocabulary declares', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const host = mockHost();
        const el = document.createElement('div');

        applyCssClass(host, el, { cssClass: 'usa-input' }, 'applicant.orgName');

        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('does not warn when the resolved adapter declares no vocabulary (e.g. the default adapter)', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const host = mockHost({ resolvedAdapterName: 'default', adapterClassVocabulary: () => undefined });
        const el = document.createElement('div');

        applyCssClass(host, el, { cssClass: 'anything-goes' }, 'applicant.orgName');

        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('warns once per (adapter name, class) — not once per call', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const host = mockHost();
        const el = document.createElement('div');

        applyCssClass(host, el, { cssClass: 'repeat-me' }, 'field.one');
        applyCssClass(host, el, { cssClass: 'repeat-me' }, 'field.two');

        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('warns again for the same class under a different adapter name', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const elA = document.createElement('div');
        applyCssClass(mockHost({ resolvedAdapterName: 'uswds-distinct-a' }), elA, { cssClass: 'distinct-class' }, 'x');
        const elB = document.createElement('div');
        applyCssClass(mockHost({ resolvedAdapterName: 'uswds-distinct-b' }), elB, { cssClass: 'distinct-class' }, 'x');

        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});
