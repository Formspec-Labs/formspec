/** @filedesc Tailwind adapter for DatePicker — renders native date input with Tailwind styling. */
import type { DatePickerBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { createInputSkeleton } from '../shared/input-factory.js';
import { createTailwindFieldDOM, TW, toggleInputError } from './shared';

export const renderDatePicker: AdapterRenderFn<DatePickerBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error, describedBy } = createTailwindFieldDOM(behavior);

    if (p.labelPosition === 'start') root.style.display = 'flex';

    const { control, actualInput } = createInputSkeleton(behavior, {
        type: behavior.inputType,
        inputClass: TW.input,
        ariaDescribedBy: describedBy,
        onInputCreated: (input) => {
            if (behavior.minDate) input.min = behavior.minDate;
            if (behavior.maxDate) input.max = behavior.maxDate;
        }
    });

    root.appendChild(control);
    root.appendChild(error);
    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control: actualInput, hint, error,
        onValidationChange: (hasError) => {
            toggleInputError(actualInput, hasError);
        },
    });
    actx.onDispose(dispose);
};
