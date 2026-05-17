/** @filedesc Tailwind adapter for MoneyInput — input group with currency prefix. */
import type { MoneyInputBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { createInputSkeleton } from '../shared/input-factory.js';
import { createTailwindFieldDOM, TW, toggleInputError, applyAffixRounding } from './shared';

export const renderMoneyInput: AdapterRenderFn<MoneyInputBehavior> = (
    behavior, parent, actx
) => {
    const { root, label, hint, error, describedBy } = createTailwindFieldDOM(behavior);

    const { control, actualInput, prefixEl } = createInputSkeleton(behavior, {
        type: 'number',
        inputClass: TW.input,
        ariaDescribedBy: describedBy,
        groupClass: 'flex rounded-xl shadow-sm',
        prefixClass: 'inline-flex items-center rounded-l-xl border border-r-0 border-[color:var(--formspec-tw-border)] bg-[var(--formspec-tw-surface-muted)] px-3 text-sm text-[var(--formspec-tw-muted)]',
        prefixTag: 'span',
        prefix: behavior.resolvedCurrency ?? undefined,
        onInputCreated: (input) => {
            input.name = `${behavior.fieldPath}__amount`;
            // If fixed currency, it acts as a prefix.
            // If editable currency, we'll manually append the currency input as a suffix.
            applyAffixRounding(input, !!behavior.resolvedCurrency, !behavior.resolvedCurrency);
        }
    });

    // Handle fixed currency prefix attributes
    if (behavior.resolvedCurrency && prefixEl) {
        prefixEl.setAttribute('aria-hidden', 'true');
    } else if (!behavior.resolvedCurrency) {
        // Handle editable currency suffix input
        const currencyInput = document.createElement('input') as HTMLInputElement;
        currencyInput.className =
            'block w-20 rounded-r-xl border border-[color:var(--formspec-tw-border)] bg-[var(--formspec-tw-surface-muted)] px-2 py-2.5 text-sm text-[var(--formspec-tw-text)] shadow-sm focus:border-[color:var(--formspec-tw-accent)] focus:outline-none focus:ring-4 focus:ring-[var(--formspec-tw-accent-ring)]';
        currencyInput.type = 'text';
        currencyInput.placeholder = 'Currency';
        currencyInput.name = `${behavior.fieldPath}__currency`;
        currencyInput.setAttribute('aria-label', 'Currency code');
        control.appendChild(currencyInput);
    }

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
