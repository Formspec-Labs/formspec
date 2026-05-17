/** @filedesc USWDS v3 adapter for NumberInput — renders usa-input with type="number". */
import type { NumberInputBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { applyUSWDSValidationState, createUSWDSFieldDOM } from './shared';

import { createInputSkeleton } from '../shared/input-factory.js';

export const renderNumberInput: AdapterRenderFn<NumberInputBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error } = createUSWDSFieldDOM(behavior);

    if (p.labelPosition === 'start') root.style.display = 'flex';

    const { control, actualInput } = createInputSkeleton(behavior, {
        type: 'number',
        inputClass: 'usa-input',
    });

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
