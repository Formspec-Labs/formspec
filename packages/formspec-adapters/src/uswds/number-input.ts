/** @filedesc USWDS v3 adapter for NumberInput — renders usa-input with type="number". */
import { widthStopClass, type NumberInputBehavior, type AdapterRenderFn } from '@formspec-org/webcomponent';
import { applyUSWDSValidationState, createUSWDSFieldDOM, createUSWDSInput } from './shared';

export const renderNumberInput: AdapterRenderFn<NumberInputBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error } = createUSWDSFieldDOM(behavior);

    if (p.labelPosition === 'start') root.classList.add('formspec-label-start');

    const { control, actualInput } = createUSWDSInput(behavior, {
        type: 'number',
        inputClass: 'usa-input',
    });
    // The stop targets the bordered box: the input itself, or — with a prefix/suffix — the
    // usa-input-group createUSWDSInput wraps it in.
    control.className += widthStopClass('usa-input', behavior.width);

    root.appendChild(control);

    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control, hint, error,
        onValidationChange: (hasError) => {
            applyUSWDSValidationState(root, label, hasError, actualInput);
        },
    });
    actx.onDispose(dispose);
};
