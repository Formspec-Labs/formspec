/** @filedesc Exact decimals survive control rendering and subsequent edits. */
import { beforeAll, afterEach, expect, it } from 'vitest';
import { parseJsonNumber } from '@formspec-org/engine';

beforeAll(async () => {
    const { FormspecRender } = await import('../../src/index');
    if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
});
afterEach(() => document.body.querySelectorAll('formspec-render').forEach(el => el.remove()));

it.each(['MoneyInput', 'Slider'])('renders exact authored numeric attributes in %s', component => {
    const third = '0.3333333333333333333333333333';
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = { $formspecComponent: '1.0', version: '1.0.0',
        targetDefinition: { url: 'urn:test:decimal-attributes' },
        tree: { component, bind: 'input', min: parseJsonNumber(third), max: 1, step: parseJsonNumber(third), showTicks: true } };
    el.definition = { $formspec: '1.0', url: 'urn:test:decimal-attributes', version: '1.0.0',
        items: [{ key: 'input', label: 'Input', type: 'field', dataType: component === 'MoneyInput' ? 'money' : 'decimal',
            initialValue: component === 'MoneyInput' ? { amount: third, currency: 'USD' } : parseJsonNumber(third) }] };
    el.render();
    const input = el.querySelector('.formspec-money-amount, input[type="range"]') as HTMLInputElement;
    expect(input.min).toBe(third); expect(input.step).toBe(third); expect(input.value).toBe(third);
});

it('renders calculated thirds and preserves the entered digits', () => {
    const third = '0.3333333333333333333333333333';
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.definition = {
        $formspec: '1.0', url: 'urn:test:decimal-control', version: '1.0.0',
        items: [
            { key: 'input', type: 'field', dataType: 'decimal', label: 'Input', initialValue: 1 },
            { key: 'ratio', type: 'field', dataType: 'decimal', label: 'Ratio' },
        ],
        binds: [{ path: 'ratio', calculate: '$input / 3' }],
    };
    el.render();
    const input = el.querySelector('input[name="input"]') as HTMLInputElement;
    const ratio = el.querySelector('input[name="ratio"]') as HTMLInputElement;
    expect(ratio.value).toBe(third);
    input.value = third;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe(third);
    expect(ratio.value).toBe('0.1111111111111111111111111111');
});

it('retains an unsupported edit as invalid and disables the stepper without throwing', () => {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = { $formspecComponent: '1.0', version: '1.0.0',
        targetDefinition: { url: 'urn:test:invalid-stepper' },
        tree: { component: 'NumberInput', bind: 'input', showStepper: true } };
    el.definition = { $formspec: '1.0', url: 'urn:test:invalid-stepper', version: '1.0.0',
        items: [{ key: 'input', label: 'Input', type: 'field', dataType: 'decimal', initialValue: 1 }] };
    el.render();
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = '1e-100';
    expect(() => input.dispatchEvent(new Event('input', { bubbles: true }))).not.toThrow();
    const response = el.getEngine().getResponse({ profile: 'on-submit' });
    expect(response.data.input).toBe('1e-100');
    expect(response.status).toBe('in-progress');
    expect(el.getEngine().getValidationReport().results).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'input', code: 'TYPE_MISMATCH' }),
    ]));
    expect(el.querySelector('.formspec-stepper-increment').disabled).toBe(true);
    input.value = '000.3333333333333333333333333333';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(JSON.stringify(el.getEngine().getResponse().data.input)).toBe('0.3333333333333333333333333333');
});
