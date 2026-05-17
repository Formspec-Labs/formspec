/** @filedesc Default adapter for TextInput — reproduces current DOM structure. */
import type { TextInputBehavior } from '../../behaviors/types';
import type { AdapterRenderFn } from '../types';
import { createFieldDOM, finalizeFieldDOM, applyControlSlotClass } from './shared';

export const renderTextInput: AdapterRenderFn<TextInputBehavior> = (
    behavior, parent, actx
) => {
    const fieldDOM = createFieldDOM(behavior, actx);

    let control: HTMLElement;

    if (behavior.maxLines && behavior.maxLines > 1) {
        // Textarea variant
        const textarea = document.createElement('textarea');
        textarea.className = 'formspec-input';
        textarea.name = behavior.fieldPath;
        textarea.rows = behavior.maxLines;
        if (behavior.placeholder) textarea.placeholder = behavior.placeholder;
        textarea.id = behavior.id;
        control = textarea;
    } else if (behavior.prefix || behavior.suffix) {
        // Prefix/suffix wrapper variant (matches .formspec-input-adornment in React)
        const wrapper = document.createElement('div');
        wrapper.className = 'formspec-input-adornment';

        if (behavior.prefix) {
            const prefixEl = document.createElement('span');
            prefixEl.className = 'formspec-prefix formspec-input-prefix';
            prefixEl.id = `${behavior.id}-prefix`;
            prefixEl.textContent = behavior.prefix;
            wrapper.appendChild(prefixEl);
        }

        const input = document.createElement('input');
        input.type = behavior.resolvedInputType || 'text';
        input.className = 'formspec-input';
        input.name = behavior.fieldPath;
        input.id = behavior.id;
        if (behavior.placeholder) input.placeholder = behavior.placeholder;
        if (behavior.inputMode) input.inputMode = behavior.inputMode;
        for (const [attr, val] of Object.entries(behavior.extensionAttrs)) {
            if (attr === 'inputMode') input.inputMode = val;
            else if (attr === 'maxLength') input.maxLength = Number(val);
            else input.setAttribute(attr, val);
        }

        wrapper.appendChild(input);

        if (behavior.suffix) {
            const suffixEl = document.createElement('span');
            suffixEl.className = 'formspec-suffix formspec-input-suffix';
            suffixEl.id = `${behavior.id}-suffix`;
            suffixEl.textContent = behavior.suffix;
            wrapper.appendChild(suffixEl);
        }

        control = wrapper;
    } else {
        // Standard text input
        const input = document.createElement('input');
        input.type = behavior.resolvedInputType || 'text';
        input.className = 'formspec-input';
        input.name = behavior.fieldPath;
        input.id = behavior.id;
        if (behavior.placeholder) input.placeholder = behavior.placeholder;
        if (behavior.inputMode) input.inputMode = behavior.inputMode;
        for (const [attr, val] of Object.entries(behavior.extensionAttrs)) {
            if (attr === 'inputMode') input.inputMode = val;
            else if (attr === 'maxLength') input.maxLength = Number(val);
            else input.setAttribute(attr, val);
        }
        control = input;
    }

    fieldDOM.root.appendChild(control);
    applyControlSlotClass(control, behavior, actx);
    finalizeFieldDOM(fieldDOM, behavior, actx);
    parent.appendChild(fieldDOM.root);

    const dispose = behavior.bind({
        root: fieldDOM.root,
        label: fieldDOM.label,
        control,
        hint: fieldDOM.hint,
        error: fieldDOM.error,
    });
    actx.onDispose(dispose);
};
