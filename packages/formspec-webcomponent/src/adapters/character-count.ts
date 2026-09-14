/** @filedesc Shared accessible character count for TextInput widgetConfig.maxLength — used by default and external adapters. */
import { effect } from '@preact/signals-core';
import {
    CHARACTER_COUNT_ANNOUNCE_DELAY_MS,
    characterCountLimitMessage,
    characterCountStatus,
} from '@formspec-org/layout';
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
    /** Called whenever the over-limit state flips, e.g. to compose aria-invalid with Formspec validation. */
    onOverLimitChange(overLimit: boolean): void;
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
    message.textContent = characterCountLimitMessage(maxLength);
    const status = document.createElement(config.statusTag ?? 'p');
    status.className = classes.status;
    status.setAttribute('aria-hidden', 'true');
    const srStatus = document.createElement('div');
    srStatus.className = classes.srStatus;
    srStatus.setAttribute('aria-live', 'polite');
    status.textContent = srStatus.textContent = characterCountStatus(0, maxLength);

    const describedBy = field.getAttribute('data-describedby-base');
    field.setAttribute('data-describedby-base', describedBy ? `${message.id} ${describedBy}` : message.id);

    let srTimer: ReturnType<typeof setTimeout> | undefined;
    let wasOverLimit = false;
    const update = (length: number) => {
        const overLimit = length > maxLength;
        if (overLimit !== wasOverLimit) {
            wasOverLimit = overLimit;
            status.classList.toggle(classes.statusOverLimit, overLimit);
            onOverLimitChange(overLimit);
        }
        const text = characterCountStatus(length, maxLength);
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
            return () => field.removeEventListener('input', onInput);
        })();

    return {
        elements: [message, status, srStatus],
        dispose: () => {
            stopWatching();
            clearTimeout(srTimer);
        },
    };
}
