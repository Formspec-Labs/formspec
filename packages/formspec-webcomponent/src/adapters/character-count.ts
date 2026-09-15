/** @filedesc Shared accessible character count for TextInput widgetConfig.maxLength — used by default and external adapters. */
import { effect } from '@preact/signals-core';
import {
    CHARACTER_COUNT_ANNOUNCE_DELAY_MS,
    characterCountLimitMessage,
    characterCountStatus,
    type ChromeStringKey,
} from '@formspec-org/layout';
import type { IFormEngine } from '@formspec-org/engine/render';
import type { FieldBehavior } from '../behaviors/types';

export interface CharacterCountConfig {
    /** The text control the count describes. Its native `maxlength` is removed. */
    field: HTMLInputElement | HTMLTextAreaElement;
    maxLength: number;
    /** The field's view model: the count follows its value. Without one it follows the field's input events. */
    vm: FieldBehavior['vm'];
    /** Id for the sr-only limit message, which the field's aria-describedby names first. */
    messageId: string;
    /** Design-system classes for the three elements, and the status class while over the limit. */
    classes: { message: string; status: string; statusOverLimit: string; srStatus: string };
    /** Tag of the visual status element. Defaults to `p`. */
    statusTag?: 'p' | 'div';
    /**
     * Locale-aware wording (Locale §3.1.10 `$ui.characterCount.*`), following a switch. Absent — the
     * pre-engine skeleton pass — keeps the inventory's English default.
     */
    engine?: IFormEngine;
    /** Called whenever the over-limit state flips, e.g. to compose aria-invalid with Formspec validation. */
    onOverLimitChange(overLimit: boolean): void;
}

/** `characterCountLimitMessage`/`characterCountStatus`'s Locale-override lookup, bound to `engine`. */
function localeLookup(engine: IFormEngine | undefined): ((key: ChromeStringKey) => string | null) | undefined {
    if (!engine) return undefined;
    return (key) => engine.lookupLocaleString(`$ui.${key}`);
}

export interface CharacterCountResult {
    /** Limit message, visual status, and live status, in order: append them after the control. */
    elements: HTMLElement[];
    /** Stop following the value and cancel a pending announcement. */
    dispose(): void;
}

/**
 * Theme `widgetConfig.maxLength` (theme §4.2: a character count display, not a hard cap), as USWDS
 * usa-character-count renders it: an sr-only limit message linked through aria-describedby, a visual status
 * (aria-hidden), and a polite live status repeated after a typing pause. No native maxlength, which would
 * silently truncate pasted text.
 */
export function createCharacterCount(config: CharacterCountConfig): CharacterCountResult {
    const { field, maxLength, vm, classes, onOverLimitChange } = config;
    field.removeAttribute('maxlength');

    const message = document.createElement('span');
    message.className = classes.message;
    message.id = config.messageId;
    const status = document.createElement(config.statusTag ?? 'p');
    status.className = classes.status;
    status.setAttribute('aria-hidden', 'true');
    const srStatus = document.createElement('div');
    srStatus.className = classes.srStatus;
    srStatus.setAttribute('aria-live', 'polite');
    // Primed synchronously so an untouched field's first paint carries live status text with no 1s
    // announce delay; `update()` below corrects it immediately when the field starts non-empty.
    status.textContent = srStatus.textContent = characterCountStatus(0, maxLength, localeLookup(config.engine));

    const describedBy = field.getAttribute('data-describedby-base');
    field.setAttribute('data-describedby-base', describedBy ? `${message.id} ${describedBy}` : message.id);

    // Locale §3.1.10 $ui.characterCount.* — an authored override wins; the inventory's English default
    // otherwise. Read inside every effect below so a locale switch alone (no value change) still updates.
    const disposeMessage = effect(() => {
        config.engine?.localeSignal.value;
        message.textContent = characterCountLimitMessage(maxLength, localeLookup(config.engine));
    });

    let srTimer: ReturnType<typeof setTimeout> | undefined;
    let wasOverLimit = false;
    const update = (length: number) => {
        config.engine?.localeSignal.value;
        const overLimit = length > maxLength;
        if (overLimit !== wasOverLimit) {
            wasOverLimit = overLimit;
            status.classList.toggle(classes.statusOverLimit, overLimit);
            onOverLimitChange(overLimit);
        }
        const text = characterCountStatus(length, maxLength, localeLookup(config.engine));
        if (status.textContent === text) return;
        status.textContent = text;
        clearTimeout(srTimer);
        srTimer = setTimeout(() => { srStatus.textContent = text; }, CHARACTER_COUNT_ANNOUNCE_DELAY_MS);
    };
    const stopWatching = vm
        ? effect(() => update(String(vm.value.value ?? '').length))
        : (() => {
            const onInput = () => update(field.value.length);
            field.addEventListener('input', onInput);
            const stopLocaleWatch = effect(() => update(field.value.length));
            return () => { field.removeEventListener('input', onInput); stopLocaleWatch(); };
        })();

    return {
        elements: [message, status, srStatus],
        dispose: () => {
            disposeMessage();
            stopWatching();
            clearTimeout(srTimer);
        },
    };
}
