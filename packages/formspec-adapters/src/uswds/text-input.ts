/** @filedesc USWDS v3 adapter for TextInput — usa-input or usa-textarea, with usa-character-count for maxLength. */
import { effect } from '@preact/signals-core';
import type { TextInputBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { applyUSWDSValidationState, createUSWDSFieldDOM, createUSWDSInput } from './shared';

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
 * Appended inside the field root so relevance hiding covers it. Returns a dispose function.
 */
function renderCharacterCount(
    behavior: TextInputBehavior,
    root: HTMLElement,
    field: HTMLInputElement | HTMLTextAreaElement,
    maxLength: number,
): () => void {
    root.classList.add('usa-character-count');
    field.classList.add('usa-character-count__field');
    field.maxLength = maxLength;

    const message = el('span', { class: 'usa-character-count__message usa-sr-only', id: `${behavior.id}-info` });
    message.textContent = `You can enter up to ${maxLength} characters`;
    const status = el('div', { class: 'usa-character-count__status usa-hint', 'aria-hidden': 'true' });
    const srStatus = el('div', { class: 'usa-character-count__sr-status usa-sr-only', 'aria-live': 'polite' });
    status.textContent = srStatus.textContent = characterCountStatus(0, maxLength);
    root.append(message, status, srStatus);

    const describedBy = field.getAttribute('data-describedby-base');
    field.setAttribute('data-describedby-base', describedBy ? `${message.id} ${describedBy}` : message.id);

    let srTimer: ReturnType<typeof setTimeout> | undefined;
    const update = (length: number) => {
        const text = characterCountStatus(length, maxLength);
        if (status.textContent === text) return;
        status.textContent = text;
        status.classList.toggle('usa-character-count__status--invalid', length > maxLength);
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
    if (behavior.maxLength && !(actualInput instanceof HTMLSelectElement)) {
        actx.onDispose(renderCharacterCount(behavior, root, actualInput, behavior.maxLength));
    }

    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control, hint, error,
        onValidationChange: (hasError) => {
            applyUSWDSValidationState(root, label, hasError, actualInput);
        },
    });
    actx.onDispose(dispose);
};
