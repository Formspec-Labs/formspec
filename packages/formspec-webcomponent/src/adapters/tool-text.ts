/** @filedesc Assist spec §8.2 tool text: an authored string as plain text, capped for the WebMCP tool attributes. */
import { isRichText, parseRichText, richTextToPlain } from '@formspec-org/layout';

/** §8.2 cap on the form root's `tooldescription`, in characters. */
export const TOOL_DESCRIPTION_MAX = 500;
/** §8.2 cap on a control's `toolparamdescription`, in characters. */
export const TOOL_PARAM_DESCRIPTION_MAX = 150;

const ELLIPSIS = '…';

/**
 * An authored string as plain text: the structure the author wrote (core §4.2.1 subset) flattened first, the
 * `{{}}` leaves filled after — so a respondent's value never opens a markup boundary, and no markup reaches an
 * attribute or a live region.
 */
export function plainText(template: string | null | undefined, interpolate: (template: string) => string = (t) => t): string {
    const source = template ?? '';
    return interpolate(isRichText(source) ? richTextToPlain(parseRichText(source)) : source);
}

/**
 * {@link plainText} of at most `max` characters for a WebMCP tool attribute (§8.2): text past the cap is cut at a
 * character boundary and ends in an ellipsis, so the result is never longer than `max`.
 */
export function toolText(
    template: string | null | undefined,
    max: number,
    interpolate?: (template: string) => string,
): string {
    const text = plainText(template, interpolate);
    const chars = [...text];
    if (chars.length <= max) return text;
    return chars.slice(0, max - 1).join('').trimEnd() + ELLIPSIS;
}
