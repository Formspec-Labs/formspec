/** @filedesc ADR 0064 decision 1: deriveAdapter makes a variant adapter one line — same components, new name/stylesheets/vocabulary. */
import { describe, it, expect } from 'vitest';
import { deriveAdapter } from '../../src/adapters/derive';
import type { RenderAdapter } from '../../src/adapters/types';

describe('deriveAdapter', () => {
    const renderTextInput = () => {};
    const renderSelect = () => {};
    const base: RenderAdapter = {
        name: 'uswds',
        stylesheets: ['https://cdn.example.org/uswds-base.css'],
        classVocabulary: new Set(['usa-input', 'usa-legend']),
        components: { TextInput: renderTextInput, Select: renderSelect },
    };

    it('names and re-skins a variant: new name, new stylesheet, new vocabulary', () => {
        const variant = deriveAdapter(base, {
            name: 'uswds-nj',
            stylesheets: ['https://cdn.example.org/uswds-nj.css'],
            classVocabulary: new Set(['usa-input', 'usa-legend', 'nj-callout']),
        });
        expect(variant.name).toBe('uswds-nj');
        expect(variant.stylesheets).toEqual(['https://cdn.example.org/uswds-nj.css']);
        expect(variant.classVocabulary).toEqual(new Set(['usa-input', 'usa-legend', 'nj-callout']));
        // The base is untouched — deriveAdapter never mutates its input.
        expect(base.name).toBe('uswds');
        expect(base.stylesheets).toEqual(['https://cdn.example.org/uswds-base.css']);
    });

    it('accepts a StylesheetLayer entry (ADR 0063 D-4) alongside a plain string', () => {
        const variant = deriveAdapter(base, {
            name: 'uswds-nj',
            stylesheets: [
                { href: 'https://cdn.example.org/uswds-nj-base.css', presentWhen: { className: 'usa-sr-only', property: 'position', value: 'absolute' } },
                'https://cdn.example.org/uswds-formspec.css',
            ],
        });
        expect(variant.stylesheets).toEqual([
            { href: 'https://cdn.example.org/uswds-nj-base.css', presentWhen: { className: 'usa-sr-only', property: 'position', value: 'absolute' } },
            'https://cdn.example.org/uswds-formspec.css',
        ]);
    });

    it('shares the same component render functions — a variant is a skin, not a fork', () => {
        const variant = deriveAdapter(base, { name: 'uswds-nj', stylesheets: ['https://cdn.example.org/uswds-nj.css'] });
        expect(variant.components.TextInput).toBe(renderTextInput);
        expect(variant.components.Select).toBe(renderSelect);
    });

    it('classVocabulary stays optional — a variant can decline to declare one', () => {
        const variant = deriveAdapter(base, { name: 'uswds-nj', stylesheets: ['https://cdn.example.org/uswds-nj.css'] });
        expect(variant.classVocabulary).toBeUndefined();
    });
});
