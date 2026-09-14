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
    ResponseActionInvocationContext,
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
import {
    createFormEngine,
    findResponseActionByIntent,
    missingSubmitActionFinding,
    resolveResponseAction,
    resolveResponseActionValidationTuple,
} from '@formspec-org/engine';
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
import type {
    SemanticControlScope,
    SemanticResponseBinding,
} from './semantic-controls';

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
    invocationContext?: ResponseActionInvocationContext;
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
    /** Exact runtime identity used only by the public semantic-control seam. */
    semanticControlScope?: SemanticControlScope;
    currentSemanticResponseBinding: () => SemanticResponseBinding | null;
    advanceSemanticResponseRevision: () => SemanticResponseBinding | null;
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

const RESPONSE_ACTION_ID = /^[A-Za-z][A-Za-z0-9-]*$/;

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function hasNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function hasValidResponseActionEffectShape(value: unknown): boolean {
    const effect = record(value);
    if (!effect || typeof effect.type !== 'string') return false;
    if (
        effect.onError !== undefined
        && effect.onError !== 'fail'
        && effect.onError !== 'defer'
    ) {
        return false;
    }

    switch (effect.type) {
        case 'mappingExecution':
            return hasNonEmptyString(effect.mappingRef)
                && hasNonEmptyString(effect.idempotencyKey);
        case 'ledgerAppend':
            return hasNonEmptyString(effect.eventKind)
                && hasNonEmptyString(effect.idempotencyKey);
        case 'handoffAssembly':
            return hasNonEmptyString(effect.handoffProfileRef)
                && hasNonEmptyString(effect.recipientRef)
                && hasNonEmptyString(effect.idempotencyKey);
        case 'evidenceRequest':
        case 'serviceRequest':
            return hasNonEmptyString(effect.requestRef)
                && hasNonEmptyString(effect.idempotencyKey);
        case 'hostEvent':
            return hasNonEmptyString(effect.eventName)
                && effect.idempotencyKey === undefined;
        case 'browserResource':
            return (effect.operation === 'open' || effect.operation === 'download')
                && hasNonEmptyString(effect.resourceRef)
                && effect.idempotencyKey === undefined;
        default:
            return false;
    }
}

function hasValidResponseActionShape(value: unknown): value is ResponseAction {
    const action = record(value);
    if (
        !action
        || !hasNonEmptyString(action.id)
        || !RESPONSE_ACTION_ID.test(action.id)
        || !hasNonEmptyString(action.intent)
        || !Array.isArray(action.effects)
        || action.effects.length === 0
        || !action.effects.every(hasValidResponseActionEffectShape)
    ) {
        return false;
    }

    const label = action.label;
    if (label !== undefined) {
        const candidate = record(label);
        const hasLiteral = candidate ? hasNonEmptyString(candidate.literal) : false;
        const hasRef = candidate ? hasNonEmptyString(candidate.ref) : false;
        if (!candidate || hasLiteral === hasRef) return false;
    }

    try {
        resolveResponseActionValidationTuple(value as ResponseAction);
    } catch {
        return false;
    }
    return true;
}

function hasLiteralActionLabel(action: ResponseAction): boolean {
    const label = record(action.label);
    return label ? hasNonEmptyString(label.literal) : false;
}

/**
 * Select actions that the Definition auto-renderer can place without
 * inventing a control label. The document itself must be a matching,
 * response-scoped document with unique, structurally usable actions; one bad
 * action closes the whole auto-placement seam.
 */
function autoPlacedDefinitionActions(
    document: ResponseActionsDocument | null | undefined,
    definition: { url?: unknown },
): readonly ResponseAction[] {
    const candidate = record(document);
    const target = record(candidate?.targetDefinition);
    if (
        !candidate
        || candidate.$formspecResponseActions !== '1.0'
        || !hasNonEmptyString(candidate.version)
        || (candidate.scope !== undefined && candidate.scope !== 'response')
        || !target
        || !hasNonEmptyString(target.url)
        || target.url !== definition.url
        || (
            target.compatibleVersions !== undefined
            && !hasNonEmptyString(target.compatibleVersions)
        )
        || !Array.isArray(candidate.actions)
        || candidate.actions.length === 0
        || !candidate.actions.every(hasValidResponseActionShape)
    ) {
        return [];
    }

    const ids = new Set<string>();
    for (const action of candidate.actions) {
        if (ids.has(action.id)) return [];
        ids.add(action.id);
    }

    return candidate.actions.filter(hasLiteralActionLabel);
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
    /**
     * Exact artifact, render, and Response identity for renderer-owned
     * semantic controls. Omit for ordinary human-only rendering.
     */
    semanticControlScope?: SemanticControlScope;
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
        semanticControlScope,
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
    const semanticResponseState = useMemo(
        () => ({
            responseRevision: semanticControlScope?.initialResponseRevision ?? 0,
        }),
        [
            semanticControlScope?.renderInstanceId,
            semanticControlScope?.responseId,
            semanticControlScope?.initialResponseRevision,
        ],
    );
    const currentSemanticResponseBinding = useCallback(
        (): SemanticResponseBinding | null => semanticControlScope
            ? {
                responseId: semanticControlScope.responseId,
                responseRevision: semanticResponseState.responseRevision,
            }
            : null,
        [semanticControlScope, semanticResponseState],
    );
    const advanceSemanticResponseRevision = useCallback(
        (): SemanticResponseBinding | null => {
            if (!semanticControlScope) return null;
            semanticResponseState.responseRevision += 1;
            return {
                responseId: semanticControlScope.responseId,
                responseRevision: semanticResponseState.responseRevision,
            };
        },
        [semanticControlScope, semanticResponseState],
    );
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

        // The host opts into Definition action controls by wiring onSubmit.
        // Place each usable response-scoped Action in document order. Exact
        // actionRef deduplication preserves explicitly authored controls, and
        // literal labels keep all visible copy in the structured document.
        if (onSubmit) {
            for (const action of autoPlacedDefinitionActions(responseActionsDocument, def)) {
                ensureActionButton(root, planCtx.nextId, { pageMode, actionRef: action.id });
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

    // Every rendered instance path the engine validates (repeat rows included, e.g. `rows[1].name`),
    // not Definition template paths. Same key set as webcomponent submit touchAllFields.
    const touchAllFields = useCallback(() => {
        let touchedAny = false;
        for (const path of [...Object.keys(engine.errorSignals), ...Object.keys(engine.validationResults)]) {
            if (touchedFieldsRef.current.has(path)) continue;
            touchedFieldsRef.current.add(path);
            touchedAny = true;
        }
        if (touchedAny) touchedVersionSignal.value += 1;
    }, [engine, touchedVersionSignal]);

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
            semanticControlScope,
            onSubmit,
            onHostEvent,
            onActionFinding,
            onActionResult,
            responseActionInvoker,
            evaluateActionPrecondition,
            dispatchActionEffect,
            resolveActionIdempotencyKey,
            resolveActionRef,
            currentSemanticResponseBinding,
            advanceSemanticResponseRevision,
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
        [engine, layoutPlan, components, effectiveThemeDocument, shouldEmitThemeTokens, componentDocument, componentGraph, hostEvidence, responseActionsDocument, semanticControlScope, onSubmit, onHostEvent, onActionFinding, onActionResult, responseActionInvoker, evaluateActionPrecondition, dispatchActionEffect, resolveActionIdempotencyKey, resolveActionRef, currentSemanticResponseBinding, advanceSemanticResponseRevision, touchField, touchAllFields, touchedVersionSignal, isTouched, registryMap, resolveFieldHelp, admitFieldHelpUri, fieldHelpLabel, mergedFormPresentation],
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
