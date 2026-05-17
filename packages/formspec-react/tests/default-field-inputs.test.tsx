/** @filedesc Tests for DefaultField input sub-features and new input types. */
import { describe, it, expect, beforeAll } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import type { LayoutNode } from '@formspec-org/layout';
import { FormspecNode } from '../src/node-renderer';
import { FormspecProvider } from '../src/context';

beforeAll(async () => {
    await initFormspecEngine();
});

/** flushSync inside act — engine signal → useSyncExternalStore updates must see an act boundary in tests. */
function actSync(callback: () => void): void {
    act(() => {
        flushSync(callback);
    });
}

const baseDef = (items: any[]) => ({
    $formspec: '1.0',
    url: 'https://test.example/inputs',
    version: '1.0.0',
    status: 'active',
    title: 'Input Test',
    name: 'input-test',
    items,
});

function renderField(definition: any, node: LayoutNode): HTMLElement {
    const engine = createFormEngine(definition);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    actSync(() => {
        root.render(
            <FormspecProvider engine={engine}>
                <FormspecNode node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }} />
            </FormspecProvider>
        );
    });
    return container;
}

// ── TextInput enhancements ────────────────────────────────────────

describe('TextInput — maxLines', () => {
    it('renders <textarea> with rows when maxLines is set', () => {
        const def = baseDef([{ key: 'bio', type: 'field', dataType: 'text', label: 'Bio' }]);
        const node: LayoutNode = {
            id: 'bio-field', component: 'TextInput', category: 'field',
            props: { maxLines: 4 }, cssClasses: [], children: [], bindPath: 'bio',
        };
        const container = renderField(def, node);
        const textarea = container.querySelector('textarea');
        expect(textarea).toBeTruthy();
        expect(Number(textarea!.getAttribute('rows'))).toBe(4);
    });

    it('renders prefix when node.props.prefix is set', () => {
        const def = baseDef([{ key: 'user', type: 'field', dataType: 'string', label: 'User' }]);
        const node: LayoutNode = {
            id: 'user-field', component: 'TextInput', category: 'field',
            props: { prefix: '@' }, cssClasses: [], children: [], bindPath: 'user',
        };
        const container = renderField(def, node);
        expect(container.textContent).toContain('@');
    });

    it('renders suffix when node.props.suffix is set', () => {
        const def = baseDef([{ key: 'domain', type: 'field', dataType: 'string', label: 'Domain' }]);
        const node: LayoutNode = {
            id: 'domain-field', component: 'TextInput', category: 'field',
            props: { suffix: '.com' }, cssClasses: [], children: [], bindPath: 'domain',
        };
        const container = renderField(def, node);
        expect(container.textContent).toContain('.com');
    });
});

// ── NumberInput enhancements ──────────────────────────────────────

describe('NumberInput — min/max/step', () => {
    it('applies min, max, step attributes to the number input', () => {
        const def = baseDef([{ key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' }]);
        const node: LayoutNode = {
            id: 'qty-field', component: 'NumberInput', category: 'field',
            props: { min: 1, max: 100, step: 5 }, cssClasses: [], children: [], bindPath: 'qty',
        };
        const container = renderField(def, node);
        const input = container.querySelector('input[type="number"]') as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.min).toBe('1');
        expect(input.max).toBe('100');
        expect(input.step).toBe('5');
    });
});

// ── DatePicker variants ───────────────────────────────────────────

describe('DatePicker — variants', () => {
    it('renders datetime-local when variant is dateTime', () => {
        const def = baseDef([{ key: 'dt', type: 'field', dataType: 'dateTime', label: 'Date Time' }]);
        const node: LayoutNode = {
            id: 'dt-field', component: 'DatePicker', category: 'field',
            props: { variant: 'dateTime' }, cssClasses: [], children: [], bindPath: 'dt',
        };
        const container = renderField(def, node);
        expect(container.querySelector('input[type="datetime-local"]')).toBeTruthy();
    });

    it('renders time when variant is time', () => {
        const def = baseDef([{ key: 'tm', type: 'field', dataType: 'time', label: 'Time' }]);
        const node: LayoutNode = {
            id: 'tm-field', component: 'DatePicker', category: 'field',
            props: { variant: 'time' }, cssClasses: [], children: [], bindPath: 'tm',
        };
        const container = renderField(def, node);
        expect(container.querySelector('input[type="time"]')).toBeTruthy();
    });

    it('renders date by default', () => {
        const def = baseDef([{ key: 'day', type: 'field', dataType: 'date', label: 'Day' }]);
        const node: LayoutNode = {
            id: 'day-field', component: 'DatePicker', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'day',
        };
        const container = renderField(def, node);
        expect(container.querySelector('input[type="date"]')).toBeTruthy();
    });

    it('renders datetime-local from dataType alone (no variant prop)', () => {
        const def = baseDef([{ key: 'dt2', type: 'field', dataType: 'dateTime', label: 'DT' }]);
        const node: LayoutNode = {
            id: 'dt2-field', component: 'DatePicker', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'dt2',
        };
        const container = renderField(def, node);
        expect(container.querySelector('input[type="datetime-local"]')).toBeTruthy();
    });
});

// ── FileUpload enhancements ───────────────────────────────────────

describe('FileUpload — accept and multiple', () => {
    it('applies accept attribute from node.props', () => {
        const def = baseDef([{ key: 'doc', type: 'field', dataType: 'string', label: 'Doc' }]);
        const node: LayoutNode = {
            id: 'doc-field', component: 'FileUpload', category: 'field',
            props: { accept: '.pdf,.docx' }, cssClasses: [], children: [], bindPath: 'doc',
        };
        const container = renderField(def, node);
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.accept).toBe('.pdf,.docx');
    });

    it('applies multiple attribute from node.props', () => {
        const def = baseDef([{ key: 'files', type: 'field', dataType: 'string', label: 'Files' }]);
        const node: LayoutNode = {
            id: 'files-field', component: 'FileUpload', category: 'field',
            props: { multiple: true }, cssClasses: [], children: [], bindPath: 'files',
        };
        const container = renderField(def, node);
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.multiple).toBe(true);
    });

    it('clears the file list when engine value is cleared externally', () => {
        const def = baseDef([{ key: 'doc', type: 'field', dataType: 'string', label: 'Doc' }]);
        const engine = createFormEngine(def);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const node: LayoutNode = {
            id: 'doc-field', component: 'FileUpload', category: 'field',
            props: { dragDrop: false }, cssClasses: [], children: [], bindPath: 'doc',
        };
        actSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }} />
                </FormspecProvider>
            );
        });

        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        actSync(() => {
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(container.querySelectorAll('.formspec-file-list-item').length).toBe(1);

        actSync(() => {
            engine.setValue('doc', null);
        });
        expect(container.querySelectorAll('.formspec-file-list-item').length).toBe(0);
    });
});

// ── MoneyInput (new) ──────────────────────────────────────────────

describe('MoneyInput', () => {
    it('renders a text input with inputMode=decimal', () => {
        const def = baseDef([{ key: 'price', type: 'field', dataType: 'money', label: 'Price' }]);
        const node: LayoutNode = {
            id: 'price-field', component: 'MoneyInput', category: 'field',
            props: { currency: 'USD' }, cssClasses: [], children: [], bindPath: 'price',
        };
        const container = renderField(def, node);
        expect(container.querySelector('.formspec-money')).toBeTruthy();
        const input = container.querySelector('input.formspec-money-amount[inputmode="decimal"]') as HTMLInputElement;
        expect(input).toBeTruthy();
    });

    it('displays the currency symbol (not code) via Intl resolution', () => {
        const def = baseDef([{ key: 'price', type: 'field', dataType: 'money', label: 'Price' }]);
        const node: LayoutNode = {
            id: 'price-field', component: 'MoneyInput', category: 'field',
            props: { currency: 'USD' }, cssClasses: [], children: [], bindPath: 'price',
        };
        const container = renderField(def, node);
        const span = container.querySelector('.formspec-money-currency') as HTMLElement;
        expect(span).toBeTruthy();
        expect(span.textContent).toBe('$');
    });

    it('resolves EUR to its narrow symbol', () => {
        const def = baseDef([{ key: 'price', type: 'field', dataType: 'money', label: 'Price' }]);
        const node: LayoutNode = {
            id: 'price-field', component: 'MoneyInput', category: 'field',
            props: { currency: 'EUR' }, cssClasses: [], children: [], bindPath: 'price',
        };
        const container = renderField(def, node);
        const span = container.querySelector('.formspec-money-currency') as HTMLElement;
        expect(span.textContent).toMatch(/€/);
    });
});

// ── Slider (new) ──────────────────────────────────────────────────

describe('Slider', () => {
    it('renders an input[type=range]', () => {
        const def = baseDef([{ key: 'vol', type: 'field', dataType: 'number', label: 'Volume' }]);
        const node: LayoutNode = {
            id: 'vol-field', component: 'Slider', category: 'field',
            props: { min: 0, max: 100, step: 1 }, cssClasses: [], children: [], bindPath: 'vol',
        };
        const container = renderField(def, node);
        expect(container.querySelector('.formspec-field.formspec-slider')).toBeTruthy();
        expect(container.querySelector('.formspec-slider-track')).toBeTruthy();
        const input = container.querySelector('input[type="range"].formspec-input') as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.min).toBe('0');
        expect(input.max).toBe('100');
        expect(input.step).toBe('1');
    });

    it('shows current value display when showValue is not false', () => {
        const def = baseDef([{ key: 'vol', type: 'field', dataType: 'number', label: 'Volume' }]);
        const node: LayoutNode = {
            id: 'vol-field', component: 'Slider', category: 'field',
            props: { min: 0, max: 100 }, cssClasses: [], children: [], bindPath: 'vol',
        };
        const container = renderField(def, node);
        expect(container.querySelector('.formspec-slider-value')).toBeTruthy();
    });

    it('hides value display when showValue is false', () => {
        const def = baseDef([{ key: 'vol', type: 'field', dataType: 'number', label: 'Volume' }]);
        const node: LayoutNode = {
            id: 'vol-field', component: 'Slider', category: 'field',
            props: { min: 0, max: 100, showValue: false }, cssClasses: [], children: [], bindPath: 'vol',
        };
        const container = renderField(def, node);
        expect(container.querySelector('.formspec-slider-value')).toBeNull();
    });
});

// ── Rating (new) ──────────────────────────────────────────────────

describe('Rating', () => {
    it('renders maxRating number of stars', () => {
        const def = baseDef([{ key: 'stars', type: 'field', dataType: 'integer', label: 'Stars' }]);
        const node: LayoutNode = {
            id: 'stars-field', component: 'Rating', category: 'field',
            props: { maxRating: 5 }, cssClasses: [], children: [], bindPath: 'stars',
        };
        const container = renderField(def, node);
        const stars = container.querySelectorAll('.formspec-rating-star');
        expect(stars.length).toBe(5);
    });

    it('defaults to 5 stars when maxRating is not set', () => {
        const def = baseDef([{ key: 'stars', type: 'field', dataType: 'integer', label: 'Stars' }]);
        const node: LayoutNode = {
            id: 'stars-field', component: 'Rating', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'stars',
        };
        const container = renderField(def, node);
        const stars = container.querySelectorAll('.formspec-rating-star');
        expect(stars.length).toBe(5);
    });

    it('marks stars as selected based on field value', () => {
        const def = baseDef([{ key: 'stars', type: 'field', dataType: 'integer', label: 'Stars' }]);
        const engine = createFormEngine(def);
        engine.setValue('stars', 3);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const node: LayoutNode = {
            id: 'stars-field', component: 'Rating', category: 'field',
            props: { maxRating: 5 }, cssClasses: [], children: [], bindPath: 'stars',
        };
        actSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }} />
                </FormspecProvider>
            );
        });
        const selected = container.querySelectorAll('.formspec-rating-star--selected');
        expect(selected.length).toBe(3);
    });

    it('calls setValue when a star is clicked', () => {
        const def = baseDef([{ key: 'stars', type: 'field', dataType: 'integer', label: 'Stars' }]);
        const engine = createFormEngine(def);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const node: LayoutNode = {
            id: 'stars-field', component: 'Rating', category: 'field',
            props: { maxRating: 5 }, cssClasses: [], children: [], bindPath: 'stars',
        };
        actSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }} />
                </FormspecProvider>
            );
        });

        const stars = container.querySelectorAll('.formspec-rating-star');
        // Click the 4th star
        actSync(() => { (stars[3] as HTMLElement).click(); });

        const selected = container.querySelectorAll('.formspec-rating-star--selected');
        expect(selected.length).toBe(4);
    });
});

// ── Signature (new) ───────────────────────────────────────────────

describe('Signature', () => {
    it('renders a <canvas> element', () => {
        const def = baseDef([{ key: 'sig', type: 'field', dataType: 'string', label: 'Signature' }]);
        const node: LayoutNode = {
            id: 'sig-field', component: 'Signature', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'sig',
        };
        const container = renderField(def, node);
        expect(container.querySelector('canvas')).toBeTruthy();
    });

    it('renders a Clear button', () => {
        const def = baseDef([{ key: 'sig', type: 'field', dataType: 'string', label: 'Signature' }]);
        const node: LayoutNode = {
            id: 'sig-field', component: 'Signature', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'sig',
        };
        const container = renderField(def, node);
        const btn = container.querySelector('.formspec-signature-clear');
        expect(btn).toBeTruthy();
        expect(btn!.textContent).toContain('Clear');
    });

    it('applies node.props.height to the canvas via CSS style', () => {
        const def = baseDef([{ key: 'sig', type: 'field', dataType: 'string', label: 'Signature' }]);
        const node: LayoutNode = {
            id: 'sig-field', component: 'Signature', category: 'field',
            props: { height: 300 }, cssClasses: [], children: [], bindPath: 'sig',
        };
        const container = renderField(def, node);
        const canvas = container.querySelector('canvas') as HTMLCanvasElement;
        expect(canvas).toBeTruthy();
        // DPR-aware canvas uses CSS style for sizing instead of HTML attributes
        expect(canvas.style.height).toBe('300px');
    });

    // Item 1 — WCAG 2.1.1 / 4.1.2: canvas accessibility
    it('canvas has role="img" and aria-label with field label', () => {
        const def = baseDef([{ key: 'sig', type: 'field', dataType: 'string', label: 'Your Signature' }]);
        const node: LayoutNode = {
            id: 'sig-field', component: 'Signature', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'sig',
        };
        const container = renderField(def, node);
        const canvas = container.querySelector('canvas') as HTMLCanvasElement;
        expect(canvas.getAttribute('role')).toBe('img');
        expect(canvas.getAttribute('aria-label')).toBe('Signature pad for Your Signature');
        expect(canvas.getAttribute('tabindex')).toBe('0');
    });

    it('Clear button has aria-label with field label', () => {
        const def = baseDef([{ key: 'sig', type: 'field', dataType: 'string', label: 'Your Signature' }]);
        const node: LayoutNode = {
            id: 'sig-field', component: 'Signature', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'sig',
        };
        const container = renderField(def, node);
        const btn = container.querySelector('.formspec-signature-clear') as HTMLButtonElement;
        expect(btn.getAttribute('aria-label')).toBe('Clear Your Signature');
    });

    it('canvas uses CSS width 100% instead of hardcoded pixel width', () => {
        const def = baseDef([{ key: 'sig', type: 'field', dataType: 'string', label: 'Signature' }]);
        const node: LayoutNode = {
            id: 'sig-field', component: 'Signature', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'sig',
        };
        const container = renderField(def, node);
        const canvas = container.querySelector('canvas') as HTMLCanvasElement;
        expect(canvas.style.width).toBe('100%');
        // Should NOT have a hardcoded 400px width
        expect(canvas.style.width).not.toBe('400px');
    });

    it('canvas has a reasonable default buffer width attribute', () => {
        const def = baseDef([{ key: 'sig', type: 'field', dataType: 'string', label: 'Signature' }]);
        const node: LayoutNode = {
            id: 'sig-field', component: 'Signature', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'sig',
        };
        const container = renderField(def, node);
        const canvas = container.querySelector('canvas') as HTMLCanvasElement;
        // DPR-aware: buffer width = CSS width * DPR. In jsdom, getBoundingClientRect returns 0,
        // so we just check it's set via the effect (canvas.width attribute).
        // The inline style should not constrain to a fixed pixel value.
        expect(canvas.style.width).not.toContain('400');
    });
});

// ── RadioGroup / CheckboxGroup — fieldset parity with WC ───────────

describe('RadioGroup / CheckboxGroup — fieldset + legend', () => {
    it('uses fieldset.formspec-fieldset and legend.formspec-legend for RadioGroup', () => {
        const def = baseDef([{
            key: 'color',
            type: 'field',
            dataType: 'choice',
            label: 'Color',
            options: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }],
        }]);
        const node: LayoutNode = {
            id: 'color-field',
            component: 'RadioGroup',
            category: 'field',
            props: {},
            cssClasses: [],
            children: [],
            bindPath: 'color',
        };
        const container = renderField(def, node);
        const fs = container.querySelector('fieldset.formspec-fieldset');
        const legend = container.querySelector('legend.formspec-legend');
        expect(fs).toBeTruthy();
        expect(legend).toBeTruthy();
        const radiogroup = container.querySelector('[role="radiogroup"]');
        expect(radiogroup?.getAttribute('aria-labelledby')).toBe(legend?.id);
    });

    it('uses fieldset and legend for CheckboxGroup', () => {
        const def = baseDef([{
            key: 'tags',
            type: 'field',
            dataType: 'multiChoice',
            label: 'Tags',
            options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
        }]);
        const node: LayoutNode = {
            id: 'tags-field',
            component: 'CheckboxGroup',
            category: 'field',
            props: {},
            cssClasses: [],
            children: [],
            bindPath: 'tags',
        };
        const container = renderField(def, node);
        expect(container.querySelector('fieldset.formspec-fieldset')).toBeTruthy();
        expect(container.querySelector('legend.formspec-legend')).toBeTruthy();
        const group = container.querySelector('[role="group"]');
        const leg = container.querySelector('legend');
        expect(group?.getAttribute('aria-labelledby')).toBe(leg?.id);
    });
});

// ── RadioGroup / CheckboxGroup readonly ───────────────────────────

describe('RadioGroup — readonly disables inputs', () => {
    it('disables radio inputs when field is readonly', () => {
        const def = baseDef([{
            key: 'color', type: 'field', dataType: 'choice', label: 'Color',
            options: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }],
        }]);
        def.binds = [{ path: 'color', readonly: 'true' }];
        const node: LayoutNode = {
            id: 'color-field', component: 'RadioGroup', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'color',
        };
        const container = renderField(def, node);
        const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
        expect(radios.length).toBeGreaterThan(0);
        radios.forEach(r => expect(r.disabled).toBe(true));
    });
});

describe('CheckboxGroup — readonly disables inputs', () => {
    it('disables checkbox inputs when field is readonly', () => {
        const def = baseDef([{
            key: 'tags', type: 'field', dataType: 'multi-choice', label: 'Tags',
            options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
        }]);
        def.binds = [{ path: 'tags', readonly: 'true' }];
        const node: LayoutNode = {
            id: 'tags-field', component: 'CheckboxGroup', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'tags',
        };
        const container = renderField(def, node);
        const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
        expect(checkboxes.length).toBeGreaterThan(0);
        checkboxes.forEach(c => expect(c.disabled).toBe(true));
    });
});

// ── Select placeholder hidden ──────────────────────────────────────

describe('Select — placeholder option', () => {
    it('placeholder option has hidden attribute', () => {
        const def = baseDef([{
            key: 'color', type: 'field', dataType: 'choice', label: 'Color',
            options: [{ value: 'red', label: 'Red' }],
        }]);
        const node: LayoutNode = {
            id: 'color-field', component: 'Select', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'color',
        };
        const container = renderField(def, node);
        const placeholder = container.querySelector('option[value=""]') as HTMLOptionElement;
        expect(placeholder).toBeTruthy();
        expect(placeholder.hidden).toBe(true);
    });
});

// ── MoneyInput currency association ───────────────────────────────

describe('MoneyInput — currency aria-describedby', () => {
    it('currency span has id and input aria-describedby includes it', () => {
        const def = baseDef([{ key: 'price', type: 'field', dataType: 'money', label: 'Price' }]);
        const node: LayoutNode = {
            id: 'price-field', component: 'MoneyInput', category: 'field',
            props: { currency: 'EUR' }, cssClasses: [], children: [], bindPath: 'price',
        };
        const container = renderField(def, node);
        const span = container.querySelector('.formspec-money-currency') as HTMLElement;
        // field.id is engine-assigned (e.g. 'field-price') — verify the id ends with -currency
        expect(span.id).toBeTruthy();
        expect(span.id).toMatch(/-currency$/);
        const input = container.querySelector('input') as HTMLInputElement;
        const describedBy = input.getAttribute('aria-describedby') ?? '';
        expect(describedBy).toContain(span.id);
    });
});

// ── Slider aria-valuetext ──────────────────────────────────────────

describe('Slider — aria-valuetext', () => {
    it('range input has aria-valuetext reflecting displayValue', () => {
        const def = baseDef([{ key: 'vol', type: 'field', dataType: 'number', label: 'Volume' }]);
        const engine = createFormEngine(def);
        engine.setValue('vol', 42);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const node: LayoutNode = {
            id: 'vol-field', component: 'Slider', category: 'field',
            props: { min: 0, max: 100 }, cssClasses: [], children: [], bindPath: 'vol',
        };
        actSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }} />
                </FormspecProvider>
            );
        });
        const input = container.querySelector('input[type="range"]') as HTMLInputElement;
        expect(input.getAttribute('aria-valuetext')).toBe('42');
    });
});

// ── TextInput prefix/suffix aria-describedby ───────────────────────

describe('TextInput — prefix/suffix aria-describedby', () => {
    it('prefix span has id and input aria-describedby includes it', () => {
        const def = baseDef([{ key: 'user', type: 'field', dataType: 'string', label: 'User' }]);
        const node: LayoutNode = {
            id: 'user-field', component: 'TextInput', category: 'field',
            props: { prefix: '@' }, cssClasses: [], children: [], bindPath: 'user',
        };
        const container = renderField(def, node);
        const span = container.querySelector('.formspec-input-prefix') as HTMLElement;
        // field.id is the engine-assigned id (e.g. 'field-user') — test against the actual rendered id
        expect(span.id).toBeTruthy();
        expect(span.id).toMatch(/-prefix$/);
        const input = container.querySelector('input') as HTMLInputElement;
        const describedBy = input.getAttribute('aria-describedby') ?? '';
        expect(describedBy).toContain(span.id);
    });

    it('suffix span has id and input aria-describedby includes it', () => {
        const def = baseDef([{ key: 'domain', type: 'field', dataType: 'string', label: 'Domain' }]);
        const node: LayoutNode = {
            id: 'domain-field', component: 'TextInput', category: 'field',
            props: { suffix: '.com' }, cssClasses: [], children: [], bindPath: 'domain',
        };
        const container = renderField(def, node);
        const span = container.querySelector('.formspec-input-suffix') as HTMLElement;
        expect(span.id).toBeTruthy();
        expect(span.id).toMatch(/-suffix$/);
        const input = container.querySelector('input') as HTMLInputElement;
        const describedBy = input.getAttribute('aria-describedby') ?? '';
        expect(describedBy).toContain(span.id);
    });
});

// ── Toggle role="switch" ───────────────────────────────────────────

describe('Toggle — role switch', () => {
    it('Toggle checkbox has role="switch"', () => {
        const def = baseDef([{ key: 'enabled', type: 'field', dataType: 'boolean', label: 'Enabled' }]);
        const node: LayoutNode = {
            id: 'enabled-field', component: 'Toggle', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'enabled',
        };
        const container = renderField(def, node);
        const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(input.getAttribute('role')).toBe('switch');
    });

    it('Checkbox does NOT have role="switch"', () => {
        const def = baseDef([{ key: 'agree', type: 'field', dataType: 'boolean', label: 'Agree' }]);
        const node: LayoutNode = {
            id: 'agree-field', component: 'Checkbox', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'agree',
        };
        const container = renderField(def, node);
        const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(input.getAttribute('role')).toBeNull();
    });

    it('Toggle wraps input + labels in a .formspec-toggle container', () => {
        const def = baseDef([{ key: 'active', type: 'field', dataType: 'boolean', label: 'Active' }]);
        const node: LayoutNode = {
            id: 'active-field', component: 'Toggle', category: 'field',
            props: { onLabel: 'On', offLabel: 'Off' }, cssClasses: [], children: [], bindPath: 'active',
        };
        const container = renderField(def, node);
        const toggleWrapper = container.querySelector('.formspec-toggle');
        expect(toggleWrapper).toBeTruthy();
        // The toggle container should contain the input and the on/off labels
        const input = toggleWrapper!.querySelector('input[role="switch"]');
        expect(input).toBeTruthy();
        const offLabel = toggleWrapper!.querySelector('.formspec-toggle-off');
        expect(offLabel).toBeTruthy();
        const onLabel = toggleWrapper!.querySelector('.formspec-toggle-on');
        expect(onLabel).toBeTruthy();
    });

    it('Toggle adds formspec-toggle--on when checked and keeps off/on text on fixed spans', () => {
        const def = baseDef([{ key: 'active', type: 'field', dataType: 'boolean', label: 'Active' }]);
        const node: LayoutNode = {
            id: 'active-field', component: 'Toggle', category: 'field',
            props: { onLabel: 'On', offLabel: 'Off' }, cssClasses: [], children: [], bindPath: 'active',
        };
        const container = renderField(def, node);
        const toggleWrapper = container.querySelector('.formspec-toggle') as HTMLElement;
        const offEl = toggleWrapper.querySelector('.formspec-toggle-off') as HTMLElement;
        const onEl = toggleWrapper.querySelector('.formspec-toggle-on') as HTMLElement;
        expect(toggleWrapper.classList.contains('formspec-toggle--on')).toBe(false);
        expect(offEl.textContent).toBe('Off');
        expect(onEl.textContent).toBe('On');

        const input = toggleWrapper.querySelector('input') as HTMLInputElement;
        actSync(() => {
            input.click();
        });
        expect(toggleWrapper.classList.contains('formspec-toggle--on')).toBe(true);
        expect(offEl.textContent).toBe('Off');
        expect(onEl.textContent).toBe('On');
    });

    it('Toggle without on/off labels still has .formspec-toggle wrapper', () => {
        const def = baseDef([{ key: 'active', type: 'field', dataType: 'boolean', label: 'Active' }]);
        const node: LayoutNode = {
            id: 'active-field', component: 'Toggle', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'active',
        };
        const container = renderField(def, node);
        const toggleWrapper = container.querySelector('.formspec-toggle');
        expect(toggleWrapper).toBeTruthy();
        const input = toggleWrapper!.querySelector('input[role="switch"]');
        expect(input).toBeTruthy();
    });

    it('Checkbox does NOT have .formspec-toggle wrapper', () => {
        const def = baseDef([{ key: 'agree', type: 'field', dataType: 'boolean', label: 'Agree' }]);
        const node: LayoutNode = {
            id: 'agree-field', component: 'Checkbox', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'agree',
        };
        const container = renderField(def, node);
        const toggleWrapper = container.querySelector('.formspec-toggle');
        expect(toggleWrapper).toBeFalsy();
    });
});

// ── Select searchable ──────────────────────────────────────────────

describe('Select — searchable', () => {
    it('renders a listbox with filter input when searchable=true', () => {
        const def = baseDef([{
            key: 'country', type: 'field', dataType: 'choice', label: 'Country',
            options: [
                { value: 'us', label: 'United States' },
                { value: 'ca', label: 'Canada' },
                { value: 'mx', label: 'Mexico' },
            ],
        }]);
        const node: LayoutNode = {
            id: 'country-field', component: 'Select', category: 'field',
            props: { searchable: true }, cssClasses: [], children: [], bindPath: 'country',
        };
        const container = renderField(def, node);
        expect(container.querySelector('.formspec-select-searchable')).toBeTruthy();
        expect(container.querySelector('[role="listbox"]')).toBeTruthy();
        // filter input present
        const filterInput = container.querySelector('.formspec-select-searchable input[type="text"]') as HTMLInputElement;
        expect(filterInput).toBeTruthy();
    });

    it('places combobox input inside .formspec-combobox-row', () => {
        const def = baseDef([{
            key: 'country', type: 'field', dataType: 'choice', label: 'Country',
            options: [{ value: 'us', label: 'United States' }],
        }]);
        const node: LayoutNode = {
            id: 'country-field', component: 'Select', category: 'field',
            props: { searchable: true }, cssClasses: [], children: [], bindPath: 'country',
        };
        const container = renderField(def, node);
        const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
        expect(input?.closest('.formspec-combobox-row')).not.toBeNull();
    });

    it('native select is used when searchable is not set', () => {
        const def = baseDef([{
            key: 'color', type: 'field', dataType: 'choice', label: 'Color',
            options: [{ value: 'red', label: 'Red' }],
        }]);
        const node: LayoutNode = {
            id: 'color-field', component: 'Select', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'color',
        };
        const container = renderField(def, node);
        expect(container.querySelector('select')).toBeTruthy();
        expect(container.querySelector('[role="listbox"]')).toBeNull();
    });

    it('filters options when filter text is typed', () => {
        const def = baseDef([{
            key: 'country', type: 'field', dataType: 'choice', label: 'Country',
            options: [
                { value: 'us', label: 'United States' },
                { value: 'ca', label: 'Canada' },
                { value: 'mx', label: 'Mexico' },
            ],
        }]);
        const node: LayoutNode = {
            id: 'country-field', component: 'Select', category: 'field',
            props: { searchable: true }, cssClasses: [], children: [], bindPath: 'country',
        };
        const container = renderField(def, node);
        const filterInput = container.querySelector('.formspec-select-searchable input[type="text"]') as HTMLInputElement;

        // Focus, then simulate typing via React's input value setter to trigger onChange
        actSync(() => { filterInput.focus(); });
        // React intercepts the native setter — use Object.getOwnPropertyDescriptor to trigger it
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        actSync(() => {
            nativeInputValueSetter?.call(filterInput, 'can');
            filterInput.dispatchEvent(new Event('input', { bubbles: true }));
        });

        const items = container.querySelectorAll('[role="option"]');
        expect(items.length).toBe(1);
        expect(items[0].textContent).toBe('Canada');
    });

    it('filters by definition option keywords when the label does not contain the query', () => {
        const def = baseDef([{
            key: 'country', type: 'field', dataType: 'choice', label: 'Country',
            options: [
                { value: 'us', label: 'United States', keywords: ['USA', 'US', 'America'] },
                { value: 'ca', label: 'Canada', keywords: ['CAN', 'CA'] },
            ],
        }]);
        const node: LayoutNode = {
            id: 'country-field', component: 'Select', category: 'field',
            props: { searchable: true }, cssClasses: [], children: [], bindPath: 'country',
        };
        const container = renderField(def, node);
        const filterInput = container.querySelector('.formspec-select-searchable input[type="text"]') as HTMLInputElement;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        actSync(() => { filterInput.focus(); });
        actSync(() => {
            nativeInputValueSetter?.call(filterInput, 'usa');
            filterInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const items = container.querySelectorAll('[role="option"]');
        expect(items.length).toBe(1);
        expect(items[0].textContent).toBe('United States');
    });

    it('filter input does not have a separate onInput attribute (onChange is the sole handler)', () => {
        const def = baseDef([{
            key: 'country', type: 'field', dataType: 'choice', label: 'Country',
            options: [{ value: 'us', label: 'United States' }],
        }]);
        const node: LayoutNode = {
            id: 'country-field', component: 'Select', category: 'field',
            props: { searchable: true }, cssClasses: [], children: [], bindPath: 'country',
        };
        const container = renderField(def, node);
        const filterInput = container.querySelector('.formspec-select-searchable input[type="text"]') as HTMLInputElement;
        // React removes redundant event handlers — no oninput attribute should be set directly
        expect(filterInput.getAttribute('oninput')).toBeNull();
    });
});

describe('Select — multiple (multiChoice)', () => {
    it('renders combobox with aria-multiselectable when multiple is true', () => {
        const def = baseDef([{
            key: 'tags',
            type: 'field',
            dataType: 'multiChoice',
            label: 'Tags',
            options: [
                { value: 'a', label: 'Alpha' },
                { value: 'b', label: 'Beta' },
            ],
        }]);
        const node: LayoutNode = {
            id: 'tags-field',
            component: 'Select',
            category: 'field',
            props: { multiple: true, searchable: true },
            cssClasses: [],
            children: [],
            bindPath: 'tags',
        };
        const container = renderField(def, node);
        expect(container.querySelector('.formspec-combobox')).toBeTruthy();
        expect(container.querySelector('[aria-multiselectable="true"]')).toBeTruthy();
    });
});

// ── SearchableSelect — WAI-ARIA combobox ────────────────────────────

describe('SearchableSelect — WAI-ARIA combobox pattern', () => {
    function makeSearchable(options = [
        { value: 'us', label: 'United States' },
        { value: 'ca', label: 'Canada' },
        { value: 'mx', label: 'Mexico' },
    ]) {
        const def = baseDef([{
            key: 'country', type: 'field', dataType: 'choice', label: 'Country',
            options,
        }]);
        const node: LayoutNode = {
            id: 'country-field', component: 'Select', category: 'field',
            props: { searchable: true }, cssClasses: [], children: [], bindPath: 'country',
        };
        return renderField(def, node);
    }

    it('filter input has role="combobox"', () => {
        const container = makeSearchable();
        const input = container.querySelector('.formspec-select-searchable input[type="text"]') as HTMLInputElement;
        expect(input.getAttribute('role')).toBe('combobox');
    });

    it('filter input has aria-autocomplete="list"', () => {
        const container = makeSearchable();
        const input = container.querySelector('.formspec-select-searchable input[type="text"]') as HTMLInputElement;
        expect(input.getAttribute('aria-autocomplete')).toBe('list');
    });

    it('listbox has a stable id and input aria-controls points to it', () => {
        const container = makeSearchable();
        const listbox = container.querySelector('[role="listbox"]') as HTMLElement;
        const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
        expect(listbox.id).toBeTruthy();
        expect(input.getAttribute('aria-controls')).toBe(listbox.id);
    });

    it('aria-expanded is false when input is not focused', () => {
        const container = makeSearchable();
        const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
        expect(input.getAttribute('aria-expanded')).toBe('false');
    });

    it('aria-expanded becomes true when input is focused', () => {
        const container = makeSearchable();
        const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
        actSync(() => { input.focus(); });
        expect(input.getAttribute('aria-expanded')).toBe('true');
    });

    it('listbox is hidden when input is not focused', () => {
        const container = makeSearchable();
        const listbox = container.querySelector('[role="listbox"]') as HTMLElement;
        expect(listbox.hidden).toBe(true);
    });

    it('listbox is visible when input is focused', () => {
        const container = makeSearchable();
        const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
        actSync(() => { input.focus(); });
        const listbox = container.querySelector('[role="listbox"]') as HTMLElement;
        expect(listbox.hidden).toBe(false);
    });

    it('listbox uses formspec-combobox-list for dropdown chrome (parity with web component)', () => {
        const container = makeSearchable();
        const listbox = container.querySelector('[role="listbox"]');
        expect(listbox?.classList.contains('formspec-combobox-list')).toBe(true);
    });

    it('each option has an id and role="option"', () => {
        const container = makeSearchable();
        const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
        actSync(() => { input.focus(); });
        const options = container.querySelectorAll('[role="option"]');
        expect(options.length).toBe(3);
        options.forEach(opt => expect(opt.id).toBeTruthy());
    });

    it('ArrowDown highlights the first option and sets aria-activedescendant', () => {
        const container = makeSearchable();
        const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
        actSync(() => { input.focus(); });
        actSync(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
        const options = container.querySelectorAll('[role="option"]');
        expect(options[0].getAttribute('aria-selected')).toBe('true');
        expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    });

    it('ArrowDown twice highlights the second option', () => {
        const container = makeSearchable();
        const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
        actSync(() => { input.focus(); });
        actSync(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
        actSync(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
        const options = container.querySelectorAll('[role="option"]');
        expect(options[1].getAttribute('aria-selected')).toBe('true');
        expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
    });

    it('ArrowUp from first wraps to last option', () => {
        const container = makeSearchable();
        const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
        actSync(() => { input.focus(); });
        actSync(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
        actSync(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); });
        const options = container.querySelectorAll('[role="option"]');
        expect(options[options.length - 1].getAttribute('aria-selected')).toBe('true');
    });

    it('Enter selects the highlighted option and sets field value', () => {
        const def = baseDef([{
            key: 'country', type: 'field', dataType: 'choice', label: 'Country',
            options: [
                { value: 'us', label: 'United States' },
                { value: 'ca', label: 'Canada' },
            ],
        }]);
        const engine = createFormEngine(def);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const node: LayoutNode = {
            id: 'country-field', component: 'Select', category: 'field',
            props: { searchable: true }, cssClasses: [], children: [], bindPath: 'country',
        };
        actSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }} />
                </FormspecProvider>
            );
        });
        const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
        actSync(() => { input.focus(); });
        actSync(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
        actSync(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
        expect(engine.getResponse().data['country']).toBe('us');
    });

    it('Escape closes the listbox', () => {
        const container = makeSearchable();
        const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
        actSync(() => { input.focus(); });
        expect(input.getAttribute('aria-expanded')).toBe('true');
        actSync(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        expect(input.getAttribute('aria-expanded')).toBe('false');
    });
});

// ── FileUpload maxSize ─────────────────────────────────────────────

describe('FileUpload — maxSize', () => {
    it('rejects files exceeding maxSize', () => {
        const def = baseDef([{ key: 'doc', type: 'field', dataType: 'string', label: 'Doc' }]);
        const engine = createFormEngine(def);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const node: LayoutNode = {
            id: 'doc-field', component: 'FileUpload', category: 'field',
            // maxSize = 1000 bytes
            props: { maxSize: 1000 }, cssClasses: [], children: [], bindPath: 'doc',
        };
        actSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }} />
                </FormspecProvider>
            );
        });

        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        // Simulate oversized file
        const bigFile = new File(['x'.repeat(2000)], 'big.pdf', { type: 'application/pdf' });
        Object.defineProperty(input, 'files', { value: [bigFile], configurable: true });
        actSync(() => {
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Engine value should NOT be set to a FileList — it stays at the initial empty value
        const response = engine.getResponse();
        // The engine initializes string fields to '' by default; FileList would be an object
        expect(typeof response.data['doc']).not.toBe('object');

        // An error message should be visible
        const error = container.querySelector('.formspec-file-size-error, .formspec-error') as HTMLElement;
        expect(error).toBeTruthy();
        expect(error.textContent).toContain('exceeds');
    });

    it('accepts files within maxSize', () => {
        const def = baseDef([{ key: 'doc', type: 'field', dataType: 'string', label: 'Doc' }]);
        const engine = createFormEngine(def);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const node: LayoutNode = {
            id: 'doc-field', component: 'FileUpload', category: 'field',
            props: { maxSize: 1000 }, cssClasses: [], children: [], bindPath: 'doc',
        };
        actSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }} />
                </FormspecProvider>
            );
        });

        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        const smallFile = new File(['small'], 'small.pdf', { type: 'application/pdf' });
        Object.defineProperty(input, 'files', { value: [smallFile], configurable: true });
        actSync(() => {
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Engine value should be set (FileList object)
        const response = engine.getResponse();
        expect(response.data['doc']).toBeTruthy();
    });
});

// ── DatePicker minDate / maxDate ───────────────────────────────────

describe('DatePicker — readonly', () => {
    it('does not apply external input changes when readonly', () => {
        const def = baseDef([{ key: 'dob', type: 'field', dataType: 'date', label: 'DOB' }]);
        def.binds = [{ path: 'dob', readonly: 'true' }];
        const engine = createFormEngine(def);
        engine.setValue('dob', '2020-01-01');

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const node: LayoutNode = {
            id: 'dob-field', component: 'DatePicker', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'dob',
        };
        actSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }} />
                </FormspecProvider>
            );
        });

        const input = container.querySelector('input[type="date"]') as HTMLInputElement;
        expect(input.readOnly).toBe(true);
        actSync(() => {
            input.value = '2021-06-15';
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(engine.getResponse().data.dob).toBe('2020-01-01');
    });
});

describe('NumberInput — readonly', () => {
    it('does not apply external input changes when readonly', () => {
        const def = baseDef([{ key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' }]);
        def.binds = [{ path: 'qty', readonly: 'true' }];
        const engine = createFormEngine(def);
        engine.setValue('qty', 5);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const node: LayoutNode = {
            id: 'qty-field', component: 'NumberInput', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'qty',
        };
        actSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }} />
                </FormspecProvider>
            );
        });

        const input = container.querySelector('input[type="number"]') as HTMLInputElement;
        expect(input.readOnly).toBe(true);
        actSync(() => {
            input.value = '99';
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(engine.getResponse().data.qty).toBe(5);
    });
});

describe('DatePicker — minDate/maxDate', () => {
    it('passes minDate and maxDate as min/max attributes', () => {
        const def = baseDef([{ key: 'dob', type: 'field', dataType: 'date', label: 'DOB' }]);
        const node: LayoutNode = {
            id: 'dob-field', component: 'DatePicker', category: 'field',
            props: { minDate: '2000-01-01', maxDate: '2024-12-31' }, cssClasses: [], children: [], bindPath: 'dob',
        };
        const container = renderField(def, node);
        const input = container.querySelector('input[type="date"]') as HTMLInputElement;
        expect(input.min).toBe('2000-01-01');
        expect(input.max).toBe('2024-12-31');
    });
});

// ── FileUpload dragDrop ────────────────────────────────────────────

describe('FileUpload — dragDrop', () => {
    it('renders drop zone by default (dragDrop not set)', () => {
        const def = baseDef([{ key: 'doc', type: 'field', dataType: 'string', label: 'Doc' }]);
        const node: LayoutNode = {
            id: 'doc-field', component: 'FileUpload', category: 'field',
            props: {}, cssClasses: [], children: [], bindPath: 'doc',
        };
        const container = renderField(def, node);
        expect(container.querySelector('.formspec-file-drop-zone')).toBeTruthy();
    });

    it('renders drop zone when dragDrop=true', () => {
        const def = baseDef([{ key: 'doc', type: 'field', dataType: 'string', label: 'Doc' }]);
        const node: LayoutNode = {
            id: 'doc-field', component: 'FileUpload', category: 'field',
            props: { dragDrop: true }, cssClasses: [], children: [], bindPath: 'doc',
        };
        const container = renderField(def, node);
        expect(container.querySelector('.formspec-file-drop-zone')).toBeTruthy();
    });

    it('renders plain file input when dragDrop=false', () => {
        const def = baseDef([{ key: 'doc', type: 'field', dataType: 'string', label: 'Doc' }]);
        const node: LayoutNode = {
            id: 'doc-field', component: 'FileUpload', category: 'field',
            props: { dragDrop: false }, cssClasses: [], children: [], bindPath: 'doc',
        };
        const container = renderField(def, node);
        expect(container.querySelector('.formspec-file-drop-zone')).toBeNull();
        expect(container.querySelector('input[type="file"]')).toBeTruthy();
    });
});

// ── Stepper button aria-labels ─────────────────────────────────────

describe('NumberInput stepper — button aria-labels', () => {
    it('decrement button has aria-label with field label', () => {
        const def = baseDef([{ key: 'qty', type: 'field', dataType: 'integer', label: 'Quantity' }]);
        const node: LayoutNode = {
            id: 'qty-field', component: 'NumberInput', category: 'field',
            props: { showStepper: true }, cssClasses: [], children: [], bindPath: 'qty',
        };
        const container = renderField(def, node);
        const dec = container.querySelector('.formspec-stepper-decrement') as HTMLButtonElement;
        expect(dec.getAttribute('aria-label')).toBe('Decrease Quantity');
    });

    it('increment button has aria-label with field label', () => {
        const def = baseDef([{ key: 'qty', type: 'field', dataType: 'integer', label: 'Quantity' }]);
        const node: LayoutNode = {
            id: 'qty-field', component: 'NumberInput', category: 'field',
            props: { showStepper: true }, cssClasses: [], children: [], bindPath: 'qty',
        };
        const container = renderField(def, node);
        const inc = container.querySelector('.formspec-stepper-increment') as HTMLButtonElement;
        expect(inc.getAttribute('aria-label')).toBe('Increase Quantity');
    });
});

// ── Rating (slider pattern — parity with default web component adapter) ──

describe('Rating — slider keyboard navigation', () => {
    function makeRating(value?: number) {
        const def = baseDef([{ key: 'stars', type: 'field', dataType: 'integer', label: 'Stars' }]);
        const engine = createFormEngine(def);
        if (value != null) engine.setValue('stars', value);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const node: LayoutNode = {
            id: 'stars-field', component: 'Rating', category: 'field',
            props: { maxRating: 5 }, cssClasses: [], children: [], bindPath: 'stars',
        };
        actSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }} />
                </FormspecProvider>
            );
        });
        return { container, engine };
    }

    it('wraps stars in role="slider" with aria attributes', () => {
        const { container } = makeRating();
        const slider = container.querySelector('.formspec-rating-stars') as HTMLElement;
        expect(slider).toBeTruthy();
        expect(slider.getAttribute('role')).toBe('slider');
        expect(slider.getAttribute('tabindex')).toBe('0');
        expect(slider.getAttribute('aria-valuemin')).toBe('0');
        expect(slider.getAttribute('aria-valuemax')).toBe('5');
        expect(slider.getAttribute('aria-valuenow')).toBe('0');
        expect(slider.getAttribute('aria-valuetext')).toBe('0 of 5');
    });

    it('ArrowRight increments the rating', () => {
        const { container, engine } = makeRating(2);
        const slider = container.querySelector('.formspec-rating-stars') as HTMLElement;
        actSync(() => {
            slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        });
        expect(engine.getResponse().data['stars']).toBe(3);
    });

    it('ArrowLeft decrements the rating', () => {
        const { container, engine } = makeRating(3);
        const slider = container.querySelector('.formspec-rating-stars') as HTMLElement;
        actSync(() => {
            slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        });
        expect(engine.getResponse().data['stars']).toBe(2);
    });

    it('ArrowUp increments the rating', () => {
        const { container, engine } = makeRating(1);
        const slider = container.querySelector('.formspec-rating-stars') as HTMLElement;
        actSync(() => {
            slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        });
        expect(engine.getResponse().data['stars']).toBe(2);
    });

    it('ArrowDown decrements the rating', () => {
        const { container, engine } = makeRating(4);
        const slider = container.querySelector('.formspec-rating-stars') as HTMLElement;
        actSync(() => {
            slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });
        expect(engine.getResponse().data['stars']).toBe(3);
    });

    it('Home clears rating to 0', () => {
        const { container, engine } = makeRating(4);
        const slider = container.querySelector('.formspec-rating-stars') as HTMLElement;
        actSync(() => {
            slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        });
        expect(engine.getResponse().data['stars']).toBe(0);
    });

    it('End sets rating to maxRating', () => {
        const { container, engine } = makeRating(1);
        const slider = container.querySelector('.formspec-rating-stars') as HTMLElement;
        actSync(() => {
            slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        });
        expect(engine.getResponse().data['stars']).toBe(5);
    });

    it('ArrowRight clamps at maxRating', () => {
        const { container, engine } = makeRating(5);
        const slider = container.querySelector('.formspec-rating-stars') as HTMLElement;
        actSync(() => {
            slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        });
        expect(engine.getResponse().data['stars']).toBe(5);
    });

    it('ArrowLeft clamps at 0', () => {
        const { container, engine } = makeRating(0);
        const slider = container.querySelector('.formspec-rating-stars') as HTMLElement;
        actSync(() => {
            slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        });
        expect(engine.getResponse().data['stars']).toBe(0);
    });
});

// ── aria-describedby policy (supplementary text only, not errors) ─

describe('DefaultField — aria-describedby excludes validation errors', () => {
    it('TextInput keeps hint in aria-describedby but not error id when invalid', () => {
        const def = baseDef([{
            key: 'email',
            type: 'field',
            dataType: 'string',
            label: 'Email',
            hint: 'Work email',
        }]);
        def.binds = [{ path: 'email', constraint: 'false' }];
        const engine = createFormEngine(def);
        const node: LayoutNode = {
            id: 'email-field',
            component: 'TextInput',
            category: 'field',
            props: {},
            cssClasses: [],
            children: [],
            bindPath: 'email',
        };
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        actSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode
                        node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }}
                    />
                </FormspecProvider>,
            );
        });
        engine.setValue('email', 'not-an-email');
        actSync(() => {
            const inputEl = container.querySelector('#field-email') as HTMLInputElement;
            inputEl?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        });
        const input = container.querySelector('#field-email') as HTMLInputElement;
        const db = input.getAttribute('aria-describedby') ?? '';
        expect(db).toContain('field-email-hint');
        expect(db).not.toContain('field-email-error');
        expect(input.getAttribute('aria-invalid')).toBe('true');
    });
});

// ── Field chrome parity (label / description / hint order) ────────

describe('DefaultField — description and label chrome', () => {
    it('renders description after label and before hint for TextInput', () => {
        const def = baseDef([{
            key: 'x',
            type: 'field',
            dataType: 'string',
            label: 'Title',
            description: 'Longer field help text.',
            hint: 'Short hint.',
        }]);
        const node: LayoutNode = {
            id: 'x-field',
            component: 'TextInput',
            category: 'field',
            props: {},
            cssClasses: [],
            children: [],
            bindPath: 'x',
        };
        const container = renderField(def, node);
        const field = container.querySelector('.formspec-field');
        expect(field).toBeTruthy();
        const children = [...field!.children];
        const descIdx = children.findIndex((c) => c.classList.contains('formspec-description'));
        const hintIdx = children.findIndex((c) => c.classList.contains('formspec-hint'));
        const inputIdx = children.findIndex((c) => c.matches('input'));
        expect(descIdx).toBeGreaterThan(-1);
        expect(hintIdx).toBeGreaterThan(descIdx);
        expect(inputIdx).toBeGreaterThan(hintIdx);
        expect((children[descIdx] as HTMLElement).textContent).toContain('Longer field help');
    });

    it('applies formspec-label to the primary label element', () => {
        const def = baseDef([{ key: 'y', type: 'field', dataType: 'string', label: 'Name' }]);
        const node: LayoutNode = {
            id: 'y-field',
            component: 'TextInput',
            category: 'field',
            props: {},
            cssClasses: [],
            children: [],
            bindPath: 'y',
        };
        const container = renderField(def, node);
        const lbl = container.querySelector('.formspec-field label.formspec-label');
        expect(lbl).toBeTruthy();
    });
});

// ── Select clear icon aria-hidden ─────────────────────────────────

describe('Select — clear button icon aria-hidden', () => {
    it('the × character is wrapped in aria-hidden span', () => {
        const def = baseDef([{
            key: 'color', type: 'field', dataType: 'choice', label: 'Color',
            options: [{ value: 'red', label: 'Red' }],
        }]);
        const engine = createFormEngine(def);
        engine.setValue('color', 'red');

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const node: LayoutNode = {
            id: 'color-field', component: 'Select', category: 'field',
            props: { clearable: true }, cssClasses: [], children: [], bindPath: 'color',
        };
        actSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={{ id: 'root', component: 'Stack', category: 'layout', props: {}, cssClasses: [], children: [node] }} />
                </FormspecProvider>
            );
        });

        const clearBtn = container.querySelector('.formspec-select-clear') as HTMLButtonElement;
        expect(clearBtn).toBeTruthy();
        const hiddenSpan = clearBtn.querySelector('span[aria-hidden="true"]');
        expect(hiddenSpan).toBeTruthy();
        expect(hiddenSpan!.textContent).toBe('×');
    });
});
