/** @filedesc USWDS v3 adapter for CheckboxGroup — renders usa-checkbox markup inside a fieldset. */
import { uiText, watchText, type CheckboxGroupBehavior, type AdapterRenderFn } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { applyUSWDSValidationState, createUSWDSFieldDOM, buildUSWDSOptions } from './shared';

export const renderCheckboxGroup: AdapterRenderFn<CheckboxGroupBehavior> = (
    behavior, parent, actx
) => {
    const { root, content, label, hint, error } = createUSWDSFieldDOM(behavior, { asGroup: true });

    // Select All — USWDS doesn't have a built-in select-all, but we use
    // the same usa-checkbox markup for consistency
    if (behavior.selectAll && behavior.options().length > 0) {
        const selectAllWrapper = el('div', { class: 'usa-checkbox' });
        const selectAllId = `${behavior.id}-select-all`;
        const selectAllCb = document.createElement('input') as HTMLInputElement;
        selectAllCb.className = 'usa-checkbox__input';
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
        const selectAllLabel = el('label', { class: 'usa-checkbox__label', for: selectAllId });
        watchText(actx, uiText(actx.engine, 'select.selectAll'), (text) => { selectAllLabel.textContent = text; });
        selectAllWrapper.appendChild(selectAllCb);
        selectAllWrapper.appendChild(selectAllLabel);
        content.appendChild(selectAllWrapper);
    }

    content.appendChild(error);

    let optionControlsRef = buildUSWDSOptions(behavior, content, behavior.options(), 'checkbox', behavior.fieldPath);

    parent.appendChild(root);

    const dispose = behavior.bind({
        root,
        label,
        control: content,
        skipAriaDescribedBy: true,
        hint,
        error,
        optionControls: optionControlsRef,
        rebuildOptions: (_container, newOptions) => {
            optionControlsRef = buildUSWDSOptions(behavior, content, newOptions, 'checkbox', behavior.fieldPath);
            return optionControlsRef;
        },
        onValidationChange: (hasError) => {
            applyUSWDSValidationState(root, label, hasError);
        },
    });
    actx.onDispose(dispose);
};
