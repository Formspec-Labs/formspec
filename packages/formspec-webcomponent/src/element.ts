/** @filedesc The <formspec-render> custom element that orchestrates form rendering. */
import { signal } from '@preact/signals-core';
import { createFormEngine, type FormEngine, type IFormEngine, type LocaleDocument } from '@formspec-org/engine/render';
import { initFormspecEngine, isFormspecEngineInitialized } from '@formspec-org/engine/init-formspec-engine';
import type {
    ComponentDocument,
    FormDefinition,
    FormItem,
    RegistryDocument,
    RegistryEntry,
    ScreenerDocument,
    ThemeDocument as SchemaThemeDocument,
    ValidationResult,
} from '@formspec-org/types';
import type { EngineReplayEvent } from '@formspec-org/engine';
import { globalRegistry } from './registry';
import {
    ScreenerRoute,
    ScreenerRouteType,
    ScreenerStateSnapshot,
} from './types';
import type { ComponentDescriptor, ComponentPresentationSource, FormDataRecord, SubmitDetail } from './hub-types';
import type { SubmitHost } from './submit';
import {
    ThemeDocument,
    PresentationBlock,
    ItemDescriptor,
    planComponentTree,
    planDefinitionFallback,
    ensureSubmitButton,
    preparePlanContext,
    mergeFormPresentationForPlanning,
} from '@formspec-org/layout';
import { buildPlatformTheme } from '@formspec-org/layout';
const defaultThemeJson = buildPlatformTheme();

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
        return ['data-formspec-appearance'];
    }

    // ── Internal state ────────────────────────────────────────────────
    /** @internal */ _definition: FormDefinition | null = null;
    /** @internal */ _componentDocument: ComponentDocument | null = null;
    /** @internal */ _themeDocument: ThemeDocument | null = null;
    /** @internal */ _registryEntries: Map<string, RegistryEntry> = new Map();
    /** @internal */ engine: IFormEngine | null = null;
    /** @internal */ cleanupFns: Array<() => void> = [];
    private _breakpoints: BreakpointState = createBreakpointState();
    private get activeBreakpoint(): string | null { return this._breakpoints.activeBreakpointSignal.value ?? null; }
    /** @internal */ stylesheetHrefs: string[] = [];
    private rootContainer: HTMLDivElement | null = null;
    private _renderPending = false;
    private _colorSchemeMedia: MediaQueryList | null = null;
    private readonly _handleColorSchemeChange = () => this.syncRootContainerAppearance();
    private _locale = '';
    private _pendingLocaleDocuments: LocaleDocument[] = [];

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.appendChild(document.createElement('slot'));
    }

    attributeChangedCallback(name: string): void {
        if (name === 'data-formspec-appearance') {
            this.syncRootContainerAppearance();
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
    /** Backing store for the `screenerSeedAnswers` property. */
    private _screenerSeedAnswers: FormDataRecord | null = null;
    /**
     * Full response `data` to apply on the next {@link definition} load (screener keys + main form).
     * Prefer this over separate engine hydration — consumed once when the engine is created.
     */
    private _initialData: FormDataRecord | null = null;
    /** Whether to auto-inject a SubmitButton node into the layout plan. Defaults to true. */
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

    /** @internal */ resolveToken = (val: unknown): unknown => resolveTokenFn(this._stylingHost, val);
    /** @internal */ resolveItemPresentation = (itemDesc: ItemDescriptor): PresentationBlock => resolveItemPresentationFn(this._stylingHost, itemDesc);
    /** @internal */ applyStyle = (el: HTMLElement, style: Record<string, string | number> | undefined): void => applyStyleFn(this._stylingHost, el, style);
    /** @internal */ applyCssClass = (el: HTMLElement, comp: ComponentPresentationSource): void => applyCssClassFn(this._stylingHost, el, comp);
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

        const bootEngine = () => {
            if (this._definition !== val) {
                return;
            }
            this.engine = createFormEngine(val, {
                registryEntries: Array.from(this._registryEntries.values()),
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
     * Set the theme document. Loads/unloads referenced stylesheets via
     * ref-counting and schedules a re-render.
     */
    set themeDocument(val: ThemeDocument | null) {
        this._themeDocument = val;
        loadStylesheetsFn(this._stylingHost);
        this.scheduleRender();
    }

    /** The currently loaded theme document, or `null` if none. */
    get themeDocument(): ThemeDocument | null {
        return this._themeDocument;
    }

    /** Whether to auto-inject a SubmitButton into the layout plan. Defaults to true. */
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
    getDiagnosticsSnapshot(options?: { mode?: 'continuous' | 'submit' }) {
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
    submit(options?: { mode?: 'continuous' | 'submit'; emitEvent?: boolean }) {
        return submitFn(this._submitHost, options);
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
        return this._themeDocument || defaultThemeJson as ThemeDocument;
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
            if (this._componentDocument.$formspecComponent !== '1.0') {
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
        this.syncRootContainerAppearance();
        container.replaceChildren();

        emitTokenPropertiesFn(this._stylingHost, container);

        if (hasActiveScreener(this._screenerDocument) && !this._screenerCompleted) {
            this.tryAutoCompleteScreenerFromSeed();
        }

        if (hasActiveScreener(this._screenerDocument) && !this._screenerCompleted) {
            renderScreener(this as ScreenerHost, container);
            return;
        }

        const planCtx = preparePlanContext({
            items: this._definition.items,
            formPresentation: mergeFormPresentationForPlanning(
                this._definition.formPresentation,
                this._componentDocument?.formPresentation,
            ),
            componentDocument: this._componentDocument ?? undefined,
            theme: (this._themeDocument || this.getEffectiveTheme()) as unknown as SchemaThemeDocument,
            activeBreakpoint: this.activeBreakpoint,
            findItem: (key: string) => this.findItemByKey(key),
            isComponentAvailable: (type: string) => !!globalRegistry.get(type),
        });

        if (this._componentDocument && this._componentDocument.tree) {
            const plan = planComponentTree(
                this._componentDocument.tree as unknown as Parameters<typeof planComponentTree>[0],
                planCtx,
            );
            if (this._showSubmit) ensureSubmitButton(plan, planCtx.nextId);
            emitNodeFn(this._renderHost, plan, container, '');
        } else {
            const plans = planDefinitionFallback(this._definition.items, planCtx);
            // Always wrap in a root Stack — needed for pageMode detection and submit button injection
            const wrapperNode: import('@formspec-org/layout').LayoutNode = {
                id: '_root-stack',
                component: 'Stack',
                category: 'layout',
                props: {},
                cssClasses: [],
                children: plans,
            };
            if (this._showSubmit) ensureSubmitButton(wrapperNode, planCtx.nextId);
            emitNodeFn(this._renderHost, wrapperNode, container, '');
        }
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
