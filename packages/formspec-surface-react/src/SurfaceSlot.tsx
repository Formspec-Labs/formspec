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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ContextResolver,
  targetDefinitionMatches,
  type ReferenceEntry,
} from '@formspec-org/assist';
import { createFormEngine } from '@formspec-org/engine';
import { FormspecForm } from '@formspec-org/react';
import type {
  ResponseAction,
  ResponseActionInvocationResult,
  ResponseActionInvoker,
  ResponseActionsDocument as ReactResponseActionsDocument,
  SemanticArtifactIdentity,
  SemanticControlRegistry,
  SemanticControlScope,
  SemanticResponseBinding,
  SubmitResult,
} from '@formspec-org/react';
import type {
  FormDefinition,
  OntologyDocument,
  ReferencesDocument,
  ResponseActionsDocument as GeneratedResponseActionsDocument,
} from '@formspec-org/types';
import {
  loadWidgetDataInputs,
  responseActionsDocumentForDefinition,
  surfaceDiagnostic,
  type DataSourceAuthorizer,
  type DataSourceLoader,
  type DataSourcePayloadValidator,
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
import { Heading, nextLevel } from './heading.js';
import type {
  SurfaceWidget,
  SurfaceWidgetActionExecutor,
  SurfaceWidgetActionDetail,
  SurfaceWidgetActionEmission,
  SurfaceWidgetActionOutcomeStore,
  SurfaceWidgetActionInput,
  SurfaceWidgetActionReport,
  SurfaceWidgetRouteContext,
} from './widget-api.js';
import {
  allocateWidgetActionInvocationId,
  admitSurfaceWidgetActionInput,
  createWidgetActionCoordinator,
  responseActionsDocumentForAction,
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

export interface SurfaceDefinitionFormRenderInput {
  plan: ResolvedDefinitionFormPlan;
  grant: ThemeGrant;
  route: SurfaceWidgetRouteContext;
  responseActionsDocument: ReactResponseActionsDocument | undefined;
  referencesDocuments: readonly ReferencesDocument[];
  ontologyDocuments: readonly OntologyDocument[];
  /** Exact runtime identity for generic semantic-control lookup, when admitted. */
  semanticControlScope?: SemanticControlScope | undefined;
  /** Receives every terminal from the mounted Definition Action control. */
  onDefinitionActionResult?:
    | ((result: ResponseActionInvocationResult<SubmitResult>) => void)
    | undefined;
  /**
   * Optional host executor for the selected Definition-scoped document. The
   * renderer still owns action resolution and submission; this port lets a
   * generic async Response Actions runtime perform declared durable effects.
   */
  responseActionInvoker?: ResponseActionInvoker<SubmitResult> | undefined;
  /** Preserve the shell's completed-action navigation boundary. */
  onActionCompleted?:
    | ((
        action: ResponseAction,
        result: ResponseActionInvocationResult<SubmitResult>,
      ) => void)
    | undefined;
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
  plan: SlotPlan<SurfaceWidget>;
  grant: ThemeGrant;
  route: SurfaceWidgetRouteContext;
  /** The shell's own person-facing strings, host-overridable (§3.0). */
  strings: SurfaceStrings;
  dataSourceLoader?: DataSourceLoader | undefined;
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
  renderDefinitionForm?: SurfaceDefinitionFormRenderer | undefined;
  definitionActionInvoker?: ResponseActionInvoker<SubmitResult> | undefined;
  resolveSemanticControlScope?: SurfaceSemanticControlScopeResolver | undefined;
  /** Exact caller-paired identity used only by renderers that publish output. */
  semanticOutputScope?: SurfaceSemanticOutputScope | undefined;
  onDefinitionActionResult?:
    | ((result: ResponseActionInvocationResult<SubmitResult>) => void)
    | undefined;
  /** A published Action reached a successful terminal with a valid report. */
  onActionCompleted?:
    | ((
        action: ResponseAction,
        result: ResponseActionInvocationResult<SubmitResult>,
      ) => void)
    | undefined;
  onAdvance?:
    | ((
        transition: PlannedTransition,
        result?: Pick<
          ResponseActionInvocationResult<SurfaceWidgetActionDetail>,
          'transitionBindings'
        >,
      ) => 'advanced' | 'refused' | void)
    | undefined;
}

/** The action that is safe to use for route advancement, or no action. */
export function completedFormAction(
  result: ResponseActionInvocationResult<SubmitResult>,
): ResponseAction | undefined {
  if (result.status !== 'completed') return undefined;
  if (!result.resolution.resolved || !result.resolution.action) return undefined;
  if (result.detail?.validationReport?.valid !== true) return undefined;
  return result.resolution.action;
}

/**
 * Widget app actions have no Response to validate. Response-scoped widget
 * actions retain the form completion gate; app scope needs only the successful
 * resolved action terminal because the engine already enforced app validation.
 */
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
  if (result.status !== 'completed') return undefined;
  if (!result.resolution.resolved || !result.resolution.action) return undefined;
  const detail = result.detail;
  if (
    detail === null ||
    !Object.prototype.hasOwnProperty.call(detail, 'validationReport')
  ) {
    return undefined;
  }
  const validationReport = (detail as SubmitResult).validationReport;
  if (validationReport?.valid !== true) return undefined;
  return result.resolution.action;
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
  grant,
  route,
  strings,
  dataSourceLoader,
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
  renderDefinitionForm,
  definitionActionInvoker,
  resolveSemanticControlScope,
  semanticOutputScope,
  onDefinitionActionResult,
  onActionCompleted,
  onAdvance,
}: SurfaceSlotProps): ReactNode {
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
    case 'definition-form': {
      if (plan.status === 'unresolved' || plan.definition === undefined) {
        return <UnavailableSlot>{strings('slotUnavailableDefinitionForm')}</UnavailableSlot>;
      }
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
      const renderInput: SurfaceDefinitionFormRenderInput = {
        plan: {
          ...plan,
          status: 'ready',
          definition: plan.definition,
        },
        grant,
        route,
        responseActionsDocument,
        referencesDocuments: referencesDocuments ?? [],
        ontologyDocuments: ontologyDocuments ?? [],
        onDefinitionActionResult,
        onActionCompleted,
        responseActionInvoker: definitionActionInvoker,
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
      return renderDefinitionForm
        ? renderDefinitionForm(renderInput)
        : (
            <DefaultDefinitionFormSlot
              input={renderInput}
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
              grant={grant}
              route={route}
              strings={strings}
              dataSourceLoader={dataSourceLoader}
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
              renderDefinitionForm={renderDefinitionForm}
              resolveSemanticControlScope={resolveSemanticControlScope}
              semanticOutputScope={semanticOutputScope}
              onDefinitionActionResult={onDefinitionActionResult}
              onActionCompleted={onActionCompleted}
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

export function renderDefaultDefinitionForm({
  plan,
  grant,
  route,
  referencesDocuments,
  ontologyDocuments,
  responseActionsDocument,
  semanticControlScope,
  onDefinitionActionResult,
  onActionCompleted,
  responseActionInvoker,
}: SurfaceDefinitionFormRenderInput): ReactNode {
  return (
    <DefaultSurfaceDefinitionForm
      plan={plan}
      grant={grant}
      route={route}
      referencesDocuments={referencesDocuments}
      ontologyDocuments={ontologyDocuments}
      responseActionsDocument={responseActionsDocument}
      semanticControlScope={semanticControlScope}
      onDefinitionActionResult={onDefinitionActionResult}
      onActionCompleted={onActionCompleted}
      responseActionInvoker={responseActionInvoker}
    />
  );
}

function DefaultDefinitionFormSlot({
  input,
  semanticOutputScope,
}: {
  input: SurfaceDefinitionFormRenderInput;
  semanticOutputScope: SurfaceSemanticOutputPublisherScope | undefined;
}): ReactNode {
  useSurfaceSemanticOutputs(
    semanticOutputScope,
    semanticOutputScope
      ? [{ subjectRef: semanticOutputScope.subjectPrefix }]
      : [],
  );
  return renderDefaultDefinitionForm(input);
}

function DefaultSurfaceDefinitionForm({
  plan,
  grant,
  referencesDocuments,
  ontologyDocuments,
  responseActionsDocument,
  semanticControlScope,
  onDefinitionActionResult,
  onActionCompleted,
  responseActionInvoker,
}: SurfaceDefinitionFormRenderInput): ReactNode {
  const engine = useMemo(
    () => createFormEngine(plan.definition),
    [plan.definition],
  );
  useEffect(() => () => engine.dispose(), [engine]);

  const contextResolver = useMemo(() => {
    const references = referencesDocuments.filter((document) =>
      targetDefinitionMatches(document.targetDefinition, plan.definition));
    const ontologies = ontologyDocuments.filter((document) =>
      targetDefinitionMatches(document.targetDefinition, plan.definition));
    try {
      return new ContextResolver(
        engine,
        [...references],
        [...ontologies],
        [...plan.registryEntries],
      );
    } catch {
      return undefined;
    }
  }, [
    engine,
    ontologyDocuments,
    plan.definition,
    plan.registryEntries,
    referencesDocuments,
  ]);

  const resolveFieldHelp = useCallback(
    (path: string) => {
      if (!contextResolver) return [];
      try {
        const help = contextResolver.resolve(path, 'human');
        return Object.values(help.references).flatMap((entries) =>
          (entries ?? []).flatMap((reference: ReferenceEntry) =>
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
        return [];
      }
    },
    [contextResolver],
  );

  return (
    <FormspecForm
      engine={engine}
      themeDocument={grant.themeDocument}
      registryEntries={[...plan.registryEntries]}
      resolveFieldHelp={resolveFieldHelp}
      responseActionsDocument={responseActionsDocument ?? null}
      responseActionInvoker={responseActionInvoker ?? null}
      {...(semanticControlScope ? { semanticControlScope } : {})}
      emitThemeTokens={false}
      {...(onActionCompleted || onDefinitionActionResult
        ? {
            // `onSubmit` requests the renderer's declared submit control. It is
            // a no-op because durable effects have not reached a terminal yet.
            onSubmit: () => {},
            onActionResult: (
              result: ResponseActionInvocationResult<SubmitResult>,
            ) => {
              onDefinitionActionResult?.(result);
              const action = completedFormAction(result);
              if (action) onActionCompleted?.(action, result);
            },
          }
        : {})}
    />
  );
}

type ModuleWidgetPlan = Extract<SlotPlan<SurfaceWidget>, { slotType: 'module-widget' }>;

interface SurfaceWidgetSlotProps {
  plan: ModuleWidgetPlan;
  grant: ThemeGrant;
  route: SurfaceWidgetRouteContext;
  strings: SurfaceStrings;
  dataSourceLoader?: DataSourceLoader | undefined;
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
  onAdvance?:
    | ((
        transition: PlannedTransition,
        result?: Pick<
          ResponseActionInvocationResult<SurfaceWidgetActionDetail>,
          'transitionBindings'
        >,
      ) => 'advanced' | 'refused' | void)
    | undefined;
  semanticOutputScope?: SurfaceSemanticOutputPublisherScope | undefined;
}

const EMPTY_WIDGET_DATA = Object.freeze({}) as Readonly<Record<string, unknown>>;
const READY_WITH_NO_DATA: WidgetDataDelivery = {
  status: 'ready',
  data: EMPTY_WIDGET_DATA,
  degradedInputs: [],
  diagnostics: [],
};

type WidgetDataState = WidgetDataDelivery | { status: 'loading' };

function SurfaceWidgetSlot({
  plan,
  grant,
  route,
  strings,
  dataSourceLoader,
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
  const [delivery, setDelivery] = useState<WidgetDataState>(
    plan.dataInputs.length === 0 ? READY_WITH_NO_DATA : { status: 'loading' },
  );
  const [dataLoadAttempt, setDataLoadAttempt] = useState(0);
  const activeGeneration = useRef(runtimeGeneration);
  activeGeneration.current = runtimeGeneration;
  const localActionCoordinator = useRef(createWidgetActionCoordinator());
  const actionCoordinator = widgetActionCoordinator ?? localActionCoordinator.current;
  const navigatedInvocations = useRef(new Set<string>());
  const dataDiagnosticScope = `widget-data:${runtimeGeneration}:${plan.slotId}`;

  useEffect(() => {
    let current = true;
    if (plan.dataInputs.length > 0) setDelivery({ status: 'loading' });
    onRuntimeDiagnosticsChange?.(dataDiagnosticScope, []);

    void loadWidgetDataInputs({
      inputs: plan.dataInputs,
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
      loader: dataSourceLoader,
      authorize: authorizeDataSource,
      validatePayload: validateDataSourcePayload,
      site: {
        surfaceId: route.surfaceId,
        routeId: route.routeId,
        slotId: plan.slotId,
      },
    }).then((result) => {
      if (!current) return;
      setDelivery(result);
      onRuntimeDiagnosticsChange?.(dataDiagnosticScope, result.diagnostics);
    });

    return () => {
      current = false;
      onRuntimeDiagnosticsChange?.(dataDiagnosticScope, []);
    };
  }, [
    authorizeDataSource,
    dataDiagnosticScope,
    dataSourceLoader,
    onRuntimeDiagnosticsChange,
    plan.dataInputs,
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
      const document = responseActionsDocumentForAction(
        responseActionsDocuments,
        actionRef,
      );
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

      const source = {
        moduleId: plan.key.moduleId,
        widgetName: plan.key.widgetName,
        slotId: plan.slotId,
        route,
        outputName,
      };
      const emittedGeneration = runtimeGeneration;
      const emission = actionCoordinator.emit({
          generation: emittedGeneration,
          document,
          actionRef,
          source,
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
                    : 'failed' as const,
            }))
            .catch(() => ({ status: 'failed' as const })),
        };
      }
      const completion = emission.completion
        .then(({ invocationId, result }) => {
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
            return { status: 'failed' as const };
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
          const navigation = onAdvance?.(
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
  return (
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
  );
}

function UnavailableSlot({ children }: { children: ReactNode }) {
  return (
    <p className="fs-surface-unavailable" role="status" data-probe="slot-unavailable">
      {children}
    </p>
  );
}

export { nextLevel };
