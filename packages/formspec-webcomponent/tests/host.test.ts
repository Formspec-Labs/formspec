/** @filedesc The host entry: pinned Definition, Theme and Locale in, a drawn <formspec-render> out, failure reported on <html>. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { HOST_CONFIG_ID, HOST_STATE_ATTRIBUTE, HOST_WASM_ID, bootHost, mountHost } from '../src/host';

const wasmBytes = readFileSync(createRequire(import.meta.url).resolve('@formspec-org/engine/wasm-runtime'));

const definition = {
    $formspec: '1.0', url: 'urn:test:host', version: '1.0.0', status: 'draft', title: 'Host',
    items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
} as never;
const french = {
    $formspecLocale: '2.0', version: '1.0.0', locale: 'fr',
    target: { kind: 'definition', url: 'urn:test:host' }, strings: { 'name.label': 'Nom' },
} as never;

describe('mountHost', () => {
    it('draws the form in the pinned Locale and sets the language', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const el = await mountHost({ definition, locales: [french], locale: 'fr' }, { wasmBytes }, container);
        expect(el.querySelector('[data-name="name"] label')?.textContent).toContain('Nom');
        expect(el.getAttribute('lang')).toBe('fr');
    });

    it('shows the Definition\'s own wording when no Locale is chosen', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const el = await mountHost({ definition, locales: [french] }, { wasmBytes }, container);
        expect(el.querySelector('[data-name="name"] label')?.textContent).toContain('Name');
    });

    it('rejects when nothing is drawn within the time allowed', async () => {
        const empty = { ...(definition as object), items: [] } as never;
        await expect(mountHost({ definition: empty }, { wasmBytes }, document.body, 100)).rejects.toThrow(/not drawn within 100 ms/);
    });
});

describe('bootHost', () => {
    const pageWith = (config: unknown) => {
        const doc = document.implementation.createHTMLDocument('host');
        const script = (id: string, text: string) => { const s = doc.createElement('script'); s.type = 'application/json'; s.id = id; s.textContent = text; doc.body.appendChild(s); };
        if (config !== undefined) script(HOST_CONFIG_ID, JSON.stringify(config));
        script(HOST_WASM_ID, Buffer.from(wasmBytes).toString('base64'));
        return doc;
    };

    it('marks <html> error with the reason when the page has no config', async () => {
        const doc = pageWith(undefined);
        await bootHost(doc);
        expect(doc.documentElement.getAttribute(HOST_STATE_ATTRIBUTE)).toBe('error');
        expect((window as any).__formspecHost.error).toBeTruthy();
    });
});
