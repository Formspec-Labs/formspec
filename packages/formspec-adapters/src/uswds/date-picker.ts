/** @filedesc USWDS v3 adapter for DatePicker — usa-date-picker markup + text input (parity with RealUSWDSStory). */
import { widthStopClass, type DatePickerBehavior, type AdapterRenderFn } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { applyUSWDSValidationState, createUSWDSFieldDOM } from './shared';

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
    // No groupClass: DatePickerBehavior carries no prefix/suffix, so createInputSkeleton's
    // group-wrap branch (triggered only by prefix || suffix) never fires — a `usa-date-picker`
    // groupClass here would be dead configuration. The useTextDate shell below carries that
    // class explicitly instead.
    const { control, actualInput } = createInputSkeleton(behavior, {
        type: useTextDate ? 'text' : behavior.inputType,
        inputClass: 'usa-input',
        onInputCreated: (input) => {
            if (behavior.inputType === 'datetime-local' && input instanceof HTMLInputElement) {
                if (behavior.minDate) input.min = behavior.minDate;
                if (behavior.maxDate) input.max = behavior.maxDate;
            }
        },
    });
    // Invariant-safe form even though DatePicker carries no prefix/suffix today: target whatever
    // createInputSkeleton returns as the control, not the inner element the class was seeded on.
    control.className += widthStopClass('usa-input', behavior.width);

    if (formatHint) actualInput.setAttribute('data-describedby-base', formatHint.id);

    // useTextDate: wrap the bare input in the usa-date-picker shell manually (no prefix/suffix
    // means createInputSkeleton never wraps it).
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
