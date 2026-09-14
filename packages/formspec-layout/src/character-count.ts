/** @filedesc Character count copy for TextInput theme widgetConfig.maxLength (USWDS usa-character-count wording). */

/** The sr-only limit message a control's aria-describedby names. */
export function characterCountLimitMessage(maxLength: number): string {
    return `You can enter up to ${maxLength} characters`;
}

/** The visible and announced count status (usa-character-count `getCountMessage`). */
export function characterCountStatus(length: number, maxLength: number): string {
    if (length === 0) return `${maxLength} characters allowed`;
    const remaining = maxLength - length;
    const count = Math.abs(remaining);
    return `${count} character${count === 1 ? '' : 's'} ${remaining < 0 ? 'over limit' : 'left'}`;
}

/** Typing pause before the polite live status repeats the count, so screen readers are not flooded. */
export const CHARACTER_COUNT_ANNOUNCE_DELAY_MS = 1000;
