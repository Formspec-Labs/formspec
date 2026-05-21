/** @filedesc Default adapter for Toggle — renders a checkbox wrapped in a toggle container with labels. */
import type { ToggleBehavior } from '../../behaviors/types';
import type { AdapterRenderFn } from '../types';
import { createFieldDOM, finalizeFieldDOM, applyControlSlotClass } from './shared';

export const renderToggle: AdapterRenderFn<ToggleBehavior> = (
    behavior, parent, actx
) => {
    const fieldDOM = createFieldDOM(behavior, actx);

    // Toggle special case: when labelPosition is 'top' (default),
    // the original field-input.ts adds formspec-field--inline (lines 82-84).
    const effectiveLP = behavior.presentation.labelPosition || 'top';
    if (effectiveLP === 'top') {
        fieldDOM.root.classList.add('formspec-field--inline');
    }

    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'formspec-toggle';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'formspec-input';
    checkbox.name = behavior.fieldPath;
    checkbox.id = behavior.id;
    checkbox.setAttribute('role', 'switch');
    toggleContainer.appendChild(checkbox);

    if (behavior.onLabel || behavior.offLabel) {
        // OFF label before the switch
        const offSpan = document.createElement('span');
        offSpan.className = 'formspec-toggle-label formspec-toggle-off';
        offSpan.setAttribute('aria-hidden', 'true');
        offSpan.textContent = behavior.offLabel || '';
        toggleContainer.insertBefore(offSpan, checkbox);

        // ON label after the switch
        const onSpan = document.createElement('span');
        onSpan.className = 'formspec-toggle-label formspec-toggle-on';
        onSpan.id = `${behavior.id}-toggle-label`;
        onSpan.setAttribute('aria-hidden', 'true');
        onSpan.textContent = behavior.onLabel || '';
        toggleContainer.appendChild(onSpan);
    }

    fieldDOM.root.appendChild(toggleContainer);
    applyControlSlotClass(toggleContainer, behavior, actx);
    finalizeFieldDOM(fieldDOM, behavior, actx);
    parent.appendChild(fieldDOM.root);

    const dispose = behavior.bind({
        root: fieldDOM.root,
        label: fieldDOM.label,
        control: toggleContainer,
        hint: fieldDOM.hint,
        error: fieldDOM.error,
    });
    actx.onDispose(dispose);
};
