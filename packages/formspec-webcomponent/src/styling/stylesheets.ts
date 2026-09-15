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

/** What a host already loaded, as the stylesheets themselves declare it on `.formspec-container`. */
interface HostProvidedStyles {
    layout: boolean;
    adapter: string;
}

/** The element's tree a probe attaches to — a document probes into `body`, a shadow root into itself. */
function probeParent(root: StyleRoot): ParentNode | null {
    return root.nodeType === DOCUMENT_NODE ? (root as Document).body : (root as ShadowRoot);
}

/**
 * Appends a hidden element carrying `className` to `root`'s tree, reads its computed style, removes the
 * element, and returns what `read` extracted — `undefined` when the probe cannot render (no `body` yet).
 * Every presence check (ADR 0063 D-4) — the structural sheet, an adapter's marker, one `StylesheetLayer`'s
 * own probe — goes through this one hidden-element mechanism.
 */
function withProbe<T>(root: StyleRoot, className: string, read: (style: CSSStyleDeclaration) => T): T | undefined {
    const parent = probeParent(root);
    if (!parent) return undefined;
    const probe = document.createElement('div');
    probe.className = className;
    probe.style.display = 'none';
    parent.appendChild(probe);
    const result = read(getComputedStyle(probe));
    probe.remove();
    return result;
}

/**
 * Ask the page what it already has. The structural sheet and every legacy (string-entry) adapter sheet
 * set one custom property each on `.formspec-container` — a host that pre-loaded them (bundler import,
 * hashed asset, hand-written link) gets no link from us, and no unstyled frame.
 */
function hostProvidedStyles(root: StyleRoot): HostProvidedStyles {
    return (
        withProbe(root, 'formspec-container', (style) => ({
            layout: style.getPropertyValue('--formspec-layout').trim() !== '',
            adapter: style.getPropertyValue('--formspec-adapter').trim(),
        })) ?? { layout: false, adapter: '' }
    );
}

/**
 * One `StylesheetLayer`'s own presence probe (ADR 0063 D-4): a hidden element carrying
 * `presentWhen.className`, appended to the render root's tree — present when its computed
 * `presentWhen.property` already equals `presentWhen.value`.
 */
function layerIsPresent(root: StyleRoot, layer: StylesheetLayer): boolean {
    const value = withProbe(root, layer.presentWhen.className, (style) =>
        style.getPropertyValue(layer.presentWhen.property).trim());
    return value === layer.presentWhen.value;
}

/**
 * Hrefs from the resolved adapter's declared layers. A plain string is a layer with no probe: linked
 * unless the adapter marker already names this adapter — the rule from before this amendment, still the
 * whole of it for a single-sheet adapter (Tailwind). A `StylesheetLayer` gets its own presence probe,
 * independent of every other layer — a bare page gets both a USWDS adapter's base and rules layers; a
 * page that already loads USWDS gets only the rules layer.
 */
function adapterLayerHrefs(host: StylingHost, root: StyleRoot, provided: HostProvidedStyles): string[] {
    const adapterMarkerMatches = provided.adapter === host.resolvedAdapterName;
    const hrefs: string[] = [];
    for (const layer of host.adapterStylesheets()) {
        if (typeof layer === 'string') {
            if (!adapterMarkerMatches) hrefs.push(layer);
        } else if (!layerIsPresent(root, layer)) {
            hrefs.push(layer.href);
        }
    }
    return hrefs;
}

/**
 * Cascade order: structural layout, then the resolved adapter's design system, then the theme's own
 * sheets — least to most specific. Theme sheets always link: they are the brand layer this document
 * asked for, not something a page can have pre-loaded on the renderer's behalf.
 */
function orderedStylesheetHrefs(host: StylingHost, root: StyleRoot, provided: HostProvidedStyles): string[] {
    return [
        ...(provided.layout ? [] : [LAYOUT_STYLESHEET_HREF]),
        ...adapterLayerHrefs(host, root, provided),
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
    for (const rawHref of orderedStylesheetHrefs(host, root, hostProvidedStyles(root))) {
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
