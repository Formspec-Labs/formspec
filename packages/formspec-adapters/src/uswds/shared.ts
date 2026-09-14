/** @filedesc Shared DOM construction for USWDS field adapters — root, label, hint, error. */
import type { FieldBehavior } from '@formspec-org/webcomponent';
import { el, applyCascadeClasses, applyCascadeAccessibility } from '../helpers';
import { buildOptionList, clearOptionNodes } from '../shared/option-list.js';
import { createInputSkeleton, linkInputAdornments, type InputSkeletonOptions, type InputSkeletonResult } from '../shared/input-factory.js';

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

    // Hint (behavior resolves it through the view model: Locale + {{}} interpolation)
    let hint: HTMLElement | undefined;
    if (behavior.hint) {
        const hintId = `${fieldId}-hint`;
        hint = el('span', { class: 'usa-hint', id: hintId });
        hint.textContent = behavior.hint;
        root.appendChild(hint);
    }

    // Error (bindSharedFieldEffects adds its id to aria-describedby while an error is shown)
    const error = createUSWDSError(fieldId);
    root.appendChild(error);

    return { root, label, hint, error };
}

/**
 * Input/textarea with USWDS prefix/suffix markup (`usa-input-group`, `usa-input-prefix`, `usa-input-suffix`).
 * Adornment ids reach aria-describedby through `data-describedby-base`.
 */
export function createUSWDSInput(behavior: FieldBehavior, options: InputSkeletonOptions): InputSkeletonResult {
    return linkInputAdornments(behavior.id, createInputSkeleton(behavior, {
        groupClass: 'usa-input-group',
        prefixClass: 'usa-input-prefix',
        suffixClass: 'usa-input-suffix',
        ...options,
    }));
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
 * Shared renderer for single boolean Toggle controls.
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

/** Create the USWDS error message element (`usa-error-message`, id `<behaviorId>-error`). */
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
    // Prefix/suffix inputs are borderless inside the group; the group carries the error border.
    const inputGroup = control?.parentElement;
    if (inputGroup?.classList.contains('usa-input-group')) inputGroup.classList.toggle('usa-input-group--error', hasError);
}
