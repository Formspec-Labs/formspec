import { describe, expect, it } from 'vitest';
import type { Issuer, ResolvedIssuer } from '@formspec-org/engine/render';
import { IssuerChrome } from '../../src/issuer/IssuerChrome';

const ISSUER: Issuer = {
    $formspecIssuer: '1.0',
    url: 'https://x/i.json',
    version: '1.0.0',
    name: { en: 'Springfield Health', es: 'Salud Springfield' },
    kind: 'department',
    organizationName: 'City of Springfield',
    contactPoint: { contactType: 'customer support', email: 'h@s.gov' },
    logo: { primary: { url: 'logo.svg', altText: 'X' } },
    defaultLanguage: 'en',
};

const RESOLVED: ResolvedIssuer = {
    primary: ISSUER,
    chain: [ISSUER],
    source: 'definition',
};

describe('IssuerChrome', () => {
    it('renders name in requested language', () => {
        const chrome = IssuerChrome({ resolved: RESOLVED, locale: 'es' });

        expect(chrome?.querySelector('.fs-issuer-name')?.textContent).toBe('Salud Springfield');
    });

    it('renders breadcrumb of parent organizationName', () => {
        const chrome = IssuerChrome({ resolved: RESOLVED, locale: 'en' });

        expect(chrome?.querySelector('.fs-issuer-org-breadcrumb')?.textContent)
            .toContain('City of Springfield');
    });

    it('renders contact email for customer support contactPoint', () => {
        const chrome = IssuerChrome({ resolved: RESOLVED, locale: 'en' });

        expect(chrome?.querySelector('.fs-issuer-support')?.textContent).toBe('h@s.gov');
        expect(chrome?.querySelector('.fs-issuer-support')?.getAttribute('href')).toBe('mailto:h@s.gov');
    });

    it('shows visible indicator when source is host-query', () => {
        const chrome = IssuerChrome({
            resolved: { ...RESOLVED, source: 'host-query' },
            locale: 'en',
            hostOrigin: 'https://embed',
        });

        expect(chrome?.querySelector('.fs-issuer-query-indicator')?.textContent)
            .toBe('Branding provided by https://embed');
    });

    it('does not show indicator when source is host-embed', () => {
        const chrome = IssuerChrome({
            resolved: { ...RESOLVED, source: 'host-embed' },
            locale: 'en',
            hostOrigin: 'https://embed',
        });

        expect(chrome?.querySelector('.fs-issuer-query-indicator')).toBeNull();
    });

    it('renders unbranded null when source is unbranded', () => {
        const chrome = IssuerChrome({
            resolved: { ...RESOLVED, source: 'unbranded' },
            locale: 'en',
        });

        expect(chrome).toBeNull();
    });
});
