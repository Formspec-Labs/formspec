/** @filedesc Default adapter for DatePicker — renders a date/time/datetime-local input. */
import type { DatePickerBehavior } from '../../behaviors/types';
import type { AdapterRenderFn } from '../types';
import { createFieldDOM, finalizeFieldDOM, applyControlSlotClass, formspecWidthClass } from './shared';

export const renderDatePicker: AdapterRenderFn<DatePickerBehavior> = (
    behavior, parent, actx
) => {
    const fieldDOM = createFieldDOM(behavior, actx);

    const input = document.createElement('input');
    input.type = behavior.inputType;
    input.className = 'formspec-input' + formspecWidthClass(behavior.width);
    input.name = behavior.fieldPath;
    input.id = behavior.id;
    if (behavior.placeholder) input.placeholder = behavior.placeholder;
    if (behavior.minDate) input.min = behavior.minDate;
    if (behavior.maxDate) input.max = behavior.maxDate;

    fieldDOM.root.appendChild(input);
    applyControlSlotClass(input, behavior, actx);
    finalizeFieldDOM(fieldDOM, behavior, actx);
    parent.appendChild(fieldDOM.root);

    const dispose = behavior.bind({
        root: fieldDOM.root,
        label: fieldDOM.label,
        control: input,
        hint: fieldDOM.hint,
        error: fieldDOM.error,
    });
    actx.onDispose(dispose);
};
