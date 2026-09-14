/** @filedesc Tailwind adapter for NumberInput — renders styled number input with optional prefix/suffix group. */
import type { NumberInputBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { createTailwindFieldDOM, createTailwindInput, toggleInputError } from './shared';

export const renderNumberInput: AdapterRenderFn<NumberInputBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error, describedBy } = createTailwindFieldDOM(behavior);

    if (p.labelPosition === 'start') root.style.display = 'flex';

    const { control, actualInput } = createTailwindInput(behavior, { type: 'number', ariaDescribedBy: describedBy });

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
