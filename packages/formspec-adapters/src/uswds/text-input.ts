/** @filedesc USWDS v3 adapter for TextInput — usa-input or usa-textarea, with usa-character-count for maxLength. */
import { createCharacterCount, type TextInputBehavior, type AdapterRenderFn } from '@formspec-org/webcomponent';
import { applyUSWDSValidationState, createUSWDSFieldDOM, createUSWDSInput } from './shared';

/** USWDS character count validation message (usa-character-count `VALIDATION_MESSAGE`). */
const OVER_LIMIT_MESSAGE = 'The content is too long.';

/**
 * USWDS usa-character-count markup through the shared {@link createCharacterCount}, rendered statically (no
 * USWDS JS). Like USWDS JS, the limit lives in `data-maxlength`, and over-limit text gets the custom validity
 * message. Appended inside the field root so relevance hiding covers it.
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
    const count = createCharacterCount({
        field,
        maxLength,
        vm: behavior.vm,
        messageId: `${behavior.id}-info`,
        classes: {
            message: 'usa-character-count__message usa-sr-only',
            status: 'usa-character-count__status usa-hint',
            statusOverLimit: 'usa-character-count__status--invalid',
            srStatus: 'usa-character-count__sr-status usa-sr-only',
        },
        statusTag: 'div',
        onOverLimitChange: (overLimit) => {
            if (overLimit && !field.validationMessage) field.setCustomValidity(OVER_LIMIT_MESSAGE);
            else if (!overLimit && field.validationMessage === OVER_LIMIT_MESSAGE) field.setCustomValidity('');
            onOverLimitChange(overLimit);
        },
    });
    root.append(...count.elements);
    return count.dispose;
}

export const renderTextInput: AdapterRenderFn<TextInputBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error } = createUSWDSFieldDOM(behavior);

    if (p.labelPosition === 'start') root.classList.add('formspec-label-start');

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
