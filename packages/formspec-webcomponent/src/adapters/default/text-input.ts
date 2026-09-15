/** @filedesc Default adapter for TextInput — input or textarea, with a character count for widgetConfig.maxLength. */
import type { TextInputBehavior } from '../../behaviors/types';
import type { AdapterRenderFn } from '../types';
import { createFieldDOM, finalizeFieldDOM, applyControlSlotClass, wrapInputAdornments, formspecWidthClass } from './shared';
import { createCharacterCount } from '../character-count';

export const renderTextInput: AdapterRenderFn<TextInputBehavior> = (
    behavior, parent, actx
) => {
    const fieldDOM = createFieldDOM(behavior, actx);

    let control: HTMLElement;
    let field: HTMLInputElement | HTMLTextAreaElement;

    if (behavior.maxLines && behavior.maxLines > 1) {
        // Textarea variant
        const textarea = document.createElement('textarea');
        textarea.className = 'formspec-input' + formspecWidthClass(behavior.width);
        textarea.name = behavior.fieldPath;
        textarea.rows = behavior.maxLines;
        if (behavior.placeholder) textarea.placeholder = behavior.placeholder;
        textarea.id = behavior.id;
        control = field = textarea;
    } else {
        const input = document.createElement('input');
        input.type = behavior.resolvedInputType || 'text';
        input.className = 'formspec-input' + formspecWidthClass(behavior.width);
        input.name = behavior.fieldPath;
        input.id = behavior.id;
        if (behavior.placeholder) input.placeholder = behavior.placeholder;
        if (behavior.inputMode) input.inputMode = behavior.inputMode;
        for (const [attr, val] of Object.entries(behavior.extensionAttrs)) {
            if (attr === 'inputMode') input.inputMode = val;
            else if (attr === 'maxLength') input.maxLength = Number(val);
            else input.setAttribute(attr, val);
        }
        field = input;
        control = wrapInputAdornments(input, behavior);
    }

    fieldDOM.root.appendChild(control);

    // Invalid while Formspec validation shows an error or the character count is over its limit.
    let hasError = false;
    let overLimit = false;
    if (behavior.maxLength) {
        const count = createCharacterCount({
            field,
            maxLength: behavior.maxLength,
            vm: behavior.vm,
            messageId: `${behavior.id}-count-info`,
            classes: {
                message: 'formspec-sr-only',
                status: 'formspec-hint formspec-character-count',
                statusOverLimit: 'formspec-character-count--over-limit',
                srStatus: 'formspec-sr-only formspec-character-count-sr-status',
            },
            onOverLimitChange: (next) => {
                overLimit = next;
                field.setAttribute('aria-invalid', String(hasError || overLimit));
            },
        });
        fieldDOM.root.append(...count.elements);
        actx.onDispose(count.dispose);
    }

    applyControlSlotClass(control, behavior, actx);
    finalizeFieldDOM(fieldDOM, behavior, actx);
    parent.appendChild(fieldDOM.root);

    const dispose = behavior.bind({
        root: fieldDOM.root,
        label: fieldDOM.label,
        control,
        hint: fieldDOM.hint,
        error: fieldDOM.error,
        onValidationChange: behavior.maxLength
            ? (next) => {
                hasError = next;
                field.setAttribute('aria-invalid', String(hasError || overLimit));
            }
            : undefined,
    });
    actx.onDispose(dispose);
};
