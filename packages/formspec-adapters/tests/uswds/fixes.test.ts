/**
 * @filedesc Failing tests (RED) for known USWDS adapter bugs.
 *
 * Each test targets a specific issue identified in the code-scout review.
 * All should FAIL before the fix and PASS after.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderTextInput } from '../../src/uswds/text-input';
import { renderNumberInput } from '../../src/uswds/number-input';
import { renderSelect } from '../../src/uswds/select';
import { renderCheckboxGroup } from '../../src/uswds/checkbox-group';
import { renderRadioGroup } from '../../src/uswds/radio-group';
import { renderMoneyInput } from '../../src/uswds/money-input';
import { renderToggle } from '../../src/uswds/toggle';
import { renderRating } from '../../src/uswds/rating';
import { renderSignature } from '../../src/uswds/signature';
import {
    mockTextInput, mockNumberInput, mockSelect, mockToggle, mockCheckboxGroup, mockRadioGroup, mockMoneyInput,
    mockRating, mockSignature, mockAdapterContext, captureBindRefs,
    mockCanvasContext,
} from '../helpers';

beforeAll(() => { mockCanvasContext(); });

function makeParent(): HTMLElement { return document.createElement('div'); }

// ════════════════════════════════════════════════════════════════════
// Issue 1: Error-class toggling
// USWDS requires usa-form-group--error on the wrapper and
// usa-input--error on the input when validation fails.
// Currently: adapters pass no onValidationChange callback to bind().
// ════════════════════════════════════════════════════════════════════

describe('Error-class toggling (onValidationChange)', () => {
    it('TextInput passes onValidationChange to bind()', () => {
        const parent = makeParent();
        const b = mockTextInput();
        renderTextInput(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);
        expect(typeof refs.onValidationChange).toBe('function');
    });

    it('TextInput onValidationChange toggles usa-form-group--error on root', () => {
        const parent = makeParent();
        const b = mockTextInput();
        renderTextInput(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);

        // Simulate error
        refs.onValidationChange!(true, 'Required');
        const root = parent.querySelector('.usa-form-group')!;
        expect(root.classList.contains('usa-form-group--error')).toBe(true);

        // Simulate clear
        refs.onValidationChange!(false, '');
        expect(root.classList.contains('usa-form-group--error')).toBe(false);
    });

    it('TextInput onValidationChange toggles usa-input--error on the input', () => {
        const parent = makeParent();
        const b = mockTextInput();
        renderTextInput(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);

        refs.onValidationChange!(true, 'Required');
        const input = parent.querySelector('.usa-input')!;
        expect(input.classList.contains('usa-input--error')).toBe(true);
    });

    it('TextInput onValidationChange toggles usa-label--error on the label', () => {
        const parent = makeParent();
        const b = mockTextInput();
        renderTextInput(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);

        refs.onValidationChange!(true, 'Required');
        const label = parent.querySelector('.usa-label')!;
        expect(label.classList.contains('usa-label--error')).toBe(true);
    });

    it('NumberInput passes onValidationChange to bind()', () => {
        const parent = makeParent();
        const b = mockNumberInput();
        renderNumberInput(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);
        expect(typeof refs.onValidationChange).toBe('function');
    });

    it('Select onValidationChange uses usa-input--error and usa-label--error', () => {
        const parent = makeParent();
        const b = mockSelect();
        renderSelect(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);

        refs.onValidationChange!(true, 'Required');
        const label = parent.querySelector('.usa-label')!;
        const select = parent.querySelector('.usa-select')!;
        expect(label.classList.contains('usa-label--error')).toBe(true);
        expect(select.classList.contains('usa-input--error')).toBe(true);
    });

    // A fieldset renders its legend inside the border box, so a left border on the fieldset starts at the
    // legend's vertical midpoint — halfway down every multi-line question. USWDS's template never does
    // that: the error modifier belongs on the wrapping `.usa-form-group`.
    it.each([
        ['CheckboxGroup', () => { const b = mockCheckboxGroup(); return { b, render: renderCheckboxGroup }; }],
        ['RadioGroup', () => { const b = mockRadioGroup(); return { b, render: renderRadioGroup }; }],
    ] as const)('%s puts the error modifier on the form group, never on the fieldset', (_name, make) => {
        const parent = makeParent();
        const { b, render } = make();
        render(b as never, parent, mockAdapterContext());
        const refs = captureBindRefs(b);

        refs.onValidationChange!(true, 'Required');
        const group = parent.querySelector('.usa-form-group')!;
        const fieldset = parent.querySelector('fieldset.usa-fieldset')!;
        const legend = parent.querySelector('.usa-legend')!;
        expect(group.classList.contains('usa-form-group--error')).toBe(true);
        expect(fieldset.classList.contains('usa-form-group--error')).toBe(false);
        expect(group.contains(fieldset)).toBe(true);
        expect(legend.classList.contains('usa-label--error')).toBe(true);

        refs.onValidationChange!(false, '');
        expect(group.classList.contains('usa-form-group--error')).toBe(false);
    });

    // A prefixed input is borderless inside its group, so the group carries the error border.
    it('MoneyInput puts the error border on the currency input group', () => {
        const parent = makeParent();
        const b = mockMoneyInput({ resolvedCurrency: '$' });
        renderMoneyInput(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);

        const group = parent.querySelector('.usa-input-group')!;
        refs.onValidationChange!(true, 'Required');
        expect(group.classList.contains('usa-input-group--error')).toBe(true);
        expect(parent.querySelector('.formspec-money-amount')!.classList.contains('usa-input--error')).toBe(true);

        refs.onValidationChange!(false, '');
        expect(group.classList.contains('usa-input-group--error')).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════
// Issue 2: Missing aria-describedby on Toggle, Rating, Signature
// These adapters don't link hint/error elements to the input via
// aria-describedby, unlike TextInput/NumberInput/Select/DatePicker.
// ════════════════════════════════════════════════════════════════════

describe('aria-describedby gaps', () => {
    it('Toggle passes hint and error to bind()', () => {
        const parent = makeParent();
        const b = mockToggle({ hint: 'Enable notifications' });
        renderToggle(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);
        expect(refs.hint).toBeTruthy();
        expect(refs.error).toBeTruthy();
    });

    it('Rating passes hint and error to bind()', () => {
        const parent = makeParent();
        const b = mockRating({ hint: 'Rate from 1 to 5' });
        renderRating(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);
        expect(refs.hint).toBeTruthy();
        expect(refs.error).toBeTruthy();
    });

    it('Signature passes hint and error to bind()', () => {
        const parent = makeParent();
        const b = mockSignature({ hint: 'Draw your signature' });
        renderSignature(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);
        expect(refs.hint).toBeTruthy();
        expect(refs.error).toBeTruthy();
    });
});

// ════════════════════════════════════════════════════════════════════
// Issue 3: Select missing rebuildOptions
// The Select adapter doesn't pass rebuildOptions to bind(), so
// remote/async options won't update the DOM.
// ════════════════════════════════════════════════════════════════════

describe('Select rebuildOptions', () => {
    it('passes rebuildOptions to bind()', () => {
        const parent = makeParent();
        const b = mockSelect();
        renderSelect(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);
        expect(typeof refs.rebuildOptions).toBe('function');
    });

    it('rebuildOptions replaces select options', () => {
        const parent = makeParent();
        const b = mockSelect();
        renderSelect(b, parent, mockAdapterContext());
        const refs = captureBindRefs(b);

        // Rebuild with new options
        refs.rebuildOptions!(
            parent.querySelector('select')!,
            [{ value: 'mx', label: 'Mexico' }, { value: 'br', label: 'Brazil' }]
        );

        const select = parent.querySelector('select.usa-select') as HTMLSelectElement;
        const optTexts = Array.from(select.options).map(o => o.textContent);
        expect(optTexts).toContain('Mexico');
        expect(optTexts).toContain('Brazil');
        // Old options should be gone
        expect(optTexts).not.toContain('USA');
    });
});

// ════════════════════════════════════════════════════════════════════
// Issue 4: Rating keyboard ignores allowHalf
// When allowHalf is true, keyboard Enter/Space on a star always sets
// the full integer value instead of respecting half-star logic.
// ════════════════════════════════════════════════════════════════════

describe('Rating keyboard (container-level slider pattern)', () => {
    it('ArrowRight on container increments by 1 when allowHalf is false', () => {
        const parent = makeParent();
        const b = mockRating({ allowHalf: false });
        renderRating(b, parent, mockAdapterContext());

        const container = parent.querySelector('.formspec-rating-stars')!;
        container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(b.setValue).toHaveBeenCalledWith(1);
    });

    it('ArrowRight on container increments by 0.5 when allowHalf is true', () => {
        const parent = makeParent();
        const b = mockRating({ allowHalf: true });
        renderRating(b, parent, mockAdapterContext());

        const container = parent.querySelector('.formspec-rating-stars')!;
        container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(b.setValue).toHaveBeenCalledWith(0.5);
    });
});

// ════════════════════════════════════════════════════════════════════
// Issue 4b: Rating ARIA slider semantics
// The container should use role="slider" with aria-valuenow/valuetext
// and support Home/End keys, matching the default adapter's quality.
// ════════════════════════════════════════════════════════════════════

describe('Rating ARIA slider semantics', () => {
    it('container has role=slider with aria-valuenow', () => {
        const parent = makeParent();
        renderRating(mockRating(), parent, mockAdapterContext());
        const container = parent.querySelector('.formspec-rating-stars')!;
        expect(container.getAttribute('role')).toBe('slider');
        expect(container.getAttribute('aria-valuenow')).toBe('0');
        expect(container.getAttribute('aria-valuemin')).toBe('0');
        expect(container.getAttribute('aria-valuemax')).toBe('5');
    });

    it('container is focusable with tabindex=0', () => {
        const parent = makeParent();
        renderRating(mockRating(), parent, mockAdapterContext());
        const container = parent.querySelector('.formspec-rating-stars')!;
        expect(container.getAttribute('tabindex')).toBe('0');
    });

    it('Home key sets value to 0', () => {
        const parent = makeParent();
        const b = mockRating();
        renderRating(b, parent, mockAdapterContext());
        const container = parent.querySelector('.formspec-rating-stars')!;
        container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(b.setValue).toHaveBeenCalledWith(0);
    });

    it('End key sets value to maxRating', () => {
        const parent = makeParent();
        const b = mockRating();
        renderRating(b, parent, mockAdapterContext());
        const container = parent.querySelector('.formspec-rating-stars')!;
        container.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        expect(b.setValue).toHaveBeenCalledWith(5);
    });

    it('ArrowRight increments by step', () => {
        const parent = makeParent();
        const b = mockRating({ allowHalf: false });
        renderRating(b, parent, mockAdapterContext());
        const container = parent.querySelector('.formspec-rating-stars')!;
        container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(b.setValue).toHaveBeenCalledWith(1);
    });

    it('ArrowRight increments by 0.5 when allowHalf', () => {
        const parent = makeParent();
        const b = mockRating({ allowHalf: true });
        renderRating(b, parent, mockAdapterContext());
        const container = parent.querySelector('.formspec-rating-stars')!;
        container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(b.setValue).toHaveBeenCalledWith(0.5);
    });
});

// ════════════════════════════════════════════════════════════════════
// Issue 5: Signature missing touch event support
// The canvas only handles mouse events. Touch events needed for mobile.
// ════════════════════════════════════════════════════════════════════

describe('Signature touch events', () => {
    it('dispatches formspec-signature-drawn on touchend', () => {
        const parent = makeParent();
        renderSignature(mockSignature(), parent, mockAdapterContext());
        const canvas = parent.querySelector('canvas')!;

        const drawn = vi.fn();
        const root = parent.querySelector('.usa-form-group')!;
        root.addEventListener('formspec-signature-drawn', drawn);

        // Simulate touch sequence
        const touch = { clientX: 50, clientY: 50, identifier: 0, target: canvas };
        canvas.dispatchEvent(new TouchEvent('touchstart', {
            touches: [touch as any],
            bubbles: true,
        }));
        canvas.dispatchEvent(new TouchEvent('touchmove', {
            touches: [touch as any],
            bubbles: true,
        }));
        canvas.dispatchEvent(new TouchEvent('touchend', {
            touches: [],
            bubbles: true,
        }));

        expect(drawn).toHaveBeenCalled();
    });

    it('prevents default on touchstart to block scrolling', () => {
        const parent = makeParent();
        renderSignature(mockSignature(), parent, mockAdapterContext());
        const canvas = parent.querySelector('canvas')!;

        const touch = { clientX: 50, clientY: 50, identifier: 0, target: canvas };
        const event = new TouchEvent('touchstart', {
            touches: [touch as any],
            cancelable: true,
            bubbles: true,
        });
        canvas.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });
});

describe('empty error node', () => {
    // USWDS styles `.usa-error-message` display:block with .25rem vertical padding, so an always-present
    // empty node adds 8px under every label. The reference markup only has the node in the error state.
    it('is hidden until there is a message, then shows it', () => {
        const parent = makeParent();
        const b = mockTextInput();
        renderTextInput(b, parent, mockAdapterContext());
        const error = parent.querySelector('.usa-error-message') as HTMLElement;

        expect(error.hidden).toBe(true);

        // The shared binder writes the text, then reports the state the adapter styles.
        error.textContent = 'Required';
        const refs = captureBindRefs(b);
        refs.onValidationChange!(true, 'Required');
        expect(error.hidden).toBe(false);

        error.textContent = '';
        refs.onValidationChange!(false, '');
        expect(error.hidden).toBe(true);
    });
});
