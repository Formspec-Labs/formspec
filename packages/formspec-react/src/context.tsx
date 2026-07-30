'use client';

/** @filedesc FormspecProvider — React context wrapping a FormEngine + optional layout plan. */
import React, { createContext, useContext, useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { signal } from '@preact/signals-core';
import type {
    ActionRefFinding,
    ActionResolution,
    IFormEngine,
    IssuerFetcher,
    IssuerSource,
    ReadonlyEngineSignal,
    ResponseAction,
    ResponseActionEffectDispatchContext,
    ResponseActionEffectOutcome,
    ResponseActionIdempotencyKeyContext,
    ResponseActionInvocationPorts,
    ResponseActionInvocationResult,
    ResponseActionPreconditionResult,
    ResponseActionsDocumentInput,
} from '@formspec-org/engine';
import type {
    EffectRequest,
    FormResponse,
    Precondition,
    ThemeDocument as SchemaThemeDocument,
    ValidationReport,
} from '@formspec-org/types';
import { createFormEngine, findResponseActionByIntent, missingSubmitActionFinding, resolveResponseAction } from '@formspec-org/engine';
import type {
    ComponentGraphProjectionContext,
    LayoutHostEvidence,
    LayoutNode,
    ThemeDocument as LayoutThemeDocument,
} from '@formspec-org/layout';
import {
    buildPlatformTheme,
    mergePlatformAndTenantTheme,
    planDefinitionFallback,
    planComponentTree,
    preparePlanContext,
    ensureActionButton,
    mergeFormPresentationForPlanning,
} from '@formspec-org/layout';
import type { ComponentMap } from './component-map';

const platformTheme = buildPlatformTheme();

export type ResponseActionsDocument = ResponseActionsDocumentInput;
export type {
    ActionRefFinding,
    ActionResolution,
    ResponseAction,
    ResponseActionInvocationResult,
};

export interface ResponseActionInvokerInput<TDetail = SubmitResult> {
    document: ResponseActionsDocument | null | undefined;
    actionRef: string;
    nodeId?: string;
    ports: ResponseActionInvocationPorts<TDetail>;
}

export type ResponseActionInvokerResult<TDetail = SubmitResult> =
    | ResponseActionInvocationResult<TDetail>
    | { invocation: ResponseActionInvocationResult<TDetail> };

export type ResponseActionInvoker<TDetail = SubmitResult> = (
    input: ResponseActionInvokerInput<TDetail>,
) => ResponseActionInvokerResult<TDetail> | Promise<ResponseActionInvokerResult<TDetail>>;

export interface SubmitResult {
    response: FormResponse;
    validationReport: ValidationReport | null;
}

/** Human-facing help resolved from manifested References sidecars. */
export interface FormspecHumanReference {
    id?: string;
    title: string;
    description?: string;
    content?: string;
    uri?: string;
    type?: string;
    /** Direct current Need anchors on this exact rendered reference. */
    needAnchors: readonly string[];
}

export type FormspecFieldHelpResolver = (
    path: string,
) => readonly FormspecHumanReference[];

/**
 * Host policy for turning a References URI into a browser destination.
 *
 * Returning `undefined` keeps the human-readable reference but renders its
 * title as text. A host may translate a non-browser scheme into a trusted
 * internal route; the default admits only HTTPS and same-app relative URIs.
 */
export type FormspecFieldHelpUriAdmission = (
    uri: string,
) => string | undefined;

const ABSOLUTE_URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const FIELD_HELP_URI_BASE = 'https://formspec.invalid/';

/** Fail-closed browser policy for human Reference links. */
export function admitDefaultFieldHelpUri(uri: string): string | undefined {
    if (
        uri.length === 0
        || uri.trim() !== uri
        || uri.includes('\\')
        || uri.startsWith('//')
    ) {
        return undefined;
    }
    try {
        const absolute = ABSOLUTE_URI_SCHEME.test(uri);
        const destination = absolute
            ? new URL(uri)
            : new URL(uri, FIELD_HELP_URI_BASE);
        if (
            destination.protocol !== 'https:'
            || destination.username.length > 0
            || destination.password.length > 0
            || (!absolute && destination.origin !== 'https://formspec.invalid')
        ) {
            return undefined;
        }
        return uri;
    } catch {
        return undefined;
    }
}

export interface FormspecContextValue {
    engine: IFormEngine;
    layoutPlan: LayoutNode | null;
    components: ComponentMap;
    /** Theme document from the provider (used for container token emission). */
    themeDocument?: LayoutThemeDocument;
    /** Whether this tree owns theme-token emission. */
    emitThemeTokens: boolean;
    /** Component document from the provider (used for container token emission). */
    componentDocument?: any;
    /** Host-supplied Component graph projection context. Projection-only; no runtime authority. */
    componentGraph?: ComponentGraphProjectionContext | null;
    /** Host-supplied UI Graph Policy validation evidence. Projection-only; no runtime authority. */
    hostEvidence?: LayoutHostEvidence | null;
    /** Response Actions document used by ActionButton actionRef resolution. */
    responseActionsDocument?: ResponseActionsDocument | null;
    /** Callback invoked on form submission. Absent means no built-in submit button. */
    onSubmit?: (result: SubmitResult) => void;
    /** Callback invoked for every declared hostEvent effect. */
    onHostEvent?: (eventName: string, result: SubmitResult, action: ResponseAction) => void;
    /** Callback invoked when ActionButton actionRef resolution produces a finding. */
    onActionFinding?: (finding: ActionRefFinding) => void;
    /** Callback invoked after every ActionButton invocation terminal. */
    onActionResult?: (result: ResponseActionInvocationResult<SubmitResult>) => void;
    /** Optional host-owned invoker that can wrap the engine executor with durable runtime plumbing. */
    responseActionInvoker?: ResponseActionInvoker<SubmitResult> | null;
    /** Host precondition evaluator for Response Actions that declare FEL preconditions. */
    evaluateActionPrecondition?: (
        precondition: Precondition,
        action: ResponseAction,
    ) => ResponseActionPreconditionResult;
    /** Host durable-effect adapter for non-hostEvent Response Action effects. */
    dispatchActionEffect?: (
        effect: EffectRequest,
        result: SubmitResult,
        action: ResponseAction,
        context: ResponseActionEffectDispatchContext,
    ) => ResponseActionEffectOutcome | void;
    /** Host idempotency-key resolver for durable Response Action effects. */
    resolveActionIdempotencyKey?: (
        effect: EffectRequest,
        action: ResponseAction,
        context: ResponseActionIdempotencyKeyContext,
    ) => string;
    /** Resolve an ActionButton actionRef against the loaded Response Actions document. */
    resolveActionRef: (actionRef: string, nodeId?: string) => ActionResolution;
    /** Mark a field as touched (e.g., on blur). */
    touchField: (path: string) => void;
    /** Touch every field in the definition (e.g., before submit to reveal all errors). */
    touchAllFields: () => void;
    /** Signal that increments when touched set changes — subscribe for reactivity. */
    touchedVersion: ReadonlyEngineSignal<number>;
    /** Check if a field has been touched. Read touchedVersion.value first for reactivity. */
    isTouched: (path: string) => boolean;
    /** Registry entries for extension resolution. */
    registryEntries: Map<string, any>;
    /** Human References for a field path. Agent-only context never enters this seam. */
    resolveFieldHelp?: FormspecFieldHelpResolver;
    /** Admit or translate a human Reference URI before it reaches an anchor. */
    admitFieldHelpUri: FormspecFieldHelpUriAdmission;
    /** Localizable disclosure label for resolved field help. */
    fieldHelpLabel: string;
    /** Effective formPresentation (definition merged with component document). */
    formPresentation?: Record<string, unknown>;
}

const FormspecContext = createContext<FormspecContextValue | null>(null);

function pageModeFromPresentation(presentation: Record<string, unknown> | undefined): 'wizard' | 'tabs' | undefined {
    return presentation?.pageMode === 'wizard' || presentation?.pageMode === 'tabs'
        ? presentation.pageMode
        : undefined;
}

export interface FormspecProviderProps {
    /** Pre-built FormEngine instance. Mutually exclusive with `definition`. */
    engine?: IFormEngine;
    /** Raw definition JSON. Will create a FormEngine internally. */
    definition?: any;
    /** Component document for layout planning. */
    componentDocument?: any;
    /** Host-supplied Component graph projection context for inert renderer metadata. */
    componentGraph?: ComponentGraphProjectionContext | null;
    /** Host-supplied UI Graph Policy validation evidence for inert renderer metadata. */
    hostEvidence?: LayoutHostEvidence | null;
    /** Theme document for presentation cascade. */
    themeDocument?: SchemaThemeDocument;
    /**
     * Emit theme tokens on provider and form-container elements. Default true.
     * Set false when an owning shell already emitted the effective token map.
     */
    emitThemeTokens?: boolean;
    /** Response Actions document for ActionButton actionRef resolution. */
    responseActionsDocument?: ResponseActionsDocument | null;
    /** Initial response data to pre-populate fields (for edit flows). */
    initialData?: Record<string, any>;
    /** Registry entries for extension field validation. */
    registryEntries?: any[];
    /** Human References resolver for the active Definition. */
    resolveFieldHelp?: FormspecFieldHelpResolver;
    /** Host URI policy. Defaults to HTTPS and same-app relative destinations. */
    admitFieldHelpUri?: FormspecFieldHelpUriAdmission;
    /** Localizable disclosure label for resolved field help. */
    fieldHelpLabel?: string;
    /** Runtime context for FEL today(), locale formatting, etc. */
    runtimeContext?: any;
    /** Optional fetcher for remote Issuer documents. */
    issuerFetcher?: IssuerFetcher;
    /** Host-supplied Issuer override. */
    issuerOverride?: IssuerSource;
    /** Component map overrides. */
    components?: ComponentMap;
    /** Callback for form submission. If provided, a submit button is rendered. */
    onSubmit?: (result: SubmitResult) => void;
    /** Callback invoked for every declared hostEvent effect. */
    onHostEvent?: (eventName: string, result: SubmitResult, action: ResponseAction) => void;
    /** Callback for ActionButton actionRef resolution findings. */
    onActionFinding?: (finding: ActionRefFinding) => void;
    /** Callback invoked after every ActionButton invocation terminal. */
    onActionResult?: (result: ResponseActionInvocationResult<SubmitResult>) => void;
    /** Optional host-owned invoker that can wrap the engine executor with durable runtime plumbing. */
    responseActionInvoker?: ResponseActionInvoker<SubmitResult> | null;
    /** Host precondition evaluator for Response Actions that declare FEL preconditions. */
    evaluateActionPrecondition?: (
        precondition: Precondition,
        action: ResponseAction,
    ) => ResponseActionPreconditionResult;
    /** Host durable-effect adapter for non-hostEvent Response Action effects. */
    dispatchActionEffect?: (
        effect: EffectRequest,
        result: SubmitResult,
        action: ResponseAction,
        context: ResponseActionEffectDispatchContext,
    ) => ResponseActionEffectOutcome | void;
    /** Host idempotency-key resolver for durable Response Action effects. */
    resolveActionIdempotencyKey?: (
        effect: EffectRequest,
        action: ResponseAction,
        context: ResponseActionIdempotencyKeyContext,
    ) => string;
    children: React.ReactNode;
}

/**
 * Provides FormEngine and layout plan to descendant hooks and renderers.
 *
 * Accepts either a pre-built `engine` or a raw `definition` (creates engine internally).
 */
export function FormspecProvider(props: FormspecProviderProps) {
    const {
        engine: externalEngine,
        definition,
        componentDocument,
        componentGraph,
        hostEvidence,
        themeDocument,
        responseActionsDocument,
        initialData,
        registryEntries,
        resolveFieldHelp,
        admitFieldHelpUri = admitDefaultFieldHelpUri,
        runtimeContext,
        issuerFetcher,
        issuerOverride,
        components = {},
        onSubmit,
        onHostEvent,
        onActionFinding,
        onActionResult,
        responseActionInvoker,
        evaluateActionPrecondition,
        dispatchActionEffect,
        resolveActionIdempotencyKey,
        children,
    } = props;
    const fieldHelpLabel = props.fieldHelpLabel ?? 'Help and guidance';
    const shouldEmitThemeTokens = props.emitThemeTokens ?? true;
    const hasIssuerOverrideProp = Object.prototype.hasOwnProperty.call(props, 'issuerOverride');
    const effectiveThemeDocument = useMemo(
        () => themeDocument
            ? mergePlatformAndTenantTheme(platformTheme, themeDocument)
            : mergePlatformAndTenantTheme(platformTheme),
        [themeDocument],
    );

    /**
     * The element the provider's theme tokens are written to.
     *
     * The provider used to call `emitThemeTokens(themeDocument.tokens)` with no
     * target, which defaults to `document.documentElement`, and never cleaned
     * up. One mount of a tenant-themed tree left that tenant's tokens inline on
     * `<html>` for the life of the page: they survived unmount, survived
     * client-side navigation to a route whose `routeClass` refuses tenant
     * theming, and reached everything outside a `.formspec-container` — host
     * chrome, a second embedded renderer, any skin that paints the brand token.
     * A host composing this provider could clean up after it but never prevent
     * it, which is the runtime hole under ADR 0161's theme-authority promise.
     *
     * `display: contents` is inline rather than in a stylesheet so the element
     * generates no box even when the default skin is not loaded. Custom
     * properties inherit through it regardless of `display`, so the tokens
     * reach exactly the subtree the provider owns and nothing above it.
     */
    const themeScopeRef = useRef<HTMLDivElement>(null);

    const engine = useMemo(() => {
        if (externalEngine) return externalEngine;
        if (!definition) throw new Error('FormspecProvider requires either engine or definition');
        const eng = createFormEngine(definition, {
            runtimeContext,
            registryEntries,
            issuerFetcher,
            issuerOverride,
        });
        if (initialData) {
            applyInitialData(eng, initialData);
        }
        return eng;
    }, [externalEngine, definition, registryEntries, runtimeContext, initialData, issuerFetcher]);

    useEffect(() => {
        if (hasIssuerOverrideProp) {
            engine.setIssuerOverride(issuerOverride);
        }
    }, [engine, hasIssuerOverrideProp, issuerOverride]);

    // Build registry entry map for extension resolution
    const registryMap = useMemo(() => {
        const map = new Map<string, any>();
        if (registryEntries) {
            for (const doc of (Array.isArray(registryEntries) ? registryEntries : [registryEntries])) {
                if (!doc?.entries) continue;
                for (const entry of doc.entries) {
                    if (entry.name) map.set(entry.name, entry);
                }
            }
        }
        return map;
    }, [registryEntries]);

    // Responsive breakpoint detection — match component document breakpoints via matchMedia
    const [activeBreakpoint, setActiveBreakpoint] = useState<string | null>(() => {
        if (typeof window === 'undefined' || !componentDocument?.breakpoints) return null;
        return detectBreakpoint(componentDocument.breakpoints);
    });

    useEffect(() => {
        if (typeof window === 'undefined' || !componentDocument?.breakpoints) return;
        const breakpoints = componentDocument.breakpoints as Record<string, number | { minWidth?: number }>;
        const entries = Object.entries(breakpoints)
            .map(([name, bp]): [string, number] | null => {
                const v = typeof bp === 'number' ? bp : (bp.minWidth ?? null);
                return v != null ? [name, v] : null;
            })
            .filter((e): e is [string, number] => e !== null)
            .sort(([, a], [, b]) => a - b);
        if (entries.length === 0) return;

        const queries = entries.map(([name, minWidth]) => ({
            name,
            mql: window.matchMedia(`(min-width: ${minWidth}px)`),
        }));

        const update = () => setActiveBreakpoint(detectBreakpoint(breakpoints));
        for (const { mql } of queries) mql.addEventListener('change', update);
        return () => { for (const { mql } of queries) mql.removeEventListener('change', update); };
    }, [componentDocument]);

    const mergedFormPresentation = useMemo(
        () =>
            engine
                ? mergeFormPresentationForPlanning(
                      engine.getDefinition().formPresentation,
                      componentDocument?.formPresentation,
                  )
                : undefined,
        [engine, componentDocument],
    );

    const layoutPlan = useMemo(() => {
        if (!engine) return null;
        const def = engine.getDefinition();
        const items = def.items || [];
        const pageMode = pageModeFromPresentation(mergedFormPresentation);

        const planCtx = preparePlanContext({
            items,
            formPresentation: mergedFormPresentation,
            componentDocument,
            componentGraph: componentGraph ?? undefined,
            hostEvidence: hostEvidence ?? undefined,
            theme: effectiveThemeDocument,
            activeBreakpoint,
            findItem: (key: string) => findItemByKey(items, key),
        });

        let root: LayoutNode;
        if (componentDocument?.tree) {
            root = planComponentTree(componentDocument.tree, planCtx);
        } else {
            // planDefinitionFallback returns an array — wrap in a root Stack node
            const nodes = planDefinitionFallback(items, planCtx);
            root = {
                id: 'root',
                component: 'Stack',
                category: 'layout' as const,
                props: {},
                cssClasses: [],
                children: nodes,
                pageMode: pageMode && nodes.some((node) => node.component === 'Section')
                    ? pageMode
                    : undefined,
            };
        }

        // §10: only inject an ActionButton when a submit-intent Action
        // actually exists in the loaded Response Actions document. §10
        // forbids implicit-default Actions and free-string fallbacks, so
        // auto-injection MUST be a no-op when no submit Action is published.
        if (onSubmit) {
            const submitAction = findResponseActionByIntent(responseActionsDocument, 'submit');
            if (submitAction) {
                ensureActionButton(root, planCtx.nextId, { pageMode, actionRef: submitAction.id });
            }
        }
        return root;
    }, [engine, componentDocument, componentGraph, hostEvidence, effectiveThemeDocument, activeBreakpoint, onSubmit, responseActionsDocument, mergedFormPresentation]);

    // §10: surface a finding when the host wires onSubmit but no submit Action
    // is published — otherwise auto-inject silently no-ops.
    useEffect(() => {
        if (!onSubmit || !onActionFinding) return;
        if (findResponseActionByIntent(responseActionsDocument, 'submit')) return;
        onActionFinding(missingSubmitActionFinding());
    }, [onSubmit, onActionFinding, responseActionsDocument]);

    // Touched tracking — stable across re-renders
    const touchedFieldsRef = useRef(new Set<string>());
    const touchedVersionSignal = useMemo(() => signal(0), []);

    const touchField = useCallback((path: string) => {
        if (!touchedFieldsRef.current.has(path)) {
            touchedFieldsRef.current.add(path);
            touchedVersionSignal.value += 1;
        }
    }, [touchedVersionSignal]);

    const touchAllFields = useCallback(() => {
        const def = engine.getDefinition();
        const walk = (items: any[], prefix: string) => {
            for (const item of items) {
                const path = prefix ? `${prefix}.${item.key}` : item.key;
                if (item.type === 'field') touchField(path);
                if (item.children) walk(item.children, path);
            }
        };
        walk(def.items || [], '');
    }, [engine, touchField]);

    const isTouched = useCallback((path: string) => {
        return touchedFieldsRef.current.has(path);
    }, []);

    const resolveActionRef = useCallback((actionRef: string, nodeId?: string): ActionResolution =>
        resolveResponseAction(responseActionsDocument, actionRef, nodeId),
    [responseActionsDocument]);

    // Auto-emit theme tokens as CSS custom properties onto the provider's OWN
    // element — never the document root. See `themeScopeRef` below for why.
    useEffect(() => {
        if (!shouldEmitThemeTokens) return;
        const el = themeScopeRef.current;
        if (!el) return;
        const tokens = effectiveThemeDocument.tokens;
        if (!tokens) return;
        emitThemeTokens(tokens, el);
        return () => {
            for (let i = el.style.length - 1; i >= 0; i--) {
                const property = el.style[i];
                if (property.startsWith('--formspec-')) el.style.removeProperty(property);
            }
        };
    }, [effectiveThemeDocument, shouldEmitThemeTokens]);

    useEffect(() => {
        // Only dispose if we created the engine internally
        if (!externalEngine && engine) {
            return () => engine.dispose();
        }
    }, [engine, externalEngine]);

    const value = useMemo<FormspecContextValue>(
        () => ({
            engine,
            layoutPlan,
            components,
            themeDocument: effectiveThemeDocument,
            emitThemeTokens: shouldEmitThemeTokens,
            componentDocument,
            componentGraph,
            hostEvidence,
            responseActionsDocument,
            onSubmit,
            onHostEvent,
            onActionFinding,
            onActionResult,
            responseActionInvoker,
            evaluateActionPrecondition,
            dispatchActionEffect,
            resolveActionIdempotencyKey,
            resolveActionRef,
            touchField,
            touchAllFields,
            touchedVersion: touchedVersionSignal,
            isTouched,
            registryEntries: registryMap,
            resolveFieldHelp,
            admitFieldHelpUri,
            fieldHelpLabel,
            formPresentation: mergedFormPresentation,
        }),
        [engine, layoutPlan, components, effectiveThemeDocument, shouldEmitThemeTokens, componentDocument, componentGraph, hostEvidence, responseActionsDocument, onSubmit, onHostEvent, onActionFinding, onActionResult, responseActionInvoker, evaluateActionPrecondition, dispatchActionEffect, resolveActionIdempotencyKey, resolveActionRef, touchField, touchAllFields, touchedVersionSignal, isTouched, registryMap, resolveFieldHelp, admitFieldHelpUri, fieldHelpLabel, mergedFormPresentation],
    );

    return (
        <FormspecContext.Provider value={value}>
            <div ref={themeScopeRef} className="formspec-theme-scope" style={THEME_SCOPE_STYLE}>
                {children}
            </div>
        </FormspecContext.Provider>
    );
}

/** See `themeScopeRef` — the scope element must not generate a box. */
const THEME_SCOPE_STYLE: React.CSSProperties = { display: 'contents' };

/** Access the FormspecContext. Throws if used outside FormspecProvider. */
export function useFormspecContext(): FormspecContextValue {
    const ctx = useContext(FormspecContext);
    if (!ctx) throw new Error('useFormspecContext must be used within a FormspecProvider');
    return ctx;
}

/** Detect the largest matching breakpoint from a breakpoints map (mobile-first).
 *  Breakpoint values may be plain integers `{ sm: 576 }` or objects `{ sm: { minWidth: 576 } }`.
 */
function detectBreakpoint(breakpoints: Record<string, number | { minWidth?: number }>): string | null {
    if (typeof window === 'undefined') return null;
    let match: string | null = null;
    const entries = Object.entries(breakpoints)
        .map(([name, bp]): [string, number] | null => {
            const v = typeof bp === 'number' ? bp : (bp.minWidth ?? null);
            return v != null ? [name, v] : null;
        })
        .filter((e): e is [string, number] => e !== null)
        .sort(([, a], [, b]) => a - b);
    for (const [name, minWidth] of entries) {
        if (window.matchMedia(`(min-width: ${minWidth}px)`).matches) {
            match = name;
        }
    }
    return match;
}

/**
 * Emit theme tokens as --formspec-* CSS custom properties.
 * Converts dotted token keys (e.g., `color.primary`) to `--formspec-color-primary`.
 *
 * `target` defaults to `document.documentElement` — a HOST may choose to paint
 * the document root, and the shipped examples do. `FormspecProvider` does not:
 * a renderer that writes tenant tokens to `<html>` makes a global mutation that
 * outlives the component and that a composing host can only clean up after,
 * never prevent. Always pass a target from inside a component.
 */
export function emitThemeTokens(
    tokens: Record<string, string | number>,
    target?: HTMLElement,
): void {
    const el = target ?? document.documentElement;
    for (const [key, value] of Object.entries(tokens)) {
        el.style.setProperty(`--formspec-${key.replace(/\./g, '-')}`, String(value));
    }
}

/** Walk nested initial data and set leaf values on the engine with dotted paths. */
function applyInitialData(engine: IFormEngine, data: Record<string, any>, prefix = ''): void {
    for (const [key, value] of Object.entries(data)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (Array.isArray(value)) {
            // Repeat group: ensure instances exist, then recurse into each
            const currentCount = engine.repeats[path]?.value ?? 0;
            for (let i = currentCount; i < value.length; i++) {
                engine.addRepeatInstance(path);
            }
            for (let i = 0; i < value.length; i++) {
                if (value[i] != null && typeof value[i] === 'object') {
                    applyInitialData(engine, value[i], `${path}[${i}]`);
                }
            }
        } else if (value !== null && typeof value === 'object') {
            applyInitialData(engine, value, path);
        } else {
            engine.setValue(path, value);
        }
    }
}

import { Path } from '@formspec-org/types';

/** Recursive item lookup by dotted key path. */
export function findItemByKey(items: any[], key: string): any | null {
    const segments = Path.parse(key).splitNormalized();
    let current = items;
    for (let i = 0; i < segments.length; i++) {
        const found = current.find((item: any) => item.key === segments[i]);
        if (!found) return null;
        if (i === segments.length - 1) return found;
        current = found.children || [];
    }
    return null;
}
