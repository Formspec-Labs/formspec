/** @filedesc Ref-counted stylesheet linking into an element's own root — document head or shadow root. */
import type { StylingHost } from './index';

/**
 * Structural layout CSS, shipped next to this module in `dist/`. Every adapter needs it,
 * so the renderer links it ahead of any adapter or theme sheet.
 */
export const LAYOUT_STYLESHEET_HREF: string = new URL('../formspec-layout.css', import.meta.url).href;

/**
 * Ref counts per style root, so a shadow root and the document count the same href
 * independently. Weak: a detached root's counts go with it.
 */
const refCountsByRoot = new WeakMap<StyleRoot, Map<string, number>>();

/** Where an element's `<link>` elements belong. A ShadowRoot styles only what it contains. */
type StyleRoot = Document | ShadowRoot;

const DOCUMENT_NODE = 9;
const DOCUMENT_FRAGMENT_NODE = 11;

/** The element's root, or `null` while it sits outside any tree — `connectedCallback` links it then. */
function styleRoot(host: StylingHost): StyleRoot | null {
    const root = host.getRootNode();
    const kind = root.nodeType;
    return kind === DOCUMENT_NODE || kind === DOCUMENT_FRAGMENT_NODE ? (root as StyleRoot) : null;
}

/** A document links into its `<head>`; a shadow root holds its links directly. */
function linkContainer(root: StyleRoot): ParentNode {
    return (root as Document).head ?? root;
}

function refCounts(root: StyleRoot): Map<string, number> {
    let counts = refCountsByRoot.get(root);
    if (!counts) {
        counts = new Map();
        refCountsByRoot.set(root, counts);
    }
    return counts;
}

export function canonicalizeStylesheetHref(href: string): string {
    try {
        return new URL(href, document.baseURI).href;
    } catch {
        return href;
    }
}

function findLink(root: StyleRoot, hrefKey: string): HTMLLinkElement | null {
    const links = linkContainer(root).querySelectorAll('link[data-formspec-theme-href]');
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
    const root = styleRoot(host);
    if (!root) return;
    const container = linkContainer(root);
    const counts = refCounts(root);

    const uniqueHrefs = new Set<string>();
    for (const rawHref of orderedStylesheetHrefs(host)) {
        if (!rawHref || typeof rawHref !== 'string') continue;
        const hrefKey = canonicalizeStylesheetHref(rawHref);
        if (uniqueHrefs.has(hrefKey)) continue;
        uniqueHrefs.add(hrefKey);

        const existingCount = counts.get(hrefKey) ?? 0;
        if (existingCount === 0) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = rawHref;
            link.dataset.formspecTheme = 'true';
            link.dataset.formspecThemeHref = hrefKey;
            container.appendChild(link);
        }
        counts.set(hrefKey, existingCount + 1);
        host.stylesheetHrefs.push(hrefKey);
    }
    host.stylesheetRoot = root;
}

export function cleanupStylesheets(host: StylingHost): void {
    // The root recorded at link time, not the current one: on disconnect the element has already left it.
    const root = host.stylesheetRoot;
    if (root) {
        const counts = refCounts(root);
        for (const hrefKey of host.stylesheetHrefs) {
            const count = counts.get(hrefKey) ?? 0;
            if (count <= 1) {
                counts.delete(hrefKey);
                findLink(root, hrefKey)?.remove();
            } else {
                counts.set(hrefKey, count - 1);
            }
        }
    }
    host.stylesheetHrefs = [];
    host.stylesheetRoot = null;
}
