/** @filedesc Tailwind adapter for TextInput — renders styled input or textarea. */
import type { TextInputBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { createTailwindFieldDOM, createTailwindInput, toggleInputError } from './shared';

export const renderTextInput: AdapterRenderFn<TextInputBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error, describedBy } = createTailwindFieldDOM(behavior);

    if (p.labelPosition === 'start') root.style.display = 'flex';

    const { control, actualInput } = createTailwindInput(behavior, { ariaDescribedBy: describedBy });

    if (!control.parentElement) root.appendChild(control);
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
