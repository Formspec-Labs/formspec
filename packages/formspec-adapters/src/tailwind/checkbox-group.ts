/** @filedesc Tailwind adapter for CheckboxGroup — card-style multi-select grid. */
import type { CheckboxGroupBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { el, applyCascadeClasses, applyCascadeAccessibility } from '../helpers';
import { createTailwindError, TW, applyErrorStyling, buildTailwindGroupOptions } from './shared';

function optionGridClass(columns?: number): string {
    if (columns === 3) return 'grid gap-3 mt-3 sm:grid-cols-2 lg:grid-cols-3';
    if (columns === 2) return 'grid gap-3 mt-3 sm:grid-cols-2';
    return 'grid gap-3 mt-3';
}

export const renderCheckboxGroup: AdapterRenderFn<CheckboxGroupBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;

    const fieldset = el('fieldset', { class: TW.fieldset });
    applyCascadeClasses(fieldset, p);
    applyCascadeAccessibility(fieldset, p);

    const legend = el('legend', {
        class: p.labelPosition === 'hidden' ? TW.labelHidden : TW.legend,
    });
    legend.textContent = behavior.label;
    fieldset.appendChild(legend);

    let hint: HTMLElement | undefined;
    if (behavior.hint) {
        const hintId = `${behavior.id}-hint`;
        hint = el('p', { class: TW.hint, id: hintId });
        hint.textContent = behavior.hint;
        fieldset.appendChild(hint);
    }

    // Select All — compact row above the grid
    if (behavior.selectAll && behavior.options().length > 0) {
        const selectAllRow = el('div', {
            class: 'mt-2 flex items-center gap-3 rounded-lg border border-dashed border-[color:var(--formspec-tw-border)] bg-[var(--formspec-tw-surface-muted)] px-3 py-2.5',
        });
        const selectAllId = `${behavior.id}-select-all`;

        const selectAllCb = document.createElement('input') as HTMLInputElement;
        selectAllCb.className = TW.controlSm;
        selectAllCb.id = selectAllId;
        selectAllCb.type = 'checkbox';
        selectAllCb.addEventListener('change', () => {
            const checked: string[] = [];
            for (const [optVal, cb] of optionControlsRef) {
                cb.checked = selectAllCb.checked;
                if (cb.checked) checked.push(optVal);
            }
            behavior.setValue(checked);
        });

        const selectAllLabel = el('label', {
            class: 'cursor-pointer text-sm font-semibold text-[var(--formspec-tw-text)]',
            for: selectAllId,
        });
        selectAllLabel.textContent = 'Select all';
        selectAllRow.appendChild(selectAllCb);
        selectAllRow.appendChild(selectAllLabel);
        fieldset.appendChild(selectAllRow);
    }

    const optionContainer = el('div', { class: optionGridClass(behavior.columns) });
    let optionControlsRef = buildTailwindGroupOptions(
        behavior, optionContainer, behavior.options(), 'checkbox',
    );
    fieldset.appendChild(optionContainer);

    const error = createTailwindError(behavior.id);
    fieldset.appendChild(error);

    parent.appendChild(fieldset);

    const dispose = behavior.bind({
        root: fieldset,
        label: legend,
        control: fieldset,
        hint,
        error,
        optionControls: optionControlsRef,
        rebuildOptions: (_container, newOptions) => {
            optionControlsRef = buildTailwindGroupOptions(behavior, optionContainer, newOptions, 'checkbox');
            return optionControlsRef;
        },
        onValidationChange: (hasError) => {
            applyErrorStyling(fieldset, hasError);
        },
    });
    actx.onDispose(dispose);
};
