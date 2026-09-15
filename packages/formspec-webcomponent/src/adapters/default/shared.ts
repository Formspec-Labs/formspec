/** @filedesc Shared DOM construction helpers for the default render adapter. */
import { effect, untracked } from '@preact/signals-core';
import type { FieldBehavior } from '../../behaviors/types';
import type { AdapterContext } from '../types';
import { writeRichText } from '../rich-text-dom.js';
import { uiText } from '../ui-text.js';
import { watchText } from '../watch-text.js';

export interface FieldDOMOptions {
    /** Set false for group controls where the label shouldn't target a single input. Default true. */
    labelFor?: boolean;
    /** When true, use <fieldset> for root and <legend> for label. */
    asGroup?: boolean;
}

export interface FieldDOM {
    root: HTMLElement;
    label: HTMLElement;
    hint: HTMLElement;
    error: HTMLElement;
}

/**
 * Create the common field wrapper structure: root div (or fieldset), label (or legend),
 * description, hint, error.
 *
 * Uses behavior.widgetClassSlots for x-classes support (from theme widgetConfig).
 * When a FieldViewModel is available, reads current locale-resolved values from VM signals.
 * Returns element references for adapter-specific control insertion.
 */
export function createFieldDOM(
    behavior: FieldBehavior,
    actx: AdapterContext,
    options?: FieldDOMOptions,
): FieldDOM {
    const p = behavior.presentation;
    const slots = behavior.widgetClassSlots;
    const fieldId = behavior.id;
    const hintId = `${fieldId}-hint`;
    const errorId = `${fieldId}-error`;
    const descId = `${fieldId}-desc`;
    const asGroup = options?.asGroup === true;

    // Initial text only; bindSharedFieldEffects keeps it current. Untracked: adapters run inside
    // render effects (repeat lists) that must not re-render when a label's interpolated value changes.
    const vm = behavior.vm;
    const labelText = vm ? untracked(() => vm.label.value) : behavior.label;
    const hintText = behavior.hint;
    const descText = behavior.description;

    const root = document.createElement(asGroup ? 'fieldset' : 'div');
    root.className = asGroup ? 'formspec-fieldset' : 'formspec-field';
    root.dataset.name = behavior.fieldPath;
    // data-bind: the base item key (last segment of fieldPath, no array indices).
    // Used by the Theme mode authoring overlay to look up theme overrides by itemKey.
    const itemKey = behavior.fieldPath.replace(/\[\d+\]/g, '').split('.').pop();
    if (itemKey) root.dataset.bind = itemKey;
    if (slots.root) actx.applyClassValue(root, slots.root);

    const effectiveLabelPosition = p.labelPosition || 'top';

    const label = document.createElement(asGroup ? 'legend' : 'label');
    label.className = asGroup ? 'formspec-legend' : 'formspec-label';
    // Label and legend take phrasing content only, so the rich-text subset renders inline (core §4.2.1).
    writeRichText(label, labelText, { inline: true });
    if (asGroup) {
        label.id = `${fieldId}-label`;
    } else if (options?.labelFor !== false) {
        (label as HTMLLabelElement).htmlFor = fieldId;
    }
    if (slots.label) actx.applyClassValue(label, slots.label);

    if (effectiveLabelPosition === 'hidden') {
        label.classList.add('formspec-sr-only');
    } else if (!asGroup && effectiveLabelPosition === 'start') {
        root.classList.add('formspec-field--inline');
    }

    root.appendChild(label);

    // Always rendered, hidden while empty: interpolated text can arrive after render, and
    // bindSharedFieldEffects keeps text, visibility, and aria-describedby current.
    const desc = document.createElement('div');
    desc.className = 'formspec-description';
    desc.id = descId;
    writeRichText(desc, descText);
    desc.hidden = !descText;
    root.appendChild(desc);

    // A div, not a p: a hint carrying the rich-text subset may hold paragraphs and a list, which a <p> cannot.
    const hint = document.createElement('div');
    hint.className = 'formspec-hint';
    hint.id = hintId;
    writeRichText(hint, hintText);
    hint.hidden = !hintText;
    if (slots.hint) actx.applyClassValue(hint, slots.hint);
    root.appendChild(hint);

    const error = document.createElement('p');
    error.className = 'formspec-error';
    error.id = errorId;
    // Not a live region: the control's aria-describedby names this message while it shows, so a live
    // region would announce it twice (and announce every invalid field at once on submit).
    if (slots.error) actx.applyClassValue(error, slots.error);

    return { root, label, hint, error };
}

/**
 * Finalize field DOM: append remote options status, error display, and apply theme styles.
 * Call this AFTER inserting the control element.
 */
export function finalizeFieldDOM(
    fieldDOM: FieldDOM,
    behavior: FieldBehavior,
    actx: AdapterContext,
): void {
    const vm = behavior.vm;
    const isRequired = vm ? untracked(() => vm.required.value) : false;
    const showMarker = behavior.presentation.requiredIndicator !== 'none';
    if (isRequired && showMarker && !fieldDOM.label.querySelector('.formspec-required')) {
        const marker = document.createElement('abbr');
        marker.className = 'formspec-required usa-label--required';
        marker.setAttribute('title', 'required');
        marker.textContent = ' *';
        fieldDOM.label.appendChild(marker);
    }

    // Remote options loading/error status
    const ros = behavior.remoteOptionsState;
    if (ros.loading || ros.error) {
        const status = document.createElement('div');
        status.className = 'formspec-hint formspec-remote-options-status';
        if (ros.loading) {
            watchText(actx, uiText(actx.engine, 'select.loadingOptions'), (text) => { status.textContent = text; });
        } else if (ros.error) {
            const key = behavior.options().length > 0 ? 'select.remoteFallback' : 'select.remoteFailed';
            watchText(actx, uiText(actx.engine, key), (text) => { status.textContent = text; });
        }
        fieldDOM.root.appendChild(status);
    }

    fieldDOM.root.appendChild(fieldDOM.error);

    // Theme cascade styles
    actx.applyCssClass(fieldDOM.root, behavior.presentation);
    actx.applyStyle(fieldDOM.root, behavior.presentation.style);
    actx.applyAccessibility(fieldDOM.root, behavior.presentation);

    // Component-level overrides (extracted by behavior hook, not raw comp)
    if (behavior.compOverrides.accessibility) {
        actx.applyAccessibility(fieldDOM.root, behavior.compOverrides);
    }
    if (behavior.compOverrides.cssClass) {
        actx.applyCssClass(fieldDOM.root, behavior.compOverrides);
    }
    if (behavior.compOverrides.style) {
        actx.applyStyle(fieldDOM.root, behavior.compOverrides.style);
    }
}

/**
 * Wrap `input` with display-only prefix/suffix spans (matches .formspec-input-adornment in React).
 * Returns `input` unchanged when neither is set. Span ids feed aria-describedby via bindSharedFieldEffects.
 */
export function wrapInputAdornments(
    input: HTMLInputElement,
    behavior: { id: string; prefix?: string; suffix?: string },
): HTMLElement {
    if (!behavior.prefix && !behavior.suffix) return input;
    const wrapper = document.createElement('div');
    wrapper.className = 'formspec-input-adornment';
    const adornment = (kind: 'prefix' | 'suffix', text: string) => {
        const span = document.createElement('span');
        span.className = `formspec-${kind} formspec-input-${kind}`;
        span.id = `${behavior.id}-${kind}`;
        span.textContent = text;
        return span;
    };
    if (behavior.prefix) wrapper.appendChild(adornment('prefix', behavior.prefix));
    wrapper.appendChild(input);
    if (behavior.suffix) wrapper.appendChild(adornment('suffix', behavior.suffix));
    return wrapper;
}

/**
 * Apply widgetClassSlots.control to the actual input element(s).
 * For radio/checkbox groups, applies to each input. For others, applies to the control.
 */
/**
 * Run `fn` whenever the field value may have changed.
 *
 * With a {@link FieldBehavior.vm}, tracks `vm.value` via Preact `effect` (engine view-model cells are typed as
 * read-only signal accessors only; observing them goes through `effect`, not `.subscribe` on the public type).
 *
 * Without a VM, subscribes to `change` on `fallbackControl` (native &lt;select&gt; / similar).
 */
export function watchFieldValueChanges(
    behavior: FieldBehavior,
    fallbackControl: HTMLSelectElement,
    fn: () => void,
): () => void {
    if (behavior.vm) {
        return effect(() => {
            behavior.vm!.value.value;
            fn();
        });
    }
    const onChange = () => fn();
    fallbackControl.addEventListener('change', onChange);
    return () => fallbackControl.removeEventListener('change', onChange);
}

export function applyControlSlotClass(
    control: HTMLElement,
    behavior: FieldBehavior,
    actx: AdapterContext,
    isGroup: boolean = false,
): void {
    const controlSlot = behavior.widgetClassSlots.control;
    if (!controlSlot) return;
    if (isGroup) {
        control.querySelectorAll('input').forEach(el => actx.applyClassValue(el, controlSlot));
    } else {
        const target = control.querySelector('input') || control.querySelector('select') || control.querySelector('textarea') || control;
        if (target instanceof HTMLElement) actx.applyClassValue(target, controlSlot);
    }
}
