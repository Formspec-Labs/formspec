/** @filedesc USWDS v3 adapter for TextInput — renders usa-input or usa-textarea markup. */
import type { TextInputBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { applyUSWDSValidationState, createUSWDSFieldDOM, createUSWDSInput } from './shared';

export const renderTextInput: AdapterRenderFn<TextInputBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error } = createUSWDSFieldDOM(behavior);

    if (p.labelPosition === 'start') root.style.display = 'flex';

    const { control, actualInput } = createUSWDSInput(behavior, {
        inputClass: behavior.maxLines != null && behavior.maxLines > 1 ? 'usa-textarea' : 'usa-input',
    });

    if (!control.parentElement) root.appendChild(control);

    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control, hint, error,
        onValidationChange: (hasError) => {
            applyUSWDSValidationState(root, label, hasError, actualInput);
        },
    });
    actx.onDispose(dispose);
};
