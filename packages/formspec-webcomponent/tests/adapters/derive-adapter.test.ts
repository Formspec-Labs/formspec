/** @filedesc ADR 0064 decision 1: deriveAdapter makes a variant adapter one line — same components, new name/stylesheets/vocabulary. */
import { describe, it, expect } from 'vitest';
import { deriveAdapter } from '../../src/adapters/derive';
import type { RenderAdapter, StylesheetLayer } from '../../src/adapters/types';

const sheet = (href: string): StylesheetLayer => ({ href, presentWhen: { className: 'usa-sr-only', property: 'position', value: 'absolute' } });

describe('deriveAdapter', () => {
    const renderTextInput = () => {};
    const renderSelect = () => {};
    const base: RenderAdapter = {
        name: 'uswds',
        stylesheets: [sheet('https://cdn.example.org/uswds-base.css')],
        classVocabulary: new Set(['usa-input', 'usa-legend']),
        components: { TextInput: renderTextInput, Select: renderSelect },
    };

    it('names and re-skins a variant: new name, new stylesheet, new vocabulary', () => {
        const variant = deriveAdapter(base, {
            name: 'uswds-nj',
            stylesheets: [sheet('https://cdn.example.org/uswds-nj.css')],
            classVocabulary: new Set(['usa-input', 'usa-legend', 'nj-callout']),
        });
        expect(variant.name).toBe('uswds-nj');
        expect(variant.stylesheets).toEqual([sheet('https://cdn.example.org/uswds-nj.css')]);
        expect(variant.classVocabulary).toEqual(new Set(['usa-input', 'usa-legend', 'nj-callout']));
        // The base is untouched — deriveAdapter never mutates its input.
        expect(base.name).toBe('uswds');
        expect(base.stylesheets).toEqual([sheet('https://cdn.example.org/uswds-base.css')]);
    });

    it('shares the same component render functions — a variant is a skin, not a fork', () => {
        const variant = deriveAdapter(base, { name: 'uswds-nj', stylesheets: [sheet('https://cdn.example.org/uswds-nj.css')] });
        expect(variant.components.TextInput).toBe(renderTextInput);
        expect(variant.components.Select).toBe(renderSelect);
    });

    it('classVocabulary stays optional — a variant can decline to declare one', () => {
        const variant = deriveAdapter(base, { name: 'uswds-nj', stylesheets: [sheet('https://cdn.example.org/uswds-nj.css')] });
        expect(variant.classVocabulary).toBeUndefined();
    });
});
