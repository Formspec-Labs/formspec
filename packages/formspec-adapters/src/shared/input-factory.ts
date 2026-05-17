/** @filedesc Shared factory for constructing standard input controls (deduplicates mechanical wiring). */
import type { FieldBehavior } from '@formspec-org/webcomponent';
import { el } from '../helpers.js';

/** Options for customizing the input skeleton. */
export interface InputSkeletonOptions {
    /** Override the default input tag (e.g., 'select'). */
    tag?: 'input' | 'select';
    /** Override the default input type (e.g., 'number', 'date'). */
    type?: string;
    /** Classes to apply to the input/textarea element. */
    inputClass?: string;
    /** Classes to apply to the prefix/suffix group wrapper (if any). */
    groupClass?: string;
    /** Classes to apply to the prefix element. */
    prefixClass?: string;
    /** Tag to use for the prefix element (default: 'div'). */
    prefixTag?: string;
    /** Classes to apply to the suffix element. */
    suffixClass?: string;
    /** Tag to use for the suffix element (default: 'div'). */
    suffixTag?: string;
    /** ARIA described-by ID(s). */
    ariaDescribedBy?: string;
    /** Explicit prefix text (overrides behavior.prefix). */
    prefix?: string;
    /** Explicit suffix text (overrides behavior.suffix). */
    suffix?: string;
    /** Hook to customize the input element before it's wrapped. */
    onInputCreated?: (input: HTMLInputElement | HTMLTextAreaElement) => void;
}

/** The result of creating an input skeleton. */
export interface InputSkeletonResult {
    /** The element to be treated as the "control" by the behavior (might be the group wrapper). */
    control: HTMLElement;
    /** The actual input or textarea element (for focus/validation toggling). */
    actualInput: HTMLInputElement | HTMLTextAreaElement;
}

/**
 * Creates a standard input/textarea element with shared mechanical wiring.
 * Handles id, name, placeholder, inputMode, extensionAttrs, and prefix/suffix wrapping.
 */
export function createInputSkeleton(
    behavior: FieldBehavior,
    options: InputSkeletonOptions = {}
): InputSkeletonResult {
    const b = behavior as any;
    const isTextarea = b.maxLines != null && b.maxLines > 1;

    let actualInput: HTMLInputElement | HTMLTextAreaElement;

    if (isTextarea) {
        const textarea = document.createElement('textarea') as HTMLTextAreaElement;
        textarea.rows = b.maxLines!;
        actualInput = textarea;
    } else {
        const input = document.createElement(options.tag || 'input') as HTMLInputElement;
        if (options.tag !== 'select') {
            input.type = options.type || b.resolvedInputType || 'text';
        }
        if (b.inputMode) input.inputMode = b.inputMode;
        if (b.min != null) input.min = String(b.min);
        if (b.max != null) input.max = String(b.max);
        if (b.step != null) input.step = String(b.step);
        actualInput = input;
    }

    // Shared basic attributes
    actualInput.id = behavior.id;
    actualInput.name = behavior.fieldPath;
    if (options.inputClass) {
        actualInput.className = options.inputClass;
    }
    if (b.placeholder) {
        actualInput.placeholder = b.placeholder;
    }
    if (options.ariaDescribedBy) {
        actualInput.setAttribute('aria-describedby', options.ariaDescribedBy);
    }

    // Extension attributes
    for (const [attr, val] of Object.entries(behavior.extensionAttrs || {})) {
        if (attr === 'inputMode') actualInput.inputMode = val;
        else if (attr === 'maxLength') (actualInput as HTMLInputElement).maxLength = Number(val);
        else actualInput.setAttribute(attr, val);
    }

    options.onInputCreated?.(actualInput);

    const prefix = options.prefix ?? b.prefix;
    const suffix = options.suffix ?? b.suffix;

    // Prefix / Suffix wrapping
    if (prefix || suffix) {
        const group = el('div', { class: options.groupClass || '' });
        
        if (prefix) {
            const pEl = el(options.prefixTag || 'div', { class: options.prefixClass || '' });
            pEl.textContent = prefix;
            group.appendChild(pEl);
        }
        
        group.appendChild(actualInput);
        
        if (suffix) {
            const sEl = el(options.suffixTag || 'div', { class: options.suffixClass || '' });
            sEl.textContent = suffix;
            group.appendChild(sEl);
        }
        
        return { control: group, actualInput };
    }

    return { control: actualInput, actualInput };
}
