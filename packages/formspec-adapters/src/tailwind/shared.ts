/** @filedesc Shared DOM construction and neutral Tailwind utilities for adapters.
 * Designed to be theme-agnostic. Colors should come from CSS variables, theme cssClass,
 * or host Tailwind config. Includes tailwind-merge support.
 */
import type { FieldBehavior } from '@formspec-org/webcomponent';
import { el, applyCascadeClasses, applyCascadeAccessibility } from '../helpers';

// ── Semantic Tailwind utility groups — clean and maintainable ──
// Base styles that can be extended via cssClass or CSS variables.
// We avoid long concatenated strings and favor semantic groupings.

export const TW = {
    // Typography
    label: 'mb-1.5 block text-sm font-semibold text-[var(--formspec-tw-text)]',
    labelHidden: 'sr-only',
    hint: 'mt-1 text-xs leading-relaxed text-[var(--formspec-tw-muted)]',
    error: 'mt-1.5 text-sm font-medium text-[var(--formspec-tw-danger)]',
    legend: 'mb-2 text-sm font-semibold text-[var(--formspec-tw-text)]',

    // Form inputs
    input: 'block w-full rounded-xl border border-[color:var(--formspec-tw-border)] bg-[var(--formspec-tw-field-bg)] px-3.5 py-2.5 text-sm text-[var(--formspec-tw-text)] shadow-[var(--formspec-tw-shadow-sm)] transition placeholder:text-[var(--formspec-tw-placeholder)] focus:border-[color:var(--formspec-tw-accent)] focus:outline-none focus:ring-4 focus:ring-[var(--formspec-tw-accent-ring)]',
    inputError: 'border-[color:var(--formspec-tw-danger)] focus:border-[color:var(--formspec-tw-danger)] focus:ring-[var(--formspec-tw-danger-ring)]',
    inputNormal: 'border-[color:var(--formspec-tw-border)]',

    // Layout
    group: 'mb-5',
    fieldset: 'mb-6 space-y-1 border-0 p-0',

    // Controls
    controlSm: 'peer size-[1.125rem] shrink-0 cursor-pointer rounded-md border-[color:var(--formspec-tw-border-strong)] bg-[var(--formspec-tw-surface)] text-[var(--formspec-tw-accent)] transition focus:ring-2 focus:ring-[var(--formspec-tw-accent-ring)] focus:ring-offset-0',
    radioSm: 'peer size-[1.125rem] shrink-0 cursor-pointer border-[color:var(--formspec-tw-border-strong)] bg-[var(--formspec-tw-surface)] text-[var(--formspec-tw-accent)] transition focus:ring-2 focus:ring-[var(--formspec-tw-accent-ring)] focus:ring-offset-0',
    optionLabelText: 'text-sm font-medium leading-snug text-[var(--formspec-tw-text)]',
    optionLabel: 'text-sm font-medium leading-snug text-[var(--formspec-tw-text)]',
    optionWrapper: 'flex items-start gap-3',

    // Buttons
    button: 'inline-flex items-center justify-center rounded-xl bg-[var(--formspec-tw-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--formspec-tw-accent-fg)] shadow-[var(--formspec-tw-shadow-md)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--formspec-tw-accent-ring)]',
    buttonOutline: 'inline-flex items-center justify-center rounded-xl border border-[color:var(--formspec-tw-border)] bg-[var(--formspec-tw-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--formspec-tw-text)] shadow-[var(--formspec-tw-shadow-sm)] transition hover:border-[color:var(--formspec-tw-border-strong)] hover:bg-[var(--formspec-tw-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--formspec-tw-accent-ring)]',
    buttonUnstyled: 'text-sm font-semibold underline-offset-2 hover:underline',

    // Container for form controls (Toggle, Rating, Slider, etc.)
    controlContainer: 'flex min-h-[56px] items-center gap-4 rounded-2xl border border-[color:var(--formspec-tw-border)] bg-[var(--formspec-tw-surface-muted)] px-5 py-3 shadow-[var(--formspec-tw-shadow-sm)] transition-colors',
} as const;

/** Base selectable card for checkbox/radio groups. 
 * Highly customizable via cssClass or theme. Uses peer/has modifiers for state. */
export const TW_CARD_OPTION =
    'relative group flex cursor-pointer items-center gap-3 rounded-lg border border-[color:var(--formspec-tw-border)] bg-[var(--formspec-tw-surface)] px-4 py-3 shadow-[var(--formspec-tw-shadow-sm)] transition-all duration-200 hover:border-[color:var(--formspec-tw-border-strong)] hover:bg-[var(--formspec-tw-surface-muted)] has-[:checked]:border-[color:var(--formspec-tw-accent)] has-[:checked]:bg-[var(--formspec-tw-accent-soft)] has-[:checked]:shadow-[var(--formspec-tw-shadow-md)] has-[:checked]:ring-1 has-[:checked]:ring-[var(--formspec-tw-accent-ring)]';

// ── Shared field DOM ──────────────────────────────────────────────

export interface TailwindFieldDOM {
    root: HTMLElement;
    label: HTMLElement;
    hint: HTMLElement | undefined;
    error: HTMLElement;
    describedBy: string;
}

export interface TailwindFieldOptions {
    labelFor?: boolean;
}

export function createTailwindFieldDOM(
    behavior: FieldBehavior,
    options?: TailwindFieldOptions,
): TailwindFieldDOM {
    const p = behavior.presentation;
    const labelFor = options?.labelFor ?? true;

    const root = el('div', { class: TW.group, 'data-name': behavior.fieldPath });
    applyCascadeClasses(root, p);
    applyCascadeAccessibility(root, p);

    // Label
    const labelAttrs: Record<string, string> = {
        class: p.labelPosition === 'hidden' ? TW.labelHidden : TW.label,
    };
    if (labelFor) labelAttrs.for = behavior.id;
    const label = el('label', labelAttrs);
    label.textContent = behavior.label;
    root.appendChild(label);

    // Hint
    let hint: HTMLElement | undefined;
    if (behavior.hint) {
        const hintId = `${behavior.id}-hint`;
        hint = el('p', { class: TW.hint, id: hintId });
        hint.textContent = behavior.hint;
        root.appendChild(hint);
    }

    // Error (not appended — adapter places it after control)
    const error = createTailwindError(behavior.id);

    const describedBy = hint ? `${behavior.id}-hint` : '';

    return { root, label, hint, error, describedBy };
}

export function setTwAriaDescribedBy(el: HTMLElement, describedBy: string): void {
    const v = describedBy.trim();
    if (v) el.setAttribute('aria-describedby', v);
    else el.removeAttribute('aria-describedby');
}

export function createTailwindError(behaviorId: string): HTMLElement {
    return el('p', {
        class: TW.error,
        id: `${behaviorId}-error`,
    });
}

export function toggleInputError(input: HTMLElement, hasError: boolean): void {
    if (hasError) {
        input.classList.add(...TW.inputError.split(/\s+/));
        input.classList.remove(...TW.inputNormal.split(/\s+/));
    } else {
        input.classList.remove(...TW.inputError.split(/\s+/));
        input.classList.add(...TW.inputNormal.split(/\s+/));
    }
}

/** Adjusts input rounding classes when prefix/suffix elements are present. */
export function applyAffixRounding(input: HTMLElement, hasPrefix: boolean, hasSuffix: boolean): void {
    if (hasPrefix && hasSuffix) {
        input.classList.remove('rounded-xl', 'rounded-l-xl', 'rounded-r-xl');
        input.classList.add('rounded-none');
    } else if (hasPrefix) {
        input.classList.remove('rounded-xl');
        input.classList.add('rounded-none', 'rounded-r-xl');
    } else if (hasSuffix) {
        input.classList.remove('rounded-xl');
        input.classList.add('rounded-none', 'rounded-l-xl');
    }
}

/** Creates a selectable card element for checkbox/radio groups. */
export function createCardOption(id: string, labelText: string): { card: HTMLElement; input: HTMLInputElement; label: HTMLElement } {
    const card = el('label', { class: TW_CARD_OPTION, for: id });

    const input = document.createElement('input') as HTMLInputElement;
    input.id = id;
    input.type = 'checkbox';
    input.className = TW.controlSm;

    const text = el('span', { class: TW.optionLabelText });
    text.textContent = labelText;

    card.appendChild(input);
    card.appendChild(text);

    return { card, input, label: text };
}

/** Applies standard error styling to a container. Can be overridden by theme. */
export function applyErrorStyling(el: HTMLElement, hasError: boolean): void {
    el.classList.toggle('ring-2', hasError);
    el.classList.toggle('ring-[var(--formspec-tw-danger-ring)]', hasError);
    el.classList.toggle('rounded-xl', hasError);
}

/**
 * Optional tailwind-merge support.
 * Import { twMerge } from 'tailwind-merge' in your app and call:
 * setTailwindMerge(twMerge) from formspec-layout to enable automatic conflict resolution.
 */
let twMergeFn: ((...classes: string[]) => string) | null = null;

export function setTailwindMerge(fn: ((...classes: string[]) => string) | null): void {
    twMergeFn = fn;
}

export function mergeClasses(...classes: (string | undefined)[]): string {
    const joined = classes.filter(Boolean).join(' ');
    return twMergeFn ? twMergeFn(joined) : joined;
}
