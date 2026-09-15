/** @filedesc Render adapter types for the headless component architecture. */

/**
 * An adapter render function receives a behavior contract and a parent element.
 * It creates DOM, appends to parent, calls behavior.bind(refs), and registers dispose.
 */
export type AdapterRenderFn<B = any> = (behavior: B, parent: HTMLElement, actx: AdapterContext) => void;

/**
 * Context passed to adapter render functions.
 *
 * Extended beyond ADR 0046's minimal definition (onDispose only) with
 * styling helpers that the default adapter needs to reproduce current DOM.
 * External design-system adapters can ignore all but onDispose.
 */
export interface AdapterContext {
    /** Register a cleanup function called when the component is torn down. */
    onDispose(fn: () => void): void;
    /**
     * Apply cssClass from a PresentationBlock or comp descriptor to an element. `itemPath` names the item
     * for an unknown-class warning (ADR 0064 decision 2); omit it to fall back to `comp.bindPath`/`comp.id`.
     */
    applyCssClass(el: HTMLElement, comp: any, itemPath?: string): void;
    /** Apply inline styles with token resolution to an element. */
    applyStyle(el: HTMLElement, style: any): void;
    /** Apply accessibility attributes (role, aria-description, aria-live). */
    applyAccessibility(el: HTMLElement, comp: any): void;
    /** Apply a single class value (string or array) to an element's classList. */
    applyClassValue(el: HTMLElement, classValue: unknown): void;
}

/**
 * A render adapter provides DOM construction functions for component types.
 * Missing entries fall back to the default adapter.
 */
export interface RenderAdapter {
    name: string;
    components: Partial<Record<string, AdapterRenderFn>>;
    /**
     * Absolute URLs of the stylesheets this adapter's markup needs — its design system's CSS, self-contained
     * (fonts and images inlined), typically `new URL('./x.css', import.meta.url).href`. The renderer links them,
     * ref-counted, before any Theme `stylesheets`; hosts never import adapter CSS themselves.
     */
    stylesheets?: string[];
    /**
     * Every CSS class name this adapter's stylesheet selects — generated from the compiled sheet at build
     * time (ADR 0064 decision 2), never hand-listed. When present, the renderer warns once per (adapter
     * name, class) on a Theme `cssClass` this set does not contain (theme-spec §2.4/§3.x escape-hatch
     * ladder). Absent — the default adapter today — means no check runs.
     */
    classVocabulary?: ReadonlySet<string>;
}
