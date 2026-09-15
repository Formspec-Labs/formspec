/** @filedesc USWDS v3 adapter for DatePicker — usa-date-picker markup + text input (parity with RealUSWDSStory). */
import type { DatePickerBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { applyUSWDSValidationState, createUSWDSFieldDOM, uswdsWidthClass } from './shared';

import { createInputSkeleton } from '../shared/input-factory.js';

export const renderDatePicker: AdapterRenderFn<DatePickerBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error } = createUSWDSFieldDOM(behavior);

    if (p.labelPosition === 'start') root.classList.add('formspec-label-start');

    // Format hint when the item has none. Static and separate from `hint`, whose text the view model owns.
    let formatHint: HTMLElement | undefined;
    if (!behavior.hint) {
        formatHint = el('span', { class: 'usa-hint', id: `${behavior.id}-format` });
        formatHint.textContent = 'MM/DD/YYYY';
        root.appendChild(formatHint);
    }

    const useTextDate = behavior.inputType === 'date';
    const { control, actualInput } = createInputSkeleton(behavior, {
        type: useTextDate ? 'text' : behavior.inputType,
        inputClass: 'usa-input' + uswdsWidthClass(behavior.width),
        groupClass: useTextDate ? 'usa-date-picker' : undefined,
        onInputCreated: (input) => {
            if (behavior.inputType === 'datetime-local' && input instanceof HTMLInputElement) {
                if (behavior.minDate) input.min = behavior.minDate;
                if (behavior.maxDate) input.max = behavior.maxDate;
            }
        },
    });

    if (formatHint) actualInput.setAttribute('data-describedby-base', formatHint.id);

    // Special case: for usa-date-picker, the prefix/suffix logic is NOT used,
    // we just need the shell. createInputSkeleton handles groupClass if prefix/suffix present.
    // If no prefix/suffix but groupClass present, it doesn't wrap currently.
    // I'll manually wrap if useTextDate and it's not wrapped yet.
    if (useTextDate && control === actualInput) {
        const shell = el('div', { class: 'usa-date-picker' });
        shell.appendChild(actualInput);
        root.appendChild(shell);
    } else {
        root.appendChild(control);
    }

    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control: actualInput, hint, error,
        onValidationChange: (hasError) => {
            applyUSWDSValidationState(root, label, hasError, actualInput);
        },
    });
    actx.onDispose(dispose);
};
