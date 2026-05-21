import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { singleFieldDef, minimalComponentDoc, minimalTheme } from '../helpers/engine-fixtures';

let FormspecRender: any;
const originalMatchMedia = window.matchMedia;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

/** Helper: create element, set definition, and return the rendered field wrapper. */
function renderField(
    itemOverrides: Record<string, any> = {},
    compDocTree?: any,
    themeDoc?: any,
) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);

    if (themeDoc) el.themeDocument = themeDoc;

    const def = singleFieldDef(itemOverrides);

    if (compDocTree) {
        el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:form' },
            tree: compDocTree,
        };
    }

    el.definition = def;
    el.render();
    return el;
}

describe('input rendering — label position cascade', () => {
    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('mirrors browser dark preference onto the rendered container when no explicit appearance is set', () => {
        window.matchMedia = vi.fn().mockImplementation(() => ({
            matches: true,
            media: '(prefers-color-scheme: dark)',
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        const el = renderField();
        expect(el.querySelector('.formspec-container.formspec-appearance-dark')).toBeTruthy();
    });

    it('defaults to top label position (no inline class)', () => {
        const el = renderField();
        const fieldWrapper = el.querySelector('.formspec-field') as HTMLElement;
        expect(fieldWrapper).not.toBeNull();
        expect(fieldWrapper.classList.contains('formspec-field--inline')).toBe(false);
        const label = el.querySelector('.formspec-label') as HTMLElement;
        expect(label.classList.contains('formspec-sr-only')).toBe(false);
    });

    it('theme start labelPosition adds inline class', () => {
        const theme = minimalTheme({
            defaults: { labelPosition: 'start' },
        });
        const el = renderField({}, undefined, theme);
        const fieldWrapper = el.querySelector('.formspec-field') as HTMLElement;
        expect(fieldWrapper.classList.contains('formspec-field--inline')).toBe(true);
    });

    it('comp hidden labelPosition adds sr-only class to label', () => {
        const tree = {
            component: 'TextInput',
            bind: 'name',
            labelPosition: 'hidden',
        };
        const el = renderField({}, tree);
        const label = el.querySelector('.formspec-label') as HTMLElement;
        expect(label.classList.contains('formspec-sr-only')).toBe(true);
    });
});

describe('input rendering — theme widgetConfig class slots', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('applies x-classes slots to root/label/control/hint/error elements', () => {
        const theme = minimalTheme({
            defaults: {
                widgetConfig: {
                    'x-classes': {
                        root: 'usa-form-group',
                        label: 'usa-label',
                        control: 'usa-input',
                        hint: 'usa-hint',
                        error: 'usa-error-message',
                    },
                },
            },
        });
        const el = renderField({ hint: 'Helpful hint' }, undefined, theme);

        const field = el.querySelector('.formspec-field') as HTMLElement;
        const label = el.querySelector('.formspec-label') as HTMLElement;
        const input = el.querySelector('.formspec-input') as HTMLElement;
        const hint = el.querySelector('.formspec-hint') as HTMLElement;
        const error = el.querySelector('.formspec-error') as HTMLElement;

        expect(field.classList.contains('usa-form-group')).toBe(true);
        expect(label.classList.contains('usa-label')).toBe(true);
        expect(input.classList.contains('usa-input')).toBe(true);
        expect(hint.classList.contains('usa-hint')).toBe(true);
        expect(error.classList.contains('usa-error-message')).toBe(true);
    });
});

describe('input rendering — ARIA attributes', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('links hint via aria-describedby', () => {
        const el = renderField({ hint: 'Enter your name' });
        const input = el.querySelector('input') as HTMLInputElement;
        const describedBy = input.getAttribute('aria-describedby') || '';
        // Should reference hint element ID
        const ids = describedBy.split(/\s+/);
        const hintId = ids.find(id => id.endsWith('-hint'));
        expect(hintId).toBeDefined();
        // Verify the referenced element actually exists in the DOM
        expect(el.querySelector(`#${hintId}`)).not.toBeNull();
    });
});

describe('input rendering — reactive signals', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('required signal adds * indicator to label', () => {
        const el = renderField({ required: true });
        const label = el.querySelector('.formspec-label') as HTMLElement;
        expect(label.querySelector('.formspec-required')).not.toBeNull();
        expect(label.textContent).toContain('*');
    });

    it('relevance false adds formspec-hidden class', () => {
        const el = renderField({ relevant: 'false' });
        const fieldWrapper = el.querySelector('.formspec-field') as HTMLElement;
        expect(fieldWrapper.classList.contains('formspec-hidden')).toBe(true);
    });

    it('readonly signal sets readOnly on input and aria-readonly', () => {
        const el = renderField({ readonly: true });
        const input = el.querySelector('input') as HTMLInputElement;
        expect(input.readOnly).toBe(true);
        expect(input.getAttribute('aria-readonly')).toBe('true');
    });

    it('error signal shows error text and sets aria-invalid', () => {
        const el = renderField({ constraint: 'false', constraintMessage: 'Bad value' });
        const engine = el.getEngine();
        // Trigger validation by setting a value
        engine.setValue('name', 'test');
        const errorEl = el.querySelector('.formspec-error') as HTMLElement;
        const input = el.querySelector('input') as HTMLInputElement;
        // Errors are displayed after the field is touched.
        input.dispatchEvent(new Event('focusout', { bubbles: true }));
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(errorEl.textContent).toBe('Bad value');
    });
});

describe('input rendering — dataType→input type mapping', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('string→text input', () => {
        const el = renderField({ dataType: 'string' });
        const input = el.querySelector('input') as HTMLInputElement;
        expect(input.type).toBe('text');
    });

    it('integer→number input', () => {
        const el = renderField({ dataType: 'integer' });
        const input = el.querySelector('input') as HTMLInputElement;
        expect(input.type).toBe('number');
    });

    it('date→date input', () => {
        const el = renderField({ dataType: 'date' });
        const input = el.querySelector('input') as HTMLInputElement;
        expect(input.type).toBe('date');
    });

    it('boolean→checkbox input', () => {
        const el = renderField({ dataType: 'boolean' });
        const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(input).not.toBeNull();
    });

    it('choice→select element', () => {
        const el = renderField({
            dataType: 'choice',
            options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
        });
        const select = el.querySelector('select') as HTMLSelectElement;
        expect(select).not.toBeNull();
        expect(select.querySelectorAll('option').length).toBeGreaterThanOrEqual(2);
    });

    it('honors Tier 1 widgetHint when no theme explicitly chooses a widget', () => {
        const el = renderField({
            dataType: 'choice',
            options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
            presentation: { widgetHint: 'RadioGroup' },
        });
        const radioGroup = el.querySelector('[role="radiogroup"]') as HTMLElement;
        expect(radioGroup).not.toBeNull();
        expect(radioGroup.querySelectorAll('input[type="radio"]').length).toBe(2);
        expect(el.querySelector('select')).toBeNull();
    });

    it('select change propagates value to engine', () => {
        const tree = { component: 'Select', bind: 'name' };
        const el = renderField({
            dataType: 'choice',
            options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
        }, tree);
        const engine = el.getEngine();
        const select = el.querySelector('select') as HTMLSelectElement;
        expect(select).not.toBeNull();

        // Simulate user selecting an option — selects fire 'change', not 'input'
        select.value = 'b';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(engine.signals['name'].value).toBe('b');
    });
});

describe('input rendering — TextInput variants', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('maxLines > 1 renders textarea', () => {
        const tree = { component: 'TextInput', bind: 'name', maxLines: 5 };
        const el = renderField({ dataType: 'string' }, tree);
        const textarea = el.querySelector('textarea') as HTMLTextAreaElement;
        expect(textarea).not.toBeNull();
        expect(Number(textarea.rows)).toBe(5);
    });

    it('prefix/suffix renders wrapper spans and links via aria-describedby', () => {
        const tree = { component: 'TextInput', bind: 'name', prefix: '$', suffix: '.00' };
        const el = renderField({ dataType: 'string' }, tree);
        const prefix = el.querySelector('.formspec-input-prefix') as HTMLElement;
        const suffix = el.querySelector('.formspec-input-suffix') as HTMLElement;
        expect(prefix.textContent).toBe('$');
        expect(suffix.textContent).toBe('.00');

        // Verify IDs exist
        expect(prefix.id).toMatch(/-prefix$/);
        expect(suffix.id).toMatch(/-suffix$/);

        // Verify aria-describedby linkage on the input
        const input = el.querySelector('input') as HTMLInputElement;
        const describedBy = input.getAttribute('aria-describedby') || '';
        expect(describedBy).toContain(prefix.id);
        expect(describedBy).toContain(suffix.id);
    });
});

describe('input rendering — Select clearable', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders a clear button that resets the value', () => {
        const tree = { component: 'Select', bind: 'name', clearable: true };
        const el = renderField({
            dataType: 'choice',
            options: [{ value: 'a', label: 'A' }],
        }, tree);
        const engine = el.getEngine();
        engine.setValue('name', 'a');
        el.render();

        const clearBtn = el.querySelector('.formspec-select-clear') as HTMLButtonElement;
        expect(clearBtn).not.toBeNull();
        expect(clearBtn.style.display).not.toBe('none');

        clearBtn.click();
        expect(engine.signals['name'].value).toBeNull();
        expect(clearBtn.style.display).toBe('none');
    });
});

describe('input rendering — NumberInput attributes', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('sets min/max/step from comp props', () => {
        const tree = { component: 'NumberInput', bind: 'name', min: 0, max: 100, step: 5 };
        const el = renderField({ dataType: 'integer' }, tree);
        const input = el.querySelector('input[type="number"]') as HTMLInputElement;
        expect(input.min).toBe('0');
        expect(input.max).toBe('100');
        expect(input.step).toBe('5');
    });
});

describe('input rendering — compatibility warning', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('warns on bind/dataType incompatibility', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        // Toggle is not compatible with 'string' dataType
        const tree = { component: 'Toggle', bind: 'name' };
        renderField({ dataType: 'string' }, tree);
        const calls = warn.mock.calls.map(c => c[0]);
        expect(calls.some((c: string) => c.includes('Incompatible'))).toBe(true);
        warn.mockRestore();
    });

    it('does not warn for MoneyInput with money dataType', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const tree = { component: 'MoneyInput', bind: 'name' };
        renderField({ dataType: 'money' }, tree);
        const calls = warn.mock.calls.map(c => c[0]);
        expect(calls.some((c: string) => typeof c === 'string' && c.includes('Incompatible'))).toBe(false);
        warn.mockRestore();
    });
});

describe('input rendering — money display rounding', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('rounds displayed money amount to 2 decimal places', () => {
        const tree = { component: 'MoneyInput', bind: 'name' };
        const el = renderField({ dataType: 'money' }, tree);
        const engine = el.getEngine();
        engine.setValue('name', { amount: 8333.333333333334, currency: 'USD' });
        el.render();
        const amountInput = el.querySelector('.formspec-money input.formspec-money-amount') as HTMLInputElement;
        expect(amountInput).not.toBeNull();
        expect(amountInput.value).toBe('8333.33');
    });

    it('displays exact value when it has 2 or fewer decimals', () => {
        const tree = { component: 'MoneyInput', bind: 'name' };
        const el = renderField({ dataType: 'money' }, tree);
        const engine = el.getEngine();
        engine.setValue('name', { amount: 100.50, currency: 'USD' });
        el.render();
        const amountInput = el.querySelector('.formspec-money input.formspec-money-amount') as HTMLInputElement;
        expect(amountInput.value).toBe('100.5');
    });

    it('displays whole numbers without decimals', () => {
        const tree = { component: 'MoneyInput', bind: 'name' };
        const el = renderField({ dataType: 'money' }, tree);
        const engine = el.getEngine();
        engine.setValue('name', { amount: 5000, currency: 'USD' });
        el.render();
        const amountInput = el.querySelector('.formspec-money input.formspec-money-amount') as HTMLInputElement;
        expect(amountInput.value).toBe('5000');
    });
});
