/** @filedesc Tailwind adapter for TextInput — renders styled input or textarea. */
import type { TextInputBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { createInputSkeleton } from '../shared/input-factory.js';
import { createTailwindFieldDOM, TW, toggleInputError, applyAffixRounding } from './shared';

export const renderTextInput: AdapterRenderFn<TextInputBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error, describedBy } = createTailwindFieldDOM(behavior);

    if (p.labelPosition === 'start') root.style.display = 'flex';

    const { control, actualInput } = createInputSkeleton(behavior, {
        inputClass: TW.input,
        ariaDescribedBy: describedBy,
        groupClass: 'flex rounded-xl shadow-sm',
        prefixClass: 'inline-flex items-center rounded-l-xl border border-r-0 border-[color:var(--formspec-tw-border)] bg-[var(--formspec-tw-surface-muted)] px-3 text-sm text-[var(--formspec-tw-muted)]',
        prefixTag: 'span',
        suffixClass: 'inline-flex items-center rounded-r-xl border border-l-0 border-[color:var(--formspec-tw-border)] bg-[var(--formspec-tw-surface-muted)] px-3 text-sm text-[var(--formspec-tw-muted)]',
        suffixTag: 'span',
        onInputCreated: (input) => {
            applyAffixRounding(input, !!behavior.prefix, !!behavior.suffix);
        }
    });

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
