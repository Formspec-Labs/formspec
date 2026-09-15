/** @filedesc Ref-counted stylesheet linking into an element's own root — document head or shadow root. */
import type { StylingHost } from './index';
import type { StylesheetLayer } from '../adapters/types';

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
 * The structural sheet as a layer: present when `layout.primitives.css` already marks `.formspec-container`.
 * Same shape as every adapter layer, so one probe answers "does the page already have this CSS?" for all.
 */
const LAYOUT_LAYER: StylesheetLayer = {
    href: LAYOUT_STYLESHEET_HREF,
    presentWhen: { className: 'formspec-container', property: '--formspec-layout', value: '1' },
};

/** The element's tree a probe attaches to — a document probes into `body`, a shadow root into itself. */
function probeParent(root: StyleRoot): ParentNode | null {
    return root.nodeType === DOCUMENT_NODE ? (root as Document).body : (root as ShadowRoot);
}

/**
 * A layer's presence probe (ADR 0063 D-4): append a hidden element carrying `presentWhen.className` to the
 * render root's tree, read the computed `presentWhen.property`, remove it. Present when the value already
 * equals `presentWhen.value` — a host that loaded the sheet itself (bundler import, hashed asset, CDN, a
 * hand-written link) gets no link from us, and no unstyled frame. Not present while the probe cannot render
 * (no `body` yet), so the sheet links.
 */
function layerIsPresent(root: StyleRoot, layer: StylesheetLayer): boolean {
    const parent = probeParent(root);
    if (!parent) return false;
    const probe = document.createElement('div');
    probe.className = layer.presentWhen.className;
    probe.style.display = 'none';
    parent.appendChild(probe);
    const value = getComputedStyle(probe).getPropertyValue(layer.presentWhen.property).trim();
    probe.remove();
    return value === layer.presentWhen.value;
}

/**
 * Cascade order: structural layout, then the resolved adapter's layers, then the theme's own sheets —
 * least to most specific. Layout and adapter layers link only when their probe finds them missing; theme
 * sheets always link: they are the brand layer this document asked for, not something a page can have
 * pre-loaded on the renderer's behalf.
 */
function orderedStylesheetHrefs(host: StylingHost, root: StyleRoot): string[] {
    return [
        ...[LAYOUT_LAYER, ...host.adapterStylesheets()]
            .filter((layer) => !layerIsPresent(root, layer))
            .map((layer) => layer.href),
        ...(host._themeDocument?.stylesheets ?? []),
    ];
}

/** Link what the page lacks; returns the links this call created, for the caller to wait on. */
export function loadStylesheets(host: StylingHost): HTMLLinkElement[] {
    cleanupStylesheets(host);
    const root = styleRoot(host);
    if (!root) return [];
    const container = linkContainer(root);
    const counts = refCounts(root);
    const created: HTMLLinkElement[] = [];

    const uniqueHrefs = new Set<string>();
    for (const rawHref of orderedStylesheetHrefs(host, root)) {
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
            created.push(link);
        }
        counts.set(hrefKey, existingCount + 1);
        host.stylesheetHrefs.push(hrefKey);
    }
    host.stylesheetRoot = root;
    return created;
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
