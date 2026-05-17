/** @filedesc Tailwind adapter for Select — renders styled dropdown. */
import type { SelectBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { createInputSkeleton } from '../shared/input-factory.js';
import { createTailwindFieldDOM, TW, toggleInputError } from './shared';

export const renderSelect: AdapterRenderFn<SelectBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error, describedBy } = createTailwindFieldDOM(behavior);

    if (p.labelPosition === 'start') root.style.display = 'flex';

    const { control, actualInput } = createInputSkeleton(behavior, {
        tag: 'select',
        inputClass: TW.input,
        ariaDescribedBy: describedBy,
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
    root.appendChild(error);
    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control: select, hint, error,
        onValidationChange: (hasError) => {
            toggleInputError(select, hasError);
        },
        rebuildOptions: (_container, newOptions) => {
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
