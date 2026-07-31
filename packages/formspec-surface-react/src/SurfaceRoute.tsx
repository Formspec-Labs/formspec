/**
 * @filedesc `SurfaceRouteView` — one route plan, rendered, with its theme
 * boundary.
 *
 * It takes a `SurfaceRoutePlan` and re-derives nothing in it: not the route
 * match, not the theme grant, not the slot dispatch, not the heading level, not
 * the transition state (`surface-shell-spec.md` §8.3 item 1). Three things
 * happen here and nowhere else:
 *
 * 1. **The route title takes the level the composition assigns.** At the
 *    default baseline of 2 it is the page's single `h1`. A host that owns the
 *    page heading passes `headingBaseLevel: 1`, and this renders no title
 *    heading at all rather than a second `h1` under the host's — the shell
 *    honours the baseline it was given (§3.4.1 obligation 3). The level comes
 *    from `resolveRouteTitleLevel` in the core, so this file decides nothing
 *    about the outline.
 *
 * 2. **The grant's tokens are emitted on THIS element, with cleanup** (TB-2).
 *    Scoped, not global. `emitMergedThemeCssVars` is the same helper
 *    `FormspecForm` uses on its own container, used the same correct way:
 *    written on mount, removed on unmount, never on `document.documentElement`.
 *    A refusing route therefore carries the platform values and a branded route
 *    carries the tenant's, and navigating between them leaves no residue.
 *
 *    Deliberately NOT paired with a document-root scrub. A shell that scrubbed
 *    would be manufacturing the property it claims to hold, which is not a
 *    measurement of anything (§4.5). `SurfaceApp` READS the root and reports
 *    `THEME-DOCUMENT-ROOT-CONTAMINATED` instead.
 *
 * 3. **Slots render in authored order.** `slot.position` is an author hint that
 *    v0.1 explicitly gives "no normative position vocabulary", so honouring it
 *    would mean inventing one. Authored order is the only thing defined.
 */
import { useLayoutEffect, useRef } from 'react';
import { emitMergedThemeCssVars } from '@formspec-org/layout';
import {
  generationNeedAnchors,
  resolveRouteTitleLevel,
  resolveSurfaceStrings,
  type DataSourceAuthorizer,
  type DataSourceLoader,
  type DataSourcePayloadValidator,
  type PlannedTransition,
  type SurfaceDiagnostic,
  type SurfaceRoutePlan,
  type SurfaceStrings,
} from '@formspec-org/surface';
import type {
  OntologyDocument,
  ReferencesDocument,
  ResponseActionsDocument,
} from '@formspec-org/types';
import { Heading } from './heading.js';
import {
  SurfaceSlotFrame,
  type SurfaceDefinitionFormRenderInput,
  type SurfaceDefinitionFormRenderer,
  type SurfaceSemanticControlScopeResolver,
} from './SurfaceSlot.js';
import { SurfaceTransitions } from './SurfaceTransitions.js';
import type { SurfaceTransitionOutcome } from './SurfaceApp.js';
import type {
  SurfaceWidget,
  SurfaceWidgetActionExecutor,
  SurfaceWidgetActionOutcomeStore,
  SurfaceWidgetActionReport,
} from './widget-api.js';
import type {
  SurfaceSemanticOutputScopeResolver,
} from './semantic-output.js';
import type { WidgetActionCoordinator } from './widget-action-runtime.js';
import { needTraceAttributes } from './need-trace.js';

export interface SurfaceRouteViewProps {
  /** Everything the core decided for this route. Nothing here re-decides it. */
  plan: SurfaceRoutePlan<SurfaceWidget>;
  /** The shell's own person-facing strings. Defaults to the shipped English. */
  strings?: SurfaceStrings | undefined;
  dataSourceLoader?: DataSourceLoader | undefined;
  authorizeDataSource?: DataSourceAuthorizer | undefined;
  validateDataSourcePayload?: DataSourcePayloadValidator | undefined;
  widgetActionExecutor?: SurfaceWidgetActionExecutor | undefined;
  widgetActionOutcomeStore?: SurfaceWidgetActionOutcomeStore | undefined;
  widgetActionCoordinator?: WidgetActionCoordinator | undefined;
  runtimeGeneration?: string | undefined;
  onWidgetActionReport?: ((report: SurfaceWidgetActionReport) => void) | undefined;
  onRuntimeDiagnosticsChange?:
    | ((scope: string, diagnostics: readonly SurfaceDiagnostic[]) => void)
    | undefined;
  renderDefinitionForm?: SurfaceDefinitionFormRenderer | undefined;
  definitionActionInvoker?:
    | SurfaceDefinitionFormRenderInput['responseActionInvoker']
    | undefined;
  resolveSemanticControlScope?: SurfaceSemanticControlScopeResolver | undefined;
  resolveSemanticOutputScope?: SurfaceSemanticOutputScopeResolver | undefined;
  onDefinitionActionResult?:
    | SurfaceDefinitionFormRenderInput['onDefinitionActionResult']
    | undefined;
  showExperienceNeeds?: boolean | undefined;
  /**
   * Shows the theme-posture sentence on the page. **Default false** (§4.3.1):
   * on an admitting route it carries no information, and on any route it is
   * chrome the bundle did not author appearing above content that was signed.
   * A host that wants the refusal visible — and there is a real trust argument
   * for showing it on `proof` and `ceremony` routes — opts in.
   */
  showThemeNotice?: boolean | undefined;
  /** The Response Actions document a `definition-form` slot runs its actions under. */
  responseActionsDocuments?: readonly ResponseActionsDocument[] | undefined;
  /** Manifested References documents available to matching Definition forms. */
  referencesDocuments?: readonly ReferencesDocument[] | undefined;
  /** Manifested Ontology documents available to matching Definition forms. */
  ontologyDocuments?: readonly OntologyDocument[] | undefined;
  /** Runs a transition's action under Response Actions authority. */
  onFireTransition?:
    | ((
        transition: PlannedTransition,
        from: SurfaceRoutePlan<SurfaceWidget>['handle'],
      ) => Promise<SurfaceTransitionOutcome>)
    | undefined;
  /**
   * Called when a transition has actually completed under Response Actions
   * authority — never on a click. The shell navigates; it does not decide that
   * the action succeeded.
   */
  onAdvance?:
    | ((
        transition: PlannedTransition,
        outcome?: Pick<SurfaceTransitionOutcome, 'transitionBindings'>,
      ) => void)
    | undefined;
}

export function SurfaceRouteView({
  plan,
  strings,
  dataSourceLoader,
  authorizeDataSource,
  validateDataSourcePayload,
  widgetActionExecutor,
  widgetActionOutcomeStore,
  widgetActionCoordinator,
  runtimeGeneration,
  onWidgetActionReport,
  onRuntimeDiagnosticsChange,
  renderDefinitionForm,
  definitionActionInvoker,
  resolveSemanticControlScope,
  resolveSemanticOutputScope,
  onDefinitionActionResult,
  showExperienceNeeds,
  showThemeNotice = false,
  responseActionsDocuments,
  referencesDocuments,
  ontologyDocuments,
  onFireTransition,
  onAdvance,
}: SurfaceRouteViewProps) {
  const container = useRef<HTMLElement>(null);
  const { handle, grant, params } = plan;
  const text = strings ?? resolveSurfaceStrings();

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const tokens = (grant.themeDocument as { tokens?: Record<string, string | number> }).tokens;
    emitMergedThemeCssVars(element, { themeTokens: tokens ?? {} });
    return () => {
      for (let index = element.style.length - 1; index >= 0; index -= 1) {
        const property = element.style[index];
        if (property?.startsWith('--formspec-')) element.style.removeProperty(property);
      }
    };
  }, [grant]);

  const route = {
    surfaceId: handle.surfaceId,
    surfaceRef: plan.surfaceRef,
    routeId: handle.routeId,
    routeClass: handle.route.routeClass,
    params,
  };
  const semanticOutputScope = resolveSemanticOutputScope?.({
    plan,
    route,
    runtimeGeneration,
  });

  const titleLevel = resolveRouteTitleLevel(plan.headingBaseLevel);
  const titleText = handle.route.title ?? handle.routeId;
  const titleId = `fs-surface-title-${handle.routeId}`;

  return (
    <article
      ref={container}
      className={`fs-surface-route fs-surface-route--${grant.admitsTenantTheme ? 'branded' : 'platform'}`}
      data-route={handle.routeId}
      data-surface={handle.surfaceId}
      data-route-class={handle.route.routeClass ?? 'unclassified'}
      data-tenant-theme={grant.admitsTenantTheme ? 'admitted' : 'refused'}
      data-tenant-token-count={grant.tenantTokenKeys.length}
      {...needTraceAttributes(generationNeedAnchors(handle.route))}
      // When the host owns the page heading the shell renders no title element,
      // so the region is named directly rather than pointing at a node that is
      // not there.
      {...(titleLevel === undefined
        ? { 'aria-label': titleText }
        : { 'aria-labelledby': titleId })}
    >
      {titleLevel !== undefined && (
        <Heading level={titleLevel} className="fs-surface-route__title" id={titleId}>
          {titleText}
        </Heading>
      )}

      {showThemeNotice && (
        <p
          className={`fs-surface-themenote fs-surface-themenote--${grant.posture}`}
          data-probe="theme-note"
        >
          {grant.reason}
        </p>
      )}

      <div className="fs-surface-route__slots">
        {plan.slots.map((slotPlan) => (
          <SurfaceSlotFrame
            key={slotPlan.slotId}
            plan={slotPlan}
            grant={grant}
            route={route}
            strings={text}
            dataSourceLoader={dataSourceLoader}
            authorizeDataSource={authorizeDataSource}
            validateDataSourcePayload={validateDataSourcePayload}
            showExperienceNeeds={showExperienceNeeds}
            responseActionsDocuments={responseActionsDocuments}
            referencesDocuments={referencesDocuments}
            ontologyDocuments={ontologyDocuments}
            transitions={plan.transitions}
            widgetActionExecutor={widgetActionExecutor}
            widgetActionOutcomeStore={widgetActionOutcomeStore}
            widgetActionCoordinator={widgetActionCoordinator}
            runtimeGeneration={runtimeGeneration}
            onWidgetActionReport={onWidgetActionReport}
            onRuntimeDiagnosticsChange={onRuntimeDiagnosticsChange}
            renderDefinitionForm={renderDefinitionForm}
            definitionActionInvoker={definitionActionInvoker}
            resolveSemanticControlScope={resolveSemanticControlScope}
            semanticOutputScope={semanticOutputScope}
            onDefinitionActionResult={onDefinitionActionResult}
            onActionCompleted={(action, result) => {
              // The form's own submit ran under Response Actions authority and
              // reported success. THAT is what advances the route — not the
              // click that started it.
              const supplied = plan.transitions.filter(
                (candidate) =>
                  candidate.status === 'supplied-by-slot' &&
                  (candidate.trigger === action.id ||
                    candidate.trigger === action.intent),
              );
              if (supplied.length === 1 && supplied[0]) {
                onAdvance?.(
                  supplied[0],
                  result.transitionBindings
                    ? { transitionBindings: result.transitionBindings }
                    : undefined,
                );
              }
            }}
            onAdvance={onAdvance}
          />
        ))}
      </div>

      <SurfaceTransitions
        from={handle}
        transitions={plan.transitions}
        strings={text}
        {...(onFireTransition ? { onFire: onFireTransition } : {})}
        {...(onAdvance ? { onAdvance } : {})}
      />
    </article>
  );
}
