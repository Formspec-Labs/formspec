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
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { FormspecForm } from '@formspec-org/react';
import type {
  ResponseAction,
  ResponseActionInvocationResult,
  ResponseActionsDocument as ReactResponseActionsDocument,
  SubmitResult,
} from '@formspec-org/react';
import type { ResponseActionsDocument as GeneratedResponseActionsDocument } from '@formspec-org/types';
import {
  loadWidgetDataInputs,
  responseActionsDocumentForDefinition,
  surfaceDiagnostic,
  type DataSourceAuthorizer,
  type DataSourceLoader,
  type DataSourcePayloadValidator,
  type PlannedTransition,
  type SlotPlan,
  type SurfaceDiagnostic,
  type SurfaceStrings,
  type ThemeGrant,
  type WidgetDataDelivery,
} from '@formspec-org/surface';
import { Heading, nextLevel } from './heading.js';
import type {
  SurfaceWidget,
  SurfaceWidgetActionExecutor,
  SurfaceWidgetActionOutcomeStore,
  SurfaceWidgetActionReport,
  SurfaceWidgetRouteContext,
} from './widget-api.js';
import {
  allocateWidgetActionInvocationId,
  createWidgetActionCoordinator,
  responseActionsDocumentForAction,
  type WidgetActionCoordinator,
} from './widget-action-runtime.js';
import { WidgetEmptyState } from './widgets/empty-state.js';
import { needIdTraceAttributes, needTraceAttributes } from './need-trace.js';

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
  /** Preserve the shell's completed-action navigation boundary. */
  onActionCompleted?: ((action: ResponseAction) => void) | undefined;
}

export type SurfaceDefinitionFormRenderer = (
  input: SurfaceDefinitionFormRenderInput,
) => ReactNode;

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
  /** A published Action reached a successful terminal with a valid report. */
  onActionCompleted?: ((action: ResponseAction) => void) | undefined;
  onAdvance?: ((transition: PlannedTransition) => void) | undefined;
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
  const { plan } = props;
  return (
    <section
      className="fs-surface-slot"
      data-slot={plan.slotId}
      data-slot-type={plan.slotType}
      {...needTraceAttributes(plan.needAnchors)}
      {...(plan.title ? { 'aria-label': plan.title } : {})}
    >
      {plan.title && !rendersOwnHeading(plan) && (
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
  transitions,
  widgetActionExecutor,
  widgetActionOutcomeStore,
  widgetActionCoordinator,
  runtimeGeneration,
  onWidgetActionReport,
  onRuntimeDiagnosticsChange,
  renderDefinitionForm,
  onActionCompleted,
  onAdvance,
}: SurfaceSlotProps): ReactNode {
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
        onActionCompleted,
      };
      return renderDefinitionForm
        ? renderDefinitionForm(renderInput)
        : renderDefaultDefinitionForm(renderInput);
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
          {unit.title && (
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
        />
      );
    }

    case 'static-content': {
      const { content } = plan;
      if (content === undefined) {
        return <UnavailableSlot>{strings('slotUnavailableStaticContent')}</UnavailableSlot>;
      }
      switch (content.kind) {
        case 'heading':
          return (
            <Heading
              level={content.level}
              className="fs-surface-static-heading"
              {...needTraceAttributes(plan.contentNeedAnchors)}
            >
              {content.content}
            </Heading>
          );
        case 'text':
          return (
            <p
              className="fs-surface-static-text"
              {...needTraceAttributes(plan.contentNeedAnchors)}
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
              {...needTraceAttributes(plan.contentNeedAnchors)}
              // Empty alt is an explicit authored decorative choice in Surface
              // 0.2. Missing alt never reaches this renderer.
              {...(content.decorative ? { role: 'presentation' } : {})}
            />
          );
        case 'divider':
          // Presentational only: no accessible name, not focusable, and
          // `content` is not rendered as text even when non-empty (§3.4.2).
          return (
            <hr
              className="fs-surface-static-divider"
              {...needTraceAttributes(plan.contentNeedAnchors)}
            />
          );
      }
      return null;
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
              transitions={transitions}
              widgetActionExecutor={widgetActionExecutor}
              widgetActionOutcomeStore={widgetActionOutcomeStore}
              widgetActionCoordinator={widgetActionCoordinator}
              runtimeGeneration={runtimeGeneration}
              onWidgetActionReport={onWidgetActionReport}
              onRuntimeDiagnosticsChange={onRuntimeDiagnosticsChange}
              renderDefinitionForm={renderDefinitionForm}
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

export function renderDefaultDefinitionForm({
  plan,
  grant,
  responseActionsDocument,
  onActionCompleted,
}: SurfaceDefinitionFormRenderInput): ReactNode {
  return (
    <FormspecForm
      definition={plan.definition}
      themeDocument={grant.themeDocument}
      registryEntries={[...plan.registryEntries]}
      responseActionsDocument={responseActionsDocument ?? null}
      emitThemeTokens={false}
      {...(onActionCompleted
        ? {
            // `onSubmit` requests the renderer's declared submit control. It is
            // a no-op because durable effects have not reached a terminal yet.
            onSubmit: () => {},
            onActionResult: (
              result: ResponseActionInvocationResult<SubmitResult>,
            ) => {
              const action = completedFormAction(result);
              if (action) onActionCompleted(action);
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
  onAdvance?: ((transition: PlannedTransition) => void) | undefined;
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
}: SurfaceWidgetSlotProps): ReactNode {
  const [delivery, setDelivery] = useState<WidgetDataState>(
    plan.dataInputs.length === 0 ? READY_WITH_NO_DATA : { status: 'loading' },
  );
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
    validateDataSourcePayload,
  ]);

  const reportRefusal = useCallback(
    (
      invocationId: string,
      outputName: string,
      code:
        | 'WIDGET-ACTION-OUTPUT-UNDECLARED'
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
    (outputName: string) => {
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
        return;
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
        return;
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
        return;
      }
      if (!widgetActionExecutor) {
        const invocationId = allocateWidgetActionInvocationId();
        onWidgetActionReport?.({
          invocationId,
          actionRef,
          outputName,
          navigation: 'not-attempted',
        });
        return;
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
          executor: widgetActionExecutor,
          outcomeStore: widgetActionOutcomeStore,
        });
      if (!emission.started) return;
      void emission.completion
        .then(({ invocationId, result }) => {
          if (activeGeneration.current !== emittedGeneration) {
            onWidgetActionReport?.({
              invocationId,
              actionRef,
              outputName,
              result,
              navigation: 'obsolete-generation',
            });
            return;
          }

          const action = completedFormAction(result);
          if (!action || action.id !== actionRef) {
            onWidgetActionReport?.({
              invocationId,
              actionRef,
              outputName,
              result,
              navigation: 'none',
            });
            return;
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
            return;
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
            return;
          }
          if (navigatedInvocations.current.has(invocationId)) return;
          navigatedInvocations.current.add(invocationId);
          onWidgetActionReport?.({
            invocationId,
            actionRef,
            outputName,
            result,
            navigation: 'advanced',
          });
          onAdvance?.(transition);
        })
        .catch(() => undefined);
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

  if (delivery.status === 'loading') {
    return (
      <div
        className="fs-surface-widget-loading"
        data-widget-data="loading"
        aria-busy="true"
      />
    );
  }
  if (delivery.status === 'unavailable') {
    const modes = delivery.failures
      .map((failure) => failure.failureMode)
      .filter((mode): mode is NonNullable<typeof mode> => mode !== undefined);
    const emptyState = modes.length > 0 && modes.every((mode) => mode === 'empty-state');
    if (emptyState) {
      return <WidgetEmptyState>{strings('widgetEmpty')}</WidgetEmptyState>;
    }
    return (
      <div
        data-widget-data="unavailable"
        data-widget-failure-mode={modes.join(' ')}
      >
        <UnavailableSlot>{strings('slotUnavailableWidgetData')}</UnavailableSlot>
      </div>
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
      actions={plan.actionOutputs.flatMap((output) =>
        output.action === undefined
          ? []
          : [{ outputName: output.name, ...output.action }],
      )}
      emitAction={emitAction}
      admitsTenantTheme={grant.admitsTenantTheme}
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
