/** @filedesc Applies inline style objects to elements with token resolution. */
import type { StylingHost } from './index';
import { resolveToken } from './tokens';

export function applyStyle(host: StylingHost, el: HTMLElement, style: Record<string, string | number> | undefined): void {
    if (!style) return;
    for (const [key, val] of Object.entries(style)) {
        const resolved = resolveToken(host, val);
        (el.style as unknown as Record<string, string | number>)[key] = resolved as string | number;
    }
}
