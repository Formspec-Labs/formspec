import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let FormspecRender: CustomElementConstructor;

const DEFINITION_ISSUER = {
    $formspecIssuer: '1.0',
    url: 'https://definition.example/issuer.json',
    version: '1.0.0',
    name: 'Definition Org',
    kind: 'organization',
} as const;

const HOST_ISSUER = {
    ...DEFINITION_ISSUER,
    url: 'https://host.example/issuer.json',
    version: '2.0.0',
    name: 'Host Org',
} as const;

const QUERY_ISSUER = {
    ...DEFINITION_ISSUER,
    url: 'https://allowed.example/issuer.json',
    version: '3.0.0',
    name: 'Query Org',
} as const;

const DEFINITION = {
    $formspec: '1.0',
    url: 'urn:test:issuer-webcomponent',
    version: '1.0.0',
    title: 'Issuer Test',
    items: [],
    issuer: DEFINITION_ISSUER,
};

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

describe('<formspec-render> Issuer integration', () => {
    let el: HTMLElement & {
        definition: typeof DEFINITION;
        issuerOverride?: unknown;
        issuerAllowedOrigins: string[];
        render(): void;
    };

    beforeEach(() => {
        window.history.pushState({}, '', '/');
        el = document.createElement('formspec-render') as typeof el;
        document.body.appendChild(el);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        el.remove();
        window.history.pushState({}, '', '/');
    });

    it('accepts an `issuer-override` JSON attribute', () => {
        el.setAttribute('issuer-override', JSON.stringify({
            kind: 'inline',
            issuer: HOST_ISSUER,
        }));

        expect(el.issuerOverride).toMatchObject({
            kind: 'inline',
            source: 'host-embed',
            issuer: HOST_ISSUER,
        });
    });

    it('accepts `issuerOverride` property', () => {
        el.issuerOverride = { kind: 'url', url: 'https://x/i.json' };

        expect(el.issuerOverride).toEqual({
            kind: 'url',
            url: 'https://x/i.json',
            source: 'host-embed',
        });
    });

    it('reads `issuer-allowed-origins` attribute as JSON array', () => {
        el.setAttribute('issuer-allowed-origins', '["https://allowed.example"]');

        expect(el.issuerAllowedOrigins).toEqual(['https://allowed.example']);
    });

    it('renders Definition Issuer chrome', async () => {
        el.definition = DEFINITION;
        await flushAsyncRender();

        expect(el.querySelector('.fs-issuer-name')?.textContent).toBe('Definition Org');
    });

    it('allowlisted query override replaces chrome and shows indicator', async () => {
        window.history.pushState(
            {},
            '',
            '/form?_issuer=' + encodeURIComponent('https://allowed.example/issuer.json'),
        );
        vi.stubGlobal('fetch', async () => new Response(JSON.stringify(QUERY_ISSUER), { status: 200 }));
        el.issuerAllowedOrigins = ['https://allowed.example'];

        el.definition = DEFINITION;
        await flushAsyncRender();

        expect(el.querySelector('.fs-issuer-name')?.textContent).toBe('Query Org');
        expect(el.querySelector('.fs-issuer-query-indicator')?.textContent)
            .toContain('Branding provided by');
    });

    it('embed override wins over allowlisted query override', async () => {
        window.history.pushState(
            {},
            '',
            '/form?_issuer=' + encodeURIComponent('https://allowed.example/issuer.json'),
        );
        const fetch = vi.fn(async () => new Response(JSON.stringify(QUERY_ISSUER), { status: 200 }));
        vi.stubGlobal('fetch', fetch);
        el.issuerAllowedOrigins = ['https://allowed.example'];
        el.issuerOverride = { kind: 'inline', issuer: HOST_ISSUER };

        el.definition = DEFINITION;
        await flushAsyncRender();

        expect(el.querySelector('.fs-issuer-name')?.textContent).toBe('Host Org');
        expect(el.querySelector('.fs-issuer-query-indicator')).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });
});

async function flushAsyncRender(): Promise<void> {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
}
