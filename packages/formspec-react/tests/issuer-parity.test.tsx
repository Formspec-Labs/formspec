/** @filedesc Issuer chrome and host override parity with the web component renderer. */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { initFormspecEngine } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';

beforeAll(async () => {
    await initFormspecEngine();
});

afterEach(() => {
    window.history.pushState({}, '', '/');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const testDefinition = {
    $formspec: '1.0',
    url: 'https://test.example/form',
    version: '1.0.0',
    status: 'active',
    title: 'Test Form',
    description: 'A test form.',
    name: 'test',
    items: [
        {
            key: 'name',
            type: 'field',
            dataType: 'string',
            label: 'Full Name',
        },
    ],
};

const DEFINITION_ISSUER = {
    $formspecIssuer: '1.0',
    url: 'https://definition.example/issuer.json',
    version: '1.0.0',
    name: 'Definition Org',
    kind: 'organization',
} as const;

const HOST_ISSUER = {
    $formspecIssuer: '1.0',
    url: 'https://host.example/issuer.json',
    version: '1.0.0',
    name: 'Host Org',
    kind: 'organization',
} as const;

const QUERY_ISSUER = {
    $formspecIssuer: '1.0',
    url: 'https://allowed.example/issuer.json',
    version: '1.0.0',
    name: 'Query Org',
    kind: 'organization',
} as const;

const issuerDefinition = {
    ...testDefinition,
    issuer: DEFINITION_ISSUER,
};

function renderInto(element: React.ReactElement): HTMLElement {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => { root.render(element); });
    return container;
}

async function flushAsyncRender(): Promise<void> {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
}

async function expectTextAfterAsyncRender(
    container: HTMLElement,
    selector: string,
    expected: string,
): Promise<void> {
    for (let i = 0; i < 10; i += 1) {
        await flushAsyncRender();
        if (container.querySelector(selector)?.textContent === expected) {
            expect(container.querySelector(selector)?.textContent).toBe(expected);
            return;
        }
    }
    expect(container.querySelector(selector)?.textContent).toBe(expected);
}

describe('FormspecForm Issuer parity', () => {
    it('renders Definition Issuer chrome', async () => {
        const container = renderInto(
            <FormspecForm definition={issuerDefinition} />
        );

        await expectTextAfterAsyncRender(container, '.fs-issuer-name', 'Definition Org');
        expect(container.querySelector('.fs-issuer-chrome')?.getAttribute('data-source')).toBe('definition');
    });

    it('allowlisted query override replaces chrome and shows indicator', async () => {
        window.history.pushState(
            {},
            '',
            '/form?_issuer=' + encodeURIComponent('https://allowed.example/issuer.json'),
        );
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(QUERY_ISSUER), { status: 200 })));

        const container = renderInto(
            <FormspecForm
                definition={issuerDefinition}
                issuerAllowedOrigins={['https://allowed.example']}
            />
        );

        await expectTextAfterAsyncRender(container, '.fs-issuer-name', 'Query Org');
        expect(container.querySelector('.fs-issuer-chrome')?.getAttribute('data-source')).toBe('host-query');
        expect(container.querySelector('.fs-issuer-query-indicator')?.textContent)
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

        const container = renderInto(
            <FormspecForm
                definition={issuerDefinition}
                issuerAllowedOrigins={['https://allowed.example']}
                issuerOverride={{ kind: 'inline', issuer: HOST_ISSUER }}
            />
        );

        await expectTextAfterAsyncRender(container, '.fs-issuer-name', 'Host Org');
        expect(container.querySelector('.fs-issuer-chrome')?.getAttribute('data-source')).toBe('host-embed');
        expect(container.querySelector('.fs-issuer-query-indicator')).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('ignores query override without an allowlist', async () => {
        window.history.pushState(
            {},
            '',
            '/form?_issuer=' + encodeURIComponent('https://allowed.example/issuer.json'),
        );
        const fetch = vi.fn(async () => new Response(JSON.stringify(QUERY_ISSUER), { status: 200 }));
        vi.stubGlobal('fetch', fetch);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const container = renderInto(
            <FormspecForm definition={issuerDefinition} />
        );

        await expectTextAfterAsyncRender(container, '.fs-issuer-name', 'Definition Org');
        expect(container.querySelector('.fs-issuer-chrome')?.getAttribute('data-source')).toBe('definition');
        expect(fetch).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(
            'Formspec Issuer query override ignored: no issuer allowlist configured',
        );
    });
});
