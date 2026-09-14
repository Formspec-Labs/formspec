/** @filedesc A field with a calculate Bind renders read-only (Core §4.3.1) unless readonly is explicit. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

beforeAll(async () => {
    const mod = await import('../../src/index');
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', mod.FormspecRender);
    }
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

describe('calculated fields', () => {
    it('render read-only unless the Bind sets readonly explicitly', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:calculated-readonly',
            version: '1.0.0',
            title: 'Calculated',
            items: [
                { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
                { key: 'total', type: 'field', dataType: 'integer', label: 'Total' },
                { key: 'override', type: 'field', dataType: 'integer', label: 'Override' },
            ],
            binds: [
                { path: 'total', calculate: '$qty * 2' },
                { path: 'override', calculate: '$qty * 3', readonly: 'false' },
            ],
        };
        el.render();

        const input = (name: string) => el.querySelector(`input[name="${name}"]`) as HTMLInputElement;
        expect(input('total').readOnly).toBe(true);
        expect(input('total').getAttribute('aria-readonly')).toBe('true');
        expect(input('total').closest('.formspec-field')?.classList.contains('formspec-field--readonly')).toBe(true);
        expect(input('qty').readOnly).toBe(false);
        expect(input('override').readOnly).toBe(false);
    });
});
