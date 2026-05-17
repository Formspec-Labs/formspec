/** @filedesc Default adapter for CheckboxGroup — renders multi-select checkboxes with optional selectAll. */
import type { CheckboxGroupBehavior } from '../../behaviors/types';
import type { AdapterRenderFn } from '../types';
import { createFieldDOM, finalizeFieldDOM, applyControlSlotClass } from './shared';

export const renderCheckboxGroup: AdapterRenderFn<CheckboxGroupBehavior> = (
    behavior, parent, actx
) => {
    const fieldDOM = createFieldDOM(behavior, actx, { asGroup: true });

    const container = document.createElement('div');
    container.className = 'formspec-checkbox-group';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-labelledby', fieldDOM.label.id);
    if (behavior.columns && behavior.columns > 1) {
        container.dataset.columns = String(behavior.columns);
    }

    const optionControls = new Map<string, HTMLInputElement>();
    const options = behavior.options();

    if (options.length > 0 && behavior.selectAll) {
        const selectAllLbl = document.createElement('label');
        selectAllLbl.className = 'formspec-select-all';
        const selectAllCb = document.createElement('input');
        selectAllCb.type = 'checkbox';
        selectAllCb.addEventListener('change', () => {
            const checked: string[] = [];
            for (const [optVal, cb] of optionControls) {
                cb.checked = selectAllCb.checked;
                if (cb.checked) checked.push(optVal);
            }
            behavior.setValue(checked);
        });
        selectAllLbl.appendChild(selectAllCb);
        selectAllLbl.appendChild(document.createTextNode(' Select all'));
        container.appendChild(selectAllLbl);
    }

    for (const opt of options) {
        const lbl = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = opt.value;
        cb.name = behavior.fieldPath;
        optionControls.set(opt.value, cb);
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(` ${opt.label}`));
        container.appendChild(lbl);
    }

    fieldDOM.root.appendChild(container);
    applyControlSlotClass(container, behavior, actx, true);
    finalizeFieldDOM(fieldDOM, behavior, actx);
    parent.appendChild(fieldDOM.root);

    const dispose = behavior.bind({
        root: fieldDOM.root,
        label: fieldDOM.label,
        control: container,
        hint: fieldDOM.hint,
        error: fieldDOM.error,
        optionControls,
        skipAriaDescribedBy: true,
    });
    actx.onDispose(dispose);
};
