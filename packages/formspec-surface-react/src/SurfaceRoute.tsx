import type { NativeScreenerSlotProps, SurfaceScreenerCompletionPolicy } from './screener-completion.js';
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
import { presentedRouteTitle, type SurfaceRouteTitleResolver } from './title-presentation.js';
import { activeWorkspaceSlot } from './workspace-navigation.js';
import type { DataSourceRevisionSelector } from './data-source-revision.js';
import { useMemo, useRef, useState, type ReactNode } from 'react';
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
  LocaleDocument,
  ReferencesDocument,
  ResponseActionsDocument,
} from '@formspec-org/types';
import { Heading } from './heading.js';
import { FilingStatus, useFilingDraftObservations, type FilingStatusOptions } from './FilingStatus.js';
import {
  SurfaceSlotFrame,
  type SurfaceDefinitionFormRenderInput,
  type SurfaceDefinitionFormRenderer,
  type SurfaceFormSession,
  type SurfaceSemanticControlScopeResolver,
} from './SurfaceSlot.js';
import { SurfaceTransitions } from './SurfaceTransitions.js';
import type {
  AdvanceTransition,
  FireTransition,
} from './SurfaceApp.js';
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
import { useSurfaceThemeTokens } from './surface-theme.js';

export interface SurfaceRouteViewProps {
  filingStatus?: FilingStatusOptions | undefined;
  bandPreferenceScope?: string | undefined;
  formSession?: SurfaceFormSession | undefined;
  localeDocuments?: readonly LocaleDocument[] | undefined;
  activeLocale?: string | undefined;
  screenerCompletion?: SurfaceScreenerCompletionPolicy | undefined;
  screenerInstanceId?: string | undefined;
  /** Pure destination check; required before host-required completion. */
  checkScreenerTarget?: ((target: string) => { status: 'accepted' } | { status: 'refused'; reason: string }) | undefined;
  onScreenerTarget?: NativeScreenerSlotProps['navigate'];
  /** Everything the core decided for this route. Nothing here re-decides it. */
  plan: SurfaceRoutePlan<SurfaceWidget>;
  resolveRouteTitle?: SurfaceRouteTitleResolver | undefined;
  /** The shell's own person-facing strings. Defaults to the shipped English. */
  strings?: SurfaceStrings | undefined;
  dataSourceLoader?: DataSourceLoader | undefined;
  /** Pure per-source scheduling hints; evaluated on host renders, never authority. */
  dataSourceRevision?: DataSourceRevisionSelector | undefined;
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
  onFireTransition?: FireTransition | undefined;
  /**
   * Called when a transition has actually completed under Response Actions
   * authority — never on a click. The shell navigates; it does not decide that
   * the action succeeded.
   */
  onAdvance?: AdvanceTransition | undefined;
}

export function SurfaceRouteView({
  plan,
  filingStatus,
  bandPreferenceScope,
  resolveRouteTitle,
  strings,
  dataSourceLoader,
  dataSourceRevision,
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
  onScreenerTarget,
  checkScreenerTarget,
  screenerInstanceId,
  screenerCompletion,
  localeDocuments,
  activeLocale,
  formSession,
}: SurfaceRouteViewProps) {
  const container = useRef<HTMLElement>(null);
  const { handle, grant, params } = plan;
  const text = strings ?? resolveSurfaceStrings();
  const port = formSession?.drafts?.port;
  const suppliedReader = filingStatus?.readSummaries;
  const readSummaries = useMemo(() => suppliedReader ?? port?.readSummaries.bind(port), [suppliedReader, port]);
  const draftScope = suppliedReader ? formSession?.previewScope : formSession?.drafts?.scope;
  const observedSlots = useMemo(() => plan.bands?.length
    ? [...plan.bands.map(band => band.slot), ...plan.slots] : plan.slots, [plan.bands, plan.slots]);
  const filingReads = useFilingDraftObservations(
    observedSlots, readSummaries, draftScope, filingStatus?.revision, runtimeGeneration, formSession?.draftRevision,
    { loader: dataSourceLoader, authorize: authorizeDataSource, validatePayload: validateDataSourcePayload }, dataSourceRevision,
  );
  const filingStatusContext = { ...filingStatus, ...filingReads };

  useSurfaceThemeTokens(container, grant.themeDocument);

  const workspace = formSession?.workspace;
  const activeSlot = activeWorkspaceSlot(plan, workspace?.slot);

  const titleLevel = resolveRouteTitleLevel(plan.headingBaseLevel);
  const titleText = presentedRouteTitle(handle, resolveRouteTitle);
  const titleId = `fs-surface-title-${handle.routeId}`;
  const route = {
    surfaceId: handle.surfaceId,
    surfaceRef: plan.surfaceRef,
    routeId: handle.routeId,
    routeClass: handle.route.routeClass,
    title: titleText,
    params,
  };
  const semanticOutputScope = resolveSemanticOutputScope?.({
    plan,
    route,
    runtimeGeneration,
  });
  const hasWidgetSlot = plan.slots.some(
    (slotPlan) => slotPlan.slotType === 'module-widget',
  );
  const hasDecisionFormSlot = plan.slots.some(
    (slotPlan) => slotPlan.slotType === 'definition-form',
  );
  const routeClass = String(handle.route.routeClass ?? 'unclassified');
  const routeLayout =
    (routeClass === 'review' && plan.slots.length > 1) ||
    (handle.route.routeClass === 'operation' &&
      hasWidgetSlot &&
      hasDecisionFormSlot)
      ? 'split'
      : undefined;

  return (
    <article
      ref={container}
      className={`fs-surface-route fs-surface-route--${grant.admitsTenantTheme ? 'branded' : 'platform'}`}
      data-route={handle.routeId}
      data-surface={handle.surfaceId}
      data-route-class={handle.route.routeClass ?? 'unclassified'}
      data-route-layout={routeLayout}
      data-fs-appearance={formSession?.appearance}
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

      {plan.bands?.map(({ routeId, slot }) => {
        const preference = JSON.stringify([bandPreferenceScope, plan.surfaceRef ?? handle.surfaceId, routeId, slot.slotId]);
        return <TrackerBand key={preference} preference={preference} title={slot.title?.trim() ? slot.title : text('filingMap')}>
          <div data-slot={slot.slotId} data-slot-type={slot.slotType} {...needTraceAttributes(slot.needAnchors)}>
            <FilingStatus plan={slot.tracker} context={filingStatusContext} level={slot.headingBaseLevel} text={text} />
          </div>
        </TrackerBand>;
      })}

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
            filingStatus={filingStatusContext}
            screenerCompletion={screenerCompletion}
              checkScreenerTarget={checkScreenerTarget}
              onScreenerTarget={onScreenerTarget}
            screenerInstanceId={screenerInstanceId}
            localeDocuments={localeDocuments}
            activeLocale={activeLocale}
            formSession={formSession}
            {...(workspace && slotPlan.slotId === activeSlot && { activeSection: workspace.activeSection })}
            sectionNavigationActive={slotPlan.slotId === activeSlot}
            grant={grant}
            route={route}
            strings={text}
            dataSourceLoader={dataSourceLoader}
            dataSourceRevision={dataSourceRevision}
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
                  candidate.actionId === action.id,
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
        from={{ ...handle, params: plan.params }}
        transitions={plan.transitions}
        strings={text}
        {...(onFireTransition ? { onFire: onFireTransition } : {})}
        {...(onAdvance ? { onAdvance } : {})}
      />
    </article>
  );
}

/** Native disclosure supplies keyboard behavior and a localized default summary for untitled slots. */
function TrackerBand({ preference, title, children }: {
  preference: string; title: string; children: ReactNode;
}) {
  const key = `formspec.surface.tracker-band.${preference}`;
  const [initiallyExpanded] = useState(() => {
    try { return window.localStorage.getItem(key) !== 'closed'; }
    catch { return true; }
  });
  return <details data-filing-band="" open={initiallyExpanded}>
    <summary onClick={event => {
      // Persist before the browser can navigate away. Native toggle events are queued.
      const open = !event.currentTarget.closest('details')?.open;
      try { window.localStorage.setItem(key, open ? 'open' : 'closed'); }
      catch { /* The disclosure remains usable when storage is unavailable. */ }
    }}>{title}</summary>
    {children}
  </details>;
}
