/** @filedesc The host entry: pinned Definition, Theme and Locale in, a drawn <formspec-render> out, failure reported on <html>. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { HOST_CONFIG_ID, HOST_STATE_ATTRIBUTE, HOST_WASM_ID, bootHost, freezeControls, mountHost } from '../src/host';

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

    it('draws a form whose only content is an empty repeat', async () => {
        const repeat = { ...(definition as object), items: [{ key: 'people', type: 'group', label: 'People', repeatable: true, children: [{ key: 'n', type: 'field', dataType: 'string', label: 'N' }] }] } as never;
        const el = await mountHost({ definition: repeat }, { wasmBytes }, document.body, 2000);
        expect(el.querySelector('[data-formspec-form]')).not.toBeNull();
    });

    it('refuses a Theme that names a render adapter the host does not have', async () => {
        const theme = { $formspecTheme: '1.0', url: 'urn:test:t', version: '1.0.0', tokens: {}, adapter: 'uswds' } as never;
        await expect(mountHost({ definition, theme }, { wasmBytes })).rejects.toThrow(/adapter 'uswds'.*only: default/);
    });

    it('forwards documents.component, suppresses .formspec-required on readonly fields, and localizes fileUpload dropzone', async () => {
        const richDef = {
            $formspec: '1.0',
            url: 'urn:test:rich',
            version: '1.0.0',
            status: 'draft',
            title: 'Rich',
            items: [
                { key: 'refCode', type: 'field', dataType: 'string', label: 'Reference code', required: true, readonly: true },
                { key: 'photo', type: 'field', dataType: 'file', label: 'Photo', presentation: { widgetHint: 'FileUpload' } },
            ],
        } as never;
        const comp = {
            $formspecComponent: '1.0',
            url: 'urn:test:rich:comp',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:rich', version: '1.0.0' },
            tree: {
                component: 'Stack',
                children: [
                    {
                        component: 'Section',
                        title: 'Section One',
                        children: [
                            { component: 'TextInput', bind: 'refCode' },
                            { component: 'FileUpload', bind: 'photo' },
                        ],
                    },
                ],
            },
        } as never;
        const esLocale = {
            $formspecLocale: '2.0',
            version: '1.0.0',
            locale: 'es-US',
            target: { kind: 'definition', url: 'urn:test:rich' },
            strings: {
                '$ui.fileUpload.dropzone': 'Arrastre un archivo aquí',
                '$ui.fileUpload.browse': 'Subir archivo',
            },
        } as never;
        const container = document.createElement('div');
        document.body.appendChild(container);
        const el = await mountHost(
            { definition: richDef, component: comp, locales: [esLocale], locale: 'es-US' },
            { wasmBytes },
            container,
        );
        expect(el.componentDocument).toEqual(comp);
        expect(el.textContent).toContain('Section One');
        const readonlyField = el.querySelector('[data-name="refCode"]');
        expect(readonlyField?.classList.contains('formspec-field--readonly')).toBe(true);
        expect(readonlyField?.querySelectorAll('.formspec-required').length).toBe(0);
        expect(el.querySelector('.formspec-file-drop-label')?.textContent).toBe('Arrastre un archivo aquí');
        expect(el.querySelector('.formspec-file-browse-btn')?.textContent).toBe('Subir archivo');
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

describe('print mode', () => {
    it('keeps every answer visible and makes none of them editable', () => {
        const root = document.createElement('div');
        root.innerHTML = '<input type="text" value="Ada"><textarea>note</textarea><input type="checkbox" checked><select><option>a</option></select><input type="file">';
        freezeControls(root);
        const [text, area, check, select, file] = Array.from(root.querySelectorAll('input, textarea, select')) as HTMLInputElement[];
        expect([text.readOnly, area.readOnly]).toEqual([true, true]);
        expect(text.getAttribute('aria-readonly')).toBe('true');
        expect([check.disabled, select.disabled, file.disabled]).toEqual([true, true, true]);
        expect(check.checked).toBe(true);
    });
});
