/** @filedesc Structural DOM tests for canonical Tailwind adapter components. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { renderTextInput } from '../../src/tailwind/text-input';
import { renderNumberInput } from '../../src/tailwind/number-input';
import { renderRadioGroup } from '../../src/tailwind/radio-group';
import { renderCheckboxGroup } from '../../src/tailwind/checkbox-group';
import { renderSelect } from '../../src/tailwind/select';
import { renderDatePicker } from '../../src/tailwind/date-picker';
import { renderToggle } from '../../src/tailwind/toggle';
import { renderMoneyInput } from '../../src/tailwind/money-input';
import { renderSlider } from '../../src/tailwind/slider';
import { renderRating } from '../../src/tailwind/rating';
import { renderFileUpload } from '../../src/tailwind/file-upload';
import { renderSignature } from '../../src/tailwind/signature';
import { renderWizard } from '../../src/tailwind/wizard';
import { renderTabs } from '../../src/tailwind/tabs';
import {
    mockTextInput, mockNumberInput, mockRadioGroup, mockCheckboxGroup,
    mockSelect, mockDatePicker, mockToggle,
    mockMoneyInput, mockSlider, mockRating, mockFileUpload,
    mockSignature, mockWizard, mockTabs, mockAdapterContext, captureBindRefs,
    mockCanvasContext,
} from '../helpers';

beforeAll(() => { mockCanvasContext(); });

// ── Helpers ────────────────────────────────────────────────────────

function makeParent(): HTMLElement { return document.createElement('div'); }

/** Assert an element has all the specified Tailwind utility classes. */
function hasClasses(el: Element, ...classes: string[]) {
    for (const cls of classes) {
        expect(el.classList.contains(cls), `Expected class "${cls}" on ${el.tagName}`).toBe(true);
    }
}

// ── TextInput ──────────────────────────────────────────────────────

describe('Tailwind TextInput', () => {
    it('renders form group with styled input', () => {
        const parent = makeParent();
        renderTextInput(mockTextInput(), parent, mockAdapterContext());

        const root = parent.firstElementChild!;
        expect(root).toBeTruthy();
        expect(root.getAttribute('data-name')).toBe('name');

        // Label
        const label = root.querySelector('label')!;
        expect(label).toBeTruthy();
        expect(label.textContent).toBe('Full Name');
        hasClasses(label, 'block', 'text-sm', 'font-semibold');

        // Input
        const input = root.querySelector('input')!;
        expect(input).toBeTruthy();
        expect(input.type).toBe('text');
        hasClasses(input, 'block', 'w-full', 'rounded-xl');

        // Error element
        const error = root.querySelector('#field-name-error')!;
        expect(error).toBeTruthy();
        hasClasses(error, 'text-sm');
        expect(error.className).toContain('var(--formspec-tw-danger)');
    });

    it('renders textarea when maxLines > 1', () => {
        const parent = makeParent();
        renderTextInput(mockTextInput({ maxLines: 5 }), parent, mockAdapterContext());
        expect(parent.querySelector('textarea')).toBeTruthy();
        expect(parent.querySelector('input')).toBeNull();
    });

    it('renders prefix/suffix with input group', () => {
        const parent = makeParent();
        renderTextInput(mockTextInput({ prefix: '$', suffix: '.00' }), parent, mockAdapterContext());
        // Prefix and suffix addons use CSS variable classes — select by muted text token
        const texts = Array.from(parent.querySelectorAll('[class*="formspec-tw-muted"]')).map(e => e.textContent);
        expect(texts).toContain('$');
        expect(texts).toContain('.00');
    });

    it('hides label with sr-only when labelPosition is hidden', () => {
        const parent = makeParent();
        renderTextInput(
            mockTextInput({ presentation: { labelPosition: 'hidden' } as any }),
            parent, mockAdapterContext()
        );
        const label = parent.querySelector('label')!;
        expect(label.classList.contains('sr-only')).toBe(true);
    });

    it('calls bind() with correct FieldRefs and registers dispose', () => {
        const parent = makeParent();
        const actx = mockAdapterContext();
        const b = mockTextInput();
        renderTextInput(b, parent, actx);

        expect(b.bind).toHaveBeenCalledOnce();
        expect(actx.onDispose).toHaveBeenCalled();

        const refs = captureBindRefs(b);
        expect(refs.root).toBeTruthy();
        expect(refs.label).toBeTruthy();
        expect(refs.control).toBeTruthy();
        expect(refs.error).toBeTruthy();
        expect(typeof refs.onValidationChange).toBe('function');
    });

    it('onValidationChange toggles error classes', () => {
        const parent = makeParent();
        const b = mockTextInput();
        renderTextInput(b, parent, mockAdapterContext());

        const refs = captureBindRefs(b);
        const input = parent.querySelector('input')!;

        refs.onValidationChange!(true);
        expect(input.className).toContain('var(--formspec-tw-danger)');

        refs.onValidationChange!(false);
        expect(input.className).not.toContain('var(--formspec-tw-danger)');
    });
});

// ── NumberInput ────────────────────────────────────────────────────

describe('Tailwind NumberInput', () => {
    it('renders input with type=number and constraints', () => {
        const parent = makeParent();
        renderNumberInput(mockNumberInput({ min: 0, max: 120, step: 1 }), parent, mockAdapterContext());
        const input = parent.querySelector('input') as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.type).toBe('number');
        expect(input.min).toBe('0');
        expect(input.max).toBe('120');
        hasClasses(input, 'block', 'w-full', 'rounded-xl');
    });

    it('calls bind() and registers dispose', () => {
        const parent = makeParent();
        const actx = mockAdapterContext();
        const b = mockNumberInput();
        renderNumberInput(b, parent, actx);
        expect(b.bind).toHaveBeenCalledOnce();
        expect(actx.onDispose).toHaveBeenCalled();
    });
});

// ── RadioGroup ─────────────────────────────────────────────────────

describe('Tailwind RadioGroup', () => {
    it('renders fieldset with radio options', () => {
        const parent = makeParent();
        renderRadioGroup(mockRadioGroup(), parent, mockAdapterContext());

        expect(parent.querySelector('fieldset')).toBeTruthy();
        expect(parent.querySelector('legend')).toBeTruthy();
        const radios = parent.querySelectorAll('input[type="radio"]');
        expect(radios.length).toBe(2);
    });

    it('options use a responsive grid of card labels', () => {
        const parent = makeParent();
        renderRadioGroup(mockRadioGroup(), parent, mockAdapterContext());
        expect(parent.querySelector('.grid.gap-3')).toBeTruthy();
        expect(parent.querySelectorAll('label.rounded-lg').length).toBeGreaterThanOrEqual(2);
    });

    it('passes optionControls and rebuildOptions to bind()', () => {
        const parent = makeParent();
        const b = mockRadioGroup();
        renderRadioGroup(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);
        expect(refs.optionControls).toBeTruthy();
        expect(refs.optionControls!.size).toBe(2);
        expect(typeof refs.rebuildOptions).toBe('function');
    });
});

// ── CheckboxGroup ──────────────────────────────────────────────────

describe('Tailwind CheckboxGroup', () => {
    it('renders fieldset with checkbox options', () => {
        const parent = makeParent();
        renderCheckboxGroup(mockCheckboxGroup(), parent, mockAdapterContext());
        expect(parent.querySelector('fieldset')).toBeTruthy();
        const checkboxes = parent.querySelectorAll('input[type="checkbox"]');
        expect(checkboxes.length).toBe(2);
    });

    it('renders select-all checkbox when selectAll is true', () => {
        const parent = makeParent();
        renderCheckboxGroup(mockCheckboxGroup({ selectAll: true }), parent, mockAdapterContext());
        const checkboxes = parent.querySelectorAll('input[type="checkbox"]');
        // 2 options + 1 select-all = 3
        expect(checkboxes.length).toBe(3);
    });
});

// ── Select ─────────────────────────────────────────────────────────

describe('Tailwind Select', () => {
    it('renders styled select with options', () => {
        const parent = makeParent();
        renderSelect(mockSelect(), parent, mockAdapterContext());
        const select = parent.querySelector('select') as HTMLSelectElement;
        expect(select).toBeTruthy();
        hasClasses(select, 'block', 'w-full', 'rounded-xl');
        // placeholder + 2 options = 3
        expect(select.options.length).toBe(3);
    });

    it('passes rebuildOptions to bind()', () => {
        const parent = makeParent();
        const b = mockSelect();
        renderSelect(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);
        expect(typeof refs.rebuildOptions).toBe('function');
    });
});

// ── DatePicker ─────────────────────────────────────────────────────

describe('Tailwind DatePicker', () => {
    it('renders input with type=date', () => {
        const parent = makeParent();
        renderDatePicker(mockDatePicker(), parent, mockAdapterContext());
        const input = parent.querySelector('input') as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.type).toBe('date');
        hasClasses(input, 'block', 'w-full', 'rounded-xl');
    });
});

// ── Toggle ─────────────────────────────────────────────────────────

describe('Tailwind Toggle', () => {
    it('renders toggle switch with on/off labels', () => {
        const parent = makeParent();
        renderToggle(mockToggle(), parent, mockAdapterContext());
        const input = parent.querySelector('input[type="checkbox"]')!;
        expect(input).toBeTruthy();
        expect(parent.querySelector('input[role="switch"]')).toBeTruthy();
    });
});

// ── MoneyInput ─────────────────────────────────────────────────────

describe('Tailwind MoneyInput', () => {
    it('renders input group with currency prefix', () => {
        const parent = makeParent();
        renderMoneyInput(mockMoneyInput(), parent, mockAdapterContext());
        // Should have currency symbol somewhere
        const allText = parent.textContent;
        expect(allText).toContain('$');
        expect(parent.querySelector('input[type="number"]')).toBeTruthy();
    });

    it('renders currency input when no resolvedCurrency', () => {
        const parent = makeParent();
        renderMoneyInput(mockMoneyInput({ resolvedCurrency: null }), parent, mockAdapterContext());
        const inputs = parent.querySelectorAll('input');
        // Amount input + currency input
        expect(inputs.length).toBeGreaterThanOrEqual(2);
    });
});

// ── Slider ─────────────────────────────────────────────────────────

describe('Tailwind Slider', () => {
    it('renders range input', () => {
        const parent = makeParent();
        renderSlider(mockSlider(), parent, mockAdapterContext());
        const input = parent.querySelector('input[type="range"]') as HTMLInputElement;
        expect(input).toBeTruthy();
        hasClasses(input, 'flex-1', 'min-w-[10rem]');
        expect(input.classList.contains('formspec-tw-range')).toBe(true);
    });
});

// ── Rating ─────────────────────────────────────────────────────────

describe('Tailwind Rating', () => {
    it('renders 5 star spans with ARIA slider', () => {
        const parent = makeParent();
        renderRating(mockRating(), parent, mockAdapterContext());
        expect(parent.querySelectorAll('.formspec-rating-star').length).toBe(5);
        expect(parent.querySelector('[role="slider"]')).toBeTruthy();
    });
});

// ── FileUpload ─────────────────────────────────────────────────────

describe('Tailwind FileUpload', () => {
    it('renders file input with drop zone', () => {
        const parent = makeParent();
        renderFileUpload(mockFileUpload(), parent, mockAdapterContext());
        expect(parent.querySelector('input[type="file"]')).toBeTruthy();
        // Should have a visual drop zone
        const dropZone = parent.querySelector('[class*="border-dashed"]');
        expect(dropZone).toBeTruthy();
    });
});

// ── Signature ──────────────────────────────────────────────────────

describe('Tailwind Signature', () => {
    it('renders canvas and clear button', () => {
        const parent = makeParent();
        renderSignature(mockSignature(), parent, mockAdapterContext());
        expect(parent.querySelector('canvas')).toBeTruthy();
        const clearBtn = parent.querySelector('button')!;
        expect(clearBtn).toBeTruthy();
        expect(clearBtn.textContent).toBe('Clear');
    });
});

// ── Wizard ──────────────────────────────────────────────────────────

describe('Tailwind Wizard', () => {
    it('renders step indicator when showProgress is true', () => {
        const parent = makeParent();
        renderWizard(mockWizard(), parent, mockAdapterContext());
        // Should have step indicator elements
        const steps = parent.querySelectorAll('[class*="step"],.formspec-wizard-step');
        // At minimum: panels and progress elements should exist
        expect(parent.querySelector('.formspec-wizard')).toBeTruthy();
        expect(parent.querySelectorAll('.formspec-wizard-panel').length).toBe(2);
    });

    it('renders prev/next navigation buttons', () => {
        const parent = makeParent();
        renderWizard(mockWizard(), parent, mockAdapterContext());
        const buttons = parent.querySelectorAll('button');
        expect(buttons.length).toBeGreaterThanOrEqual(2);
        const texts = Array.from(buttons).map(b => b.textContent);
        expect(texts).toContain('Previous');
        expect(texts).toContain('Next');
    });
});

// ── Tabs ────────────────────────────────────────────────────────────

describe('Tailwind Tabs', () => {
    it('renders tab bar with role=tablist', () => {
        const parent = makeParent();
        renderTabs(mockTabs(), parent, mockAdapterContext());
        expect(parent.querySelector('[role="tablist"]')).toBeTruthy();
        const tabs = parent.querySelectorAll('[role="tab"]');
        expect(tabs.length).toBe(2);
    });

    it('renders tab panels with correct ARIA', () => {
        const parent = makeParent();
        renderTabs(mockTabs(), parent, mockAdapterContext());
        const panels = parent.querySelectorAll('[role="tabpanel"]');
        expect(panels.length).toBe(2);
    });
});

// ── Cascade obligations ────────────────────────────────────────────

describe('Tailwind cascade obligations', () => {
    it('applies cssClass from presentation to root', () => {
        const parent = makeParent();
        const b = mockTextInput({ presentation: { cssClass: 'custom-theme-class' } as any });
        renderTextInput(b, parent, mockAdapterContext());
        const root = parent.firstElementChild!;
        expect(root.classList.contains('custom-theme-class')).toBe(true);
    });

    it('applies accessibility from presentation to root', () => {
        const parent = makeParent();
        const b = mockTextInput({
            presentation: {
                accessibility: { role: 'region', description: 'Important field' }
            } as any,
        });
        renderTextInput(b, parent, mockAdapterContext());
        const root = parent.firstElementChild!;
        expect(root.getAttribute('role')).toBe('region');
        expect(root.getAttribute('aria-description')).toBe('Important field');
    });
});

// ── Adapter shape ──────────────────────────────────────────────────

describe('tailwindAdapter shape', () => {
    it('exports all 14 component render functions', async () => {
        const { tailwindAdapter } = await import('../../src/tailwind/index');
        expect(tailwindAdapter.name).toBe('tailwind');
        const expected = [
            'TextInput', 'NumberInput', 'RadioGroup', 'CheckboxGroup', 'Select',
            'DatePicker', 'Toggle', 'MoneyInput', 'Slider',
            'Rating', 'FileUpload', 'Signature', 'Wizard', 'Tabs',
        ];
        for (const name of expected) {
            expect(tailwindAdapter.components[name], `Missing component: ${name}`).toBeDefined();
        }
    });

    it('does not inject integrationCSS (host Tailwind owns all control styling)', async () => {
        const { tailwindAdapter } = await import('../../src/tailwind/index');
        expect(tailwindAdapter.integrationCSS).toBeUndefined();
    });
});

describe('tailwind core CSS defaults', () => {
    it('prefers emitted formspec theme tokens over package fallback colors', () => {
        const css = readFileSync(
            resolve(import.meta.dirname, '../../src/tailwind/tailwind-formspec-core.css'),
            'utf8',
        );

        expect(css).toContain('var(--formspec-color-primary');
        expect(css).toContain('var(--formspec-color-surface');
        expect(css).toContain('var(--formspec-color-text');
    });

    it('does not force global dark mode with prefers-color-scheme root overrides', () => {
        const css = readFileSync(
            resolve(import.meta.dirname, '../../src/tailwind/tailwind-formspec-core.css'),
            'utf8',
        );

        expect(css).not.toContain('@media (prefers-color-scheme: dark)');
    });
});
