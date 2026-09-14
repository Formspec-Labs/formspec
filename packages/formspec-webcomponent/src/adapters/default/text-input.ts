/** @filedesc Default adapter for TextInput — input or textarea, with a character count for widgetConfig.maxLength. */
import { effect } from '@preact/signals-core';
import type { TextInputBehavior } from '../../behaviors/types';
import type { AdapterRenderFn } from '../types';
import { createFieldDOM, finalizeFieldDOM, applyControlSlotClass, wrapInputAdornments } from './shared';

/** Count copy (USWDS usa-character-count wording). */
function characterCountStatus(length: number, maxLength: number): string {
    if (length === 0) return `${maxLength} characters allowed`;
    const remaining = maxLength - length;
    const count = Math.abs(remaining);
    return `${count} character${count === 1 ? '' : 's'} ${remaining < 0 ? 'over limit' : 'left'}`;
}

/**
 * Theme `widgetConfig.maxLength` (theme §4.2: a character count display, not a hard cap): an sr-only limit
 * message linked through aria-describedby, a visual status (aria-hidden), and a polite live status updated
 * after a 1s typing pause. No native maxlength, which would silently truncate pasted text. Returns the
 * elements to append after the control and a dispose function.
 */
function createCharacterCount(
    behavior: TextInputBehavior,
    field: HTMLInputElement | HTMLTextAreaElement,
    maxLength: number,
    onOverLimitChange: (overLimit: boolean) => void,
): { elements: HTMLElement[]; dispose: () => void } {
    const info = document.createElement('span');
    info.className = 'formspec-sr-only';
    info.id = `${behavior.id}-count-info`;
    info.textContent = `You can enter up to ${maxLength} characters`;
    const status = document.createElement('p');
    status.className = 'formspec-hint formspec-character-count';
    status.setAttribute('aria-hidden', 'true');
    const srStatus = document.createElement('div');
    srStatus.className = 'formspec-sr-only formspec-character-count-sr-status';
    srStatus.setAttribute('aria-live', 'polite');
    status.textContent = srStatus.textContent = characterCountStatus(0, maxLength);
    field.setAttribute('data-describedby-base', info.id);

    let srTimer: ReturnType<typeof setTimeout> | undefined;
    let wasOverLimit = false;
    const update = (length: number) => {
        const overLimit = length > maxLength;
        if (overLimit !== wasOverLimit) {
            wasOverLimit = overLimit;
            status.classList.toggle('formspec-character-count--over-limit', overLimit);
            onOverLimitChange(overLimit);
        }
        const text = characterCountStatus(length, maxLength);
        if (status.textContent === text) return;
        status.textContent = text;
        clearTimeout(srTimer);
        srTimer = setTimeout(() => { srStatus.textContent = text; }, 1000);
    };
    const vm = behavior.vm;
    const stopWatching = vm
        ? effect(() => update(String(vm.value.value ?? '').length))
        : (() => {
            const onInput = () => update(field.value.length);
            field.addEventListener('input', onInput);
            return () => field.removeEventListener('input', onInput);
        })();
    return {
        elements: [info, status, srStatus],
        dispose: () => {
            stopWatching();
            clearTimeout(srTimer);
        },
    };
}

export const renderTextInput: AdapterRenderFn<TextInputBehavior> = (
    behavior, parent, actx
) => {
    const fieldDOM = createFieldDOM(behavior, actx);

    let control: HTMLElement;
    let field: HTMLInputElement | HTMLTextAreaElement;

    if (behavior.maxLines && behavior.maxLines > 1) {
        // Textarea variant
        const textarea = document.createElement('textarea');
        textarea.className = 'formspec-input';
        textarea.name = behavior.fieldPath;
        textarea.rows = behavior.maxLines;
        if (behavior.placeholder) textarea.placeholder = behavior.placeholder;
        textarea.id = behavior.id;
        control = field = textarea;
    } else {
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
        field = input;
        control = wrapInputAdornments(input, behavior);
    }

    fieldDOM.root.appendChild(control);

    // Invalid while Formspec validation shows an error or the character count is over its limit.
    let hasError = false;
    let overLimit = false;
    if (behavior.maxLength) {
        field.removeAttribute('maxlength');
        const count = createCharacterCount(behavior, field, behavior.maxLength, (next) => {
            overLimit = next;
            field.setAttribute('aria-invalid', String(hasError || overLimit));
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
