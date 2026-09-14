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
    options: { binds?: any[]; theme?: any; locale?: any; componentTree?: any } = {},
): any {
    globalRegistry.setAdapter('uswds');
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    if (options.locale) {
        el.localeDocuments = [options.locale];
        el.locale = options.locale.locale;
    }
    if (options.theme) el.themeDocument = options.theme;
    if (options.componentTree) {
        el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:uswds-fields' },
            tree: options.componentTree,
        };
    }
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

describe('USWDS error messages — aria-describedby', () => {
    const requiredBind = (path: string) => ({ path, required: 'true' });
    const radioTheme = {
        $formspecTheme: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:uswds-fields' },
        selectors: [{ match: { dataType: 'choice' }, apply: { widget: 'RadioGroup' } }],
    };

    it('links the error message to the input while the error is shown', () => {
        const el = renderForm(
            [{ key: 'name', type: 'field', dataType: 'string', label: 'Name', hint: 'Legal name' }],
            { binds: [requiredBind('name')] },
        );
        const input = el.querySelector('#field-name') as HTMLInputElement;
        expect(input.getAttribute('aria-describedby')).toBe('field-name-hint');

        el.submit({ emitEvent: false });
        expect(el.querySelector('#field-name-error')?.textContent).not.toBe('');
        expect(input.getAttribute('aria-describedby')).toBe('field-name-hint field-name-error');

        el.getEngine().setValue('name', 'Ada');
        expect(input.getAttribute('aria-describedby')).toBe('field-name-hint');
    });

    it('links a radio group error to the fieldset, not the first radio', () => {
        const el = renderForm(
            [{
                key: 'able', type: 'field', dataType: 'choice', label: 'Able to work?',
                options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
            }],
            { binds: [requiredBind('able')], theme: radioTheme },
        );
        const fieldset = el.querySelector('fieldset[data-name="able"]') as HTMLElement;
        expect(fieldset).not.toBeNull();
        el.submit({ emitEvent: false });
        expect(fieldset.getAttribute('aria-describedby')).toBe('field-able-error');
        expect(el.querySelector('input[type="radio"]')?.getAttribute('aria-describedby')).toBeNull();
    });
});

describe('USWDS submit with errors — focus', () => {
    it('moves focus to the first invalid field in page order', () => {
        const el = renderForm(
            [
                { key: 'filled', type: 'field', dataType: 'string', label: 'Filled' },
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                {
                    key: 'able', type: 'field', dataType: 'choice', label: 'Able to work?',
                    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
                },
            ],
            {
                binds: [{ path: 'name', required: 'true' }, { path: 'able', required: 'true' }],
                // Page order (component tree) differs from definition order.
                componentTree: {
                    component: 'Stack',
                    children: [
                        { component: 'TextInput', bind: 'filled' },
                        { component: 'RadioGroup', bind: 'able' },
                        { component: 'TextInput', bind: 'name' },
                    ],
                },
            },
        );
        el.submit({ emitEvent: false });
        expect(document.activeElement?.getAttribute('name')).toBe('able');
        expect((document.activeElement as HTMLInputElement).type).toBe('radio');
    });
});

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
