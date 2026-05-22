import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseQueryIssuerOverride } from '../../src/issuer/queryOverride';

describe('parseQueryIssuerOverride', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns undefined when no _issuer param', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(parseQueryIssuerOverride(new URL('https://app/form'), ['https://allowed'])).toBeUndefined();
        expect(warn).not.toHaveBeenCalled();
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
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const u = new URL(
            'https://app/form?_issuer='
                + encodeURIComponent('https://bad/issuer.json'),
        );
        expect(parseQueryIssuerOverride(u, ['https://allowed'])).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            'Formspec Issuer query override ignored: origin not allowlisted: https://bad',
        );
    });

    it('rejects when allowlist is empty', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const u = new URL('https://app/form?_issuer=https://allowed/i');
        expect(parseQueryIssuerOverride(u, [])).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            'Formspec Issuer query override ignored: no issuer allowlist configured',
        );
    });

    it('rejects malformed _issuer values', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const u = new URL('https://app/form?_issuer=not-a-url');
        expect(parseQueryIssuerOverride(u, ['https://allowed'])).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            'Formspec Issuer query override ignored: issuer URL is malformed',
        );
    });
});
