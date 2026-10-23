/** @filedesc Verifies explicit Light-DOM design and host-level CSS isolation per fs-z405. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
    document.body.querySelectorAll('.test-shadow-host').forEach((host: any) => {
        host.shadowRoot?.querySelectorAll('formspec-render').forEach((el: any) => el.remove());
        host.remove();
    });
});

describe('explicit Light-DOM architecture and CSS isolation (fs-z405)', () => {
    it('does not attach a decorative shadow root to formspec-render', () => {
        const el = document.createElement('formspec-render');
        document.body.appendChild(el);

        // Explicit light-DOM design: no internal shadowRoot
        expect(el.shadowRoot).toBeNull();
    });

    it('renders root container directly into light DOM children', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);

        el.definition = {
            id: 'test-def',
            schema: 'https://formspec.dev/v1',
            items: [
                { id: 'f1', type: 'text', label: 'Field 1' },
            ],
        };
        el.render();

        const container = el.querySelector('.formspec-container');
        expect(container).toBeTruthy();
        expect(container?.parentElement).toBe(el);
    });

    it('isolates stylesheets to host shadow root when mounted in shadow DOM', () => {
        const host = document.createElement('div');
        host.className = 'test-shadow-host';
        document.body.appendChild(host);

        const hostShadow = host.attachShadow({ mode: 'open' });
        const el = document.createElement('formspec-render') as any;
        hostShadow.appendChild(el);

        expect(el.shadowRoot).toBeNull();
        expect(el.getRootNode()).toBe(hostShadow);

        el.themeDocument = {
            $formspecTheme: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:adapter' },
        };

        // Stylesheets are linked into hostShadow, not leaking into document.head
        const hostShadowLinks = hostShadow.querySelectorAll('link[data-formspec-theme-href]');
        expect(hostShadowLinks.length).toBeGreaterThan(0);
        expect(document.head.querySelectorAll('link[data-formspec-theme-href]').length).toBe(0);
    });
});
