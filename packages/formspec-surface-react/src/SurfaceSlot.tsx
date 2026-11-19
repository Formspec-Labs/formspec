import { NativeScreenerSlot } from './screener-completion.js';
import type { AdvanceTransition } from './SurfaceApp.js';
import type { NativeScreenerSlotProps, SurfaceScreenerCompletionPolicy } from './screener-completion.js';
/**
 * @filedesc `SurfaceSlot` — one planned slot, rendered — and `SurfaceSlotFrame`,
 * the ONE place a slot's own title becomes a heading.
 *
 * The dispatch already happened: `@formspec-org/surface`'s `planRoute` turned a
 * `slotType` into a typed `SlotPlan`, exhaustively and without React in scope.
 * This file binds each plan variant to elements and nothing else, which is why
 * a second renderer (web component, server-side) needs a file this size rather
 * than a re-implementation of the taxonomy.
 *
 * ## Why the frame is a component and not two inline expressions
 *
 * `surface-shell-spec.md` §8.3 item 10: "Where a decision — whether to render a
 * slot's own title, which level a title takes — is made in more than one code
 * path, those paths MUST agree; divergent duplicates of the same rule are how a
 * fixed defect reappears one nesting level down." It did: the top-level path
 * suppressed a slot title only for `kind: heading`, and the embed path
 * suppressed it for **all** `static-content` kinds, throwing away the authored
 * title of every `text`, `image` and `divider` slot inside an embed — the exact
 * bug the top-level path had already been fixed to remove. The embed path also
 * rendered the title at the HOST slot's base rather than the child's, so an
 * embedded title sat at the same rank as its host while its content sat one
 * deeper. {@link SurfaceSlotFrame} is both paths now.
 */
import { currentEffectDataSourcePorts } from './data-source-effect.js';
import { selectDataSourceRevisions, type DataSourceRevisionSelector } from './data-source-revision.js';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createFormEngine,
  createMappingEngine,
  initFormspecEngineTools,
  isFormspecEngineToolsInitialized,
  preactReactiveRuntime,
  resolveResponseActionValidationTuple,
  responseSubjectId,
  type ActionRefFinding,
  type FormEngineOptions,
  type IFormEngine,
} from '@formspec-org/engine';
import { FormspecForm } from '@formspec-org/react';
import type {
  ResponseAction,
  ResponseActionInvocationResult,
  ResponseActionsDocument as ReactResponseActionsDocument,
  SemanticArtifactIdentity,
  SemanticControlRegistry,
  SemanticControlScope,
  SemanticResponseBinding,
  SubmitResult,
} from '@formspec-org/react';
import {
  resolveFieldReferences,
  targetDefinitionMatches,
  type FormDefinition,
  type ComponentDocument,
  type LocaleDocument,
  type OntologyDocument,
  type ReferencesDocument,
  type ResponseActionsDocument as GeneratedResponseActionsDocument,
} from '@formspec-org/types';
import {
  canonicalFiniteJson,
  loadWidgetDataInputs,
  loadDefinitionFormInitialData,
  plannedDefinitionFormActionRefs,
  responseActionsDocumentForDefinition,
  surfaceDiagnostic,
  type DataSourceAuthorizer,
  type DataSourceLoader,
  type DataSourceSelectionEvidence,
  type DataSourcePayloadValidator,
  type DefinitionFormInitialDataDelivery,
  type DefinitionFormInitialDataPlan,
  type PlannedTransition,
  type SlotPlan,
  type StaticContentPlan,
  type SurfaceDiagnostic,
  type SurfaceSemanticOutputPublisherScope,
  type SurfaceSemanticOutputScope,
  type SurfaceStrings,
  type ThemeGrant,
  type WidgetDataDelivery,
} from '@formspec-org/surface';
import { DraftStart } from './DraftStart.js';
import { DraftDefinitionForm } from './DraftDefinitionForm.js';
import { isPlainLinkClick } from './browser-location.js';
import type { DraftSession } from './draft-session.js';
import { loadDraftReviewInputs, type DraftReviewDelivery, type DraftReviewReadyDelivery } from './draft-review.js';
import type { DraftActionInvoker, DraftWriter } from './draft-writer.js';
import { Heading, nextLevel } from './heading.js';
import { FilingStatus, type FilingStatusViewContext } from './FilingStatus.js';
import type {
  SurfaceWidget,
  SurfaceWidgetActionExecutor,
  SurfaceWidgetActionDetail,
  SurfaceWidgetActionEmission,
  SurfaceWidgetActionOutcomeStore,
  SurfaceWidgetActionInput,
  SurfaceWidgetActionReport,
  SurfaceWidgetResponseContext,
  SurfaceWidgetRouteContext,
} from './widget-api.js';
import { routeIdentity } from './widget-api.js';
import {
  allocateWidgetActionInvocationId,
  admitSurfaceWidgetActionInput,
  createWidgetActionCoordinator,
  responseActionsDocumentForAction,
  snapshotWidgetResponseContext,
  normalizeWidgetActionResult,
  type WidgetActionCoordinator,
} from './widget-action-runtime.js';
import { WidgetEmptyState } from './widgets/empty-state.js';
import {
  ModuleWidgetStateView,
  widgetDataMatchesEmptyWhen,
  type ModuleWidgetStateName,
} from './widget-state.js';
import { needIdTraceAttributes, needTraceAttributes } from './need-trace.js';
import {
  surfaceSemanticOutputSubjectRef,
  useSurfaceSemanticOutputs,
} from './semantic-output.js';

export type ResolvedDefinitionFormPlan = Extract<
  SlotPlan<SurfaceWidget>,
  { slotType: 'definition-form' }
> & {
  status: 'ready';
  definition: NonNullable<
    Extract<SlotPlan<SurfaceWidget>, { slotType: 'definition-form' }>['definition']
  >;
};

export type SurfaceSaveNotice = 'saved' | 'savedLocally' | 'saveFailed' | 'draftConflict' | 'draftLoaded';

export interface SurfaceFormSession {
  appearance: 'light' | 'dark';
  previewScope: string | undefined;
  drafts?: DraftSession | undefined;
  draftRevision?: number | undefined;
  reportSave: (notice: SurfaceSaveNotice) => void;
  workspace?: {
    slot: string | undefined;
    activeSection: string | undefined;
    focusField?: string | undefined;
    hrefForSection: (slot: string, section: string) => string | undefined;
    onActiveSectionChange: (slot: string, section: string) => void;
    reportSectionTitle?: ((slot: string, title: string | undefined) => void) | undefined;
  } | undefined;
}

export interface SurfaceDefinitionFormRenderInput {
  plan: ResolvedDefinitionFormPlan;
  grant: ThemeGrant;
  route: SurfaceWidgetRouteContext;
  /** Resolved shell strings for the active locale. */
  strings: SurfaceStrings;
  /** The filing-unit type and typed keys, with the ID derived by Core. */
  responseSubject?: FormEngineOptions['responseSubject'];
  responseActionsDocument: ReactResponseActionsDocument | undefined;
  referencesDocuments: readonly ReferencesDocument[];
  ontologyDocuments: readonly OntologyDocument[];
  /** Host-admitted Component from resolveDefinitionComponent for this Definition and route/slot. */
  componentDocument?: ComponentDocument | undefined;
  /** Host-admitted Locale documents; only matching Definition targets apply. */
  localeDocuments?: readonly LocaleDocument[] | undefined;
  activeLocale?: string | undefined;
  appearance?: 'light' | 'dark' | undefined;
  /** Exact local draft scope when the browser app is previewing an edition. */
  previewScope?: string | undefined;
  draftSession?: DraftSession | undefined;
  /** A new form still needs its authored seed. An existing draft has its own data. */
  draftSeed?: 'loading' | 'unavailable' | undefined;
  draftStrings?: SurfaceStrings | undefined;
  /** Report committed saves and failed writes to the single shell live region. */
  reportSave?: ((notice: SurfaceSaveNotice) => void) | undefined;
  activeSection?: string | undefined;
  focusField?: string | undefined;
  sectionNavigationActive?: boolean | undefined;
  hrefForSection?: ((section: string) => string | undefined) | undefined;
  onActiveSectionChange?: ((section: string) => void) | undefined;
  onSectionTitleChange?: ((title: string | undefined) => void) | undefined;
  /**
   * Data Source payload admitted before mount. Record identity, route/session
   * generation, and owner revision remain separate from Definition field data.
   */
  initialData?: SurfaceDefinitionFormInitialData | undefined;
  /** Exact runtime identity for generic semantic-control lookup, when admitted. */
  semanticControlScope?: SemanticControlScope | undefined;
  /** Receives every terminal from the mounted Definition Action control. */
  onDefinitionActionResult?:
    | ((result: ResponseActionInvocationResult<SubmitResult>) => void)
    | undefined;
  /** Receives Response Actions resolution/invocation findings from the mounted Definition form or draft writer. */
  onActionFinding?: ((finding: ActionRefFinding) => void) | undefined;
  /**
   * Optional host executor for the selected Definition-scoped document. The
   * renderer still owns action resolution and submission; this port lets a
   * generic async Response Actions runtime perform declared durable effects.
   */
  responseActionInvoker?: DraftActionInvoker | undefined;
  /** Preserve the shell's completed-action navigation boundary. */
  onActionCompleted?:
    | ((
        action: ResponseAction,
        result: ResponseActionInvocationResult<SubmitResult>,
      ) => void)
    | undefined;
}

export interface SurfaceDefinitionFormInitialData {
  data?: Readonly<Record<string, unknown>> | undefined;
  selection?: DataSourceSelectionEvidence | undefined;
  freshness: 'fresh' | 'stale';
  recordId?: string | undefined;
  generation?: string | number | undefined;
  revision?: string | number | undefined;
}

export type SurfaceDefinitionFormRenderer = (
  input: SurfaceDefinitionFormRenderInput,
) => ReactNode;

export interface SurfaceSemanticControlScopeRequest {
  plan: ResolvedDefinitionFormPlan;
  route: SurfaceWidgetRouteContext;
  responseActionsDocument: ReactResponseActionsDocument | undefined;
  runtimeGeneration: string | undefined;
}

/**
 * Host pairing for artifact digests and Response identity. The Surface shell
 * passes exact loaded objects and invents none of these facts.
 */
export type SurfaceSemanticControlScopeResolver = (
  request: SurfaceSemanticControlScopeRequest,
) => SemanticControlScope | undefined;

export interface SurfaceSemanticControlPairing {
  registry: SemanticControlRegistry;
  /** Exact loaded object identity to caller-computed canonical artifact facts. */
  definitionArtifacts: ReadonlyMap<FormDefinition, SemanticArtifactIdentity>;
  /** Exact loaded object identity to caller-computed canonical artifact facts. */
  responseActionsArtifacts: ReadonlyMap<
    ReactResponseActionsDocument,
    SemanticArtifactIdentity
  >;
  renderInstanceIdFor(
    request: SurfaceSemanticControlScopeRequest,
  ): string | undefined;
  responseBindingFor(
    request: SurfaceSemanticControlScopeRequest,
  ): SemanticResponseBinding | undefined;
}

/**
 * Build a fail-closed resolver from caller-paired object identities.
 * Canonicalization and digest computation stay outside the Surface renderer.
 */
export function createSurfaceSemanticControlScopeResolver(
  pairing: SurfaceSemanticControlPairing,
): SurfaceSemanticControlScopeResolver {
  return (request) => {
    const definitionArtifact = pairing.definitionArtifacts.get(
      request.plan.definition,
    );
    const responseActionsArtifact = request.responseActionsDocument
      ? pairing.responseActionsArtifacts.get(request.responseActionsDocument)
      : undefined;
    const renderInstanceId = pairing.renderInstanceIdFor(request);
    const responseBinding = pairing.responseBindingFor(request);
    if (
      !definitionArtifact
      || !renderInstanceId
      || !responseBinding
      || (request.responseActionsDocument && !responseActionsArtifact)
    ) {
      return undefined;
    }
    return {
      registry: pairing.registry,
      renderInstanceId,
      definitionArtifact,
      ...(responseActionsArtifact ? { responseActionsArtifact } : {}),
      responseId: responseBinding.responseId,
      initialResponseRevision: responseBinding.responseRevision,
    };
  };
}

export interface SurfaceSlotProps {
  filingStatus?: FilingStatusViewContext | undefined;
  formSession?: SurfaceFormSession | undefined;
  activeSection?: string | undefined;
  focusField?: string | undefined;
  sectionNavigationActive?: boolean | undefined;
  localeDocuments?: readonly LocaleDocument[] | undefined;
  activeLocale?: string | undefined;
  screenerCompletion?: SurfaceScreenerCompletionPolicy | undefined;
  screenerInstanceId?: string | undefined;
  /** Pure destination check; required before host-required completion. */
  checkScreenerTarget?: ((target: string) => { status: 'accepted' } | { status: 'refused'; reason: string }) | undefined;
  onScreenerTarget?: NativeScreenerSlotProps['navigate'];
  plan: SlotPlan<SurfaceWidget>;
  grant: ThemeGrant;
  route: SurfaceWidgetRouteContext;
  /** The shell's own person-facing strings, host-overridable (§3.0). */
  strings: SurfaceStrings;
  dataSourceLoader?: DataSourceLoader | undefined;
  /** Pure per-source scheduling hints; evaluated on host renders, never authority. */
  dataSourceRevision?: DataSourceRevisionSelector | undefined;
  authorizeDataSource?: DataSourceAuthorizer | undefined;
  validateDataSourcePayload?: DataSourcePayloadValidator | undefined;
  /** Shows the design rationale on `experience-unit` slots. Off for respondents. */
  showExperienceNeeds?: boolean | undefined;
  /**
   * The bundle's Response Actions document.
   *
   * `FormspecForm` injects a submit control ONLY when this publishes an Action
   * with `submit` intent — response-actions-spec §10 forbids implicit default
   * Actions, so a renderer that invented one would be wrong. Passing it is what
   * makes a form-bearing route able to fire its own transition.
   */
  responseActionsDocuments?: readonly GeneratedResponseActionsDocument[] | undefined;
  /** Manifested References documents; the default form shows human/both entries only. */
  referencesDocuments?: readonly ReferencesDocument[] | undefined;
  /** Manifested Ontology documents used for field semantics without exposing raw ids. */
  ontologyDocuments?: readonly OntologyDocument[] | undefined;
  transitions?: readonly PlannedTransition[] | undefined;
  widgetActionExecutor?: SurfaceWidgetActionExecutor | undefined;
  widgetActionOutcomeStore?: SurfaceWidgetActionOutcomeStore | undefined;
  widgetActionCoordinator?: WidgetActionCoordinator | undefined;
  /** Route + opaque session generation; late action completions cannot navigate across it. */
  runtimeGeneration?: string | undefined;
  onWidgetActionReport?: ((report: SurfaceWidgetActionReport) => void) | undefined;
  onRuntimeDiagnosticsChange?:
    | ((scope: string, diagnostics: readonly SurfaceDiagnostic[]) => void)
    | undefined;
  embedSlotPrefix?: string | undefined;
  onSlotFormEngineChange?:
    | ((slotKey: string, engine: IFormEngine | undefined) => void)
    | undefined;
  onSlotVisibilityChange?:
    | ((slotKey: string, nextRefs: ReadonlySet<string> | undefined, baselineKey: string) => void)
    | undefined;
  renderDefinitionForm?: SurfaceDefinitionFormRenderer | undefined;
  definitionActionInvoker?: DraftActionInvoker | undefined;
  resolveSemanticControlScope?: SurfaceSemanticControlScopeResolver | undefined;
  /** Exact caller-paired identity used only by renderers that publish output. */
  semanticOutputScope?: SurfaceSemanticOutputScope | undefined;
  onDefinitionActionResult?:
    | ((result: ResponseActionInvocationResult<SubmitResult>) => void)
    | undefined;
  /** A published Action completed under its resolved validation policy. */
  onActionCompleted?:
    | ((
        action: ResponseAction,
        result: ResponseActionInvocationResult<SubmitResult>,
      ) => void)
    | undefined;
  onAdvance?: AdvanceTransition | undefined;
}

/** Successful Response actions follow their resolved Validation Modes policy. */
function completedResponseAction<T>(
  result: ResponseActionInvocationResult<T>,
): ResponseAction | undefined {
  if (result.status !== 'completed') return undefined;
  if (!result.resolution.resolved || !result.resolution.action) return undefined;
  if (result.detail === null || result.detail === undefined) return undefined;
  const action = result.resolution.action;
  let tuple;
  try {
    tuple = resolveResponseActionValidationTuple(action);
  } catch {
    return undefined;
  }
  const actual = result.validationTuple;
  if (!actual || actual.profile !== tuple.profile || actual.blocking !== tuple.blocking
    || actual.persistence !== tuple.persistence) return undefined;
  const report = (result.detail as { validationReport?: { valid?: unknown } }).validationReport;
  if (tuple.profile !== 'off' && typeof report?.valid !== 'boolean') return undefined;
  if ((tuple.persistence === 'complete-response' || tuple.blocking === 'block-on-error')
    && report?.valid !== true) return undefined;
  return action;
}

/** The completed action whose declared policy permits route advancement. */
export function completedFormAction(
  result: ResponseActionInvocationResult<SubmitResult>,
): ResponseAction | undefined {
  return completedResponseAction(result);
}

/** App actions need no Response; Response actions follow their resolved policy. */
export function completedWidgetAction(
  result: ResponseActionInvocationResult<SurfaceWidgetActionDetail>,
  document: GeneratedResponseActionsDocument,
): ResponseAction | undefined {
  if (document.scope === 'app') {
    if (result.status !== 'completed') return undefined;
    return result.resolution.resolved
      ? result.resolution.action ?? undefined
      : undefined;
  }
  return completedResponseAction(result);
}

type WidgetTransitionBindingMerge =
  | Readonly<{
      status: 'ready';
      transitionBindings?: Readonly<Record<string, string>> | undefined;
    }>
  | Readonly<{
      status: 'conflict';
      bindingName: string;
    }>;

/**
 * Build the private navigation handoff for one completed app-widget action.
 *
 * The input has already crossed {@link admitSurfaceWidgetActionInput}, so it is
 * a detached frozen JSON object. Only its own top-level non-empty strings can
 * become candidates. Nested values, arbitrary executor detail, and response
 * bodies are absent from this function's inputs and therefore cannot enter the
 * route parameter handoff.
 */
function mergeAppWidgetTransitionBindings(
  document: GeneratedResponseActionsDocument,
  input: SurfaceWidgetActionInput | undefined,
  serviceBindings: Readonly<Record<string, string>> | undefined,
): WidgetTransitionBindingMerge {
  const merged: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [name, value] of Object.entries(serviceBindings ?? {})) {
    merged[name] = value;
  }

  if (document.scope === 'app' && input && Object.isFrozen(input)) {
    for (const [name, value] of Object.entries(input)) {
      if (typeof value !== 'string' || value.length === 0) continue;
      if (
        Object.prototype.hasOwnProperty.call(merged, name)
        && merged[name] !== value
      ) {
        return { status: 'conflict', bindingName: name };
      }
      merged[name] = value;
    }
  }

  return Object.keys(merged).length === 0
    ? { status: 'ready' }
    : { status: 'ready', transitionBindings: Object.freeze(merged) };
}

/**
 * True when the slot's own binding already produces the heading for its
 * content, so a slot-level title on top of it would be two headings for one
 * piece of content.
 *
 * Every other slot type — INCLUDING a `text`, `image` or `divider` static slot
 * — keeps its authored title. Dropping it for the whole slot type silently
 * threw away authored content: the spike bundle's `applyReassurance` slot is
 * `kind: text` titled "Before you start", and the title vanished.
 */
export function rendersOwnHeading(plan: SlotPlan<SurfaceWidget>): boolean {
  return plan.slotType === 'static-content' && plan.content?.kind === 'heading';
}

/**
 * The wrapper every slot renders inside, at every nesting depth: the element,
 * the data attributes a probe reads, and the slot's own title at **the plan's**
 * heading level.
 *
 * `aria-label` is set only when the slot carries an authored title. Labelling a
 * region with a slot id turns machine vocabulary into something a screen reader
 * announces, and a `<section>` with no accessible name is inert rather than a
 * landmark — which is the honest shape for a slot the author did not name.
 */
export function SurfaceSlotFrame(props: SurfaceSlotProps) {
  const { plan, showExperienceNeeds = false } = props;
  if (plan.slotType === 'experience-unit' && !showExperienceNeeds) {
    return null;
  }
  const showsAuthoredTitle =
    plan.title !== undefined &&
    (plan.slotType !== 'experience-unit' || showExperienceNeeds);
  return (
    <section
      className="fs-surface-slot"
      data-slot={plan.slotId}
      data-slot-type={plan.slotType}
      {...needTraceAttributes(plan.needAnchors)}
      {...(showsAuthoredTitle ? { 'aria-label': plan.title } : {})}
    >
      {showsAuthoredTitle && !rendersOwnHeading(plan) && (
        <Heading level={plan.headingBaseLevel} className="fs-surface-slot__title">
          {plan.title}
        </Heading>
      )}
      <SurfaceSlot {...props} />
    </section>
  );
}

export function SurfaceSlot({
  plan,
  filingStatus,
  grant,
  route,
  strings,
  dataSourceLoader,
  dataSourceRevision,
  authorizeDataSource,
  validateDataSourcePayload,
  showExperienceNeeds = false,
  responseActionsDocuments,
  referencesDocuments,
  ontologyDocuments,
  transitions,
  widgetActionExecutor,
  widgetActionOutcomeStore,
  widgetActionCoordinator,
  runtimeGeneration,
  onWidgetActionReport,
  onRuntimeDiagnosticsChange,
  embedSlotPrefix,
  onSlotFormEngineChange,
  onSlotVisibilityChange,
  renderDefinitionForm,
  definitionActionInvoker,
  resolveSemanticControlScope,
  semanticOutputScope,
  onDefinitionActionResult,
  onActionCompleted,
  onAdvance,
  onScreenerTarget,
  checkScreenerTarget,
  screenerInstanceId,
  screenerCompletion,
  localeDocuments,
  activeLocale,
  formSession,
  activeSection,
  focusField,
  sectionNavigationActive,
}: SurfaceSlotProps): ReactNode {
  const reportSectionTitle = formSession?.workspace?.reportSectionTitle;
  const onSectionTitleChange = useCallback((title: string | undefined) => {
    reportSectionTitle?.(plan.slotId, title);
  }, [reportSectionTitle, plan.slotId]);
  const subjectPrefix = surfaceSemanticOutputSubjectRef(
    route.routeId,
    plan.slotId,
  );
  const slotSemanticOutputScope:
    | SurfaceSemanticOutputPublisherScope
    | undefined =
    semanticOutputScope && subjectPrefix
      ? { ...semanticOutputScope, subjectPrefix }
      : undefined;

  switch (plan.slotType) {
    case 'draft-start': {
      const start = plan.start;
      const session = formSession?.drafts;
      const navigate = filingStatus?.navigate;
      if (!start || !session?.port.start || !navigate) return <UnavailableSlot>{strings('draftUnavailable')}</UnavailableSlot>;
      const identity = JSON.stringify([runtimeGeneration, route.routeId, plan.slotId, start.destination.routeId,
        start.slotId, start.definitionUrl, start.definitionVersion, start.params, start.subject, session.scope]);
      return <DraftStart key={identity} plan={start} session={session} navigate={navigate} strings={strings} />;
    }
    case 'filing-status':
      return <FilingStatus plan={plan.tracker} context={filingStatus}
        level={plan.title === undefined ? plan.headingBaseLevel : nextLevel(plan.headingBaseLevel)} text={strings} />;
    case 'screener': {
      if (plan.status !== 'ready' || !plan.screener) return <UnavailableSlot>{plan.reason ?? 'screener-unavailable'}</UnavailableSlot>;
      return <NativeScreenerSlot key={`${screenerInstanceId ?? runtimeGeneration ?? ''}/${plan.screener.ref.url}/${plan.screener.ref.version}`}
        document={plan.screener.document} screenerRef={{url: plan.screener.ref.url, version: plan.screener.document.version}} allowedTargets={plan.allowedTargets}
        route={route} slotId={plan.slotId} runtimeGeneration={runtimeGeneration} visitId={screenerInstanceId}
        policy={screenerCompletion} localeDocuments={localeDocuments} activeLocale={activeLocale} appearance={formSession?.appearance}
        checkTarget={checkScreenerTarget} navigate={onScreenerTarget} />;
    }
    case 'definition-form': {
      if (plan.status === 'unresolved' || plan.definition === undefined) {
        return <UnavailableSlot>{strings('slotUnavailableDefinitionForm')}</UnavailableSlot>;
      }
      // Form state belongs to the resolved filing unit, even on the same route and slot.
      const subjectKey = plan.subject && canonicalFiniteJson({
        type: plan.subject.type,
        keys: plan.subject.keys,
      });
      // This annotation is the compile-time cross-package contract: the
      // generated schema document must pass directly into React's engine seam.
      const responseActionsDocument: ReactResponseActionsDocument | undefined =
        responseActionsDocumentForDefinition(
        responseActionsDocuments ?? [],
        plan.definitionRef,
      );
      // `themeDocument` comes from the route's grant and never from the bundle
      // directly. On a refusing route that object was built from the platform
      // token registry and never saw a tenant token — which is what makes the
      // boundary structural rather than a styling choice.
      const workspace = formSession?.workspace;
      const renderInput: SurfaceDefinitionFormRenderInput = {
        plan: {
          ...plan,
          status: 'ready',
          definition: plan.definition,
        },
        grant,
        route,
        strings,
        responseActionsDocument,
        componentDocument: plan.componentDocument,
        referencesDocuments: referencesDocuments ?? [],
        ontologyDocuments: ontologyDocuments ?? [],
        onDefinitionActionResult,
        onActionCompleted,
        responseActionInvoker: definitionActionInvoker,
        localeDocuments,
        activeLocale,
        onSectionTitleChange,
        ...(sectionNavigationActive && workspace && {
          activeSection,
          ...(focusField !== undefined && { focusField }),
        }),
        ...(formSession && {
          appearance: formSession.appearance,
          previewScope: formSession.previewScope,
          draftSession: formSession.drafts,
          draftStrings: strings,
          reportSave: formSession.reportSave,
        }),
        ...(workspace && {
          sectionNavigationActive,
          hrefForSection: section => workspace.hrefForSection(plan.slotId, section),
          onActiveSectionChange: section => workspace.onActiveSectionChange(plan.slotId, section),
        }),
      };
      const semanticControlScope = resolveSemanticControlScope?.({
        plan: renderInput.plan,
        route,
        responseActionsDocument,
        runtimeGeneration,
      });
      if (semanticControlScope) {
        renderInput.semanticControlScope = semanticControlScope;
      }
      const slotKey = embedSlotPrefix ? `${embedSlotPrefix}/${plan.slotId}` : plan.slotId;
      const effectiveGeneration = runtimeGeneration ?? `${route.surfaceId}/${route.routeId}`;
      if (plan.initialData && plan.initialData.status !== 'ready') {
        if (!renderInput.draftSession) return <UnavailableSlot>{strings('slotUnavailableWidgetData')}</UnavailableSlot>;
        return <DefinitionFormSlot
          key={subjectKey}
          input={{ ...renderInput, draftSeed: 'unavailable' }}
          slotKey={slotKey}
          runtimeGeneration={effectiveGeneration}
          onRuntimeDiagnosticsChange={onRuntimeDiagnosticsChange}
          onSlotFormEngineChange={onSlotFormEngineChange}
          onSlotVisibilityChange={onSlotVisibilityChange}
          renderDefinitionForm={renderDefinitionForm}
          semanticOutputScope={slotSemanticOutputScope}
        />;
      }
      if (plan.initialData?.status === 'ready') {
        return (
          <DefinitionFormDataSlot
            key={subjectKey}
            input={renderInput}
            slotKey={slotKey}
            initialDataPlan={plan.initialData}
            dataSourceLoader={dataSourceLoader}
            dataSourceRevision={dataSourceRevision}
            authorizeDataSource={authorizeDataSource}
            validateDataSourcePayload={validateDataSourcePayload}
            runtimeGeneration={effectiveGeneration}
            onRuntimeDiagnosticsChange={onRuntimeDiagnosticsChange}
            onSlotFormEngineChange={onSlotFormEngineChange}
            onSlotVisibilityChange={onSlotVisibilityChange}
            renderDefinitionForm={renderDefinitionForm}
            semanticOutputScope={slotSemanticOutputScope}
          />
        );
      }
      return (
        <DefinitionFormSlot
          key={subjectKey}
          input={renderInput}
          slotKey={slotKey}
          runtimeGeneration={effectiveGeneration}
          onRuntimeDiagnosticsChange={onRuntimeDiagnosticsChange}
          onSlotFormEngineChange={onSlotFormEngineChange}
          onSlotVisibilityChange={onSlotVisibilityChange}
          renderDefinitionForm={renderDefinitionForm}
          semanticOutputScope={slotSemanticOutputScope}
        />
      );
    }

    case 'experience-unit': {
      const { unit } = plan;
      if (unit.status === 'unresolved') {
        return <UnavailableSlot>{strings('slotUnavailableExperienceUnit')}</UnavailableSlot>;
      }
      return (
        <div
          className="fs-surface-unit"
          data-experience-unit={unit.unitRef}
          {...needIdTraceAttributes(unit.needs.map((need) => need.id))}
        >
          {showExperienceNeeds && unit.title && (
            <Heading level={plan.headingBaseLevel} className="fs-surface-unit__title">
              {unit.title}
            </Heading>
          )}
          {/*
            `needRefs[].description` is design rationale ABOUT the respondent,
            not copy FOR them — "this is the screen someone would want to leave
            and come back to". Off by default; an authoring or review surface
            turns it on.
          */}
          {showExperienceNeeds && unit.needs.length > 0 && (
            <ul className="fs-surface-unit__needs" data-probe="experience-needs">
              {unit.needs.map((need) => (
                <li key={need.id}>{need.description ?? need.id}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    case 'module-widget': {
      const { resolution, key } = plan;
      if (resolution.status !== 'resolved') {
        return (
          <UnavailableSlot>
            {strings(
              resolution.status === 'unimplemented'
                ? 'slotUnavailableWidgetUnimplemented'
                : resolution.status === 'incompatible'
                  ? 'slotUnavailableWidgetIncompatible'
                : 'slotUnavailableWidgetUndeclared',
              { widgetName: key.widgetName, moduleId: key.moduleId },
            )}
          </UnavailableSlot>
        );
      }
      // A resolved-but-undeclared widget still renders — the host supplied a
      // component. `WIDGET-UNDECLARED` is already in the plan's diagnostics
      // (§3.3): a shell MAY render it, and MUST say it did.
      return (
        <SurfaceWidgetSlot
          plan={plan}
          grant={grant}
          route={route}
          strings={strings}
          dataSourceLoader={dataSourceLoader}
          draftSession={plan.draftReview ? formSession?.drafts : undefined}
          filingStatus={plan.draftReview ? filingStatus : undefined}
          reportSave={plan.draftReview ? formSession?.reportSave : undefined}
          localeDocuments={plan.draftReview ? localeDocuments : undefined}
          activeLocale={plan.draftReview ? activeLocale : undefined}
          dataSourceRevision={dataSourceRevision}
          authorizeDataSource={authorizeDataSource}
          validateDataSourcePayload={validateDataSourcePayload}
          responseActionsDocuments={responseActionsDocuments ?? []}
          transitions={transitions ?? []}
          widgetActionExecutor={widgetActionExecutor}
          widgetActionOutcomeStore={widgetActionOutcomeStore}
          widgetActionCoordinator={widgetActionCoordinator}
          runtimeGeneration={runtimeGeneration ?? `${route.surfaceId}/${route.routeId}`}
          onWidgetActionReport={onWidgetActionReport}
          onRuntimeDiagnosticsChange={onRuntimeDiagnosticsChange}
          onAdvance={onAdvance}
          semanticOutputScope={slotSemanticOutputScope}
        />
      );
    }

    case 'static-content': {
      const { content } = plan;
      if (content === undefined) {
        return <UnavailableSlot>{strings('slotUnavailableStaticContent')}</UnavailableSlot>;
      }
      return (
        <SurfaceStaticContent
          content={content}
          needAnchors={plan.contentNeedAnchors}
          routeId={route.routeId}
          slotId={plan.slotId}
          semanticOutputScope={slotSemanticOutputScope}
        />
      );
    }

    case 'embed-route': {
      if (plan.status !== 'ready') {
        return (
          <UnavailableSlot>
            {strings(
              plan.status === 'cycle'
                ? 'slotUnavailableEmbedCycle'
                : 'slotUnavailableEmbedUnresolved',
            )}
          </UnavailableSlot>
        );
      }
      // Embedded content paints on the HOST route's surface, so it renders under
      // the host's grant — an embedded route cannot restore branding the host
      // refuses. Headings step down a level, which `planRoute` already decided;
      // this renders the level it was handed and re-derives nothing.
      return (
        <div className="fs-surface-embed" data-embed-route={plan.routeRef} data-embed-mode={plan.mode}>
          {plan.slots.map((child) => (
            <SurfaceSlotFrame
              key={child.slotId}
              plan={child}
              filingStatus={filingStatus}
              grant={grant}
              route={route}
              strings={strings}
              dataSourceLoader={dataSourceLoader}
              dataSourceRevision={dataSourceRevision}
              authorizeDataSource={authorizeDataSource}
              validateDataSourcePayload={validateDataSourcePayload}
              showExperienceNeeds={showExperienceNeeds}
              responseActionsDocuments={responseActionsDocuments}
              referencesDocuments={referencesDocuments}
              ontologyDocuments={ontologyDocuments}
              transitions={transitions}
              widgetActionExecutor={widgetActionExecutor}
              widgetActionOutcomeStore={widgetActionOutcomeStore}
              widgetActionCoordinator={widgetActionCoordinator}
              runtimeGeneration={runtimeGeneration}
              onWidgetActionReport={onWidgetActionReport}
              onRuntimeDiagnosticsChange={onRuntimeDiagnosticsChange}
              embedSlotPrefix={embedSlotPrefix ? `${embedSlotPrefix}/${plan.slotId}` : plan.slotId}
              onSlotFormEngineChange={onSlotFormEngineChange}
              onSlotVisibilityChange={onSlotVisibilityChange}
              renderDefinitionForm={renderDefinitionForm}
              resolveSemanticControlScope={resolveSemanticControlScope}
              semanticOutputScope={semanticOutputScope}
              onDefinitionActionResult={onDefinitionActionResult}
              onActionCompleted={onActionCompleted}
              screenerCompletion={screenerCompletion}
              checkScreenerTarget={checkScreenerTarget}
              onScreenerTarget={onScreenerTarget}
              screenerInstanceId={screenerInstanceId}
              localeDocuments={localeDocuments}
              activeLocale={activeLocale}
              formSession={formSession && { ...formSession, workspace: undefined }}
              onAdvance={onAdvance}
            />
          ))}
        </div>
      );
    }

    case 'unknown':
      return <UnavailableSlot>{strings('slotUnavailableStaticContent')}</UnavailableSlot>;
  }
}

interface SurfaceStaticContentProps {
  content: StaticContentPlan;
  needAnchors: readonly string[] | undefined;
  routeId: string;
  slotId: string;
  semanticOutputScope: SurfaceSemanticOutputPublisherScope | undefined;
}

function SurfaceStaticContent({
  content,
  needAnchors,
  routeId,
  slotId,
  semanticOutputScope,
}: SurfaceStaticContentProps): ReactNode {
  const subjectRef = surfaceSemanticOutputSubjectRef(routeId, slotId);
  const semanticValue =
    content.kind === 'heading' || content.kind === 'text'
      ? content.content
      : content.kind === 'image'
        ? {
            src: content.src,
            alt: content.alt,
            decorative: content.decorative,
          }
        : undefined;
  useSurfaceSemanticOutputs(
    semanticOutputScope,
    subjectRef
      ? [{
          subjectRef,
          ...(semanticValue === undefined ? {} : { semanticValue }),
        }]
      : [],
  );

  switch (content.kind) {
    case 'heading':
      return (
        <Heading
          level={content.level}
          className="fs-surface-static-heading"
          {...needTraceAttributes(needAnchors)}
        >
          {content.content}
        </Heading>
      );
    case 'text':
      return (
        <p
          className="fs-surface-static-text"
          {...needTraceAttributes(needAnchors)}
        >
          {content.content}
        </p>
      );
    case 'image':
      return (
        <img
          className="fs-surface-static-image"
          src={content.src}
          alt={content.alt}
          {...needTraceAttributes(needAnchors)}
          // Empty alt is an explicit authored decorative choice in Surface
          // 0.2. Missing alt never reaches this renderer.
          {...(content.decorative ? { role: 'presentation' } : {})}
        />
      );
    case 'divider':
      // Presentational only: no accessible name, not focusable, and no
      // semantic value is invented for an authored divider.
      return (
        <hr
          className="fs-surface-static-divider"
          {...needTraceAttributes(needAnchors)}
        />
      );
  }
}

export function renderDefaultDefinitionForm(input: SurfaceDefinitionFormRenderInput): ReactNode {
  return <DefaultDefinitionFormSlot input={input} />;
}

type ReadyDefinitionFormInitialDataPlan = Extract<
  DefinitionFormInitialDataPlan,
  { status: 'ready' }
>;

type DefinitionFormDataState =
  | { status: 'loading' }
  | DefinitionFormInitialDataDelivery;

function executeDefinitionFormMapping({
  mapping,
  value,
}: {
  mapping: import('@formspec-org/types').MappingDocument;
  definition: FormDefinition;
  value: unknown;
}) {
  const result = createMappingEngine(mapping).reverse(
    value as Parameters<ReturnType<typeof createMappingEngine>['reverse']>[0],
  );
  if (result.diagnostics.length > 0) {
    const codes = result.diagnostics.map((diagnostic) => diagnostic.errorCode);
    return {
      status: 'unavailable' as const,
      reason: `Mapping DSL execution reported ${codes.join(', ')}.`,
    };
  }
  return { status: 'mapped' as const, data: result.output };
}

/**
 * Load before first mount. A later generation may refresh a clean form, but a
 * bubbled form edit permanently protects the mounted engine from late data.
 */
function DefinitionFormDataSlot({
  input,
  slotKey,
  initialDataPlan,
  dataSourceLoader,
  dataSourceRevision,
  authorizeDataSource,
  validateDataSourcePayload,
  runtimeGeneration,
  onRuntimeDiagnosticsChange,
  onSlotFormEngineChange,
  onSlotVisibilityChange,
  renderDefinitionForm,
  semanticOutputScope,
}: {
  input: SurfaceDefinitionFormRenderInput;
  slotKey: string;
  initialDataPlan: ReadyDefinitionFormInitialDataPlan;
  dataSourceLoader?: DataSourceLoader | undefined;
  /** Pure per-source scheduling hints; evaluated on host renders, never authority. */
  dataSourceRevision?: DataSourceRevisionSelector | undefined;
  authorizeDataSource?: DataSourceAuthorizer | undefined;
  validateDataSourcePayload?: DataSourcePayloadValidator | undefined;
  runtimeGeneration: string;
  onRuntimeDiagnosticsChange?:
    | ((scope: string, diagnostics: readonly SurfaceDiagnostic[]) => void)
    | undefined;
  embedSlotPrefix?: string | undefined;
  onSlotFormEngineChange?:
    | ((slotKey: string, engine: IFormEngine | undefined) => void)
    | undefined;
  onSlotVisibilityChange?:
    | ((slotKey: string, nextRefs: ReadonlySet<string> | undefined, baselineKey: string) => void)
    | undefined;
  renderDefinitionForm?: SurfaceDefinitionFormRenderer | undefined;
  semanticOutputScope: SurfaceSemanticOutputPublisherScope | undefined;
}): ReactNode {
  const { strings } = input;
  const [delivery, setDelivery] = useState<DefinitionFormDataState>({
    status: 'loading',
  });
  const dirty = useRef(false);
  const activeGeneration = useRef(runtimeGeneration);
  activeGeneration.current = runtimeGeneration;
  const diagnosticScope = `definition-form-data:${runtimeGeneration}:${input.plan.slotId}`;
  const sourceRevisions = selectDataSourceRevisions([{
    descriptor: initialDataPlan.descriptor,
    context: { surfaceId: input.route.surfaceId, surfaceRef: input.route.surfaceRef,
      routeId: input.route.routeId, slotId: input.plan.slotId,
      definitionRef: input.plan.definitionRef, params: input.route.params, subject: input.plan.subject,
      sessionGeneration: runtimeGeneration },
  }], dataSourceRevision);

  useEffect(() => {
    let current = true;
    const requestedGeneration = runtimeGeneration;
    setDelivery((previous) =>
      previous.status === 'ready' ? previous : { status: 'loading' },
    );
    onRuntimeDiagnosticsChange?.(diagnosticScope, []);

    if (sourceRevisions.failures[0]) {
      const diagnostic = surfaceDiagnostic('DEFINITION-FORM-DATA-UNAVAILABLE',
        'The host could not select an initial-data revision.',
        { surfaceId: input.route.surfaceId, routeId: input.route.routeId, slotId: input.plan.slotId },
        { catalogRef: sourceRevisions.failures[0].descriptor.catalogRef,
          sourceRef: sourceRevisions.failures[0].descriptor.sourceRef });
      onRuntimeDiagnosticsChange?.(diagnosticScope, [diagnostic]);
      setDelivery(previous => previous.status === 'ready' && dirty.current ? previous
        : { status: 'unavailable', reason: 'unavailable', diagnostics: [diagnostic] });
      return () => { current = false; onRuntimeDiagnosticsChange?.(diagnosticScope, []); };
    }

    void loadDefinitionFormInitialData({
      plan: initialDataPlan,
      definition: input.plan.definition,
      definitionRef: input.plan.definitionRef,
      context: {
        surfaceId: input.route.surfaceId,
        surfaceRef: input.route.surfaceRef,
        routeId: input.route.routeId,
        slotId: input.plan.slotId,
        definitionRef: input.plan.definitionRef,
        params: input.route.params,
        subject: input.plan.subject,
        sessionGeneration: requestedGeneration,
      },
      ...currentEffectDataSourcePorts(() => current, {
        loader: dataSourceLoader,
        authorize: authorizeDataSource,
        validatePayload: validateDataSourcePayload,
      }),
      map: executeDefinitionFormMapping,
      site: {
        surfaceId: input.route.surfaceId,
        routeId: input.route.routeId,
        slotId: input.plan.slotId,
      },
    }).then((result) => {
      if (
        !current ||
        activeGeneration.current !== requestedGeneration
      ) {
        return;
      }
      onRuntimeDiagnosticsChange?.(diagnosticScope, result.diagnostics);
      setDelivery((previous) => {
        // A delayed refresh cannot replace a form after the person edits it.
        if (previous.status === 'ready' && dirty.current) return previous;
        if (result.status === 'ready') dirty.current = false;
        return result;
      });
    });

    return () => {
      current = false;
      onRuntimeDiagnosticsChange?.(diagnosticScope, []);
    };
  }, [
    authorizeDataSource,
    dataSourceLoader,
    sourceRevisions.key,
    diagnosticScope,
    initialDataPlan,
    input.plan.definition,
    input.plan.definitionRef,
    input.plan.slotId,
    input.plan.subject,
    input.route.params,
    input.route.routeId,
    input.route.surfaceId,
    input.route.surfaceRef,
    onRuntimeDiagnosticsChange,
    runtimeGeneration,
    validateDataSourcePayload,
  ]);

  if (!input.draftSession) {
    if (delivery.status === 'loading') {
      return <DefinitionFormLoading>{strings('transitionPending')}</DefinitionFormLoading>;
    }
    if (delivery.status === 'unavailable') {
      return <UnavailableSlot>{strings('slotUnavailableWidgetData')}</UnavailableSlot>;
    }
  }

  const hydratedInput: SurfaceDefinitionFormRenderInput = delivery.status === 'ready' ? {
    ...input,
    initialData: {
      ...(delivery.data === undefined ? {} : { data: delivery.data }),
      ...(delivery.selection === undefined ? {} : { selection: delivery.selection }),
      freshness: delivery.freshness,
      ...(delivery.recordId === undefined ? {} : { recordId: delivery.recordId }),
      ...(delivery.generation === undefined ? {} : { generation: delivery.generation }),
      ...(delivery.revision === undefined ? {} : { revision: delivery.revision }),
    },
  } : { ...input, draftSeed: delivery.status };
  return (
    <div
      data-probe="definition-form-ready"
      onInputCapture={() => {
        dirty.current = true;
      }}
      onChangeCapture={() => {
        dirty.current = true;
      }}
    >
      <DefinitionFormSlot
        input={hydratedInput}
        slotKey={slotKey}
        runtimeGeneration={runtimeGeneration}
        onRuntimeDiagnosticsChange={onRuntimeDiagnosticsChange}
        onSlotFormEngineChange={onSlotFormEngineChange}
        onSlotVisibilityChange={onSlotVisibilityChange}
        renderDefinitionForm={renderDefinitionForm}
        semanticOutputScope={semanticOutputScope}
      />
    </div>
  );
}

function DefinitionFormLoading({ children }: { children: ReactNode }) {
  return (
    <p
      className="fs-surface-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-probe="definition-form-loading"
    >
      {children}
    </p>
  );
}

function DefinitionFormSlot({
  input,
  slotKey,
  runtimeGeneration,
  onRuntimeDiagnosticsChange,
  onSlotFormEngineChange,
  onSlotVisibilityChange,
  renderDefinitionForm,
  semanticOutputScope,
}: {
  input: SurfaceDefinitionFormRenderInput;
  slotKey: string;
  runtimeGeneration: string;
  onRuntimeDiagnosticsChange?:
    | ((scope: string, diagnostics: readonly SurfaceDiagnostic[]) => void)
    | undefined;
  onSlotFormEngineChange?:
    | ((slotKey: string, engine: IFormEngine | undefined) => void)
    | undefined;
  onSlotVisibilityChange?:
    | ((slotKey: string, nextRefs: ReadonlySet<string> | undefined, baselineKey: string) => void)
    | undefined;
  renderDefinitionForm: SurfaceDefinitionFormRenderer | undefined;
  semanticOutputScope: SurfaceSemanticOutputPublisherScope | undefined;
}): ReactNode {
  const { plan: { subject }, strings } = input;
  const actionDiagnosticScope = `definition-form-actions:${input.route.surfaceId}/${input.route.routeId}/${slotKey}`;
  const reportedFindings = useRef(new Map<string, SurfaceDiagnostic>());
  const previousScope = useRef<
    | { token: string; actions: SurfaceDefinitionFormRenderInput['responseActionsDocument'] }
    | undefined
  >(undefined);
  const scopeToken = `${runtimeGeneration}:${actionDiagnosticScope}`;
  if (
    previousScope.current?.token !== scopeToken
    || previousScope.current?.actions !== input.responseActionsDocument
  ) {
    previousScope.current = { token: scopeToken, actions: input.responseActionsDocument };
    reportedFindings.current.clear();
  }
  useEffect(() => {
    const findings = reportedFindings.current;
    return () => {
      findings.clear();
      onRuntimeDiagnosticsChange?.(actionDiagnosticScope, []);
    };
  }, [actionDiagnosticScope, onRuntimeDiagnosticsChange, runtimeGeneration, input.responseActionsDocument]);
  const handleActionFinding = useCallback(
    (finding: ActionRefFinding) => {
      const key = `${finding.code}:${finding.reason ?? ''}:${finding.target}:${finding.nodeId ?? ''}`;
      if (reportedFindings.current.has(key)) return;
      reportedFindings.current.set(
        key,
        surfaceDiagnostic(
          'BUNDLE-DOCUMENT-SHAPE',
          `Response Actions finding on slot "${input.plan.slotId}": ${finding.reason ?? finding.code} (${finding.target}).`,
          {
            surfaceId: input.route.surfaceId,
            routeId: input.route.routeId,
            slotId: input.plan.slotId,
          },
          {
            code: finding.code,
            kind: finding.kind,
            target: finding.target,
            ...(finding.reason ? { reason: finding.reason } : {}),
            ...(finding.nodeId ? { nodeId: finding.nodeId } : {}),
          },
        ),
      );
      onRuntimeDiagnosticsChange?.(actionDiagnosticScope, [...reportedFindings.current.values()]);
    },
    [actionDiagnosticScope, input.plan.slotId, input.route.routeId, input.route.surfaceId, onRuntimeDiagnosticsChange],
  );
  const needsSubject = subject !== undefined;
  const [toolsStatus, setToolsStatus] = useState<'ready' | 'loading' | 'unavailable'>(() =>
    isFormspecEngineToolsInitialized() ? 'ready' : 'loading',
  );
  useEffect(() => {
    if (!needsSubject || toolsStatus !== 'loading') return;
    let current = true;
    void initFormspecEngineTools().then(
      () => { if (current) setToolsStatus('ready'); },
      () => { if (current) setToolsStatus('unavailable'); },
    );
    return () => { current = false; };
  }, [needsSubject, toolsStatus]);

  const responseSubject = useMemo(() => {
    if (!subject || toolsStatus !== 'ready') return undefined;
    try {
      return { ...subject, id: responseSubjectId(subject.type, subject.keys) };
    } catch {
      return undefined;
    }
  }, [subject, toolsStatus]);
  if (needsSubject && !responseSubject) {
    return toolsStatus === 'loading'
      ? <DefinitionFormLoading>{strings('transitionPending')}</DefinitionFormLoading>
      : <UnavailableSlot>{strings('slotUnavailableWidgetData')}</UnavailableSlot>;
  }
  const resolvedInput: SurfaceDefinitionFormRenderInput = {
    ...input,
    responseSubject,
    onActionFinding: handleActionFinding,
  };
  return renderDefinitionForm
    ? renderDefinitionForm(resolvedInput)
    : (
      <DefaultDefinitionFormSlot
        input={resolvedInput}
        slotKey={slotKey}
        onSlotFormEngineChange={onSlotFormEngineChange}
        onSlotVisibilityChange={onSlotVisibilityChange}
        semanticOutputScope={semanticOutputScope}
      />
    );
}

function DefaultDefinitionFormSlot({
  input,
  slotKey = input.plan.slotId,
  onSlotFormEngineChange,
  onSlotVisibilityChange,
  semanticOutputScope,
}: {
  input: SurfaceDefinitionFormRenderInput;
  slotKey?: string | undefined;
  onSlotFormEngineChange?:
    | ((slotKey: string, engine: IFormEngine | undefined) => void)
    | undefined;
  onSlotVisibilityChange?:
    | ((slotKey: string, nextRefs: ReadonlySet<string> | undefined, baselineKey: string) => void)
    | undefined;
  semanticOutputScope?: SurfaceSemanticOutputPublisherScope | undefined;
}): ReactNode {
  if (input.draftSession) {
    const key = JSON.stringify([input.plan.definition.url, input.plan.definition.version,
      input.plan.subject?.type, input.plan.subject?.keys]);
    return <DraftDefinitionForm key={key} input={input} session={input.draftSession}>
      {(engine, writer) => <DefaultSurfaceDefinitionForm
        {...input}
        slotKey={slotKey}
        onSlotFormEngineChange={onSlotFormEngineChange}
        onSlotVisibilityChange={onSlotVisibilityChange}
        draftEngine={engine}
        draftWriter={writer}
        semanticOutputScope={semanticOutputScope}
      />}
    </DraftDefinitionForm>;
  }
  return (
    <DefaultSurfaceDefinitionForm
      {...input}
      slotKey={slotKey}
      onSlotFormEngineChange={onSlotFormEngineChange}
      onSlotVisibilityChange={onSlotVisibilityChange}
      semanticOutputScope={semanticOutputScope}
    />
  );
}

function effectiveStyleValue(
  element: HTMLElement,
  property: string,
  camelProp: 'display' | 'contentVisibility' | 'visibility' | 'interactivity',
  computed?: CSSStyleDeclaration | null,
): string {
  const computedValue = (
    computed?.getPropertyValue(property)
    || (computed as (CSSStyleDeclaration & { contentVisibility?: string; interactivity?: string }) | null | undefined)?.[camelProp]
    || ''
  ).trim().toLowerCase();
  if (computedValue) return computedValue;
  return (
    element.style.getPropertyValue(property)
    || (element.style as CSSStyleDeclaration & { contentVisibility?: string; interactivity?: string })[camelProp]
    || ''
  ).trim().toLowerCase();
}

function hasHiddenContentVisibility(element: HTMLElement, computed?: CSSStyleDeclaration | null): boolean {
  return effectiveStyleValue(element, 'content-visibility', 'contentVisibility', computed) === 'hidden';
}

function matchesModalDialog(element: HTMLElement): boolean {
  if (element.tagName !== 'DIALOG' || !(element as HTMLDialogElement).open) return false;
  if (typeof element.matches === 'function') {
    try {
      return element.matches(':modal');
    } catch {
      return false;
    }
  }
  return false;
}

function isEffectivelyDisabled(element: HTMLElement): boolean {
  if ((element as HTMLButtonElement).disabled) return true;
  if (element.getAttribute('aria-disabled') === 'true') return true;
  if (typeof element.matches === 'function') {
    try {
      if (element.matches(':disabled')) return true;
    } catch {
      // Ignore selector engines without :disabled support.
    }
  }
  for (let current = element.parentElement; current; current = current.parentElement) {
    if (current.tagName === 'FIELDSET' && (current as HTMLFieldSetElement).disabled) {
      const firstLegend = Array.from(current.children).find((child) => child.tagName === 'LEGEND');
      if (!firstLegend || !firstLegend.contains(element)) return true;
    }
  }
  return false;
}

function isElementReachable(
  element: HTMLElement,
  root: HTMLElement,
  visiting = new Set<HTMLElement>(),
): boolean {
  if (visiting.has(element)) return false;
  visiting.add(element);
  const view = element.ownerDocument.defaultView;
  const elementComputed = view?.getComputedStyle(element);
  const computedVisibility = effectiveStyleValue(
    element,
    'visibility',
    'visibility',
    elementComputed,
  );
  if (computedVisibility === 'hidden' || computedVisibility === 'collapse') {
    return false;
  }
  const computedElementInteractivity = (
    elementComputed?.getPropertyValue('interactivity')
    || (elementComputed as (CSSStyleDeclaration & { interactivity?: string }) | null | undefined)?.interactivity
    || ''
  ).trim().toLowerCase();
  if (computedElementInteractivity === 'inert') {
    return false;
  }

  let current: HTMLElement | null = element;
  let insideForm = true;
  let passedOpenModalDialog = false;
  while (current) {
    if (current === root) {
      insideForm = false;
    }
    const computedStyle = view?.getComputedStyle(current);
    if (!passedOpenModalDialog) {
      if ((current as HTMLElement & { inert?: boolean }).inert || current.hasAttribute('inert')) {
        return false;
      }
      if (
        !computedElementInteractivity
        && effectiveStyleValue(current, 'interactivity', 'interactivity', computedStyle) === 'inert'
      ) {
        return false;
      }
    }
    if (insideForm && current !== element) {
      if (current.tagName === 'DIALOG' && !(current as HTMLDialogElement).open) {
        if (
          current.hidden
          || current.style.display.trim().toLowerCase() === 'none'
          || hasHiddenContentVisibility(current, computedStyle)
        ) {
          return false;
        }
        const trigger = current.previousElementSibling;
        if (
          trigger instanceof HTMLElement
          && trigger.tagName === 'BUTTON'
          && trigger.classList.contains('formspec-modal-trigger')
          && !isEffectivelyDisabled(trigger)
        ) {
          return isElementReachable(trigger, root, visiting);
        }
        return false;
      }
      if (current.classList.contains('formspec-popover-content') && current.hidden) {
        if (
          current.style.display.trim().toLowerCase() === 'none'
          || hasHiddenContentVisibility(current, computedStyle)
        ) {
          return false;
        }
        const trigger = current.previousElementSibling;
        if (
          trigger instanceof HTMLElement
          && trigger.tagName === 'BUTTON'
          && trigger.classList.contains('formspec-popover-trigger')
          && !isEffectivelyDisabled(trigger)
        ) {
          return isElementReachable(trigger, root, visiting);
        }
        return false;
      }
      if (current.getAttribute('role') === 'tabpanel' && current.hidden) {
        if (
          current.style.display.trim().toLowerCase() === 'none'
          || hasHiddenContentVisibility(current, computedStyle)
        ) {
          return false;
        }
        const tabId = current.getAttribute('aria-labelledby');
        const tab = tabId
          ? [...root.querySelectorAll<HTMLElement>('[role="tab"]')].find((candidate) => candidate.id === tabId) ?? null
          : null;
        if (
          tab instanceof HTMLElement
          && !isEffectivelyDisabled(tab)
          && isElementReachable(tab, root, visiting)
        ) {
          current = current.parentElement;
          continue;
        }
        return false;
      }
      if (current.classList.contains('formspec-wizard-panel') && current.hidden) {
        if (
          current.style.display.trim().toLowerCase() === 'none'
          || hasHiddenContentVisibility(current, computedStyle)
        ) {
          return false;
        }
        current = current.parentElement;
        continue;
      }
    }

    if (current.hidden) return false;
    if (effectiveStyleValue(current, 'display', 'display', computedStyle) === 'none') return false;
    if (hasHiddenContentVisibility(current, computedStyle)) return false;
    if (matchesModalDialog(current)) {
      passedOpenModalDialog = true;
    }
    current = current.parentElement;
  }
  return true;
}

function collectMountedReachableActionRefs(root: HTMLElement): ReadonlySet<string> {
  const refs = new Set<string>();
  for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-action-ref]')) {
    const actionRef = button.dataset.actionRef;
    if (!actionRef || isEffectivelyDisabled(button)) continue;
    if (isElementReachable(button, root)) {
      refs.add(actionRef);
    }
  }
  return refs;
}

function DefaultSurfaceDefinitionForm(
  input: SurfaceDefinitionFormRenderInput & {
    slotKey: string;
    onSlotFormEngineChange?:
      | ((slotKey: string, engine: IFormEngine | undefined) => void)
      | undefined;
    onSlotVisibilityChange?:
    | ((slotKey: string, nextRefs: ReadonlySet<string> | undefined, baselineKey: string) => void)
    | undefined;
    draftEngine?: IFormEngine;
    draftWriter?: DraftWriter;
    semanticOutputScope?: SurfaceSemanticOutputPublisherScope | undefined;
  },
): ReactNode {
  const {
    plan,
    grant,
    strings,
    initialData,
    referencesDocuments,
    responseActionsDocument,
    semanticControlScope,
    onDefinitionActionResult,
    onActionFinding,
    onActionCompleted,
    responseActionInvoker,
    componentDocument,
    localeDocuments,
    activeLocale,
    appearance,
    responseSubject,
    slotKey,
    onSlotFormEngineChange,
    onSlotVisibilityChange,
    draftEngine,
    draftWriter,
    semanticOutputScope,
    activeSection,
    focusField,
    sectionNavigationActive,
    hrefForSection,
    onActiveSectionChange,
    onSectionTitleChange,
  } = input;
  const engine = useMemo(() => {
    if (draftEngine) return draftEngine;
    try {
      const created = createFormEngine(plan.definition, {
        ...(responseSubject && { responseSubject }),
        ...(initialData?.data !== undefined && {
          responseData: initialData.data as Parameters<IFormEngine['loadResponseData']>[0],
        }),
      });
      if (created.hasSubjectRefusal()) {
        created.dispose();
        return undefined;
      }
      return created;
    } catch (error) {
      console.warn('Formspec Surface could not create the form engine.', error);
      return undefined;
    }
    // Core's subject id covers both type and keys, even when a replan allocates a new object.
  }, [draftEngine, initialData?.data, plan.definition, responseSubject?.id]);
  useEffect(() => () => { if (!draftEngine) engine?.dispose(); }, [draftEngine, engine]);
  const formVisit = useRef<object | undefined>(undefined);
  const visit = useMemo(() => ({}), [engine]);
  useLayoutEffect(() => {
    formVisit.current = visit;
    return () => { formVisit.current = undefined; };
  }, [visit]);
  useLayoutEffect(() => {
    if (!engine) return;
    for (const locale of localeDocuments ?? []) {
      if (locale.target.kind === 'definition' && targetDefinitionMatches(locale.target, plan.definition)) {
        engine.loadLocale(locale);
      }
    }
    if (activeLocale !== undefined) engine.setLocale(activeLocale);
  }, [engine, localeDocuments, activeLocale, plan.definition]);
  useLayoutEffect(() => {
    if (!engine || !onSlotFormEngineChange) return;
    onSlotFormEngineChange(slotKey, engine);
    return () => {
      onSlotFormEngineChange(slotKey, undefined);
    };
  }, [engine, onSlotFormEngineChange, slotKey]);
  const formRootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!engine || !onSlotVisibilityChange) return;
    const root = formRootRef.current;
    if (!root) return;
    const matchesMinWidth =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? (minWidth: number) => window.matchMedia(`(min-width: ${minWidth}px)`).matches
        : undefined;
    const baselineKey = [...plannedDefinitionFormActionRefs(
      plan.definition,
      componentDocument,
      responseActionsDocument,
      {
        themeDocument: grant.themeDocument,
        ...(matchesMinWidth ? { matchesMinWidth } : {}),
      },
    )].sort().join('\0');

    let disposed = false;
    const measure = () => {
      if (disposed || !formRootRef.current) return;
      onSlotVisibilityChange(slotKey, collectMountedReachableActionRefs(formRootRef.current), baselineKey);
    };

    measure();

    const collectAncestors = (node: HTMLElement): HTMLElement[] => {
      const list: HTMLElement[] = [];
      for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
        list.push(ancestor);
      }
      return list;
    };
    const sameAncestors = (a: readonly HTMLElement[], b: readonly HTMLElement[]): boolean =>
      a.length === b.length && a.every((el, idx) => el === b[idx]);

    let rootObserver: MutationObserver | undefined;
    let ancestorObserver: MutationObserver | undefined;
    let observedAncestors: HTMLElement[] = [];
    const ancestorAttributeFilter = ['open', 'hidden', 'style', 'class', 'disabled', 'aria-disabled', 'inert'];

    const syncAncestorObserver = () => {
      if (disposed || typeof MutationObserver !== 'function') return;
      const nextAncestors = collectAncestors(root);
      if (ancestorObserver && sameAncestors(observedAncestors, nextAncestors)) {
        return;
      }
      ancestorObserver?.disconnect();
      ancestorObserver = undefined;
      observedAncestors = nextAncestors;
      if (nextAncestors.length === 0) return;
      const nextObserver = new MutationObserver(() => {
        syncAncestorObserver();
        measure();
      });
      for (const ancestor of nextAncestors) {
        nextObserver.observe(ancestor, {
          attributes: true,
          childList: true,
          attributeFilter: ancestorAttributeFilter,
        });
      }
      ancestorObserver = nextObserver;
    };

    if (typeof MutationObserver === 'function') {
      rootObserver = new MutationObserver(() => {
        syncAncestorObserver();
        measure();
      });
      rootObserver.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['open', 'hidden', 'style', 'class', 'disabled', 'aria-disabled', 'inert', 'data-action-ref'],
      });
      syncAncestorObserver();
    }
    const onDialogClose = () => measure();
    root.addEventListener('close', onDialogClose, true);
    const view = root.ownerDocument.defaultView;
    const onViewportResize = () => measure();
    view?.addEventListener('resize', onViewportResize);
    const stopReactive = preactReactiveRuntime.effect(() => {
      engine.getEvaluatedFormState({ profile: 'off' });
      queueMicrotask(measure);
    });

    return () => {
      disposed = true;
      rootObserver?.disconnect();
      ancestorObserver?.disconnect();
      root.removeEventListener('close', onDialogClose, true);
      view?.removeEventListener('resize', onViewportResize);
      stopReactive();
    };
  }, [
    engine,
    onSlotVisibilityChange,
    slotKey,
    plan.definition,
    componentDocument,
    responseActionsDocument,
    grant.themeDocument,
  ]);
  useLayoutEffect(() => () => {
    onSlotVisibilityChange?.(slotKey, undefined, '');
  }, [onSlotVisibilityChange, slotKey]);
  const renderedScope = engine ? semanticOutputScope : undefined;
  useSurfaceSemanticOutputs(
    renderedScope,
    renderedScope ? [{ subjectRef: renderedScope.subjectPrefix }] : [],
  );

  // Human help is References-spec resolution alone: this form never renders
  // agent-audience entries or Ontology concepts.
  const references = useMemo(
    () => referencesDocuments.filter((document) =>
      targetDefinitionMatches(document.targetDefinition, plan.definition)),
    [plan.definition, referencesDocuments],
  );

  const resolveFieldHelp = useCallback(
    (path: string) => {
      try {
        return Object.values(resolveFieldReferences(references, path, 'human')).flatMap((entries) =>
          (entries ?? []).flatMap((reference) =>
            reference.title
              ? [{
                  ...(reference.id ? { id: reference.id } : {}),
                  title: reference.title,
                  ...(reference.description
                    ? { description: reference.description }
                    : {}),
                  ...(typeof reference.content === 'string'
                    ? { content: reference.content }
                    : {}),
                  ...(reference.uri ? { uri: reference.uri } : {}),
                  type: reference.type,
                  needAnchors: (
                    reference['x-generation']?.anchors ?? []
                  ).filter((anchor) =>
                    /^need:[a-zA-Z][a-zA-Z0-9_-]*@[1-9][0-9]*$/.test(anchor)),
                }]
              : [],
          ),
        );
      } catch {
        // An unresolvable `$ref` in any document fails closed to no help.
        return [];
      }
    },
    [references],
  );

  if (!engine) {
    return <UnavailableSlot>{strings('slotUnavailableWidgetData')}</UnavailableSlot>;
  }
  return (
    <div ref={formRootRef} style={{ display: 'contents' }}>
      <FormspecForm
        {...(appearance && { className: `formspec-appearance-${appearance}` })}
        engine={engine}
        {...('activeSection' in input && { activeSection })}
        {...(focusField !== undefined && { focusField })}
        onActiveSectionChange={onActiveSectionChange}
        sectionNavigationActive={sectionNavigationActive}
        hrefForSection={hrefForSection}
        onSectionTitleChange={onSectionTitleChange}
        componentDocument={componentDocument}
        themeDocument={grant.themeDocument}
        registryEntries={[...plan.registryEntries]}
        resolveFieldHelp={resolveFieldHelp}
        responseActionsDocument={responseActionsDocument ?? null}
        {...(onActionFinding ? { onActionFinding } : {})}
        responseActionInvoker={draftWriter
          ? input => draftWriter.invoke(input, { invoker: responseActionInvoker, current: () => formVisit.current === visit })
          : responseActionInvoker ?? null}
        draftSaveFeedback={draftWriter ? 'external' : undefined}
        {...(semanticControlScope ? { semanticControlScope } : {})}
        emitThemeTokens={false}
        {...(onActionCompleted || onDefinitionActionResult
          ? {
              // `onSubmit` requests the renderer's declared submit control. It is
              // a no-op because durable effects have not reached a terminal yet.
              onSubmit: () => {},
              ...(onDefinitionActionResult
                ? { onActionResult: onDefinitionActionResult }
                : {}),
              ...(onActionCompleted
                ? {
                    onControlActionResult: (
                      result: ResponseActionInvocationResult<SubmitResult>,
                    ) => {
                      const action = completedFormAction(result);
                      if (action) onActionCompleted(action, result);
                    },
                  }
                : {}),
            }
          : {})}
      />
    </div>
  );
}

type ModuleWidgetPlan = Extract<SlotPlan<SurfaceWidget>, { slotType: 'module-widget' }>;

interface SurfaceWidgetSlotProps {
  plan: ModuleWidgetPlan;
  grant: ThemeGrant;
  route: SurfaceWidgetRouteContext;
  strings: SurfaceStrings;
  dataSourceLoader?: DataSourceLoader | undefined;
  draftSession?: DraftSession | undefined;
  filingStatus?: FilingStatusViewContext | undefined;
  reportSave?: ((notice: SurfaceSaveNotice) => void) | undefined;
  localeDocuments?: readonly LocaleDocument[] | undefined;
  activeLocale?: string | undefined;
  /** Pure per-source scheduling hints; evaluated on host renders, never authority. */
  dataSourceRevision?: DataSourceRevisionSelector | undefined;
  authorizeDataSource?: DataSourceAuthorizer | undefined;
  validateDataSourcePayload?: DataSourcePayloadValidator | undefined;
  responseActionsDocuments: readonly GeneratedResponseActionsDocument[];
  transitions: readonly PlannedTransition[];
  widgetActionExecutor?: SurfaceWidgetActionExecutor | undefined;
  widgetActionOutcomeStore?: SurfaceWidgetActionOutcomeStore | undefined;
  widgetActionCoordinator?: WidgetActionCoordinator | undefined;
  runtimeGeneration: string;
  onWidgetActionReport?: ((report: SurfaceWidgetActionReport) => void) | undefined;
  onRuntimeDiagnosticsChange?:
    | ((scope: string, diagnostics: readonly SurfaceDiagnostic[]) => void)
    | undefined;
  onAdvance?: AdvanceTransition | undefined;
  semanticOutputScope?: SurfaceSemanticOutputPublisherScope | undefined;
}

const EMPTY_WIDGET_DATA = Object.freeze({}) as Readonly<Record<string, unknown>>;
const READY_WITH_NO_DATA: WidgetDataDelivery = {
  status: 'ready',
  data: EMPTY_WIDGET_DATA,
  degradedInputs: [],
  diagnostics: [],
};

type WidgetDataState = WidgetDataDelivery | DraftReviewDelivery | { status: 'loading' };

function SurfaceWidgetSlot({
  plan,
  grant,
  route,
  strings,
  dataSourceLoader,
  draftSession,
  filingStatus,
  reportSave,
  localeDocuments,
  activeLocale,
  dataSourceRevision,
  authorizeDataSource,
  validateDataSourcePayload,
  responseActionsDocuments,
  transitions,
  widgetActionExecutor,
  widgetActionOutcomeStore,
  widgetActionCoordinator,
  runtimeGeneration,
  onWidgetActionReport,
  onRuntimeDiagnosticsChange,
  onAdvance,
  semanticOutputScope,
}: SurfaceWidgetSlotProps): ReactNode {
  const draftVisit = useMemo(() => plan.draftReview ? {} : undefined,
    [plan.draftReview, draftSession, runtimeGeneration, localeDocuments, activeLocale]);
  const [settled, setSettled] = useState<{ draftVisit: object | undefined; delivery: WidgetDataState }>({
    draftVisit, delivery: plan.dataInputs.length === 0 && !plan.draftReview ? READY_WITH_NO_DATA : { status: 'loading' },
  });
  const delivery: WidgetDataState = settled.draftVisit === draftVisit ? settled.delivery : { status: 'loading' };
  const [dataLoadAttempt, setDataLoadAttempt] = useState(0);
  const responseContexts = useRef<{ generation: string; values: ReadonlyMap<string, SurfaceWidgetResponseContext> } | undefined>(undefined);
  const activeGeneration = useRef<string | undefined>(runtimeGeneration);
  activeGeneration.current = runtimeGeneration;
  useEffect(() => {
    activeGeneration.current = runtimeGeneration;
    return () => {
      // A disposed widget cannot advance the host after its pending terminal arrives.
      if (activeGeneration.current === runtimeGeneration) activeGeneration.current = undefined;
    };
  }, [runtimeGeneration]);
  const localActionCoordinator = useRef(createWidgetActionCoordinator());
  const actionCoordinator = widgetActionCoordinator ?? localActionCoordinator.current;
  const navigatedInvocations = useRef(new Set<string>());
  const dataDiagnosticScope = `widget-data:${runtimeGeneration}:${plan.slotId}`;
  const sourceRevisions = selectDataSourceRevisions(plan.dataInputs.flatMap(input =>
    input.status === 'ready' ? [{ descriptor: input.descriptor,
      context: { surfaceId: route.surfaceId, surfaceRef: route.surfaceRef,
        routeId: route.routeId, slotId: plan.slotId, moduleId: plan.key.moduleId,
        widgetName: plan.key.widgetName, params: route.params,
        sessionGeneration: runtimeGeneration } }] : []), dataSourceRevision);

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const setDelivery = (delivery: WidgetDataState) => setSettled({ draftVisit, delivery });
    responseContexts.current = undefined;
    if (plan.dataInputs.length > 0 || plan.draftReview) setDelivery({ status: 'loading' });
    onRuntimeDiagnosticsChange?.(dataDiagnosticScope, []);

    const site = { surfaceId: route.surfaceId, routeId: route.routeId, slotId: plan.slotId };
    const load = plan.draftReview ? loadDraftReviewInputs(plan.draftReview, {
      session: draftSession, site, signal: controller.signal, localeDocuments, activeLocale,
    }) : loadWidgetDataInputs({
      inputs: plan.dataInputs.map(input => input.status === 'ready'
        && sourceRevisions.failures.some(failure =>
          failure.descriptor.catalogRef === input.descriptor.catalogRef
          && failure.descriptor.sourceRef === input.descriptor.sourceRef)
        ? { ...input, status: 'unavailable' as const,
          reason: `The host could not select a revision for ${input.descriptor.catalogRef} ${input.descriptor.sourceRef}.` }
        : input),
      context: {
        surfaceId: route.surfaceId,
        surfaceRef: route.surfaceRef,
        routeId: route.routeId,
        slotId: plan.slotId,
        moduleId: plan.key.moduleId,
        widgetName: plan.key.widgetName,
        params: route.params,
        sessionGeneration: runtimeGeneration,
      },
      ...currentEffectDataSourcePorts(() => current, {
        loader: dataSourceLoader,
        authorize: authorizeDataSource,
        validatePayload: validateDataSourcePayload,
      }),
      site,
    });
    void load.then(async (result) => {
      if (!current) return;
      if (result.status === 'ready') {
        const contexts = new Map<string, SurfaceWidgetResponseContext>();
        try {
          for (const output of plan.actionOutputs) {
            const subject = output.responseContext;
            if (!subject) continue;
            const captured = snapshotWidgetResponseContext({
              inputName: subject.inputName,
              source: { catalogRef: subject.descriptor.catalogRef, sourceRef: subject.descriptor.sourceRef },
              definition: subject.definition,
              response: result.data[subject.inputName] as SurfaceWidgetResponseContext['response'],
            });
            if (!validateDataSourcePayload || !(await validateDataSourcePayload({
              descriptor: subject.descriptor,
              context: { surfaceId: route.surfaceId, surfaceRef: route.surfaceRef,
                routeId: route.routeId, slotId: plan.slotId, moduleId: plan.key.moduleId,
                widgetName: plan.key.widgetName, params: route.params, sessionGeneration: runtimeGeneration },
              schema: subject.descriptor.source.schema!, value: captured.response,
            })).valid) throw new TypeError('The immutable Response subject failed canonical validation');
            contexts.set(output.name, captured);
          }
          if (!current) return;
          responseContexts.current = { generation: runtimeGeneration, values: contexts };
        } catch {
          if (!current) return;
          const diagnostic = surfaceDiagnostic('WIDGET-DATA-REQUIRED-UNAVAILABLE',
            'The qualified Response action subject could not be admitted.',
            { surfaceId: route.surfaceId, routeId: route.routeId, slotId: plan.slotId });
          setDelivery({ status: 'unavailable', failures: [{ inputName: 'responseInput', required: true,
            reason: 'payload-invalid', message: diagnostic.message }], diagnostics: [diagnostic] });
          onRuntimeDiagnosticsChange?.(dataDiagnosticScope, [diagnostic]);
          return;
        }
      }
      setDelivery(result);
      onRuntimeDiagnosticsChange?.(dataDiagnosticScope, result.diagnostics);
    });

    return () => {
      current = false;
      controller.abort();
      onRuntimeDiagnosticsChange?.(dataDiagnosticScope, []);
    };
  }, [
    authorizeDataSource,
    dataDiagnosticScope,
    dataSourceLoader,
    draftSession,
    draftVisit,
    localeDocuments,
    activeLocale,
    sourceRevisions.key,
    onRuntimeDiagnosticsChange,
    plan.dataInputs,
    plan.draftReview,
    plan.actionOutputs,
    plan.key.moduleId,
    plan.key.widgetName,
    plan.slotId,
    route.params,
    route.routeId,
    route.surfaceId,
    route.surfaceRef,
    runtimeGeneration,
    dataLoadAttempt,
    validateDataSourcePayload,
  ]);

  const reportRefusal = useCallback(
    (
      invocationId: string,
      outputName: string,
      code:
        | 'WIDGET-ACTION-OUTPUT-UNDECLARED'
        | 'WIDGET-ACTION-INPUT-INVALID'
        | 'WIDGET-ACTION-OUTPUT-UNMAPPED'
        | 'WIDGET-ACTION-REF-UNRESOLVED'
        | 'WIDGET-ACTION-TRANSITION-AMBIGUOUS',
      message: string,
      details: Readonly<Record<string, unknown>>,
    ) => {
      onRuntimeDiagnosticsChange?.(
        `widget-action:${runtimeGeneration}:${plan.slotId}:${invocationId}`,
        [
          surfaceDiagnostic(
            code,
            message,
            {
              surfaceId: route.surfaceId,
              routeId: route.routeId,
              slotId: plan.slotId,
            },
            details,
          ),
        ],
      );
      onWidgetActionReport?.({
        invocationId,
        outputName,
        navigation: code === 'WIDGET-ACTION-TRANSITION-AMBIGUOUS'
          ? 'ambiguous'
          : 'not-attempted',
      });
    },
    [
      onRuntimeDiagnosticsChange,
      onWidgetActionReport,
      plan.slotId,
      route.routeId,
      route.surfaceId,
      runtimeGeneration,
    ],
  );

  const emitAction = useCallback(
    (
      outputName: string,
      input?: SurfaceWidgetActionInput,
    ): SurfaceWidgetActionEmission => {
      const refused = (): SurfaceWidgetActionEmission => ({
        started: false,
        completion: Promise.resolve({ status: 'refused' }),
      });
      const declared = plan.actionOutputs.filter((output) => output.name === outputName);
      if (declared.length !== 1) {
        const invocationId = allocateWidgetActionInvocationId();
        reportRefusal(
          invocationId,
          outputName,
          'WIDGET-ACTION-OUTPUT-UNDECLARED',
          `Widget "${plan.key.widgetName}" emitted undeclared output "${outputName}".`,
          {
            moduleId: plan.key.moduleId,
            widgetName: plan.key.widgetName,
            outputName,
            declarationCount: declared.length,
          },
        );
        return refused();
      }
      const inputAdmission = admitSurfaceWidgetActionInput(input);
      if (!inputAdmission.accepted) {
        const invocationId = allocateWidgetActionInvocationId();
        reportRefusal(
          invocationId,
          outputName,
          'WIDGET-ACTION-INPUT-INVALID',
          `Widget "${plan.key.widgetName}" emitted invalid structured data for output "${outputName}".`,
          {
            moduleId: plan.key.moduleId,
            widgetName: plan.key.widgetName,
            outputName,
            reason: inputAdmission.reason,
          },
        );
        return refused();
      }
      const actionRef = declared[0]?.actionRef;
      if (!actionRef) {
        const invocationId = allocateWidgetActionInvocationId();
        reportRefusal(
          invocationId,
          outputName,
          'WIDGET-ACTION-OUTPUT-UNMAPPED',
          `Declared widget output "${outputName}" has no Surface action binding.`,
          {
            moduleId: plan.key.moduleId,
            widgetName: plan.key.widgetName,
            outputName,
          },
        );
        return refused();
      }
      const responseContext = responseContexts.current?.generation === runtimeGeneration
        ? responseContexts.current.values.get(outputName) : undefined;
      const document = declared[0]?.action ? responseActionsDocumentForAction(
        responseActionsDocuments,
        actionRef,
        responseContext,
      ) : undefined;
      if (!document) {
        const invocationId = allocateWidgetActionInvocationId();
        reportRefusal(
          invocationId,
          outputName,
          'WIDGET-ACTION-REF-UNRESOLVED',
          `Widget output "${outputName}" maps to action "${actionRef}", which does not resolve exactly once.`,
          {
            moduleId: plan.key.moduleId,
            widgetName: plan.key.widgetName,
            outputName,
            actionRef,
          },
        );
        return refused();
      }
      if (!widgetActionExecutor) {
        const invocationId = allocateWidgetActionInvocationId();
        onWidgetActionReport?.({
          invocationId,
          actionRef,
          outputName,
          navigation: 'not-attempted',
        });
        return refused();
      }

      // Hosts admit an emission by exact source identity; the route's presented
      // title is localized text, so it stays out of the source.
      const source = {
        moduleId: plan.key.moduleId,
        widgetName: plan.key.widgetName,
        slotId: plan.slotId,
        route: routeIdentity(route),
        outputName,
      };
      const emittedGeneration = runtimeGeneration;
      const emission = actionCoordinator.emit({
          generation: emittedGeneration,
          document,
          actionRef,
          source,
          ...(responseContext ? { responseContext } : {}),
          ...(inputAdmission.input === undefined
            ? {}
            : { input: inputAdmission.input }),
          executor: widgetActionExecutor,
          outcomeStore: widgetActionOutcomeStore,
        });
      if (!emission.started) {
        return {
          started: false,
          completion: emission.completion
            .then(({ result }) => ({
              status:
                activeGeneration.current !== emittedGeneration
                  ? 'obsolete' as const
                  : completedWidgetAction(result, document)?.id === actionRef
                    ? 'completed' as const
                    : unknownCompletion(result) ? 'outcome-unknown' as const : 'failed' as const,
            }))
            .catch(() => ({ status: 'failed' as const })),
        };
      }
      const completion = emission.completion
        .then(async ({ invocationId, result }) => {
          if (activeGeneration.current !== emittedGeneration) {
            onWidgetActionReport?.({
              invocationId,
              actionRef,
              outputName,
              result,
              navigation: 'obsolete-generation',
            });
            return { status: 'obsolete' as const };
          }

          const action = completedWidgetAction(result, document);
          if (!action || action.id !== actionRef) {
            onWidgetActionReport?.({
              invocationId,
              actionRef,
              outputName,
              result,
              navigation: 'none',
            });
            return { status: unknownCompletion(result) ? 'outcome-unknown' as const : 'failed' as const };
          }

          const eligible = transitions.filter(
            (transition) =>
              transition.status === 'supplied-by-slot' &&
              transition.actionId === action.id,
          );
          if (eligible.length > 1) {
            reportRefusal(
              invocationId,
              outputName,
              'WIDGET-ACTION-TRANSITION-AMBIGUOUS',
              `Completed widget action "${action.id}" selects more than one eligible transition. Navigation was refused.`,
              {
                actionRef,
                outputName,
                targets: eligible.map((transition) => transition.to),
              },
            );
            return { status: 'failed' as const };
          }
          const transition = eligible[0];
          if (!transition) {
            onWidgetActionReport?.({
              invocationId,
              actionRef,
              outputName,
              result,
              navigation: 'none',
            });
            return { status: 'completed' as const };
          }
          const bindingMerge = mergeAppWidgetTransitionBindings(
            document,
            inputAdmission.input,
            result.transitionBindings,
          );
          if (bindingMerge.status === 'conflict') {
            reportRefusal(
              invocationId,
              outputName,
              'WIDGET-ACTION-TRANSITION-AMBIGUOUS',
              `Completed widget action "${action.id}" supplies conflicting values for transition binding "${bindingMerge.bindingName}". Navigation was refused.`,
              {
                actionRef,
                outputName,
                bindingName: bindingMerge.bindingName,
                sources: ['service-output', 'widget-input'],
              },
            );
            return { status: 'failed' as const };
          }
          if (navigatedInvocations.current.has(invocationId)) {
            return { status: 'completed' as const };
          }
          navigatedInvocations.current.add(invocationId);
          const navigation = await onAdvance?.(
            transition,
            bindingMerge.transitionBindings
              ? { transitionBindings: bindingMerge.transitionBindings }
              : undefined,
          );
          onWidgetActionReport?.({
            invocationId,
            actionRef,
            outputName,
            result,
            navigation: navigation === 'advanced' ? 'advanced' : 'none',
          });
          return { status: 'completed' as const };
        })
        .catch(() => ({ status: 'failed' as const }));
      return { started: true, completion };
    },
    [
      onAdvance,
      actionCoordinator,
      onWidgetActionReport,
      plan.actionOutputs,
      plan.key.moduleId,
      plan.key.widgetName,
      plan.slotId,
      reportRefusal,
      responseActionsDocuments,
      route,
      runtimeGeneration,
      transitions,
      widgetActionExecutor,
      widgetActionOutcomeStore,
    ],
  );

  const retryDataLoad = useCallback(() => {
    setDataLoadAttempt((attempt) => attempt + 1);
  }, []);
  const resolvedActions = plan.actionOutputs.flatMap((output) =>
    output.action === undefined
      ? []
      : [{ outputName: output.name, ...output.action }],
  );
  const stateView = (
    state: ModuleWidgetStateName,
    fallback: ReactNode,
  ): ReactNode => (
    <ModuleWidgetStateView
      state={state}
      config={plan.config ?? {}}
      headingLevel={plan.headingBaseLevel}
      actions={resolvedActions}
      emitAction={emitAction}
      onRetry={retryDataLoad}
      fallback={fallback}
    />
  );

  if (delivery.status === 'loading') {
    return stateView('loading', (
      <div
        className="fs-surface-widget-loading"
        data-widget-data="loading"
        aria-busy="true"
      />
    ));
  }
  if (delivery.status === 'unavailable') {
    const modes = delivery.failures
      .map((failure) => failure.failureMode)
      .filter((mode): mode is NonNullable<typeof mode> => mode !== undefined);
    const emptyState =
      delivery.failures.length > 0 &&
      delivery.failures.every((failure) => failure.failureMode === 'empty-state');
    if (emptyState) {
      return stateView(
        'empty',
        <WidgetEmptyState>{strings('widgetEmpty')}</WidgetEmptyState>,
      );
    }
    const technicalFailure = delivery.failures.some((failure) =>
      failure.reason === 'load-failed' ||
      failure.reason === 'stale-disallowed' ||
      failure.reason === 'payload-invalid'
    );
    return stateView(technicalFailure ? 'error' : 'unavailable', (
      <div
        data-widget-data="unavailable"
        data-draft-review-reason={'draftReviewReason' in delivery ? delivery.draftReviewReason : undefined}
        data-widget-failure-mode={modes.join(' ')}
      >
        <UnavailableSlot>{strings('slotUnavailableWidgetData')}</UnavailableSlot>
      </div>
    ));
  }

  if (widgetDataMatchesEmptyWhen(plan.config ?? {}, delivery.data)) {
    return stateView(
      'empty',
      <WidgetEmptyState>{strings('widgetEmpty')}</WidgetEmptyState>,
    );
  }

  const Widget = plan.resolution.status === 'resolved'
    ? plan.resolution.component
    : undefined;
  if (!Widget) {
    return <UnavailableSlot>{strings('slotUnavailableWidgetData')}</UnavailableSlot>;
  }
  const draftReviewReady = plan.draftReview?.status === 'ready' && 'warningGroups' in delivery
    ? { plan: plan.draftReview, delivery }
    : undefined;
  return (
    <>
      <Widget
        moduleId={plan.key.moduleId}
        widgetName={plan.key.widgetName}
        slot={{ id: plan.slotId, title: plan.title }}
        route={route}
        headingLevel={plan.headingBaseLevel}
        config={plan.config ?? {}}
        data={delivery.data}
        actions={resolvedActions}
        emitAction={emitAction}
        admitsTenantTheme={grant.admitsTenantTheme}
        semanticOutputScope={semanticOutputScope}
      />
      {draftReviewReady && draftReviewReady.delivery.warningGroups.length > 0 && draftSession && (
        <DraftReviewWarningAcknowledgements
          plan={draftReviewReady.plan}
          delivery={draftReviewReady.delivery}
          draftSession={draftSession}
          filingStatus={filingStatus}
          reportSave={reportSave}
          onSaved={retryDataLoad}
        />
      )}
    </>
  );
}

function DraftReviewWarningAcknowledgements({
  plan,
  delivery,
  draftSession,
  filingStatus,
  reportSave,
  onSaved,
}: {
  plan: Extract<NonNullable<ModuleWidgetPlan['draftReview']>, { status: 'ready' }>;
  delivery: DraftReviewReadyDelivery;
  draftSession: DraftSession;
  filingStatus: FilingStatusViewContext | undefined;
  reportSave: ((notice: SurfaceSaveNotice) => void) | undefined;
  onSaved: () => void;
}) {
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const sections = useMemo(
    () => (plan.sections ?? []).map(sec => ({
      ...(sec.id === undefined ? {} : { id: sec.id }),
      fields: [...sec.fields],
      fieldTemplates: [...sec.fields],
      nodes: [],
      groups: [],
    })),
    [plan.sections],
  );
  const acknowledge = async (code: string, expectedBasis: string) => {
    if (savingCode !== null) return;
    setSavingCode(code);
    try {
      const outcome = await draftSession.acknowledgeWarningGroup({
        definition: plan.definition,
        subject: plan.subject,
        expectedRevision: delivery.revision,
        expectedBasis,
        code,
        sections,
        report: reportSave,
      });
      if (outcome === 'saved' || outcome === 'mismatch') onSaved();
    } finally {
      setSavingCode(null);
    }
  };
  return (
    <>
      {delivery.warningGroups.map(group => (
        <fieldset
          key={group.code}
          className="formspec-warning-explanation formspec-warning-acknowledgement"
          data-explanation-code={group.code}
        >
          <legend>{group.legend}</legend>
          <ul>
            {group.items.map(item => {
              const destination = item.jumpHref ?? undefined;
              const href = destination !== undefined
                ? (filingStatus?.formatHref ? filingStatus.formatHref(destination) : destination)
                : undefined;
              return (
                <li key={item.path}>
                  {destination && href ? (
                    <a
                      href={href}
                      onClick={event => {
                        if (!filingStatus?.navigate || !isPlainLinkClick(event)) return;
                        event.preventDefault();
                        void filingStatus.navigate(destination);
                      }}
                    >
                      {item.label}
                    </a>
                  ) : (
                    <span>{item.label}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {group.addedText && <p className="formspec-warning-acknowledgement-added">{group.addedText}</p>}
          {group.removedText && <p className="formspec-warning-acknowledgement-removed">{group.removedText}</p>}
          <button
            type="button"
            disabled={group.current || savingCode !== null}
            onClick={() => void acknowledge(group.code, group.basis ?? '')}
          >
            {group.buttonLabel}
          </button>
        </fieldset>
      ))}
    </>
  );
}

function UnavailableSlot({ children }: { children: ReactNode }) {
  return (
    <p className="fs-surface-unavailable" role="status" data-probe="slot-unavailable">
      {children}
    </p>
  );
}

/** Forward one closed uncertainty classification; never expose arbitrary failure text. */
function unknownCompletion(result: Parameters<typeof normalizeWidgetActionResult>[0]): boolean {
  const invocation = normalizeWidgetActionResult(result);
  return invocation.status === 'failed' && invocation.failureReason === 'completion-outcome-unknown';
}

export { nextLevel };
