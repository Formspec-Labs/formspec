/** @filedesc USWDS v3 adapter for TextInput — usa-input or usa-textarea, with usa-character-count for maxLength. */
import { effect } from '@preact/signals-core';
import type { TextInputBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { applyUSWDSValidationState, createUSWDSFieldDOM, createUSWDSInput } from './shared';

/** USWDS character count validation message (usa-character-count `VALIDATION_MESSAGE`). */
const OVER_LIMIT_MESSAGE = 'The content is too long.';

/** USWDS character count status copy (usa-character-count `getCountMessage`). */
function characterCountStatus(length: number, maxLength: number): string {
    if (length === 0) return `${maxLength} characters allowed`;
    const remaining = maxLength - length;
    const count = Math.abs(remaining);
    return `${count} character${count === 1 ? '' : 's'} ${remaining < 0 ? 'over limit' : 'left'}`;
}

/**
 * USWDS character count markup, rendered statically (no USWDS JS): sr-only limit message linked via
 * aria-describedby, visual status (aria-hidden), and a polite sr-only status updated after typing pauses.
 * Like USWDS JS, the limit lives in `data-maxlength` rather than native `maxlength` (which silently truncates
 * pasted text), and over-limit text gets the custom validity message. Appended inside the field root so
 * relevance hiding covers it. `onOverLimitChange` fires whenever the over-limit state flips.
 */
function renderCharacterCount(
    behavior: TextInputBehavior,
    root: HTMLElement,
    field: HTMLInputElement | HTMLTextAreaElement,
    maxLength: number,
    onOverLimitChange: (overLimit: boolean) => void,
): () => void {
    root.classList.add('usa-character-count');
    root.setAttribute('data-maxlength', String(maxLength));
    field.classList.add('usa-character-count__field');
    field.removeAttribute('maxlength');

    const message = el('span', { class: 'usa-character-count__message usa-sr-only', id: `${behavior.id}-info` });
    message.textContent = `You can enter up to ${maxLength} characters`;
    const status = el('div', { class: 'usa-character-count__status usa-hint', 'aria-hidden': 'true' });
    const srStatus = el('div', { class: 'usa-character-count__sr-status usa-sr-only', 'aria-live': 'polite' });
    status.textContent = srStatus.textContent = characterCountStatus(0, maxLength);
    root.append(message, status, srStatus);

    const describedBy = field.getAttribute('data-describedby-base');
    field.setAttribute('data-describedby-base', describedBy ? `${message.id} ${describedBy}` : message.id);

    let srTimer: ReturnType<typeof setTimeout> | undefined;
    let wasOverLimit = false;
    const update = (length: number) => {
        const overLimit = length > maxLength;
        if (overLimit !== wasOverLimit) {
            wasOverLimit = overLimit;
            status.classList.toggle('usa-character-count__status--invalid', overLimit);
            if (overLimit && !field.validationMessage) field.setCustomValidity(OVER_LIMIT_MESSAGE);
            else if (!overLimit && field.validationMessage === OVER_LIMIT_MESSAGE) field.setCustomValidity('');
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
    return () => {
        stopWatching();
        clearTimeout(srTimer);
    };
}

export const renderTextInput: AdapterRenderFn<TextInputBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error } = createUSWDSFieldDOM(behavior);

    if (p.labelPosition === 'start') root.style.display = 'flex';

    const { control, actualInput } = createUSWDSInput(behavior, {
        inputClass: behavior.maxLines != null && behavior.maxLines > 1 ? 'usa-textarea' : 'usa-input',
    });

    if (!control.parentElement) root.appendChild(control);

    // Invalid while Formspec validation shows an error or the character count is over its limit.
    let hasError = false;
    let overLimit = false;
    const hasCharacterCount = !!behavior.maxLength && !(actualInput instanceof HTMLSelectElement);
    const applyInvalidState = () => {
        const invalid = hasError || overLimit;
        applyUSWDSValidationState(root, label, invalid, actualInput);
        if (hasCharacterCount) actualInput.setAttribute('aria-invalid', String(invalid));
    };
    if (hasCharacterCount) {
        actx.onDispose(renderCharacterCount(
            behavior, root, actualInput as HTMLInputElement | HTMLTextAreaElement, behavior.maxLength!,
            (next) => { overLimit = next; applyInvalidState(); },
        ));
    }

    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control, hint, error,
        onValidationChange: (next) => {
            hasError = next;
            applyInvalidState();
        },
    });
    actx.onDispose(dispose);
};
