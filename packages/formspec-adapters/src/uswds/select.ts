/** @filedesc USWDS v3 adapter for Select — renders usa-select dropdown markup. */
import type { SelectBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { applyUSWDSValidationState, createUSWDSFieldDOM } from './shared';

import { createInputSkeleton } from '../shared/input-factory.js';

export const renderSelect: AdapterRenderFn<SelectBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error } = createUSWDSFieldDOM(behavior);

    if (p.labelPosition === 'start') root.style.display = 'flex';

    const { control, actualInput } = createInputSkeleton(behavior, {
        tag: 'select',
        inputClass: 'usa-select',
    });
    const select = actualInput as HTMLSelectElement;

    // Placeholder / empty option
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = behavior.placeholder || '- Select -';
    if (!behavior.clearable) placeholderOpt.disabled = true;
    placeholderOpt.selected = true;
    select.appendChild(placeholderOpt);

    for (const opt of behavior.options()) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
    }

    root.appendChild(select);

    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control: select, hint, error,
        onValidationChange: (hasError) => {
            applyUSWDSValidationState(root, label, hasError, select);
        },
        rebuildOptions: (_container, newOptions) => {
            // Remove all options except the placeholder (first child)
            while (select.options.length > 1) select.remove(select.options.length - 1);
            const controls = new Map<string, HTMLInputElement>();
            for (const opt of newOptions) {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                select.appendChild(option);
            }
            return controls;
        },
    });
    actx.onDispose(dispose);
};
