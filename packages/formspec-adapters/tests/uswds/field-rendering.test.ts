/** @filedesc Integration: USWDS field adapters on the real <formspec-render> + engine path. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { FormspecRender, globalRegistry } from '@formspec-org/webcomponent';
import { uswdsAdapter } from '../../src/uswds/index';

beforeAll(async () => {
    await initFormspecEngine();
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
    globalRegistry.registerAdapter(uswdsAdapter);
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((e) => e.remove());
    globalRegistry.setAdapter('default');
});

function renderForm(
    items: any[],
    options: { binds?: any[]; theme?: any; locale?: any } = {},
): any {
    globalRegistry.setAdapter('uswds');
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    if (options.locale) {
        el.localeDocuments = [options.locale];
        el.locale = options.locale.locale;
    }
    if (options.theme) el.themeDocument = options.theme;
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:uswds-fields',
        version: '1.0.0',
        title: 'USWDS fields',
        items,
        ...(options.binds ? { binds: options.binds } : {}),
    };
    el.render();
    return el;
}

describe('USWDS field text — hints and descriptions', () => {
    it('renders the Locale hint and description instead of the raw item strings', () => {
        const el = renderForm(
            [{ key: 'name', type: 'field', dataType: 'string', label: 'Name', hint: 'raw hint', description: 'raw description' }],
            {
                locale: {
                    $formspecLocale: '2.0',
                    locale: 'fr',
                    version: '1.0.0',
                    target: { kind: 'definition', url: 'urn:test:uswds-fields' },
                    strings: { 'name.hint': 'Indice traduit', 'name.description': 'Description traduite' },
                },
            },
        );
        expect(el.querySelector('#field-name-hint')?.textContent).toBe('Indice traduit');
        expect(el.querySelector('#field-name-desc')?.textContent).toBe('Description traduite');
    });

    it('interpolates {{}} in hints and keeps them current as values change', () => {
        const el = renderForm([
            { key: 'limit', type: 'field', dataType: 'integer', label: 'Limit' },
            { key: 'story', type: 'field', dataType: 'string', label: 'Story', hint: 'Use at most {{$limit}} words.' },
        ]);
        el.getEngine().setValue('limit', 5);
        expect(el.querySelector('#field-story-hint')?.textContent).toBe('Use at most 5 words.');
        el.getEngine().setValue('limit', 12);
        expect(el.querySelector('#field-story-hint')?.textContent).toBe('Use at most 12 words.');
    });
});
