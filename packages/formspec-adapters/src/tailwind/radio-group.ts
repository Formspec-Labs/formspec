/** @filedesc Tailwind adapter for RadioGroup — card-style option grid. */
import type { RadioGroupBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { el, applyCascadeClasses, applyCascadeAccessibility } from '../helpers';
import { createTailwindError, TW, applyErrorStyling, buildTailwindGroupOptions, createTailwindHint } from './shared';

export const renderRadioGroup: AdapterRenderFn<RadioGroupBehavior> = (
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

    const hint = createTailwindHint(behavior);
    fieldset.appendChild(hint);

    const optionContainer = el('div', { class: 'grid gap-3 mt-3 sm:grid-cols-2' });
    const initialControls = buildTailwindGroupOptions(
        behavior, optionContainer, behavior.options(), 'radio',
    );
    fieldset.appendChild(optionContainer);

    const error = createTailwindError(behavior.id);
    fieldset.appendChild(error);

    parent.appendChild(fieldset);

    const dispose = behavior.bind({
        root: fieldset,
        label: legend,
        control: fieldset,
        skipAriaDescribedBy: true,
        hint,
        error,
        optionControls: initialControls,
        rebuildOptions: (_container, newOptions) =>
            buildTailwindGroupOptions(behavior, optionContainer, newOptions, 'radio'),
        onValidationChange: (hasError) => {
            applyErrorStyling(fieldset, hasError);
        },
    });
    actx.onDispose(dispose);
};
