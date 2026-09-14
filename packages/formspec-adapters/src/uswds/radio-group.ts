/** @filedesc USWDS v3 adapter for RadioGroup — renders usa-radio markup inside a fieldset. */
import type { RadioGroupBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { applyUSWDSValidationState, createUSWDSFieldDOM, buildUSWDSOptions } from './shared';

export const renderRadioGroup: AdapterRenderFn<RadioGroupBehavior> = (
    behavior, parent, actx
) => {
    const { root, label, hint, error } = createUSWDSFieldDOM(behavior, { asGroup: true });
    // Group state (required / invalid / readonly) lands on the radiogroup, which a plain fieldset cannot carry.
    root.setAttribute('role', 'radiogroup');
    root.setAttribute('aria-labelledby', label.id);

    root.appendChild(error);

    const initialControls = buildUSWDSOptions(behavior, root, behavior.options(), 'radio', behavior.fieldPath);

    parent.appendChild(root);

    const dispose = behavior.bind({
        root,
        label,
        control: root,
        skipAriaDescribedBy: true,
        hint,
        error,
        optionControls: initialControls,
        rebuildOptions: (_container, newOptions) =>
            buildUSWDSOptions(behavior, root, newOptions, 'radio', behavior.fieldPath),
        onValidationChange: (hasError) => {
            applyUSWDSValidationState(root, label, hasError);
        },
    });
    actx.onDispose(dispose);
};
