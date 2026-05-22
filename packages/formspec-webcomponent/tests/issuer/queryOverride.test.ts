import { describe, expect, it } from 'vitest';
import { parseQueryIssuerOverride } from '../../src/issuer/queryOverride';

describe('parseQueryIssuerOverride', () => {
    it('returns undefined when no _issuer param', () => {
        expect(parseQueryIssuerOverride(new URL('https://app/form'), ['https://allowed'])).toBeUndefined();
    });

    it('returns IssuerSource when origin allowlisted', () => {
        const u = new URL(
            'https://app/form?_issuer='
                + encodeURIComponent('https://allowed/issuer.json'),
        );
        const r = parseQueryIssuerOverride(u, ['https://allowed']);
        expect(r).toEqual({
            kind: 'url',
            url: 'https://allowed/issuer.json',
            source: 'host-query',
        });
    });

    it('rejects URL whose origin is not allowlisted', () => {
        const u = new URL(
            'https://app/form?_issuer='
                + encodeURIComponent('https://bad/issuer.json'),
        );
        expect(parseQueryIssuerOverride(u, ['https://allowed'])).toBeUndefined();
    });

    it('rejects when allowlist is empty', () => {
        const u = new URL('https://app/form?_issuer=https://allowed/i');
        expect(parseQueryIssuerOverride(u, [])).toBeUndefined();
    });

    it('rejects malformed _issuer values', () => {
        const u = new URL('https://app/form?_issuer=not-a-url');
        expect(parseQueryIssuerOverride(u, ['https://allowed'])).toBeUndefined();
    });
});
