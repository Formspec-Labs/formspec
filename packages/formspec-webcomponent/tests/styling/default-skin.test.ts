/** @filedesc Default skin cascade on rendered fields: stepper adornments and the over-limit character count. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** The canonical default skin with its `@import`s inlined, as a page would load it. */
function readSkin(path: string): string {
    return readFileSync(path, 'utf8').replace(/@import\s+"(\.[^"]+)";/g, (_match, rel) => readSkin(resolve(dirname(path), rel)));
}

beforeAll(async () => {
    const mod = await import('../../src/index');
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', mod.FormspecRender);
    }
    const style = document.createElement('style');
    style.textContent = readSkin(resolve(__dirname, '../../../formspec-layout/src/formspec-default.css'));
    document.head.appendChild(style);
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

function render(items: any[], children: any[], theme?: any) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = {
        $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: 'urn:test:skin' },
        tree: { component: 'Stack', children },
    };
    if (theme) el.themeDocument = { $formspecTheme: '1.0', version: '1.0.0', targetDefinition: { url: 'urn:test:skin' }, ...theme };
    el.definition = { $formspec: '1.0', url: 'urn:test:skin', version: '1.0.0', title: 'Skin', items };
    el.render();
    return el;
}

const style = (el: Element, prop: string) => getComputedStyle(el).getPropertyValue(prop);

describe('default skin — NumberInput stepper with prefix/suffix', () => {
    it('draws one bordered box: the adornment group inside the stepper has no border or radius of its own', () => {
        const el = render(
            [
                { key: 'qty', type: 'field', dataType: 'integer', label: 'Quantity', prefix: '#', suffix: 'units' },
                { key: 'fee', type: 'field', dataType: 'integer', label: 'Fee', prefix: '$' },
            ],
            [
                { component: 'NumberInput', bind: 'qty', showStepper: true },
                { component: 'NumberInput', bind: 'fee' },
            ],
        );
        const nested = el.querySelector('.formspec-stepper .formspec-input-adornment')!;
        expect(style(nested, 'border-top-style')).toBe('none');
        expect(style(nested, 'border-bottom-style')).toBe('none');
        expect(style(nested, 'border-radius')).toBe('0px');
        // The buttons stay divided from the group.
        expect(style(nested, 'border-left-style')).toBe('solid');
        expect(style(nested, 'border-right-style')).toBe('solid');

        const standalone = el.querySelector('[data-name="fee"] .formspec-input-adornment')!;
        expect(style(standalone, 'border-top-style')).toBe('solid');
    });
});

describe('default skin — widgetConfig.width (theme §4.2 Width Stops)', () => {
    it('caps TextInput, NumberInput, MoneyInput, DatePicker, and Select at their width-stop max-width', () => {
        // An authored Component Document tree (Studio output shape): planComponentTree plans this,
        // not planDefinitionFallback, and must carry widgetConfig.width the same way.
        const el = render(
            [
                { key: 'zip', type: 'field', dataType: 'string', label: 'ZIP' },
                { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
                { key: 'fee', type: 'field', dataType: 'money', label: 'Fee' },
                { key: 'dob', type: 'field', dataType: 'date', label: 'DOB' },
                { key: 'state', type: 'field', dataType: 'choice', label: 'State', options: [{ value: 'NJ', label: 'NJ' }] },
            ],
            [
                { component: 'TextInput', bind: 'zip' },
                { component: 'NumberInput', bind: 'qty' },
                { component: 'MoneyInput', bind: 'fee' },
                { component: 'DatePicker', bind: 'dob' },
                { component: 'Select', bind: 'state' },
            ],
            {
                items: {
                    zip: { widgetConfig: { width: 'sm' } },
                    qty: { widgetConfig: { width: 'xs' } },
                    fee: { widgetConfig: { width: 'md' } },
                    dob: { widgetConfig: { width: 'lg' } },
                    state: { widgetConfig: { width: 'xl' } },
                },
            },
        );

        expect(el.querySelector('[data-name="zip"] .formspec-input--sm')).toBeTruthy();
        expect(style(el.querySelector('[data-name="zip"] .formspec-input--sm')!, 'max-width')).toBe('13ex');

        expect(el.querySelector('[data-name="qty"] .formspec-input--xs')).toBeTruthy();
        expect(el.querySelector('[data-name="fee"] .formspec-money.formspec-input--md')).toBeTruthy();
        expect(el.querySelector('[data-name="dob"] .formspec-input--lg')).toBeTruthy();
        expect(el.querySelector('[data-name="state"] select.formspec-input--xl')).toBeTruthy();
    });

    it('ignores an unrecognized width value — the control keeps filling the form column', () => {
        const el = render(
            [{ key: 'zip', type: 'field', dataType: 'string', label: 'ZIP' }],
            [{ component: 'TextInput', bind: 'zip' }],
            { items: { zip: { widgetConfig: { width: 'huge' } } } },
        );
        const input = el.querySelector('[data-name="zip"] input')!;
        expect(input.className).not.toMatch(/formspec-input--/);
    });
});

describe('default skin — character count', () => {
    it('colors an over-limit count like a validation error', () => {
        const el = render(
            [{ key: 'note', type: 'field', dataType: 'string', label: 'Note' }],
            [{ component: 'TextInput', bind: 'note' }],
            { items: { note: { widgetConfig: { maxLength: 3 } } } },
        );
        const count = el.querySelector('.formspec-character-count')!;
        const hintColor = style(count, 'color');

        el.getEngine().setValue('note', 'too long');
        expect(count.classList.contains('formspec-character-count--over-limit')).toBe(true);
        expect(style(count, 'color')).not.toBe(hintColor);
        expect(style(count, 'color')).toBe(style(el.querySelector('.formspec-error')!, 'color'));
    });
});
