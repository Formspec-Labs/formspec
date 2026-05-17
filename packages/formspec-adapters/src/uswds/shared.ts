/** @filedesc Shared DOM construction for USWDS field adapters — root, label, hint, error. */
import type { FieldBehavior } from '@formspec-org/webcomponent';
import { el, applyCascadeClasses, applyCascadeAccessibility } from '../helpers';
import { buildOptionList, clearOptionNodes } from '../shared/option-list.js';

export interface USWDSFieldDOM {
    root: HTMLElement;
    label: HTMLElement;
    hint: HTMLElement | undefined;
    error: HTMLElement;
}

export interface USWDSFieldOptions {
    /** Set false for components where label doesn't target a specific input (e.g. rating, signature). Default true. */
    labelFor?: boolean;
    /** When true, use <fieldset class="usa-fieldset"> for root and <legend class="usa-legend"> for label. */
    asGroup?: boolean;
}

/**
 * Create the common USWDS field wrapper: usa-form-group (or usa-fieldset) root,
 * usa-label (or usa-legend), optional description, usa-hint (if present), then usa-error-message.
 *
 * Order in `root` is label → description (optional) → hint (optional) → error; adapters append the control after.
 */
export function createUSWDSFieldDOM(
    behavior: FieldBehavior,
    options?: USWDSFieldOptions,
): USWDSFieldDOM {
    const p = behavior.presentation;
    const labelFor = options?.labelFor ?? true;
    const asGroup = options?.asGroup === true;
    const fieldId = behavior.id;

    const root = el(asGroup ? 'fieldset' : 'div', {
        class: asGroup ? 'usa-fieldset' : 'usa-form-group',
        'data-name': behavior.fieldPath
    });
    applyCascadeClasses(root, p);
    applyCascadeAccessibility(root, p);

    // Label
    const labelCls = asGroup
        ? (p.labelPosition === 'hidden' ? 'usa-legend usa-sr-only' : 'usa-legend')
        : (p.labelPosition === 'hidden' ? 'usa-label usa-sr-only' : 'usa-label');

    const labelAttrs: Record<string, string> = { class: labelCls };
    if (asGroup) {
        labelAttrs.id = `${fieldId}-label`;
    } else if (labelFor) {
        labelAttrs.for = fieldId;
    }

    const label = el(asGroup ? 'legend' : 'label', labelAttrs);
    label.textContent = behavior.label;
    root.appendChild(label);

    // Description (from item definition)
    if (behavior.description) {
        const descId = `${fieldId}-desc`;
        const desc = el('div', { class: 'usa-hint formspec-description', id: descId });
        desc.textContent = behavior.description;
        root.appendChild(desc);
    }

    // Hint (from component props override)
    let hint: HTMLElement | undefined;
    if (behavior.hint) {
        const hintId = `${fieldId}-hint`;
        hint = el('span', { class: 'usa-hint', id: hintId });
        hint.textContent = behavior.hint;
        root.appendChild(hint);
    }

    // Error (live region — not included in aria-describedby; bindSharedFieldEffects owns that)
    const error = createUSWDSError(fieldId);
    root.appendChild(error);

    return { root, label, hint, error };
}

/** Removes previously-rendered option elements (marked with data-option-wrapper). */
export function clearUSWDSOptions(container: HTMLElement): void {
    clearOptionNodes(container);
}

/**
 * Build radio or checkbox options for USWDS group adapters.
 */
export function buildUSWDSOptions(
    behavior: { fieldPath: string; id: string },
    container: HTMLElement,
    options: ReadonlyArray<{ value: string; label: string }>,
    type: 'radio' | 'checkbox',
    inputName: string
): Map<string, HTMLInputElement> {
    return buildOptionList({
        behaviorId: behavior.id,
        options,
        kind: type,
        inputName,
        container,
        clearContainer: clearUSWDSOptions,
        renderOption: ({ opt, optId, kind, inputName }) => {
            const wrapper = el('div', { class: `usa-${kind}` });
            const input = document.createElement('input') as HTMLInputElement;
            input.className = `usa-${kind}__input`;
            input.id = optId;
            input.type = kind;
            input.name = inputName;
            input.value = opt.value;
            const label = el('label', { class: `usa-${kind}__label`, for: optId });
            label.textContent = opt.label;
            wrapper.appendChild(input);
            wrapper.appendChild(label);
            return { wrapper, input };
        },
    });
}

/**
 * Shared renderer for single boolean controls (Checkbox, Toggle).
 */
export function renderUSWDSBooleanControl(
    behavior: any,
    parent: HTMLElement,
    actx: any,
    options: {
        labelText: string;
        isToggle?: boolean;
    }
): void {
    const { root, label, hint, error } = createUSWDSFieldDOM(behavior);

    const wrapper = el('div', { class: 'usa-checkbox' });

    const input = document.createElement('input') as HTMLInputElement;
    input.className = 'usa-checkbox__input';
    input.id = behavior.id;
    input.type = 'checkbox';
    input.name = behavior.fieldPath;

    const checkboxLabel = el('label', { class: 'usa-checkbox__label', for: behavior.id });
    checkboxLabel.textContent = options.labelText;
    if (behavior.presentation.labelPosition === 'hidden') checkboxLabel.classList.add('usa-sr-only');

    // Remove the original label from root — usa-checkbox uses its own label
    label.remove();

    wrapper.appendChild(input);
    wrapper.appendChild(checkboxLabel);
    root.appendChild(wrapper);

    parent.appendChild(root);

    const dispose = behavior.bind({
        root,
        label: checkboxLabel,
        control: input,
        hint,
        error,
        onValidationChange: (hasError: boolean) => {
            applyUSWDSValidationState(root, checkboxLabel, hasError);
        },
    });
    actx.onDispose(dispose);
}

/** Create a USWDS error message element with correct ARIA live-region attributes. */
export function createUSWDSError(behaviorId: string): HTMLElement {
    return el('span', {
        class: 'usa-error-message',
        id: `${behaviorId}-error`,
    });
}

/** Apply native USWDS error classes to the wrapper, label/legend, and optional control. */
export function applyUSWDSValidationState(
    root: HTMLElement,
    label: HTMLElement,
    hasError: boolean,
    control?: HTMLElement | null,
): void {
    root.classList.toggle('usa-form-group--error', hasError);
    label.classList.toggle('usa-label--error', hasError);
    if (control) control.classList.toggle('usa-input--error', hasError);
}
