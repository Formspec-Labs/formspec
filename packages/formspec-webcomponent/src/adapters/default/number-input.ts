/** @filedesc Default adapter for NumberInput — renders a numeric input element, with optional stepper buttons. */
import type { NumberInputBehavior } from '../../behaviors/types';
import type { AdapterRenderFn } from '../types';
import { createFieldDOM, finalizeFieldDOM, applyControlSlotClass, wrapInputAdornments, formspecWidthClass } from './shared';

export const renderNumberInput: AdapterRenderFn<NumberInputBehavior> = (
    behavior, parent, actx
) => {
    const fieldDOM = createFieldDOM(behavior, actx);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'formspec-input';
    input.name = behavior.fieldPath;
    input.id = behavior.id;
    if (behavior.placeholder) input.placeholder = behavior.placeholder;
    if (behavior.step != null) input.step = String(behavior.step);
    if (behavior.min != null) input.min = String(behavior.min);
    if (behavior.max != null) input.max = String(behavior.max);

    // Prefix/suffix hug the input; stepper buttons sit outside them.
    const adorned = wrapInputAdornments(input, behavior);
    let control: HTMLElement;
    if (behavior.showStepper) {
        const stepVal = behavior.step ?? 1;
        const wrapper = document.createElement('div');
        wrapper.className = 'formspec-stepper';

        const decBtn = document.createElement('button');
        decBtn.type = 'button';
        decBtn.className = 'formspec-stepper-decrement formspec-focus-ring';
        decBtn.textContent = '\u2212'; // minus sign
        decBtn.setAttribute('aria-label', `Decrease ${behavior.label}`);

        const incBtn = document.createElement('button');
        incBtn.type = 'button';
        incBtn.className = 'formspec-stepper-increment formspec-focus-ring';
        incBtn.textContent = '+';
        incBtn.setAttribute('aria-label', `Increase ${behavior.label}`);

        decBtn.addEventListener('click', () => {
            const current = Number(input.value) || 0;
            const next = current - stepVal;
            if (behavior.min != null && next < behavior.min) return;
            input.value = String(next);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        incBtn.addEventListener('click', () => {
            const current = Number(input.value) || 0;
            const next = current + stepVal;
            if (behavior.max != null && next > behavior.max) return;
            input.value = String(next);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        wrapper.append(decBtn, adorned, incBtn);
        control = wrapper;
        // No width stop here: default.inputs.css fixes the stepper's inner input at a hard
        // `width: 3.5rem` (a compact spinner shape, not a free-form field sized to its answer) —
        // widgetConfig.width and showStepper are mutually exclusive sizing concerns.
    } else {
        control = adorned;
        // The stop targets the bordered box: the input itself, or — with a prefix/suffix —
        // the .formspec-input-adornment wrapper wrapInputAdornments returns around it.
        control.className += formspecWidthClass(behavior.width);
    }
    fieldDOM.root.appendChild(control);
    applyControlSlotClass(control, behavior, actx);

    finalizeFieldDOM(fieldDOM, behavior, actx);
    parent.appendChild(fieldDOM.root);

    const dispose = behavior.bind({
        root: fieldDOM.root,
        label: fieldDOM.label,
        control,
        hint: fieldDOM.hint,
        error: fieldDOM.error,
    });
    actx.onDispose(dispose);
};
