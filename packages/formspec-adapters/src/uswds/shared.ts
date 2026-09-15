/** @filedesc Shared DOM construction for USWDS field adapters — root, label, hint, error. */
import type { FieldBehavior } from '@formspec-org/webcomponent';
import { writeRichText } from '@formspec-org/webcomponent';
import { el, applyCascadeClasses, applyCascadeAccessibility } from '../helpers';
import { buildOptionList, clearOptionNodes } from '../shared/option-list.js';
import { createInputSkeleton, linkInputAdornments, type InputSkeletonOptions, type InputSkeletonResult } from '../shared/input-factory.js';

export interface USWDSFieldDOM {
    /** The `.usa-form-group` wrapper: theme classes, `data-name`, relevance, and the error modifier. */
    root: HTMLElement;
    /** Where label, hint, error and controls go — the `<fieldset>` for group widgets, `root` otherwise. */
    content: HTMLElement;
    label: HTMLElement;
    hint: HTMLElement;
    error: HTMLElement;
}

export interface USWDSFieldOptions {
    /** Set false for components where label doesn't target a specific input (e.g. rating, signature). Default true. */
    labelFor?: boolean;
    /** When true, nest a <fieldset class="usa-fieldset"> inside the root and use <legend class="usa-legend"> for the label. */
    asGroup?: boolean;
}

/**
 * Create the common USWDS field wrapper: a `usa-form-group` root holding label (or legend),
 * description, usa-hint (both hidden while empty), then usa-error-message. Group widgets nest a
 * `usa-fieldset` inside the root and fill that instead.
 *
 * Order in `content` is label → description → hint → error; adapters append the control after.
 */
export function createUSWDSFieldDOM(
    behavior: FieldBehavior,
    options?: USWDSFieldOptions,
): USWDSFieldDOM {
    const p = behavior.presentation;
    const labelFor = options?.labelFor ?? true;
    const asGroup = options?.asGroup === true;
    const fieldId = behavior.id;

    const root = el('div', { class: 'usa-form-group', 'data-name': behavior.fieldPath });
    applyCascadeClasses(root, p);
    applyCascadeAccessibility(root, p);

    // USWDS's own template wraps the fieldset: `div.usa-form-group > fieldset.usa-fieldset > legend`.
    // The error modifier is a left border, and a fieldset paints its border through the legend's vertical
    // midpoint — put it on the fieldset and the red bar starts halfway down every multi-line question.
    const content = asGroup ? el('fieldset', { class: 'usa-fieldset' }) : root;
    if (asGroup) root.appendChild(content);

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
    // Label and legend take phrasing content only, so the rich-text subset renders inline (core §4.2.1).
    writeRichText(label, behavior.label, { inline: true });
    content.appendChild(label);

    // Description and hint (behavior resolves them through the view model: Locale + {{}} interpolation).
    // Always rendered, hidden while empty: interpolated text can arrive after render, and
    // bindSharedFieldEffects keeps text, visibility, and aria-describedby current.
    const desc = el('div', { class: 'usa-hint formspec-description', id: `${fieldId}-desc` });
    writeRichText(desc, behavior.description);
    desc.hidden = !behavior.description;
    content.appendChild(desc);

    // A div, not a span: a hint carrying the rich-text subset may hold paragraphs and a `ul.usa-list`, neither
    // of which is phrasing content. `usa-hint` is a type class, and the form group lays its children out as
    // blocks either way.
    const hint = el('div', { class: 'usa-hint', id: `${fieldId}-hint` });
    writeRichText(hint, behavior.hint);
    hint.hidden = !behavior.hint;
    content.appendChild(hint);

    // Error (bindSharedFieldEffects adds its id to aria-describedby while an error is shown)
    const error = createUSWDSError(fieldId);
    content.appendChild(error);

    return { root, content, label, hint, error };
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
    // The certification checkbox carries a statute link inside its label — inline subset, `for` untouched.
    writeRichText(checkboxLabel, options.labelText, { inline: true });
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

/**
 * The USWDS error message element (`usa-error-message`, id `<behaviorId>-error`). Hidden until there is a
 * message: USWDS styles it `display: block` with vertical padding, so an always-present empty node would
 * add 8px under every label and legend — spacing USWDS's own markup never has.
 */
export function createUSWDSError(behaviorId: string): HTMLElement {
    const error = el('span', {
        class: 'usa-error-message',
        id: `${behaviorId}-error`,
    });
    error.hidden = true;
    return error;
}

/** Apply native USWDS error classes to the wrapper, label/legend, and optional control. */
export function applyUSWDSValidationState(
    root: HTMLElement,
    label: HTMLElement,
    hasError: boolean,
    control?: HTMLElement | null,
): void {
    root.classList.toggle('usa-form-group--error', hasError);
    const error = root.querySelector<HTMLElement>('.usa-error-message');
    if (error) error.hidden = !hasError;
    label.classList.toggle('usa-label--error', hasError);
    if (control) control.classList.toggle('usa-input--error', hasError);
    // Prefix/suffix inputs are borderless inside the group; the group carries the error border.
    const inputGroup = control?.parentElement;
    if (inputGroup?.classList.contains('usa-input-group')) inputGroup.classList.toggle('usa-input-group--error', hasError);
}
