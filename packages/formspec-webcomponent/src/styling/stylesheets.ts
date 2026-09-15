/** @filedesc Ref-counted theme stylesheet injection and cleanup for document.head. */
import type { StylingHost } from './index';

/**
 * Structural layout CSS, shipped next to this module in `dist/`. Every adapter needs it,
 * so the renderer links it ahead of any adapter or theme sheet.
 */
export const LAYOUT_STYLESHEET_HREF: string = new URL('../formspec-layout.css', import.meta.url).href;

/** Module-level ref counts (was static on the class). */
export const stylesheetRefCounts: Map<string, number> = new Map();

export function canonicalizeStylesheetHref(href: string): string {
    try {
        return new URL(href, document.baseURI).href;
    } catch {
        return href;
    }
}

export function findThemeStylesheet(hrefKey: string): HTMLLinkElement | null {
    const links = document.head.querySelectorAll('link[data-formspec-theme-href]');
    for (const link of links) {
        const htmlLink = link as HTMLLinkElement;
        if (htmlLink.dataset.formspecThemeHref === hrefKey) return htmlLink;
    }
    return null;
}

/**
 * Cascade order: structural layout, then the resolved adapter's design system,
 * then the theme's own sheets — least to most specific.
 */
function orderedStylesheetHrefs(host: StylingHost): string[] {
    return [
        LAYOUT_STYLESHEET_HREF,
        ...host.adapterStylesheets(),
        ...(host._themeDocument?.stylesheets ?? []),
    ];
}

export function loadStylesheets(host: StylingHost): void {
    cleanupStylesheets(host);
    const uniqueHrefs = new Set<string>();
    for (const rawHref of orderedStylesheetHrefs(host)) {
        if (!rawHref || typeof rawHref !== 'string') continue;
        const hrefKey = canonicalizeStylesheetHref(rawHref);
        if (uniqueHrefs.has(hrefKey)) continue;
        uniqueHrefs.add(hrefKey);

        const existingCount = stylesheetRefCounts.get(hrefKey) ?? 0;
        if (existingCount === 0) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = rawHref;
            link.dataset.formspecTheme = 'true';
            link.dataset.formspecThemeHref = hrefKey;
            document.head.appendChild(link);
        }
        stylesheetRefCounts.set(hrefKey, existingCount + 1);
        host.stylesheetHrefs.push(hrefKey);
    }
}

export function cleanupStylesheets(host: StylingHost): void {
    for (const hrefKey of host.stylesheetHrefs) {
        const count = stylesheetRefCounts.get(hrefKey) ?? 0;
        if (count <= 1) {
            stylesheetRefCounts.delete(hrefKey);
            const link = findThemeStylesheet(hrefKey);
            if (link) link.remove();
        } else {
            stylesheetRefCounts.set(hrefKey, count - 1);
        }
    }
    host.stylesheetHrefs = [];
}
