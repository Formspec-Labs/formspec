import { describe, expect, it } from 'vitest';
import type { Issuer } from '@formspec-org/engine/render';
import { selectLogoVariant } from '../../src/issuer/logoVariant';

const FULL: Issuer = {
    $formspecIssuer: '1.0',
    url: 'x',
    version: '1.0.0',
    name: 'X',
    kind: 'organization',
    logo: {
        primary: { url: 'p', aspectRatio: '1:1', preferredBackground: 'light' },
        wordmark: { url: 'w', aspectRatio: '4:1', preferredBackground: 'any' },
        monochrome: { url: 'm', aspectRatio: '1:1', preferredBackground: 'any' },
    },
};

describe('selectLogoVariant', () => {
    it('light and wide picks primary', () => {
        expect(selectLogoVariant(FULL, { mode: 'light', headerWidth: 'wide' })?.url).toBe('p');
    });

    it('dark and high-contrast pick monochrome when present', () => {
        expect(selectLogoVariant(FULL, { mode: 'dark', headerWidth: 'wide' })?.url).toBe('m');
        expect(selectLogoVariant(FULL, { mode: 'high-contrast', headerWidth: 'wide' })?.url).toBe('m');
    });

    it('narrow light header picks wordmark when present', () => {
        expect(selectLogoVariant(FULL, { mode: 'light', headerWidth: 'narrow' })?.url).toBe('w');
    });

    it('falls back through variants when preferred is missing', () => {
        const minimal: Issuer = { ...FULL, logo: { primary: { url: 'p' } } };
        expect(selectLogoVariant(minimal, { mode: 'dark', headerWidth: 'narrow' })?.url).toBe('p');
    });

    it('returns undefined when no logo is set', () => {
        expect(
            selectLogoVariant({ ...FULL, logo: undefined }, { mode: 'light', headerWidth: 'wide' }),
        ).toBeUndefined();
    });
});
