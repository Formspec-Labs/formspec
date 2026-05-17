/** @filedesc Default adapter for RadioGroup — renders radio buttons in a group container. */
import type { RadioGroupBehavior } from '../../behaviors/types';
import type { AdapterRenderFn } from '../types';
import { createFieldDOM, finalizeFieldDOM, applyControlSlotClass } from './shared';

export const renderRadioGroup: AdapterRenderFn<RadioGroupBehavior> = (
    behavior, parent, actx
) => {
    const fieldDOM = createFieldDOM(behavior, actx, { asGroup: true });

    const container = document.createElement('div');
    container.className = 'formspec-radio-group';
    container.setAttribute('role', 'radiogroup');
    container.setAttribute('aria-labelledby', fieldDOM.label.id);
    if (behavior.orientation) container.dataset.orientation = behavior.orientation;

    const optionControls = new Map<string, HTMLInputElement>();
    const options = behavior.options();
    for (const opt of options) {
        const lbl = document.createElement('label');
        const rb = document.createElement('input');
        rb.type = 'radio';
        rb.value = opt.value;
        rb.name = behavior.inputName;
        optionControls.set(opt.value, rb);
        lbl.appendChild(rb);
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
