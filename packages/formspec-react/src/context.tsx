'use client';

/** @filedesc FormspecProvider — React context wrapping a FormEngine + optional layout plan. */
import React, { createContext, useContext, useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { signal } from '@preact/signals-core';
import { ActionFeedbackProvider, useActionFeedbackStore } from './action-feedback.js';
import { generationNeedAnchors } from './projection-metadata.js';
import type {
    ActionRefFinding,
    ActionResolution,
    IFormEngine,
    IssuerFetcher,
    IssuerSource,
    ReadonlyEngineSignal,
    ResponseAction,
    ResponseActionAsyncInvocationPorts,
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
    autoPlacedDefinitionActions,
    createFormEngine,
    findResponseActionByIntent,
    invokeResponseActionAsync,
    isValidDefinitionResponseActionsDocument,
    missingSubmitActionFinding,
    resolveResponseAction,
    createResponseActionAutosaveController,
    type ResponseActionAutosaveController,
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
    extractBreakpointEntries,
    matchBreakpoint,
    planDefinitionLayout,
    mergeFormPresentationForPlanning,
    admitFieldHelpUri,
} from '@formspec-org/layout';
import type { ComponentMap } from './component-map';
import type {
    SemanticControlScope,
    SemanticResponseBinding,
} from './semantic-controls';
import type { WorkspacePage } from '@formspec-org/layout';
import { useSignal } from './use-signal';
import { chromeText } from './use-chrome-text';
import { useExplanationState, type ExplanationState } from './explanation-state';

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

export interface FormspecActionResultMeta {
    nodeId: string;
}

export interface SubmitResult {
    response: FormResponse;
    validationReport: ValidationReport | null;
    /** Receipt and label for a completed local preview filing. */
    previewFiling?: { receiptRef: string; label: string };
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

/**
 * Fail-closed browser policy for human Reference links — the shared rule, so React and the webcomponent admit
 * exactly the same URIs (`admitFieldHelpUri` in `@formspec-org/layout`).
 */
export const admitDefaultFieldHelpUri = admitFieldHelpUri;

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
    onHostEvent?: (eventName: string, detail: unknown, action: ResponseAction) => void;
    /** Callback invoked when ActionButton actionRef resolution produces a finding. */
    onActionFinding?: (finding: ActionRefFinding) => void;
    /** Callback invoked after every ActionButton or background autosave invocation terminal. */
    onActionResult?: (result: ResponseActionInvocationResult<SubmitResult>) => void;
    /** Callback invoked only when an interactive ActionButton control finishes an invocation. */
    onControlActionResult?: (
        result: ResponseActionInvocationResult<SubmitResult>,
        meta: FormspecActionResultMeta,
    ) => void;
    /** Optional host-owned invoker that can wrap the engine executor with durable runtime plumbing. */
    responseActionInvoker?: ResponseActionInvoker<SubmitResult> | null;
    /** Host precondition evaluator for Response Actions that declare FEL preconditions. */
    evaluateActionPrecondition?: (
        precondition: Precondition,
        action: ResponseAction,
    ) => ResponseActionPreconditionResult;
    /** Effect-time FEL evaluator; receives an immutable invocation snapshot. */
    evaluateActionEffectExpression?: ResponseActionInvocationPorts<SubmitResult>['evaluateEffectExpression'];
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
    /** The latest submit through this provider's form — null before the first. A `submit`-sourced ValidationSummary reads it. */
    latestSubmit: ReadonlyEngineSignal<SubmitResult | null>;
    /**
     * @internal The engine's explanation state, read once typing pauses and at once for an answer or a Submit,
     * so the warning controls and the Findings margin share one Submit evaluation. Null when nothing asks for one.
     */
    explanationState: ReadonlyEngineSignal<ExplanationState | null>;
    /** Record a submit's result, so `latestSubmit` follows it. The submit port calls this. */
    recordSubmit: (result: SubmitResult) => void;
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
    /** @internal Shared workspace pages and the optional navigation host. */
    workspacePages?: WorkspacePage[];
    workspaceNavigation?: WorkspaceNavigationProps;
    /** Synchronize the `show-validation-summary` attribute from `.formspec-container`. */
    setShowValidationSummaryAttr?: (show: boolean) => void;
    /** Register a paged-layout field jump handler (Wizard / Workspace) for root panels. */
    registerFieldJump?: (handler: ((path: string, options?: { notifyRoute?: boolean }) => boolean) | null) => void;
    /** Jump to a field across Wizard steps or Workspace sections if a paged layout is active. */
    jumpToField?: (path: string, options?: { notifyRoute?: boolean }) => boolean;
}

/** @internal The provider's value, or `null` outside one — read it through {@link useFormspecContext}. */
export const FormspecContext = createContext<FormspecContextValue | null>(null);

export interface WorkspaceNavigationProps {
    /** A supplied value (including undefined) makes the host own section selection. */
    activeSection?: string | undefined;
    /** Optional resolved field path requested by route navigation (e.g. from respondent review). */
    focusField?: string | undefined;
    onActiveSectionChange?: ((section: string) => void) | undefined;
    /** Suppress section focus while another form owns the host's active location. */
    sectionNavigationActive?: boolean | undefined;
    /** Format a link for normal browser behavior such as opening a new tab. */
    hrefForSection?: ((section: string) => string | undefined) | undefined;
    /**
     * Address the control that accepts an owed group acknowledgement (Core §5.3.1), such as a draft review
     * route; `navigate` follows a plain click the way the host's own links do. Absent, the Findings row is text.
     */
    acknowledgementLink?: ((code: string) => { href: string; navigate?: () => void } | undefined) | undefined;
    /** Let a host compose the page title. An undefined title clears the current section. */
    onSectionTitleChange?: ((title: string | undefined) => void) | undefined;
    /** Opt in to prefixing the document title with the active section when no title callback is supplied. */
    updateDocumentTitle?: boolean | undefined;
}

export interface FormspecProviderProps extends WorkspaceNavigationProps {
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
    /** Response `data` hydrated at engine construction (host rows win over seedFrom). */
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
    /**
     * Open the form with a validation summary — the latest submit's findings, each a link to its field —
     * when the documents place none. Off by default: a Component document decides where a summary goes.
     */
    showValidationSummary?: boolean;
    /** The embedding draft writer announces Save Draft and autosave outcomes. */
    draftSaveFeedback?: 'external' | undefined;
    /** The embedding host (e.g., Surface shell) owns and announces Submit action outcomes. */
    submitFeedback?: 'external' | undefined;
    /** Callback invoked for every declared hostEvent effect. */
    onHostEvent?: (eventName: string, detail: unknown, action: ResponseAction) => void;
    /** Callback for ActionButton actionRef resolution findings. */
    onActionFinding?: (finding: ActionRefFinding) => void;
    /** Callback invoked after every ActionButton or background autosave invocation terminal. */
    onActionResult?: (result: ResponseActionInvocationResult<SubmitResult>) => void;
    /** Callback invoked only when an interactive ActionButton control finishes an invocation. */
    onControlActionResult?: (
        result: ResponseActionInvocationResult<SubmitResult>,
        meta: FormspecActionResultMeta,
    ) => void;
    /** Optional host-owned invoker that can wrap the engine executor with durable runtime plumbing. */
    responseActionInvoker?: ResponseActionInvoker<SubmitResult> | null;
    /** Host precondition evaluator for Response Actions that declare FEL preconditions. */
    evaluateActionPrecondition?: (
        precondition: Precondition,
        action: ResponseAction,
    ) => ResponseActionPreconditionResult;
    /** Effect-time FEL evaluator; receives an immutable invocation snapshot. */
    evaluateActionEffectExpression?: ResponseActionInvocationPorts<SubmitResult>['evaluateEffectExpression'];
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
        showValidationSummary = false,
        onHostEvent,
        onActionFinding,
        onActionResult,
        onControlActionResult,
        responseActionInvoker,
        evaluateActionPrecondition,
        evaluateActionEffectExpression,
        dispatchActionEffect,
        resolveActionIdempotencyKey,
        children,
    } = props;
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
            responseData: initialData,
        });
        return eng;
    }, [externalEngine, definition, registryEntries, runtimeContext, initialData, issuerFetcher]);

    useEffect(() => {
        if (hasIssuerOverrideProp) {
            engine.setIssuerOverride(issuerOverride);
        }
    }, [engine, hasIssuerOverrideProp, issuerOverride]);

    // Locale §3.1.10: the renderer's own words for the help link, unless the host names its own.
    useSignal(engine.localeSignal);
    const fieldHelpLabel = props.fieldHelpLabel ?? chromeText(engine, 'fieldHelp.label');

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

    // Responsive breakpoint detection — match merged Theme + Component breakpoints via matchMedia
    const [activeBreakpoint, setActiveBreakpoint] = useState<string | null>(() =>
        detectBreakpoint(effectiveThemeDocument?.breakpoints, componentDocument?.breakpoints),
    );

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const entries = extractBreakpointEntries(
            effectiveThemeDocument?.breakpoints,
            componentDocument?.breakpoints,
        );
        const update = () => {
            const next = detectBreakpoint(
                effectiveThemeDocument?.breakpoints,
                componentDocument?.breakpoints,
            );
            setActiveBreakpoint((prev) => (prev === next ? prev : next));
        };
        update();
        if (entries.length === 0) return;

        const queries = entries.map(([name, minWidth]) => ({
            name,
            mql: window.matchMedia(`(min-width: ${minWidth}px)`),
        }));

        for (const { mql } of queries) mql.addEventListener('change', update);
        return () => { for (const { mql } of queries) mql.removeEventListener('change', update); };
    }, [effectiveThemeDocument, componentDocument]);

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

    const [showValidationSummaryAttr, setShowValidationSummaryAttr] = useState(false);
    const effectiveShowValidationSummary = showValidationSummary || showValidationSummaryAttr;
    const activeDefinition = engine ? engine.getDefinition() : definition;
    const admittedResponseActionsDocument = useMemo(
        () => (activeDefinition && isValidDefinitionResponseActionsDocument(responseActionsDocument, activeDefinition))
            ? responseActionsDocument
            : null,
        [activeDefinition, responseActionsDocument],
    );

    const { root: layoutPlan, workspace } = useMemo(() => {
        if (!engine) return { root: null, workspace: undefined };
        const def = engine.getDefinition();
        const autoPlaceControls = onSubmit
            ? 'always'
            : responseActionInvoker
                ? 'when-unauthored'
                : 'never';
        const autoPlacedActionRefs = autoPlaceControls !== 'never'
            ? autoPlacedDefinitionActions(admittedResponseActionsDocument, def).map((action) => action.id)
            : [];
        return planDefinitionLayout({
            definition: def,
            componentDocument,
            themeDocument: effectiveThemeDocument,
            activeBreakpoint,
            componentGraph: componentGraph ?? undefined,
            hostEvidence: hostEvidence ?? undefined,
            autoPlacedActionRefs,
            autoPlaceControls,
            showValidationSummary: effectiveShowValidationSummary,
        });
    }, [engine, componentDocument, componentGraph, hostEvidence, effectiveThemeDocument, activeBreakpoint, onSubmit, responseActionInvoker, effectiveShowValidationSummary, admittedResponseActionsDocument]);

    // §10: surface a finding when the host wires onSubmit but no submit Action
    // is published — otherwise auto-inject silently no-ops.
    useEffect(() => {
        if (!onSubmit || !onActionFinding) return;
        if (findResponseActionByIntent(admittedResponseActionsDocument, 'submit')) return;
        onActionFinding(missingSubmitActionFinding());
    }, [onSubmit, onActionFinding, admittedResponseActionsDocument]);

    // Touched tracking — stable across re-renders
    const touchedFieldsRef = useRef(new Set<string>());
    const touchedVersionSignal = useMemo(() => signal(0), []);
    const latestSubmitSignal = useMemo(() => signal<SubmitResult | null>(null), []);
    const recordSubmit = useCallback((result: SubmitResult) => { latestSubmitSignal.value = result; }, [latestSubmitSignal]);
    const explanationState = useExplanationState(engine, latestSubmitSignal);
    const fieldJumpHandlerRef = useRef<((path: string, options?: { notifyRoute?: boolean }) => boolean) | null>(null);
    const registerFieldJump = useCallback((handler: ((path: string, options?: { notifyRoute?: boolean }) => boolean) | null) => {
        fieldJumpHandlerRef.current = handler;
    }, []);
    const jumpToField = useCallback((path: string, options?: { notifyRoute?: boolean }): boolean => {
        return fieldJumpHandlerRef.current ? fieldJumpHandlerRef.current(path, options) : false;
    }, []);

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
        resolveResponseAction(admittedResponseActionsDocument, actionRef, nodeId),
    [admittedResponseActionsDocument]);

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

    const {
        activeSection, focusField, onActiveSectionChange, sectionNavigationActive, hrefForSection, acknowledgementLink,
        onSectionTitleChange, updateDocumentTitle,
    } = props;
    const controlledSection = Object.prototype.hasOwnProperty.call(props, 'activeSection');
    const workspaceNavigation = useMemo<WorkspaceNavigationProps>(() => ({
        ...(controlledSection && { activeSection }),
        ...(focusField !== undefined && { focusField }),
        onActiveSectionChange, sectionNavigationActive, hrefForSection, acknowledgementLink, onSectionTitleChange, updateDocumentTitle,
    }), [controlledSection, activeSection, focusField, onActiveSectionChange, sectionNavigationActive, hrefForSection,
        acknowledgementLink, onSectionTitleChange, updateDocumentTitle]);

    const value = useMemo<FormspecContextValue>(
        () => ({
            engine,
            layoutPlan,
            workspacePages: workspace,
            workspaceNavigation,
            components,
            themeDocument: effectiveThemeDocument,
            emitThemeTokens: shouldEmitThemeTokens,
            componentDocument,
            componentGraph,
            hostEvidence,
            responseActionsDocument: admittedResponseActionsDocument,
            semanticControlScope,
            onSubmit,
            onHostEvent,
            onActionFinding,
            onActionResult,
            onControlActionResult,
            responseActionInvoker,
            evaluateActionPrecondition,
            evaluateActionEffectExpression,
            dispatchActionEffect,
            resolveActionIdempotencyKey,
            resolveActionRef,
            currentSemanticResponseBinding,
            advanceSemanticResponseRevision,
            touchField,
            touchAllFields,
            touchedVersion: touchedVersionSignal,
            isTouched,
            latestSubmit: latestSubmitSignal,
            explanationState,
            recordSubmit,
            registryEntries: registryMap,
            resolveFieldHelp,
            admitFieldHelpUri,
            fieldHelpLabel,
            formPresentation: mergedFormPresentation,
            setShowValidationSummaryAttr,
            registerFieldJump,
            jumpToField,
        }),
        [engine, layoutPlan, workspace, workspaceNavigation, components, effectiveThemeDocument, shouldEmitThemeTokens, componentDocument, componentGraph, hostEvidence, admittedResponseActionsDocument, semanticControlScope, onSubmit, onHostEvent, onActionFinding, onActionResult, onControlActionResult, responseActionInvoker, evaluateActionPrecondition, dispatchActionEffect, resolveActionIdempotencyKey, resolveActionRef, currentSemanticResponseBinding, advanceSemanticResponseRevision, touchField, touchAllFields, touchedVersionSignal, isTouched, latestSubmitSignal, explanationState, recordSubmit, registryMap, resolveFieldHelp, admitFieldHelpUri, fieldHelpLabel, mergedFormPresentation, setShowValidationSummaryAttr, registerFieldJump, jumpToField],
    );

    return (
        <FormspecContext.Provider value={value}>
            <ActionFeedbackProvider engine={engine} responseId={semanticControlScope?.responseId}
                renderInstanceId={semanticControlScope?.renderInstanceId}
                draftSaveFeedback={props.draftSaveFeedback}
                submitFeedback={props.submitFeedback}>
                <FormspecAutosaveEffect draftSaveFeedback={props.draftSaveFeedback} />
                <div ref={themeScopeRef} className="formspec-theme-scope" style={THEME_SCOPE_STYLE}>
                    {children}
                </div>
            </ActionFeedbackProvider>
        </FormspecContext.Provider>
    );
}

function FormspecAutosaveEffect({ draftSaveFeedback }: { draftSaveFeedback?: 'external' | undefined }) {
    const {
        engine,
        responseActionsDocument,
        semanticControlScope,
        onHostEvent,
        onActionFinding,
        onActionResult,
        responseActionInvoker,
        evaluateActionPrecondition,
        evaluateActionEffectExpression,
        dispatchActionEffect,
        resolveActionIdempotencyKey,
    } = useFormspecContext();
    const feedbackStore = useActionFeedbackStore();
    const latestRef = useRef({
        semanticControlScope,
        onHostEvent,
        onActionFinding,
        onActionResult,
        responseActionInvoker,
        evaluateActionPrecondition,
        evaluateActionEffectExpression,
        dispatchActionEffect,
        resolveActionIdempotencyKey,
        feedbackStore,
        responseActionsDocument,
    });
    latestRef.current = {
        semanticControlScope,
        onHostEvent,
        onActionFinding,
        onActionResult,
        responseActionInvoker,
        evaluateActionPrecondition,
        evaluateActionEffectExpression,
        dispatchActionEffect,
        resolveActionIdempotencyKey,
        feedbackStore,
        responseActionsDocument,
    };

    const controllerRef = useRef<ResponseActionAutosaveController | null>(null);

    useEffect(() => {
        if (draftSaveFeedback === 'external' || !engine) {
            return;
        }
        type AutosaveFeedbackTicket = NonNullable<ReturnType<NonNullable<typeof feedbackStore>['start']>>;
        const activeTickets = new Set<AutosaveFeedbackTicket>();
        let settledTicket: AutosaveFeedbackTicket | undefined;
        const cancelActiveTickets = () => {
            for (const pendingTicket of activeTickets) {
                latestRef.current.feedbackStore?.cancel(pendingTicket);
            }
            activeTickets.clear();
        };
        const cancelSettledTicket = () => {
            if (settledTicket) {
                latestRef.current.feedbackStore?.cancel(settledTicket);
                settledTicket = undefined;
            }
        };
        const controller = createResponseActionAutosaveController({
            engine,
            document: latestRef.current.responseActionsDocument,
            onFinding: (finding) => {
                latestRef.current.onActionFinding?.(finding);
            },
            onDocumentChange: ({ equivalentAction }) => {
                cancelActiveTickets();
                if (!equivalentAction) {
                    cancelSettledTicket();
                }
            },
            invoke: async (action, context) => {
                const invokedDoc = context.document;
                const current = latestRef.current;
                const outletId = context.isCurrent() ? current.feedbackStore?.primaryOutlet() : undefined;
                const ticket = outletId
                    ? current.feedbackStore?.start(outletId, action.intent, generationNeedAnchors(action))
                    : undefined;
                if (ticket) {
                    settledTicket = undefined;
                    activeTickets.add(ticket);
                }

                const captureAutosaveSnapshot: NonNullable<ResponseActionInvocationPorts<SubmitResult>['submit']> = ({
                    profile,
                    validationTuple,
                }) => engine.getResponseSnapshot({
                    profile: validationTuple?.persistence === 'complete-response' ? 'on-submit' : 'off',
                    ...(current.semanticControlScope ? { id: current.semanticControlScope.responseId } : {}),
                }, profile);

                const ports: ResponseActionAsyncInvocationPorts<SubmitResult> = {
                    submit: captureAutosaveSnapshot,
                    dispatchHostEvent: (eventName, detail, invokedAction) => {
                        current.onHostEvent?.(eventName, detail, invokedAction);
                    },
                    ...(current.evaluateActionPrecondition
                        ? { evaluatePrecondition: current.evaluateActionPrecondition }
                        : {}),
                    ...(current.evaluateActionEffectExpression
                        ? { evaluateEffectExpression: current.evaluateActionEffectExpression }
                        : {}),
                    ...(current.dispatchActionEffect
                        ? { dispatchEffect: current.dispatchActionEffect }
                        : {}),
                    ...(current.resolveActionIdempotencyKey
                        ? { resolveIdempotencyKey: current.resolveActionIdempotencyKey }
                        : {}),
                };

                const finish = (result: ResponseActionInvocationResult<SubmitResult>) => {
                    if (ticket) {
                        activeTickets.delete(ticket);
                    }
                    if (context.isCurrent()) {
                        current.feedbackStore?.settle(ticket, result.status);
                        if (ticket) {
                            settledTicket = ticket;
                        }
                    }
                    current.onActionResult?.(result);
                    if (result.finding) {
                        current.onActionFinding?.(result.finding);
                    }
                    return result;
                };

                try {
                    if (current.responseActionInvoker && invokedDoc) {
                        const syncPorts: ResponseActionInvocationPorts<SubmitResult> = {
                            submit: captureAutosaveSnapshot,
                            dispatchHostEvent: (eventName, detail, invokedAction) => {
                                current.onHostEvent?.(eventName, detail, invokedAction);
                            },
                            ...(current.evaluateActionPrecondition
                                ? { evaluatePrecondition: current.evaluateActionPrecondition }
                                : {}),
                            ...(current.evaluateActionEffectExpression
                                ? { evaluateEffectExpression: current.evaluateActionEffectExpression }
                                : {}),
                            ...(current.dispatchActionEffect
                                ? { dispatchEffect: current.dispatchActionEffect }
                                : {}),
                            ...(current.resolveActionIdempotencyKey
                                ? { resolveIdempotencyKey: current.resolveActionIdempotencyKey }
                                : {}),
                        };
                        const raw = await current.responseActionInvoker({
                            document: invokedDoc as ResponseActionsDocument,
                            actionRef: action.id,
                            ports: syncPorts,
                        });
                        return finish('invocation' in raw ? raw.invocation : raw);
                    }
                    return finish(await invokeResponseActionAsync(invokedDoc, action.id, ports));
                } catch (error) {
                    return finish({
                        status: 'failed',
                        resolution: resolveResponseAction(invokedDoc, action.id),
                        validationTuple: null,
                        detail: null,
                        effectTrace: [],
                        failureReason: error instanceof Error ? error.message : String(error),
                    });
                }
            },
        });
        controllerRef.current = controller;
        return () => {
            if (controllerRef.current === controller) {
                controllerRef.current = null;
            }
            cancelActiveTickets();
            cancelSettledTicket();
            controller.dispose();
        };
    }, [engine, draftSaveFeedback]);

    useEffect(() => {
        if (draftSaveFeedback === 'external' || !engine) {
            return;
        }
        controllerRef.current?.setDocument(responseActionsDocument);
    }, [engine, draftSaveFeedback, responseActionsDocument]);

    return null;
}

/** See `themeScopeRef` — the scope element must not generate a box. */
const THEME_SCOPE_STYLE: React.CSSProperties = { display: 'contents' };

/** Access the FormspecContext. Throws if used outside FormspecProvider. */
export function useFormspecContext(): FormspecContextValue {
    const ctx = useContext(FormspecContext);
    if (!ctx) throw new Error('useFormspecContext must be used within a FormspecProvider');
    return ctx;
}

/** Detect the largest matching breakpoint from merged Theme + Component breakpoints (mobile-first). */
function detectBreakpoint(
    themeBreakpoints?: Record<string, number | string | { minWidth?: number }> | null,
    componentBreakpoints?: Record<string, number | string | { minWidth?: number }> | null,
): string | null {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    return matchBreakpoint(
        themeBreakpoints,
        componentBreakpoints,
        (minWidth) => window.matchMedia(`(min-width: ${minWidth}px)`).matches,
    );
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
