/** @filedesc Tailwind adapter for NumberInput — renders styled number input. */
import type { NumberInputBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { createInputSkeleton } from '../shared/input-factory.js';
import { createTailwindFieldDOM, TW, toggleInputError } from './shared';

export const renderNumberInput: AdapterRenderFn<NumberInputBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error, describedBy } = createTailwindFieldDOM(behavior);

    if (p.labelPosition === 'start') root.style.display = 'flex';

    const { control, actualInput } = createInputSkeleton(behavior, {
        type: 'number',
        inputClass: TW.input,
        ariaDescribedBy: describedBy,
    });

    root.appendChild(control);
    root.appendChild(error);
    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control, hint, error,
        onValidationChange: (hasError) => {
            toggleInputError(actualInput, hasError);
        },
    });
    actx.onDispose(dispose);
};
