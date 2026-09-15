/** @filedesc USWDS v3 adapter for RadioGroup — renders usa-radio markup inside a fieldset. */
import type { RadioGroupBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { applyUSWDSValidationState, createUSWDSFieldDOM, buildUSWDSOptions } from './shared';

export const renderRadioGroup: AdapterRenderFn<RadioGroupBehavior> = (
    behavior, parent, actx
) => {
    const { root, content, label, hint, error } = createUSWDSFieldDOM(behavior, { asGroup: true });
    // Group state (required / invalid / readonly) lands on the radiogroup, which a plain fieldset cannot carry.
    content.setAttribute('role', 'radiogroup');
    content.setAttribute('aria-labelledby', label.id);

    content.appendChild(error);

    const initialControls = buildUSWDSOptions(behavior, content, behavior.options(), 'radio', behavior.fieldPath);

    parent.appendChild(root);

    const dispose = behavior.bind({
        root,
        label,
        control: content,
        skipAriaDescribedBy: true,
        hint,
        error,
        optionControls: initialControls,
        rebuildOptions: (_container, newOptions) =>
            buildUSWDSOptions(behavior, content, newOptions, 'radio', behavior.fieldPath),
        onValidationChange: (hasError) => {
            applyUSWDSValidationState(root, label, hasError);
        },
    });
    actx.onDispose(dispose);
};
