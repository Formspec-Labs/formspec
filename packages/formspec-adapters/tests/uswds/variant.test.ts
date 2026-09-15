/** @filedesc uswdsVariant: an organization's USWDS in one call — its compiled sheet as the base layer, the shared rules layer, a merged vocabulary. */
import { describe, it, expect } from 'vitest';
import { uswdsAdapter, uswdsVariant } from '../../src/uswds/index';

const NJ_SHEET = 'https://nj.example.gov/assets/uswds-nj.css';

describe('uswdsVariant', () => {
    it('declares the variant sheet as the base layer, with the same USWDS presence probe', () => {
        const variant = uswdsVariant({ name: 'uswds-nj', stylesheet: NJ_SHEET });
        expect(variant.name).toBe('uswds-nj');
        expect(variant.stylesheets).toHaveLength(2);
        expect(variant.stylesheets![0]).toEqual({ href: NJ_SHEET, presentWhen: uswdsAdapter.stylesheets![0].presentWhen });
    });

    it("reuses the adapter's own rules layer unchanged — a variant recompiles only the design system", () => {
        const variant = uswdsVariant({ name: 'uswds-nj', stylesheet: NJ_SHEET });
        expect(variant.stylesheets![1]).toBe(uswdsAdapter.stylesheets![1]);
    });

    it('renders with the USWDS components — a skin, not a fork', () => {
        const variant = uswdsVariant({ name: 'uswds-nj', stylesheet: NJ_SHEET });
        expect(variant.components).toBe(uswdsAdapter.components);
    });

    it("merges the variant's class vocabulary with the adapter's, so the shared rules layer's classes stay known", () => {
        const variant = uswdsVariant({ name: 'uswds-nj', stylesheet: NJ_SHEET, classVocabulary: new Set(['nj-callout']) });
        expect(variant.classVocabulary!.has('nj-callout')).toBe(true);
        // Classes only the rules layer selects: a variant's own compile never carries them.
        expect(variant.classVocabulary!.has('formspec-submit')).toBe(true);
        expect(variant.classVocabulary!.has('formspec-uswds-divider')).toBe(true);
    });

    it('declares no vocabulary when the variant supplies none — its house classes are unknown to the check', () => {
        expect(uswdsVariant({ name: 'uswds-nj', stylesheet: NJ_SHEET }).classVocabulary).toBeUndefined();
    });
});
