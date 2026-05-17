/** @filedesc USWDS v3 adapter for DatePicker — usa-date-picker markup + text input (parity with RealUSWDSStory). */
import type { DatePickerBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { applyUSWDSValidationState, createUSWDSFieldDOM } from './shared';

import { createInputSkeleton } from '../shared/input-factory.js';

export const renderDatePicker: AdapterRenderFn<DatePickerBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint: hintFromDef, error } = createUSWDSFieldDOM(behavior);

    if (p.labelPosition === 'start') root.style.display = 'flex';

    let hint = hintFromDef;
    if (!hint) {
        hint = el('span', { class: 'usa-hint', id: `${behavior.id}-hint` });
        hint.textContent = 'MM/DD/YYYY';
        root.appendChild(hint);
    }

    const useTextDate = behavior.inputType === 'date';
    const { control, actualInput } = createInputSkeleton(behavior, {
        type: useTextDate ? 'text' : behavior.inputType,
        inputClass: 'usa-input',
        groupClass: useTextDate ? 'usa-date-picker' : undefined,
        onInputCreated: (input) => {
            if (behavior.inputType === 'datetime-local') {
                if (behavior.minDate) input.min = behavior.minDate;
                if (behavior.maxDate) input.max = behavior.maxDate;
            }
        },
    });

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
