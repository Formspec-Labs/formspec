/** @filedesc The <formspec-render> custom element that orchestrates form rendering. */
import { signal } from '@preact/signals-core';
import {
    createFormEngine,
    findResponseActionByIntent,
    type FormEngine,
    type IFormEngine,
    type LocaleDocument,
} from '@formspec-org/engine/render';
import { initFormspecEngine, isFormspecEngineInitialized } from '@formspec-org/engine/init-formspec-engine';
import { Path } from '@formspec-org/types';
import type {
    ComponentDocument,
    FormDefinition,
    FormItem,
    RegistryDocument,
    RegistryEntry,
    ScreenerDocument,
    ValidationResult,
} from '@formspec-org/types';
import type { EngineReplayEvent, Issuer, IssuerSource } from '@formspec-org/engine';
import type {
    ActionHost,
    ResponseActionInvoker,
    ResponseActionsDocument,
} from './action-invocation';
import { globalRegistry } from './registry';
import {
    ScreenerRoute,
    ScreenerRouteType,
    ScreenerStateSnapshot,
} from './types';
import type { ComponentDescriptor, ComponentPresentationSource, FormDataRecord, SubmitDetail } from './hub-types';
import type { SubmitHost, SubmitOptions } from './submit';
import {
    ThemeDocument,
    PresentationBlock,
    ItemDescriptor,
    planComponentTree,
    planDefinitionFallback,
    ensureActionButton,
    preparePlanContext,
    mergeFormPresentationForPlanning,
    type ComponentGraphProjectionContext,
    type FieldHelpReference,
    type LayoutHostEvidence,
    type ReferencesDocumentLike,
} from '@formspec-org/layout';
import { buildPlatformTheme, mergePlatformAndTenantTheme, resolveFieldHelp } from '@formspec-org/layout';
const defaultThemeJson = buildPlatformTheme();
const SUPPORTED_COMPONENT_DOCUMENT_VERSIONS = new Set(['1.0', '1.1', '1.2']);

/** Longest the form stays hidden waiting on a stylesheet it linked. A blocked CDN must not hide the form. */
const STYLE_REVEAL_TIMEOUT_MS = 2000;

function componentFormPresentation(componentDocument: ComponentDocument | null): unknown {
    return (componentDocument as (ComponentDocument & { formPresentation?: unknown }) | null)?.formPresentation;
}

function pageModeFromPresentation(presentation: Record<string, unknown> | undefined): 'wizard' | 'tabs' | undefined {
    return presentation?.pageMode === 'wizard' || presentation?.pageMode === 'tabs'
        ? presentation.pageMode
        : undefined;
}

function parseIssuerOverrideAttribute(value: string | null): IssuerSource | undefined {
    if (!value) {
        return undefined;
    }
    try {
        return normalizeIssuerOverride(JSON.parse(value));
    } catch {
        return undefined;
    }
}

function parseIssuerAllowedOriginsAttribute(value: string | null): string[] {
    if (!value) {
        return [];
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter((origin): origin is string => typeof origin === 'string')
            : [];
    } catch {
        return [];
    }
}

function normalizeIssuerOverride(value: unknown): IssuerSource | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    if (record.kind === 'url' && typeof record.url === 'string') {
        return { kind: 'url', url: record.url, source: 'host-embed' };
    }
    if (record.kind === 'inline' && record.issuer && typeof record.issuer === 'object') {
        return { kind: 'inline', issuer: record.issuer as Issuer, source: 'host-embed' };
    }
    return undefined;
}

// Extracted modules
import {
    hasActiveScreener,
    renderScreener,
    buildInitialScreenerAnswers,
    screenerAnswersSatisfyRequired,
    extractScreenerSeedFromData,
    omitScreenerKeysFromData,
    evaluateScreenerDocumentForRoute,
    type ScreenerHost,
} from './rendering/screener';
import { applyResponseDataToEngine } from './hydrate-response-data';
import { setupBreakpoints as setupBreakpointsFn, cleanupBreakpoints, createBreakpointState, type BreakpointState } from './rendering/breakpoints';
import { emitNode as emitNodeFn, type RenderHost as EmitRenderHost } from './rendering/emit-node';
import { renderSkeleton as renderSkeletonFn } from './rendering/skeleton';
import {
    resolveToken as resolveTokenFn,
    resolveItemPresentation as resolveItemPresentationFn,
    applyStyle as applyStyleFn,
    applyCssClass as applyCssClassFn,
    applyClassValue as applyClassValueFn,
    resolveWidgetClassSlots as resolveWidgetClassSlotsFn,
    applyAccessibility as applyAccessibilityFn,
    emitTokenProperties as emitTokenPropertiesFn,
    loadStylesheets as loadStylesheetsFn,
    cleanupStylesheets as cleanupStylesheetsFn,
    type StylingHost,
} from './styling';
import {
    goToWizardStep as goToWizardStepFn,
    focusField as focusFieldFn,
    type NavigationHost,
} from './navigation';
import {
    submit as submitFn,
    touchAllFields as touchAllFieldsFn,
    setSubmitPending as setSubmitPendingFn,
    isSubmitPending as isSubmitPendingFn,
    resolveValidationTarget as resolveValidationTargetFn,
} from './submit';
import {
    resolveActionRef as resolveActionRefFn,
    invokeAction as invokeActionFn,
    emitActionFinding,
} from './action-invocation';
import { IssuerChrome } from './issuer/IssuerChrome';
import { parseQueryIssuerOverride } from './issuer/queryOverride';

/**
 * `<formspec-render>` custom element -- the entry point for rendering a
 * Formspec form in the browser.
 *
 * Orchestrates the full rendering pipeline:
 * - Accepts a definition, optional component document, and optional theme document.
 * - Creates and manages a {@link FormEngine} instance for reactive form state.
 * - Builds the DOM by walking the component tree (or falling back to definition items).
 * - Applies the 5-level theme cascade, token resolution, responsive breakpoints,
 *   and accessibility attributes.
 * - Manages ref-counted stylesheet injection, signal-driven DOM updates, and
 *   cleanup of effects and event listeners on disconnect.
 * - Supports replay, diagnostics snapshots, and runtime context injection.
 *
 * @example
 * ```html
 * <formspec-render></formspec-render>
 * <script>
 *   const el = document.querySelector('formspec-render');
 *   el.definition = myDefinition;
 *   el.componentDocument = myComponentDoc;
 *   el.themeDocument = myTheme;
 * </script>
 * ```
 */
export class FormspecRender extends HTMLElement {
    static get observedAttributes(): string[] {
        return ['data-formspec-appearance', 'issuer-override', 'issuer-allowed-origins'];
    }

    // ── Internal state ────────────────────────────────────────────────
    /** @internal */ _definition: FormDefinition | null = null;
    /** @internal */ _componentDocument: ComponentDocument | null = null;
    /** @internal */ _componentGraph: ComponentGraphProjectionContext | null = null;
    /** @internal */ _hostEvidence: LayoutHostEvidence | null = null;
    /** @internal */ _themeDocument: ThemeDocument | null = null;
    /** @internal */ _adapter: string | null = null;
    private _themeAdapterReported = false;
    private _styleEpoch = 0;
    /** @internal */ _responseActionsDocument: ResponseActionsDocument | null = null;
    /** @internal */ _responseActionInvoker: ResponseActionInvoker | null = null;
    /** @internal */ _registryEntries: Map<string, RegistryEntry> = new Map();
    /** @internal */ engine: IFormEngine | null = null;
    /** @internal */ cleanupFns: Array<() => void> = [];
    private _breakpoints: BreakpointState = createBreakpointState();
    private get activeBreakpoint(): string | null { return this._breakpoints.activeBreakpointSignal.value ?? null; }
    /** @internal */ stylesheetHrefs: string[] = [];
    /** @internal */ stylesheetRoot: Document | ShadowRoot | null = null;
    private rootContainer: HTMLDivElement | null = null;
    private _renderPending = false;
    private _colorSchemeMedia: MediaQueryList | null = null;
    private readonly _handleColorSchemeChange = () => this.syncRootContainerAppearance();
    private _locale = '';
    private _pendingLocaleDocuments: LocaleDocument[] = [];
    private _issuerOverride: IssuerSource | undefined;
    private _issuerAllowedOrigins: string[] = [];
    private _issuerChromeEpoch = 0;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.appendChild(document.createElement('slot'));
    }

    attributeChangedCallback(name: string): void {
        if (name === 'data-formspec-appearance') {
            this.syncRootContainerAppearance();
            this.scheduleRender();
            return;
        }
        if (name === 'issuer-override') {
            this._issuerOverride = parseIssuerOverrideAttribute(this.getAttribute('issuer-override'));
            this.applyEffectiveIssuerOverride();
            return;
        }
        if (name === 'issuer-allowed-origins') {
            this._issuerAllowedOrigins = parseIssuerAllowedOriginsAttribute(
                this.getAttribute('issuer-allowed-origins'),
            );
            this.applyEffectiveIssuerOverride();
        }
    }

    /** Fields the user has interacted with (blur). Validation errors are hidden until touched. */
    /** @internal */ touchedFields: Set<string> = new Set();
    /** Incremented when touched state changes so error-display effects can react. */
    /** @internal */ touchedVersion = signal(0);
    /** Whether the screener has been completed (route selected). */
    /** @internal */ _screenerCompleted = false;
    /** The route selected by the screener, if any. */
    /** @internal */ _screenerRoute: ScreenerRoute | null = null;
    /** Standalone Screener Document. */
    /** @internal */ _screenerDocument: ScreenerDocument | null = null;
    /** @internal */ _referencesDocuments: ReferencesDocumentLike[] = [];
    /** Backing store for the `screenerSeedAnswers` property. */
    private _screenerSeedAnswers: FormDataRecord | null = null;
    /**
     * Full response `data` to apply on the next {@link definition} load (screener keys + main form).
     * Prefer this over separate engine hydration — consumed once when the engine is created.
     */
    private _initialData: FormDataRecord | null = null;
    /** Whether to auto-inject an ActionButton node into the layout plan. Defaults to true. */
    private _showSubmit = true;
    /** Shared pending state for submit flows (e.g. async host submits). */
    /** @internal */ _submitPendingSignal = signal(false);
    /** Latest submit detail payload (`{ response, validationReport }`). */
    private _latestSubmitDetailSignal = signal<SubmitDetail | null>(null);

    // ── Styling delegators ────────────────────────────────────────────
    private get _stylingHost(): StylingHost {
        return this;
    }

    private get _renderHost(): EmitRenderHost {
        return this as unknown as EmitRenderHost;
    }

    private get _submitHost(): SubmitHost {
        return this as unknown as SubmitHost;
    }

    private get _actionHost(): ActionHost {
        return this as unknown as ActionHost;
    }

    /**
     * Returns the actionRef of a submit-intent Action if one is published,
     * else `null`. §10 forbids synthesizing an implicit default Action and
     * free-string fallbacks, so call sites MUST treat `null` as "no submit
     * Action available" and skip injection — never inject an ActionButton
     * with an empty actionRef (would render an inert button forever).
     */
    private injectedSubmitActionRef(): string | null {
        return findResponseActionByIntent(this._responseActionsDocument, 'submit')?.id ?? null;
    }

    /** @internal */ resolveToken = (val: unknown): unknown => resolveTokenFn(this._stylingHost, val);
    /** @internal */ resolveItemPresentation = (itemDesc: ItemDescriptor): PresentationBlock => resolveItemPresentationFn(this._stylingHost, itemDesc);
    /** @internal */ applyStyle = (el: HTMLElement, style: Record<string, string | number> | undefined): void => applyStyleFn(this._stylingHost, el, style);
    /** @internal */ applyCssClass = (el: HTMLElement, comp: ComponentPresentationSource, itemPath?: string): void => applyCssClassFn(this._stylingHost, el, comp, itemPath);
    /** @internal */ applyClassValue = (el: HTMLElement, classValue: unknown): void => applyClassValueFn(this._stylingHost, el, classValue);
    /** @internal */ resolveWidgetClassSlots = (presentation: PresentationBlock) => resolveWidgetClassSlotsFn(this._stylingHost, presentation);
    /** @internal */ applyAccessibility = (el: HTMLElement, comp: ComponentPresentationSource): void => applyAccessibilityFn(this._stylingHost, el, comp);

    // ── Navigation delegators ─────────────────────────────────────────
    private get _navHost(): NavigationHost {
        return this;
    }

    // ── Screener helpers ──────────────────────────────────────────────
    private isInternalScreenerTarget(target: string): boolean {
        const defUrl = this._definition?.url;
        if (!defUrl || !target) return false;
        return target === defUrl || target.startsWith(defUrl + '/') || target.split('|')[0] === defUrl;
    }

    /** @internal */ classifyScreenerRoute(route: ScreenerRoute | null | undefined): ScreenerRouteType {
        if (!route?.target) return 'none';
        return this.isInternalScreenerTarget(route.target) ? 'internal' : 'external';
    }

    /** Returns the current screener completion + routing state. */
    getScreenerState(): ScreenerStateSnapshot {
        const hasScreener = hasActiveScreener(this._screenerDocument);
        return {
            hasScreener,
            completed: hasScreener ? this._screenerCompleted : true,
            routeType: this.classifyScreenerRoute(this._screenerRoute),
            route: this._screenerRoute,
        };
    }

    /** @internal */ emitScreenerStateChange(reason: string, answers?: FormDataRecord): void {
        this.dispatchEvent(new CustomEvent('formspec-screener-state-change', {
            detail: {
                ...this.getScreenerState(),
                reason,
                ...(answers ? { answers } : {}),
            },
            bubbles: true,
            composed: true,
        }));
    }

    /**
     * Optional: only screener keys when you have no full `data` blob. Prefer {@link initialData}
     * with the same shape as `response.data` so screener + main form hydrate in one step.
     */
    set screenerSeedAnswers(val: FormDataRecord | null | undefined) {
        if (val != null && typeof val === 'object' && !Array.isArray(val)) {
            this._screenerSeedAnswers = { ...val };
        } else {
            this._screenerSeedAnswers = null;
        }
    }

    get screenerSeedAnswers(): FormDataRecord | null {
        return this._screenerSeedAnswers;
    }

    /**
     * Full Formspec response `data` (same object you would pass to engine hydration). Set
     * {@link screenerDocument} first when the payload includes screener keys. Set **before**
     * {@link definition} on a new element. Set {@link screenerDocument} first so screener keys in
     * `data` are split out for the gate; the rest is applied to the engine.
     */
    set initialData(val: FormDataRecord | null | undefined) {
        if (val != null && typeof val === 'object' && !Array.isArray(val)) {
            this._initialData = { ...val };
        } else {
            this._initialData = null;
        }
    }

    get initialData(): FormDataRecord | null {
        return this._initialData;
    }

    private tryAutoCompleteScreenerFromSeed(): void {
        if (!this.engine || !this._screenerSeedAnswers || !this._screenerDocument) return;
        const screener = this._screenerDocument;
        if (!screener?.items?.length) return;

        const defaultCurrency = this._definition?.formPresentation?.defaultCurrency || 'USD';
        const answers = buildInitialScreenerAnswers(screener, this._screenerSeedAnswers, defaultCurrency);
        if (!screenerAnswersSatisfyRequired(screener, answers)) return;

        let route: ScreenerRoute | null;
        try {
            route = evaluateScreenerDocumentForRoute(this._screenerDocument, answers);
        } catch {
            return;
        }
        if (this.classifyScreenerRoute(route) === 'internal') {
            this._screenerRoute = route;
            this._screenerCompleted = true;
            this._screenerSeedAnswers = null;
            this.emitScreenerStateChange('seed-auto-internal', answers);
        }
    }

    /** @internal */ scheduleRender() {
        if (this._renderPending) return;
        this._renderPending = true;
        Promise.resolve().then(() => {
            this._renderPending = false;
            this.render();
        });
    }

    private ensureColorSchemeListener(): void {
        if (this._colorSchemeMedia || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        this._colorSchemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
        if (typeof this._colorSchemeMedia.addEventListener === 'function') {
            this._colorSchemeMedia.addEventListener('change', this._handleColorSchemeChange);
        } else {
            this._colorSchemeMedia.addListener(this._handleColorSchemeChange);
        }
    }

    private syncRootContainerAppearance(): void {
        if (!this.rootContainer) return;
        this.rootContainer.classList.remove('formspec-appearance-light', 'formspec-appearance-dark');
        const forcedAppearance = this.getAttribute('data-formspec-appearance');
        if (forcedAppearance === 'light' || forcedAppearance === 'dark') {
            this.rootContainer.classList.add(`formspec-appearance-${forcedAppearance}`);
            return;
        }
        if (this._colorSchemeMedia?.matches) {
            this.rootContainer.classList.add('formspec-appearance-dark');
        }
    }

    /**
     * Set the form definition. Creates a new {@link FormEngine} instance and
     * schedules a re-render. Throws if engine initialization fails.
     */
    set definition(val: FormDefinition) {
        this._definition = val;
        this._screenerCompleted = false;
        this._screenerRoute = null;
        this.touchedFields.clear();
        this.touchedVersion.value = 0;
        // A definition without a theme still renders through an adapter: link its skin now.
        this.syncStylesheets();
        this.renderPlaceholder();

        const bootEngine = () => {
            if (this._definition !== val) {
                return;
            }
            this.engine = createFormEngine(val, {
                registryEntries: Array.from(this._registryEntries.values()),
                issuerOverride: this.effectiveIssuerOverride(),
            });

            // Replay buffered locale documents and active locale
            for (const doc of this._pendingLocaleDocuments) {
                this.engine.loadLocale(doc);
            }
            if (this._locale) {
                this.engine.setLocale(this._locale);
                this.setAttribute('dir', this.engine.getLocaleDirection());
            }

            if (this._initialData) {
                const seed = extractScreenerSeedFromData(this._screenerDocument, this._initialData);
                if (seed) {
                    this._screenerSeedAnswers = seed;
                }
                const rest = omitScreenerKeysFromData(this._screenerDocument, this._initialData);
                applyResponseDataToEngine(this.engine, rest);
                this._initialData = null;
            }

            this.emitScreenerStateChange('definition-set');
            this.scheduleRender();
        };

        if (isFormspecEngineInitialized()) {
            try {
                bootEngine();
            } catch (e) {
                console.error('Engine initialization failed', e);
                throw e;
            }
        } else {
            void initFormspecEngine().then(() => {
                try {
                    bootEngine();
                } catch (e) {
                    console.error('Engine initialization failed', e);
                }
            });
        }
    }

    /** The currently loaded form definition object. */
    get definition(): FormDefinition | null {
        return this._definition;
    }

    set issuerOverride(source: IssuerSource | undefined) {
        this._issuerOverride = normalizeIssuerOverride(source);
        this.applyEffectiveIssuerOverride();
    }

    get issuerOverride(): IssuerSource | undefined {
        return this._issuerOverride;
    }

    set issuerAllowedOrigins(origins: readonly string[] | undefined) {
        this._issuerAllowedOrigins = Array.isArray(origins)
            ? origins.filter((origin): origin is string => typeof origin === 'string')
            : [];
        this.applyEffectiveIssuerOverride();
    }

    get issuerAllowedOrigins(): string[] {
        return [...this._issuerAllowedOrigins];
    }

    /**
     * Set the component document (component tree, custom components, tokens,
     * breakpoints). Schedules a re-render.
     */
    set componentDocument(val: ComponentDocument | null) {
        this._componentDocument = val;
        this.scheduleRender();
    }

    /** The currently loaded component document. */
    get componentDocument(): ComponentDocument | null {
        return this._componentDocument;
    }

    /**
     * Host-supplied, AppGraphValidator-backed Component graph projection context.
     * The renderer consumes this only as inert identity metadata.
     */
    set componentGraph(val: ComponentGraphProjectionContext | null | undefined) {
        this._componentGraph = val ?? null;
        this.scheduleRender();
    }

    /** The currently loaded Component graph projection context, if any. */
    get componentGraph(): ComponentGraphProjectionContext | null {
        return this._componentGraph;
    }

    /**
     * Host-supplied AppGraphValidator-backed projection evidence.
     * The renderer forwards this to layout planning only; it does not validate,
     * fetch, apply ARIA, or infer hidden-state runtime behavior from it.
     */
    set hostEvidence(val: LayoutHostEvidence | null | undefined) {
        this._hostEvidence = val ?? null;
        this.scheduleRender();
    }

    /** The currently loaded host projection evidence, if any. */
    get hostEvidence(): LayoutHostEvidence | null {
        return this._hostEvidence;
    }

    /** Set the Response Actions document used by ActionButton actionRef resolution. */
    set responseActionsDocument(val: ResponseActionsDocument | null | undefined) {
        this._responseActionsDocument = val ?? null;
        this.scheduleRender();
    }

    /** The currently loaded Response Actions document, or null if none is loaded. */
    get responseActionsDocument(): ResponseActionsDocument | null {
        return this._responseActionsDocument;
    }

    /** Set a host-provided Response Actions invocation hook. Defaults to the built-in engine path. */
    set responseActionInvoker(val: ResponseActionInvoker | null | undefined) {
        this._responseActionInvoker = val ?? null;
    }

    /** The host-provided Response Actions invocation hook, or null when using the built-in engine path. */
    get responseActionInvoker(): ResponseActionInvoker | null {
        return this._responseActionInvoker;
    }

    /**
     * Set the theme document. The theme names the adapter it was written for;
     * setting it relinks adapter + theme stylesheets and schedules a re-render.
     */
    set themeDocument(val: ThemeDocument | null) {
        this._themeDocument = val;
        this._themeAdapterReported = false;
        this.syncStylesheets();
        this.scheduleRender();
    }

    /** The currently loaded theme document, or `null` if none. */
    get themeDocument(): ThemeDocument | null {
        return this._themeDocument;
    }

    /** Host override of the render adapter for this element only — outranks the theme's `adapter`. */
    set adapter(val: string | null) {
        this._adapter = val ?? null;
        this.syncStylesheets();
        this.scheduleRender();
    }

    /** The element-level adapter override, or `null` when the theme or host default decides. */
    get adapter(): string | null {
        return this._adapter;
    }

    /** The adapter actually rendering this element: override → theme `adapter` → host default → `'default'`. */
    get resolvedAdapterName(): string {
        return globalRegistry.resolveAdapterName(this._adapter, this._themeDocument).name;
    }

    /**
     * @internal Styling host seam — the resolved adapter's design-system CSS. Empty until a theme or a
     * definition arrives: on connect the adapter is only ever the fallback, and linking its skin then
     * costs a request the theme's adapter immediately replaces.
     */
    adapterStylesheets(): string[] {
        if (!this._themeDocument && !this._definition) return [];
        return globalRegistry.getAdapter(this.resolvedAdapterName)?.stylesheets ?? [];
    }

    /** @internal Styling host seam — the resolved adapter's declared class vocabulary, if it has one. */
    adapterClassVocabulary(): ReadonlySet<string> | undefined {
        return globalRegistry.getAdapter(this.resolvedAdapterName)?.classVocabulary;
    }

    /** Relink layout + adapter + theme stylesheets, reporting a theme that names an unregistered adapter. */
    private syncStylesheets(): void {
        const { name, missingAdapter } = globalRegistry.resolveAdapterName(this._adapter, this._themeDocument);
        if (missingAdapter && !this._themeAdapterReported) {
            this._themeAdapterReported = true;
            const message = `Theme names render adapter '${missingAdapter}', which is not registered; rendering with '${name}'.`;
            console.warn(message);
            this.dispatchEvent(new CustomEvent('formspec-theme-finding', {
                detail: { finding: { code: 'THEME-ADAPTER-MISSING', severity: 'error', adapter: missingAdapter, message } },
                bubbles: true,
                composed: true,
            }));
        }
        this.revealWhenStyled(loadStylesheetsFn(this._stylingHost));
    }

    /**
     * Stay hidden until the stylesheets this element just linked have answered — otherwise the form
     * paints unstyled for a network round-trip. Nothing linked (a host pre-loaded it) reveals at once;
     * a slow or blocked sheet reveals on the timeout rather than hiding the form indefinitely.
     */
    private revealWhenStyled(pending: HTMLLinkElement[]): void {
        const epoch = ++this._styleEpoch;
        if (pending.length === 0) {
            this.reveal(epoch);
            return;
        }
        this.style.visibility = 'hidden';
        this.setAttribute('aria-busy', 'true');
        let remaining = pending.length;
        const settled = () => { if (--remaining === 0) this.reveal(epoch); };
        for (const link of pending) {
            link.addEventListener('load', settled, { once: true });
            link.addEventListener('error', settled, { once: true });
        }
        setTimeout(() => this.reveal(epoch), STYLE_REVEAL_TIMEOUT_MS);
    }

    /** Show the form, unless a later sync has already taken over the wait. */
    private reveal(epoch: number): void {
        if (epoch !== this._styleEpoch) return;
        this.style.visibility = '';
        this.removeAttribute('aria-busy');
    }

    /**
     * Custom element lifecycle callback. Links the stylesheets the resolved
     * adapter needs so a host never imports renderer or adapter CSS itself.
     */
    connectedCallback() {
        this.syncStylesheets();
    }

    /** Whether to auto-inject an ActionButton into the layout plan. Defaults to true. */
    get showSubmit(): boolean {
        return this._showSubmit;
    }

    set showSubmit(val: boolean) {
        this._showSubmit = val;
        this.scheduleRender();
    }

    /**
     * Set one or more extension registry documents. Builds an internal lookup
     * map from extension name → registry entry so that field renderers can
     * apply constraints and metadata (inputMode, autocomplete, pattern, etc.)
     * generically instead of hardcoding per-extension behaviour.
     */
    /** Set the standalone Screener Document. */
    set screenerDocument(doc: ScreenerDocument | null) {
        this._screenerDocument = doc ?? null;
        this._screenerCompleted = false;
        this._screenerRoute = null;
        this.scheduleRender();
    }

    get screenerDocument(): ScreenerDocument | null {
        return this._screenerDocument;
    }

    set registryDocuments(docs: RegistryDocument | RegistryDocument[]) {
        this._registryEntries.clear();
        const docList = Array.isArray(docs) ? docs : docs ? [docs] : [];
        for (const doc of docList) {
            if (!doc?.entries) continue;
            for (const entry of doc.entries) {
                if (entry.name) {
                    this._registryEntries.set(entry.name, entry);
                }
            }
        }
        this.scheduleRender();
    }

    /** The current registry entry lookup (extension name → entry). */
    get registryEntries(): Map<string, RegistryEntry> {
        return this._registryEntries;
    }

    /**
     * Load one or more locale documents into the engine. If the engine
     * hasn't been created yet (no definition set), the documents are
     * buffered and applied when the engine boots.
     *
     * Set **after** `definition` for immediate loading, or before if
     * pre-loading locale bundles before the form definition arrives.
     */
    set localeDocuments(docs: LocaleDocument | LocaleDocument[]) {
        const arr = Array.isArray(docs) ? docs : [docs];
        this._pendingLocaleDocuments = arr;
        if (this.engine) {
            for (const doc of arr) {
                this.engine.loadLocale(doc);
            }
        }
    }

    /**
     * Set the active locale code. Updates the engine locale if available,
     * and sets `lang` and `dir` attributes for accessibility and RTL support.
     *
     * If the engine hasn't been created yet, the locale code is buffered
     * and applied when the engine boots.
     */
    set locale(code: string) {
        this._locale = code;
        this.setAttribute('lang', code);
        if (this.engine) {
            this.engine.setLocale(code);
            this.setAttribute('dir', this.engine.getLocaleDirection());
        }
    }

    /** The currently active locale code, or empty string if none set. */
    get locale(): string {
        return this._locale;
    }

    /**
     * Return the underlying {@link FormEngine} instance, or `null` if no
     * definition has been set yet. Useful for direct engine access in tests
     * or advanced integrations.
     */
    getEngine() {
        return this.engine;
    }

    /**
     * Capture a diagnostics snapshot from the engine, including current signal
     * values, validation state, and repeat counts.
     */
    getDiagnosticsSnapshot(options?: { profile?: 'live' | 'on-submit' | 'on-demand' | 'off' }) {
        return this.engine?.getDiagnosticsSnapshot?.(options) || null;
    }

    /**
     * Apply a single replay event (e.g. `setValue`, `addRepeat`) to the engine.
     */
    applyReplayEvent(event: EngineReplayEvent) {
        if (!this.engine?.applyReplayEvent) {
            return { ok: false, event, error: 'Engine unavailable' };
        }
        return this.engine.applyReplayEvent(event);
    }

    /**
     * Replay a sequence of events against the engine in order.
     */
    replay(events: EngineReplayEvent[], options?: { stopOnError?: boolean }) {
        if (!this.engine?.replay) {
            return { applied: 0, results: [], errors: [{ index: 0, event: null, error: 'Engine unavailable' }] };
        }
        return this.engine.replay(events, options);
    }

    /**
     * Inject a runtime context (e.g. `now`, user metadata) into the engine.
     */
    setRuntimeContext(context: Record<string, unknown>) {
        this.engine?.setRuntimeContext?.(context);
    }

    /**
     * Mark all registered fields as touched so validation errors become visible.
     */
    touchAllFields() {
        touchAllFieldsFn(this._submitHost);
    }

    /**
     * Build a submit payload and validation report from the current form state.
     * Optionally dispatches `formspec-submit` with `{ response, validationReport }`.
     */
    submit(options?: SubmitOptions) {
        return submitFn(this._submitHost, options);
    }

    /** Resolve an ActionButton actionRef against the loaded Response Actions document. */
    resolveActionRef(actionRef: string, nodeId?: string) {
        const resolution = resolveActionRefFn(this._actionHost, actionRef, nodeId);
        if (resolution.finding) {
            emitActionFinding(this._actionHost, resolution.finding);
        }
        return resolution;
    }

    /** Invoke a resolved Action and dispatch declared hostEvent effects. */
    invokeAction(actionRef: string, nodeId?: string) {
        return invokeActionFn(this._actionHost, actionRef, nodeId);
    }

    /**
     * Resolve a validation result/path to a navigation target with metadata.
     */
    resolveValidationTarget(resultOrPath: string | ValidationResult) {
        return resolveValidationTargetFn(this._submitHost, resultOrPath);
    }

    /**
     * Toggle shared submit pending state and emit `formspec-submit-pending-change`
     * whenever the value changes.
     */
    setSubmitPending(pending: boolean): void {
        setSubmitPendingFn(this._submitHost, pending);
    }

    /** Returns the current shared submit pending state. */
    isSubmitPending(): boolean {
        return isSubmitPendingFn(this._submitHost);
    }

    /**
     * Programmatically navigate to a wizard step in the first rendered wizard.
     */
    goToWizardStep(index: number): boolean {
        return goToWizardStepFn(this._navHost, index);
    }

    /**
     * Reveal and focus a field by bind path.
     */
    focusField(path: string): boolean {
        return focusFieldFn(this._navHost, path);
    }

    /** @internal */ getEffectiveTheme(): ThemeDocument {
        return this._themeDocument
            ? mergePlatformAndTenantTheme(defaultThemeJson, this._themeDocument)
            : mergePlatformAndTenantTheme(defaultThemeJson);
    }

    private cleanup() {
        for (const fn of this.cleanupFns) {
            fn();
        }
        this.cleanupFns = [];
    }

    /**
     * Perform a full synchronous render of the form.
     */
    render() {
        this.cleanup();
        if (!this.engine || !this._definition) return;
        setupBreakpointsFn(this, this._breakpoints);

        if (this._componentDocument) {
            if (!SUPPORTED_COMPONENT_DOCUMENT_VERSIONS.has(this._componentDocument.$formspecComponent)) {
                console.warn(`Unsupported Component Document version: ${this._componentDocument.$formspecComponent}`);
            }

            if (this._componentDocument.targetDefinition) {
                const target = this._componentDocument.targetDefinition;
                if (target.url !== this._definition.url) {
                    console.warn(`Component Document target URL (${target.url}) does not match Definition URL (${this._definition.url})`);
                }
            }
        }

        if (!this.rootContainer) {
            this.rootContainer = document.createElement('div');
            this.rootContainer.className = 'formspec-container';
            this.appendChild(this.rootContainer);
        }

        this.ensureColorSchemeListener();
        const container = this.rootContainer;
        container.className = 'formspec-container';
        container.removeAttribute('aria-busy');
        this.syncRootContainerAppearance();
        container.replaceChildren();

        emitTokenPropertiesFn(this._stylingHost, container);
        this.renderIssuerChrome(container);

        if (hasActiveScreener(this._screenerDocument) && !this._screenerCompleted) {
            this.tryAutoCompleteScreenerFromSeed();
        }

        if (hasActiveScreener(this._screenerDocument) && !this._screenerCompleted) {
            renderScreener(this as ScreenerHost, container);
            return;
        }

        const plan = this.buildPlan();
        if (plan) emitNodeFn(this._renderHost, plan, container, '');
    }

    /**
     * The layout plan for the current documents. Pure TypeScript — no engine, so the skeleton can draw
     * the real tree's shape before WASM finishes booting and the swap moves almost nothing.
     */
    private buildPlan(): import('@formspec-org/layout').LayoutNode | null {
        if (!this._definition) return null;
        const planCtx = preparePlanContext({
            items: this._definition.items,
            formPresentation: mergeFormPresentationForPlanning(
                this._definition.formPresentation,
                componentFormPresentation(this._componentDocument),
            ),
            componentDocument: this._componentDocument ?? undefined,
            ...(this._componentGraph ? { componentGraph: this._componentGraph } : {}),
            ...(this._hostEvidence ? { hostEvidence: this._hostEvidence } : {}),
            theme: this.getEffectiveTheme(),
            activeBreakpoint: this.activeBreakpoint,
            findItem: (key: string) => this.findItemByKey(key),
            isComponentAvailable: (type: string) => !!globalRegistry.get(type),
        });

        if (this._componentDocument && this._componentDocument.tree) {
            const plan = planComponentTree(
                this._componentDocument.tree as unknown as Parameters<typeof planComponentTree>[0],
                planCtx,
            );
            const pageMode = pageModeFromPresentation(planCtx.formPresentation);
            // §10: only inject when a submit-intent Action actually
            // exists. An empty/absent actionRef would render an inert button.
            if (this._showSubmit) {
                const injectedRef = this.injectedSubmitActionRef();
                if (injectedRef) {
                    ensureActionButton(plan, planCtx.nextId, {
                        pageMode,
                        actionRef: injectedRef,
                    });
                }
            }
            return plan;
        } else {
            const plans = planDefinitionFallback(this._definition.items, planCtx);
            const pageMode = pageModeFromPresentation(planCtx.formPresentation);
            // Always wrap in a root Stack — needed for pageMode detection and submit button injection
            const wrapperNode: import('@formspec-org/layout').LayoutNode = {
                id: '_root-stack',
                component: 'Stack',
                category: 'layout',
                props: {},
                cssClasses: [],
                children: plans,
                pageMode: pageMode && plans.some((node) => node.component === 'Section')
                    ? pageMode
                    : undefined,
            };
            // §10: see comment above. Skip when no submit Action exists.
            if (this._showSubmit) {
                const injectedRef = this.injectedSubmitActionRef();
                if (injectedRef) {
                    ensureActionButton(wrapperNode, planCtx.nextId, {
                        pageMode,
                        actionRef: injectedRef,
                    });
                }
            }
            return wrapperNode;
        }
    }

    /**
     * Draw the planned tree as placeholders while the engine boots. The column then holds the height the
     * real form will take, so the page below it does not jump when the form lands.
     */
    private renderPlaceholder(): void {
        if (!this._definition || this.engine) return;
        const plan = this.buildPlan();
        if (!plan) return;

        if (!this.rootContainer) {
            this.rootContainer = document.createElement('div');
            this.appendChild(this.rootContainer);
        }
        const container = this.rootContainer;
        container.className = 'formspec-container formspec-skeleton';
        container.setAttribute('aria-busy', 'true');
        container.replaceChildren();
        emitTokenPropertiesFn(this._stylingHost, container);

        const discard: Array<() => void> = [];
        renderSkeletonFn(plan, container, {
            adapterName: this.resolvedAdapterName,
            actx: {
                onDispose: (fn: () => void) => discard.push(fn),
                applyCssClass: (el, comp, itemPath) => this.applyCssClass(el, comp, itemPath),
                applyStyle: (el, style) => this.applyStyle(el, style),
                applyAccessibility: (el, comp) => this.applyAccessibility(el, comp),
                applyClassValue: (el, classValue) => this.applyClassValue(el, classValue),
            },
            resolveToken: (val) => this.resolveToken(val),
            conditionalPaths: this.conditionalBindPaths(),
            repeatCount: (path) => this.initialRepeatCount(path),
            itemLabel: (path) => {
                const item = this.findItemByKey(Path.parse(path).stripIndices());
                return item?.label ?? path.split('.').pop() ?? path;
            },
        });
    }

    /** Rows a repeat opens with: the supplied data decides, else `minRepeat`. Both are known without the engine. */
    private initialRepeatCount(path: string): number {
        const key = Path.parse(path).stripIndices();
        const rows = key.split('.').reduce<unknown>(
            (value: unknown, segment: string) => (value as Record<string, unknown> | null)?.[segment],
            this._initialData as unknown,
        );
        if (Array.isArray(rows)) return rows.length;
        const item = this.findItemByKey(key) as { minRepeat?: number } | null;
        return item?.minRepeat ?? 1;
    }

    /** Bind paths gated by a `relevant` expression — the engine decides them, so the skeleton skips them. */
    private conditionalBindPaths(): ReadonlySet<string> {
        const binds = (this._definition as (FormDefinition & { binds?: Array<{ path?: string; relevant?: unknown }> }) | null)?.binds;
        return new Set(
            (binds ?? [])
                .filter((bind) => typeof bind?.relevant === 'string' && bind.path)
                .map((bind) => String(bind.path)),
        );
    }

    private effectiveIssuerOverride(): IssuerSource | undefined {
        return this._issuerOverride ?? this.queryIssuerOverride();
    }

    private queryIssuerOverride(): IssuerSource | undefined {
        const view = this.ownerDocument?.defaultView;
        if (!view) {
            return undefined;
        }
        return parseQueryIssuerOverride(new URL(view.location.href), this._issuerAllowedOrigins);
    }

    private applyEffectiveIssuerOverride(): void {
        this.engine?.setIssuerOverride(this.effectiveIssuerOverride());
        this.scheduleRender();
    }

    private renderIssuerChrome(container: HTMLDivElement): void {
        const slot = document.createElement('div');
        slot.className = 'fs-issuer-chrome-slot';
        container.appendChild(slot);

        const engine = this.engine;
        if (!engine?.getResolvedIssuer) {
            return;
        }

        const epoch = ++this._issuerChromeEpoch;
        void engine.getResolvedIssuer()
            .then((resolved) => {
                if (this.engine !== engine || this._issuerChromeEpoch !== epoch || !slot.isConnected) {
                    return;
                }
                const chrome = IssuerChrome({
                    resolved,
                    locale: this._locale || engine.getActiveLocale?.() || 'en',
                    hostOrigin: this.ownerDocument?.defaultView?.location.origin,
                    mode: this.issuerChromeMode(),
                    headerWidth: this.issuerChromeHeaderWidth(),
                    document: this.ownerDocument,
                });
                slot.replaceChildren(...(chrome ? [chrome] : []));
            })
            .catch((error) => {
                console.warn('Issuer resolution failed', error);
            });
    }

    private issuerChromeMode(): 'light' | 'dark' | 'high-contrast' {
        return this.rootContainer?.classList.contains('formspec-appearance-dark')
            ? 'dark'
            : 'light';
    }

    private issuerChromeHeaderWidth(): 'wide' | 'narrow' {
        const breakpoint = this.activeBreakpoint;
        return breakpoint === 'mobile' || breakpoint === 'sm' || breakpoint === 'narrow'
            ? 'narrow'
            : 'wide';
    }

    /** Returns the screener route selected during the screening phase, or null. */
    getScreenerRoute() {
        return this._screenerRoute;
    }

    /** Programmatically skip the screener and proceed to the main form. */
    skipScreener() {
        this._screenerCompleted = true;
        this._screenerRoute = null;
        this.emitScreenerStateChange('skip');
        this.scheduleRender();
    }

    /** Return to the screener from the main form. */
    restartScreener() {
        this._screenerCompleted = false;
        this._screenerRoute = null;
        this.emitScreenerStateChange('restart');
        this.scheduleRender();
    }

    /**
     * Load one or more References Documents (References spec §4). Human-audience entries bound to a field or
     * group render as that item's help link; agent-audience entries are never rendered.
     *
     * Documents whose `targetDefinition.url` does not match the loaded Definition are refused with an error
     * (§4.3) — a References Document written for another form must not silently attach to this one.
     */
    set referencesDocuments(docs: ReferencesDocumentLike | ReferencesDocumentLike[] | null) {
        const list = docs == null ? [] : Array.isArray(docs) ? docs : [docs];
        this._referencesDocuments = list.filter((doc) => {
            const target = (doc as { targetDefinition?: { url?: string } }).targetDefinition?.url;
            const definitionUrl = this._definition?.url;
            if (target && definitionUrl && target !== definitionUrl) {
                console.error(`References Document targets ${target}, not the loaded Definition ${definitionUrl}; ignoring it.`);
                return false;
            }
            return true;
        });
        this.scheduleRender();
    }

    get referencesDocuments(): ReferencesDocumentLike[] {
        return this._referencesDocuments;
    }

    /**
     * Human-facing References bound to `fieldPath`, across every loaded document, in presentation order.
     * `@formspec-org/layout` owns the rule so React and this renderer surface the same set.
     */
    /** @internal */ resolveFieldHelp = (fieldPath: string): readonly FieldHelpReference[] =>
        this._referencesDocuments.flatMap((doc) => resolveFieldHelp(doc, fieldPath));

    /** @internal */ findItemByKey = (key: string, items: FormItem[] = this._definition?.items ?? []): FormItem | null => {
        if (key == null || typeof key !== 'string') return null;
        const dot = key.indexOf('.');
        if (dot !== -1) {
            const head = key.slice(0, dot);
            const rest = key.slice(dot + 1);
            for (const item of items) {
                if (item.key === head && item.children) {
                    return this.findItemByKey(rest, item.children);
                }
            }
            return null;
        }
        for (const item of items) {
            if (item.key === key) return item;
            if (item.children) {
                const found = this.findItemByKey(key, item.children);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Custom element lifecycle callback. Disposes all signal effects,
     * decrements stylesheet ref-counts, tears down breakpoint listeners,
     * and removes the root container.
     */
    disconnectedCallback() {
        this._issuerChromeEpoch += 1;
        this.cleanup();
        cleanupStylesheetsFn(this._stylingHost);
        cleanupBreakpoints(this._breakpoints);
        if (this._colorSchemeMedia) {
            if (typeof this._colorSchemeMedia.removeEventListener === 'function') {
                this._colorSchemeMedia.removeEventListener('change', this._handleColorSchemeChange);
            } else {
                this._colorSchemeMedia.removeListener(this._handleColorSchemeChange);
            }
            this._colorSchemeMedia = null;
        }
        if (this.rootContainer) {
            this.rootContainer.remove();
            this.rootContainer = null;
        }
    }
}
