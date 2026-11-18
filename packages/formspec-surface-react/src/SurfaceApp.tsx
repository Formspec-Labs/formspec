import type { SurfaceScreenerCompletionPolicy } from './screener-completion.js';
/**
 * @filedesc `SurfaceApp` — a bundle's Surfaces, running.
 *
 * This is the piece that did not exist. Every `SurfaceDocument` consumer in the
 * stack was authoring-side (`studio-core`'s kernel, the MCP wireframe verbs) or
 * validation-side (the app-graph validator, `formspec-lint`); the one
 * rendering-adjacent consumer never opened a Surface document at all. So the
 * closed slot taxonomy, the route-class vocabulary, the route graph and the
 * transition triggers were authored, enforced, and read by nothing at render
 * time.
 *
 * ## Every diagnostic reaches the host, whatever stage produced it
 *
 * `surface-shell-spec.md` §7.1. This component previously aggregated only the
 * bundle, composition, registry and theme-construction diagnostics; the route
 * plan and the transition plan were computed inside a child and their
 * diagnostics **discarded**, so `SLOT-BINDING-INCOMPLETE`,
 * `STATIC-IMAGE-NO-ALT`, `EMBED-ROUTE-*`, `WIDGET-*`, per-slot
 * `BUNDLE-DOCUMENT-MISSING` and every `TRANSITION-UNFIREABLE` reached the
 * screen and never `onDiagnostics`. Per-route stages produce most of the code
 * set, so that delivered the minority of it.
 *
 * The fix is structural rather than an extra call: `planMatchedRoute` composes
 * the grant, the slot plan and the transition plan in the core and returns one
 * diagnostic list, and this component unions it with the app-construction list
 * and the route-resolution list in one memo. There is no second place a
 * diagnostic could be computed and dropped.
 *
 * ## Composition order, and why the theme authority is built first
 *
 * {@link useSurfaceApp} builds the theme authority **once, from the bundle**, and
 * hands back a `grantFor` that is the only route into the tenant Theme. The
 * tenant Theme is never a prop of anything below this line, so a slot renderer
 * cannot reach it by accident and a future prop cannot restore it by mistake.
 * That is the structural half of THEME-ROUTE-CLASS.
 *
 * ## Navigation is a port, not a router
 *
 * `location` and `onNavigate` are props. This package ships
 * BrowserSurfaceApp for hosts that want the address bar, and stays out
 * of the way of hosts that already have a router — which every host of any size
 * does. A shell that owned history would be a shell that could not be embedded.
 */
import { presentedRouteLabel, presentedRouteTitle, type SurfaceRouteTitleResolver } from './title-presentation.js';
import { definitionLocaleLookup } from './browser-locale.js';
import { activeWorkspaceSlot } from './workspace-navigation.js';
import { useHostAppearance } from './browser-appearance.js';
import type { DataSourceRevisionSelector } from './data-source-revision.js';
import { deriveSurfaceRuntimeGeneration } from "./runtime-generation.js";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  canonicalFiniteJson,
  composeSurfaceApp,
  createThemeAuthority,
  createWidgetRegistry,
  documentRootContaminationDiagnostic,
  flattenRegistryEntries,
  generationNeedAnchors,
  matchRoute,
  mergeNeedAnchors,
  planMatchedRoute,
  resolveSurfaceStrings,
  routeHref,
  type DataSourceAuthorizer,
  type DataSourceLoader,
  type DataSourcePayloadValidator,
  type HeadingLevel,
  type PlannedTransition,
  type ResolvedBundle,
  type SurfaceApp as ComposedSurfaceApp,
  type SurfaceCompositionOptions,
  type SurfaceDiagnostic,
  type SurfaceRouteHandle,
  type SurfaceRoutePlan,
  type SurfaceDefinitionComponentResolver,
  type SurfaceStringOverrides,
  type SurfaceStrings,
  type SurfaceStaticAssetResolver,
  type ThemeAuthority,
  type TransitionConditionEvaluator,
  type WidgetRegistry,
} from "@formspec-org/surface";
import type { RegistryEntry, LocaleDocument, ThemeDocument } from "@formspec-org/types";
import { SurfaceRouteView } from "./SurfaceRoute.js";
import type {
  SurfaceWidget,
  SurfaceWidgetActionExecutor,
  SurfaceWidgetActionOutcomeStore,
  SurfaceWidgetActionReport,
  SurfaceWidgetModule,
} from "./widget-api.js";
import type {
  SurfaceDefinitionFormRenderInput,
  SurfaceDefinitionFormRenderer,
  SurfaceFormSession,
  SurfaceSemanticControlScopeResolver,
} from "./SurfaceSlot.js";
import type { SurfaceSemanticOutputScopeResolver } from "./semantic-output.js";
import { createWidgetActionCoordinator } from "./widget-action-runtime.js";
import {
  diagnosticListsEqual,
  useDiagnosticDelivery,
} from "./diagnostic-delivery.js";
import { needTraceAttributes } from "./need-trace.js";
import { useSurfaceThemeTokens } from "./surface-theme.js";
import type { FilingStatusOptions } from "./FilingStatus.js";
import { isPlainLinkClick } from "./browser-location.js";

export interface SurfaceTransitionOutcome {
  advanced: boolean;
  reason?: string;
  /**
   * Allowlisted strings admitted for authored transition parameters.
   * Response Action runtimes supply declared transition outputs. A completed
   * app-scoped widget action may also supply its already-admitted top-level
   * string input; that merge remains private to the navigation handoff.
   */
  transitionBindings?: Readonly<Record<string, string>>;
}

/** Matched route identity plus the admitted values parsed from its address. */
export type SurfaceTransitionSource = SurfaceRouteHandle & Readonly<{
  params: Readonly<Record<string, string>>;
}>;

export type FireTransition = (
  transition: PlannedTransition,
  from: SurfaceTransitionSource
) => Promise<SurfaceTransitionOutcome>;

type AdvanceResult = "advanced" | "refused";
type ActionNavigation = (href: string) => void | boolean | Promise<boolean>;
export type AdvanceTransition = (
  transition: PlannedTransition,
  outcome?: Pick<SurfaceTransitionOutcome, "transitionBindings">,
) => AdvanceResult | Promise<AdvanceResult> | void;

/**
 * Final navigation boundary after a Response Action reports completion.
 *
 * Planning already withholds collision- and parameter-refused transitions.
 * This rechecks the target so a future binding path, stale plan, or adversarial
 * completed-action report still cannot publish an unusable address.
 */
export function navigateAfterCompletedAction(
  transition: PlannedTransition,
  routeParams: Readonly<Record<string, string>>,
  transitionBindings: Readonly<Record<string, string>> | undefined,
  onNavigate: (href: string) => boolean | Promise<boolean>
): AdvanceResult | Promise<AdvanceResult>;
export function navigateAfterCompletedAction(
  transition: PlannedTransition,
  routeParams: Readonly<Record<string, string>>,
  onNavigate: (href: string) => void
): "advanced" | "refused";
export function navigateAfterCompletedAction(
  transition: PlannedTransition,
  routeParams: Readonly<Record<string, string>>,
  transitionBindings: Readonly<Record<string, string>> | undefined,
  onNavigate: (href: string) => void
): "advanced" | "refused";
export function navigateAfterCompletedAction(
  transition: PlannedTransition,
  routeParams: Readonly<Record<string, string>>,
  transitionBindingsOrNavigate:
    | Readonly<Record<string, string>>
    | undefined
    | ActionNavigation,
  maybeNavigate?: ActionNavigation
): AdvanceResult | Promise<AdvanceResult> {
  if (!transition.target) return "refused";
  const onNavigate =
    typeof transitionBindingsOrNavigate === "function"
      ? transitionBindingsOrNavigate
      : maybeNavigate;
  if (!onNavigate) return "refused";
  const transitionBindings =
    typeof transitionBindingsOrNavigate === "function"
      ? undefined
      : transitionBindingsOrNavigate;
  const nextParams: Record<string, string> = { ...routeParams };
  for (const [targetParam, bindingName] of Object.entries(
    transition.params ?? {}
  )) {
    const routeValue = routeParams[bindingName];
    const actionValue = transitionBindings?.[bindingName];
    const admitted = [routeValue, actionValue].filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
    if (admitted.length === 0) return "refused";
    const value = admitted[0]!;
    if (admitted.some((candidate) => candidate !== value)) return "refused";
    nextParams[targetParam] = value;
  }
  const destination = routeHref(transition.target, nextParams);
  if (destination.refusal !== undefined) return "refused";
  const navigation = onNavigate(destination.href);
  const disposition = (accepted: unknown): AdvanceResult => accepted === false ? "refused" : "advanced";
  return typeof navigation === "object" && navigation !== null && typeof navigation.then === "function"
    ? navigation.then(disposition)
    : disposition(navigation);
}

export interface UseSurfaceAppInput {
  bundle: ResolvedBundle;
  widgetModules?: readonly SurfaceWidgetModule[] | undefined;
  /** Host-supplied navigation labels. See `composeSurfaceApp`. */
  surfaceLabel?: SurfaceCompositionOptions["surfaceLabel"] | undefined;
  /** Host-supplied token aliases. Not a platform rule — see `createThemeAuthority`. */
  tokenAliases?: Readonly<Record<string, readonly string[]>> | undefined;
  /** Theme supplied by the trusted platform, independent of the admitted bundle. */
  platformTheme?: ThemeDocument | undefined;
}

/**
 * Host/router-owned current route after a committed Surface render.
 * The Surface object identity lets an evidence adapter pair its caller-owned
 * canonical digest without asking the renderer to compute or attest one.
 */
export interface SurfaceCurrentRouteState {
  surface: SurfaceRouteHandle["surface"];
  surfaceId: string;
  surfaceRef?: string | undefined;
  routeId: string;
  routeInstanceId: string;
}

export interface SurfaceAppModel {
  app: ComposedSurfaceApp;
  themeAuthority: ThemeAuthority;
  widgets: WidgetRegistry<SurfaceWidget>;
  registryEntries: readonly RegistryEntry[];
  /** Bundle, composition, registry and theme-construction diagnostics only. */
  diagnostics: readonly SurfaceDiagnostic[];
}

export function useSurfaceApp(input: UseSurfaceAppInput): SurfaceAppModel {
  const { bundle, surfaceLabel, tokenAliases, platformTheme, widgetModules } = input;

  return useMemo(() => {
    const compositionOptions: SurfaceCompositionOptions = {
      ...(surfaceLabel ? { surfaceLabel } : {}),
      entrySurface: bundle.entrySurface,
    };
    const app = composeSurfaceApp(bundle.surfaces, compositionOptions);
    const registry = flattenRegistryEntries(bundle.registries);
    const themeAuthority = createThemeAuthority({
      tenantTheme: bundle.tenantTheme,
      platformTheme,
      tokenAliases,
    });
    const widgets = createWidgetRegistry<SurfaceWidget>({
      modules: widgetModules ?? [],
      registryEntries: registry.entries,
    });
    return {
      app,
      themeAuthority,
      widgets,
      registryEntries: registry.entries,
      diagnostics: [
        ...bundle.diagnostics,
        ...app.diagnostics,
        ...registry.diagnostics,
        ...themeAuthority.diagnostics,
      ],
    };
  }, [bundle, surfaceLabel, tokenAliases, platformTheme, widgetModules]);
}

export interface SurfaceAppProps extends UseSurfaceAppInput {
  /** Explicit awaited host completion; omitted means stateless navigation. */
  screenerCompletion?: SurfaceScreenerCompletionPolicy | undefined;
  /** Selected host language for native Screener presentation. */
  activeLocale?: string | undefined;
  /** Host-admitted resources; defaults to exact manifested Locale documents. */
  localeDocuments?: readonly LocaleDocument[] | undefined;
  /** Current path, e.g. `window.location.pathname`. */
  location: string;
  onNavigate: (href: string) => void;
  /** Pure host link destination. Undefined makes the route unavailable as a link. */
  resolveNavigationHref?: ((href: string) => string | undefined) | undefined;
  /**
   * Values for route parameters, so parameterised routes can be linked.
   *
   * The shell does not invent these. A bundle with no submission has no case
   * reference, and a nav link to `/receipt/{caseRef}` with nothing to put in it
   * raises `ROUTE-PARAM-UNSUPPLIED` rather than quietly linking nowhere.
   */
  routeParams?: Readonly<Record<string, string>> | undefined;
  /** Canonical Data Sources payload port; receives exact resolved descriptors. */
  dataSourceLoader?: DataSourceLoader | undefined;
  /** Pure per-source scheduling hints; evaluated on host renders, never authority. */
  dataSourceRevision?: DataSourceRevisionSelector | undefined;
  /** Host admission verdict applied before every data load. */
  authorizeDataSource?: DataSourceAuthorizer | undefined;
  /** Required when a bound source declares a payload schema. */
  validateDataSourcePayload?: DataSourcePayloadValidator | undefined;
  /** Adapter to the existing Response Actions executor for widget outputs. */
  widgetActionExecutor?: SurfaceWidgetActionExecutor | undefined;
  /** Optional durable replay store for completed widget action invocations. */
  widgetActionOutcomeStore?: SurfaceWidgetActionOutcomeStore | undefined;
  /** Opaque host generation marker; changing it invalidates late navigation. */
  sessionGeneration?: string | number | undefined;
  onWidgetActionReport?:
    | ((report: SurfaceWidgetActionReport) => void)
    | undefined;
  /** Reads authorized draft progress across the filing tracker in one batch. */
  readSummaries?: FilingStatusOptions["readSummaries"];
  /** Change when a committed observation should be read again. */
  filingDraftRevision?: FilingStatusOptions["revision"];
  /** Pure selection of an admitted Component for both the form and its tracker links. */
  resolveDefinitionComponent?: SurfaceDefinitionComponentResolver | undefined;
  /** Host form runtime seam; the current `FormspecForm` remains the default. */
  renderDefinitionForm?: SurfaceDefinitionFormRenderer | undefined;
  /** Generic async Response Actions executor used by mounted Definition forms. */
  definitionActionInvoker?:
    | SurfaceDefinitionFormRenderInput["responseActionInvoker"]
    | undefined;
  /**
   * Caller-paired canonical artifact and Response identity for semantic
   * controls. Omission leaves ordinary rendering unchanged and publishes no
   * executable semantic-control lookup.
   */
  resolveSemanticControlScope?: SurfaceSemanticControlScopeResolver | undefined;
  /**
   * Caller-paired canonical Surface identity for renderer-produced output.
   * Omission publishes no semantic-output evidence.
   */
  resolveSemanticOutputScope?: SurfaceSemanticOutputScopeResolver | undefined;
  /** Receives every terminal from the default mounted Definition renderer. */
  onDefinitionActionResult?:
    | SurfaceDefinitionFormRenderInput["onDefinitionActionResult"]
    | undefined;
  /**
   * Admits or refuses each authored static image source before rendering.
   * Without this host resolver, image slots remain unavailable.
   */
  staticAssetResolver?: SurfaceStaticAssetResolver | undefined;
  /**
   * Runs a transition's action under Response Actions authority. Absent ⇒ no
   * transition renders a control. See `SurfaceTransitions`.
   */
  onFireTransition?: FireTransition | undefined;
  /** Evaluates transition `when` expressions against validated bundle state. */
  evaluateTransitionCondition?: TransitionConditionEvaluator | undefined;
  showExperienceNeeds?: boolean | undefined;
  /** Shows the theme-posture sentence on the page. Default false (§4.3.1). */
  showThemeNotice?: boolean | undefined;
  /**
   * Level route content starts at. Default 2 — the route title is the page's
   * single `h1`. A host whose own chrome already owns the page heading passes
   * `1`, and the shell offsets from it and renders no title heading of its own
   * (§3.4.1 obligation 3). A shell that hard-codes the outline cannot be
   * embedded.
   */
  headingBaseLevel?: HeadingLevel | undefined;
  /**
   * Overrides for the shell's own person-facing strings — the enumerable,
   * closed set in `@formspec-org/surface`'s `strings.ts` (§3.0). This is the
   * seam finding F7 lands on; it is not localisation.
   */
  strings?: SurfaceStrings | SurfaceStringOverrides | undefined;
  /**
   * Sets `document.title` from the bundle, and **restores the previous title on
   * unmount**. Default true.
   *
   * The cleanup is the point: §8.3 item 9 requires a binding to clean up any
   * document-level state it sets, "including the document title. A binding that
   * scopes its tokens and then writes an uncleaned global elsewhere has applied
   * the rule to one channel and not the principle."
   */
  setDocumentTitle?: boolean | undefined;
  /** Above the navigation — verification chrome, tenant header, whatever the host has. */
  header?: ReactNode;
  /** Host-owned presentation title for the default banner and browser title. */
  appTitle?: string | undefined;
  /** Host-owned route presentation; explicit navigation labels still take precedence. */
  resolveRouteTitle?: SurfaceRouteTitleResolver | undefined;
  footer?: ReactNode;
  navigationLabel?: string | undefined;
  renderNotFound?: ((location: string) => ReactNode) | undefined;
  /**
   * Called with EVERY diagnostic — bundle, composition, registry, theme, route
   * resolution, slot planning, theme grant, transition planning, and the
   * document-root observation — once on subscription and after each semantic
   * change. Equivalent object identities and callback replacement do not
   * replay the list.
   */
  onDiagnostics?:
    | ((diagnostics: readonly SurfaceDiagnostic[]) => void)
    | undefined;
  /**
   * Receives authoritative current-route state after commit and `undefined`
   * when no route is current or the committed route unmounts.
   */
  onCurrentRouteStateChange?:
    | ((state: SurfaceCurrentRouteState | undefined) => void)
    | undefined;
}

/**
 * Inline `--formspec-*` custom properties on the document root, in a DOM
 * medium. Read, never removed: §4.5's no-scrubbing rule.
 */
function documentRootFormspecProperties(): string[] {
  if (typeof document === "undefined") return [];
  const style = document.documentElement.style;
  const properties: string[] = [];
  for (let index = 0; index < style.length; index += 1) {
    const property = style[index];
    if (property?.startsWith("--formspec-")) properties.push(property);
  }
  return properties;
}

const DEFAULT_NAVIGATION_SCOPE = "default";
let routeInstanceSequence = 0;

function allocateRouteInstanceId(): string {
  routeInstanceSequence += 1;
  return `formspec-route-instance:${routeInstanceSequence}`;
}

function routeNavigationScope(handle: SurfaceRouteHandle): string {
  return handle.route.navigation?.scope ?? DEFAULT_NAVIGATION_SCOPE;
}

export function SurfaceApp(props: SurfaceAppProps) {
  return <SurfaceAppView {...props} model={useSurfaceApp(props)} />;
}

interface BrowserPresentation extends SurfaceFormSession {
  addressAvailable: boolean;
  anchor: boolean;
  direction: 'ltr' | 'rtl';
  entryPath: string | undefined;
  editionPicker: ReactNode;
  appearancePicker: ReactNode;
  saveNotice: string;
  navigate: (href: string) => boolean | Promise<boolean>;
}

/** Shared rendering for controlled hosts and the maintained browser binding. */
export function SurfaceAppView(props: SurfaceAppProps & {
  model: SurfaceAppModel;
  browser?: BrowserPresentation;
}) {
  const { model, browser } = props;
  const { bundle, location, onNavigate, onDiagnostics } = props;
  const setDocumentTitle = props.setDocumentTitle ?? true;
  const widgetActionCoordinator = useRef(createWidgetActionCoordinator());
  const appRoot = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const hostAppearance = useHostAppearance(appRoot, browser !== undefined);

  const strings: SurfaceStrings = useMemo(
    () =>
      typeof props.strings === "function"
        ? props.strings
        : resolveSurfaceStrings(props.strings),
    [props.strings]
  );

  const resolution = useMemo(
    () => browser?.addressAvailable === false
      ? { match: undefined, diagnostics: [] }
      : matchRoute(model.app, location),
    [model.app, location, browser?.addressAvailable]
  );
  const activeNavigationScope = resolution.match
    ? routeNavigationScope(resolution.match.handle)
    : DEFAULT_NAVIGATION_SCOPE;

  // Keep the route plan and its data inputs stable across equivalent parameter objects.
  const routeParamsKey = canonicalFiniteJson(props.routeParams ?? {});
  const routeParams = useMemo(
    () => JSON.parse(routeParamsKey) as Readonly<Record<string, string>>,
    [routeParamsKey],
  );
  const navigationParams = useMemo(() => browser && resolution.match
    ? { ...routeParams, ...resolution.match.params }
    : routeParams, [browser !== undefined, resolution.match, routeParams]);
  const runtimeGeneration = useMemo(() => deriveSurfaceRuntimeGeneration({
    sessionGeneration: props.sessionGeneration,
    location,
    app: model.app,
    routeParams,
  }), [model.app, location, routeParams, props.sessionGeneration]);

  const routeInstance = useRef<
    | {
        generation: string;
        id: string;
      }
    | undefined
  >(undefined);
  if (!resolution.match) {
    routeInstance.current = undefined;
  } else if (routeInstance.current?.generation !== runtimeGeneration) {
    routeInstance.current = {
      generation: runtimeGeneration,
      id: allocateRouteInstanceId(),
    };
  }

  // A native Screener completion belongs to this mounted composition and visit.
  const screenerVisit = useMemo(() => ({ id: allocateRouteInstanceId(), active: false }), [model.app, runtimeGeneration]);
  const liveScreenerVisit = useRef(screenerVisit);
  liveScreenerVisit.current = screenerVisit;
  useLayoutEffect(() => {
    screenerVisit.active = true;
    return () => { screenerVisit.active = false; };
  }, [screenerVisit]);

  const localeDocuments = props.localeDocuments ?? bundle.localeDocuments;
  const resolveDefinitionLocaleString = useMemo(
    () => definitionLocaleLookup(localeDocuments, props.activeLocale), [localeDocuments, props.activeLocale],
  );
  const routePlan: SurfaceRoutePlan<SurfaceWidget> | undefined = useMemo(() => {
    if (!resolution.match) return undefined;
    return planMatchedRoute<SurfaceWidget>({
      handle: resolution.match.handle,
      app: model.app,
      params: { ...routeParams, ...resolution.match.params },
      experiences: bundle.experiences,
      screenerHandles: bundle.screenerHandles,
      experienceHandles: bundle.experienceHandles,
      definitions: bundle.definitions,
      registryEntries: model.registryEntries,
      widgets: model.widgets,
      dataSources: bundle.dataSources,
      mappings: bundle.mappings,
      surfaceRef: bundle.surfaceRefs?.get(resolution.match.handle.surface),
      resolveDefinitionComponent: props.resolveDefinitionComponent,
      resolveDefinitionLocaleString,
      responseActions: bundle.responseActions,
      themeAuthority: model.themeAuthority,
      hasExecutor: props.onFireTransition !== undefined,
      hasWidgetActionExecutor: props.widgetActionExecutor !== undefined,
      evaluateCondition: props.evaluateTransitionCondition,
      headingBaseLevel: props.headingBaseLevel ?? 2,
      staticAssetResolver: props.staticAssetResolver,
      strings,
    });
  }, [
    resolution,
    model,
    bundle,
    routeParams,
    props.onFireTransition,
    props.widgetActionExecutor,
    props.evaluateTransitionCondition,
    props.headingBaseLevel,
    props.staticAssetResolver,
    props.resolveDefinitionComponent,
    resolveDefinitionLocaleString,
    strings,
  ]);
  useSurfaceThemeTokens(appRoot, browser ? routePlan?.grant.themeDocument ?? props.platformTheme : undefined);

  // One pure destination resolver is shared by preflight and navigation.
  const screenerDestination = (target: string): { status: 'accepted'; href: string } | { status: 'refused'; reason: string } => {
    if (!screenerVisit.active || liveScreenerVisit.current !== screenerVisit || !routePlan) return { status: 'refused', reason: 'screener-generation-stale' };
    const matches = model.app.routes.filter(handle => `surface:${handle.routeId}` === target);
    if (matches.length !== 1 || matches[0]!.pathCollides) return { status: 'refused', reason: 'screener-target-not-unique' };
    const destination = routeHref(matches[0]!, routePlan.params);
    return destination.refusal ? { status: 'refused', reason: destination.refusal } : { status: 'accepted', href: destination.href };
  };

  const [runtimeDiagnosticsByScope, setRuntimeDiagnosticsByScope] = useState(
    () =>
      new Map<
        string,
        { generation: string; diagnostics: readonly SurfaceDiagnostic[] }
      >()
  );
  const onRuntimeDiagnosticsChange = useCallback(
    (scope: string, next: readonly SurfaceDiagnostic[]) => {
      setRuntimeDiagnosticsByScope((previous) => {
        const current = previous.get(scope);
        if (
          current?.generation === runtimeGeneration &&
          diagnosticListsEqual(current.diagnostics, next)
        ) {
          return previous;
        }
        if (next.length === 0 && current === undefined) return previous;
        const updated = new Map(previous);
        if (next.length === 0) {
          updated.delete(scope);
        } else {
          updated.set(scope, {
            generation: runtimeGeneration,
            diagnostics: next,
          });
        }
        return updated;
      });
    },
    [runtimeGeneration]
  );
  const runtimeDiagnostics = useMemo(
    () =>
      [...runtimeDiagnosticsByScope.values()]
        .filter((entry) => entry.generation === runtimeGeneration)
        .flatMap((entry) => entry.diagnostics),
    [runtimeDiagnosticsByScope, runtimeGeneration]
  );

  const navigationDiagnostics = useMemo(
    () =>
      model.app.routes
        .filter(
          (handle) =>
            handle.route.navigation?.visible !== false &&
            routeNavigationScope(handle) === activeNavigationScope
        )
        .flatMap(
          (handle) => routeHref(handle, navigationParams).diagnostics
        ),
    [activeNavigationScope, model.app, navigationParams]
  );

  // Read after the route's `useLayoutEffect` has emitted its own tokens, so a
  // property found here is one something ELSE wrote globally. `join` is the
  // dependency so a re-render with the same root state does not loop.
  const [rootProperties, setRootProperties] = useState<string>("");
  useEffect(() => {
    const observed = documentRootFormspecProperties().join(",");
    setRootProperties((previous) =>
      previous === observed ? previous : observed
    );
  });

  const diagnostics = useMemo(() => {
    const rootDiagnostic = documentRootContaminationDiagnostic(
      rootProperties === "" ? [] : rootProperties.split(",")
    );
    return [
      ...model.diagnostics,
      ...resolution.diagnostics,
      ...navigationDiagnostics,
      ...(routePlan?.diagnostics ?? []),
      ...runtimeDiagnostics,
      ...(rootDiagnostic ? [rootDiagnostic] : []),
    ];
  }, [
    model.diagnostics,
    resolution,
    navigationDiagnostics,
    routePlan,
    runtimeDiagnostics,
    rootProperties,
  ]);

  useDiagnosticDelivery(diagnostics, onDiagnostics);

  useEffect(() => {
    const deliver = props.onCurrentRouteStateChange;
    if (!deliver) return;
    if (!routePlan) {
      deliver(undefined);
      return;
    }
    deliver({
      surface: routePlan.handle.surface,
      surfaceId: routePlan.handle.surfaceId,
      ...(routePlan.surfaceRef === undefined
        ? {}
        : { surfaceRef: routePlan.surfaceRef }),
      routeId: routePlan.handle.routeId,
      routeInstanceId: routeInstance.current!.id,
    });
    return () => deliver(undefined);
  }, [props.onCurrentRouteStateChange, routePlan, runtimeGeneration]);

  const [sectionTitles, setSectionTitles] = useState<{
    generation: string;
    bySlot: ReadonlyMap<string, string>;
  }>();
  const reportSectionTitle = useCallback((slot: string, title: string | undefined) => {
    setSectionTitles(previous => {
      if (previous?.generation !== runtimeGeneration && title === undefined) return previous;
      const bySlot = new Map(previous?.generation === runtimeGeneration ? previous.bySlot : []);
      if (bySlot.get(slot) === title) return previous;
      if (title === undefined) bySlot.delete(slot);
      else bySlot.set(slot, title);
      return { generation: runtimeGeneration, bySlot };
    });
  }, [runtimeGeneration]);
  const workspace = browser?.workspace;
  const formSession = browser && {
    ...browser, appearance: hostAppearance ?? browser.appearance,
    workspace: workspace && { ...workspace, reportSectionTitle },
  };
  const activeSlot = activeWorkspaceSlot(routePlan, workspace?.slot);
  const sectionTitle = workspace && activeSlot && sectionTitles?.generation === runtimeGeneration
    ? sectionTitles.bySlot.get(activeSlot) : undefined;
  const appTitle = props.appTitle ?? bundle.title;

  const entryPath = browser?.entryPath;
  const entryHref = entryPath === undefined || !props.resolveNavigationHref
    ? entryPath
    : props.resolveNavigationHref(entryPath);
  const brandTrace = needTraceAttributes(generationNeedAnchors(bundle.manifest));
  const routeTitle = browser && routePlan ? presentedRouteTitle(routePlan.handle, props.resolveRouteTitle) : undefined;
  const title = [sectionTitle, routeTitle, appTitle].filter(Boolean).join(' – ');
  const match = resolution.match;
  const routeIdentity = browser && JSON.stringify([browser.previewScope, match
    ? [match.handle.surfaceId, match.handle.routeId, match.params]
    : location]);
  const previousRoute = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const previous = previousRoute.current;
    previousRoute.current = routeIdentity;
    if (routeIdentity === undefined || previous === undefined || routeIdentity === previous || browser?.anchor) return;
    const target = main.current?.querySelector<HTMLElement>('.fs-surface-route__title, h1, [role="heading"][aria-level="1"]') ?? main.current;
    target?.setAttribute('tabindex', '-1');
    target?.focus({ preventScroll: true });
  }, [routeIdentity, browser?.anchor]);

  return (
    <div
      ref={appRoot}
      className="fs-surface-app"
      data-fs-appearance={formSession?.appearance}
      lang={browser ? props.activeLocale : undefined}
      dir={browser && props.activeLocale ? browser.direction : undefined}
      {...brandTrace}
    >
      {setDocumentTitle && title && <SurfaceDocumentTitle title={title} />}
      {(props.header !== undefined || appTitle || browser) && (
        <header className="fs-surface-header">
          <div className="fs-surface-header__inner">
            {props.header ?? (appTitle && (entryPath !== undefined && entryHref !== undefined
              ? <a className="fs-surface-brand" href={entryHref}
                  {...brandTrace} onClick={event => {
                    if (!isPlainLinkClick(event)) return;
                    event.preventDefault();
                    onNavigate(entryPath);
                  }}>{appTitle}</a>
              : <span className="fs-surface-brand" {...brandTrace}>{appTitle}</span>
            ))}
            {browser && (browser.editionPicker || hostAppearance === undefined) && (
              <div className="fs-surface-masthead-controls">
                {browser.editionPicker}
                {hostAppearance === undefined && browser.appearancePicker}
              </div>
            )}
            {browser && <p className="fs-surface-save-notice" role="status">{browser.saveNotice}</p>}
          </div>
        </header>
      )}
      <div className="fs-surface-shell">
        <SurfaceNav
          app={model.app}
          location={location}
          routeParams={navigationParams}
          onNavigate={onNavigate}
          resolveNavigationHref={props.resolveNavigationHref}
          label={props.navigationLabel ?? strings("navigationLabel")}
          menuLabel={props.navigationLabel ?? strings("navigationLabel")}
          resolveRouteTitle={props.resolveRouteTitle}
        />
        <main ref={main} className="fs-surface-main">
          {routePlan ? (
            <SurfaceRouteView
              key={browser ? runtimeGeneration : `${routePlan.handle.surfaceId}/${routePlan.handle.routeId}`}
              plan={routePlan}
              formSession={formSession}
              filingStatus={{
                readSummaries: props.readSummaries,
                revision: props.filingDraftRevision,
                navigate: (href) => { if (browser) void browser.navigate(href); else onNavigate(href); },
                formatHref: props.resolveNavigationHref,
                resolveRouteTitle: props.resolveRouteTitle,
              }}
              screenerCompletion={props.screenerCompletion}
              screenerInstanceId={screenerVisit.id}
              localeDocuments={localeDocuments}
              activeLocale={props.activeLocale}
              resolveRouteTitle={props.resolveRouteTitle}
              strings={strings}
              dataSourceLoader={props.dataSourceLoader}
              dataSourceRevision={props.dataSourceRevision}
              authorizeDataSource={props.authorizeDataSource}
              validateDataSourcePayload={props.validateDataSourcePayload}
              widgetActionExecutor={props.widgetActionExecutor}
              widgetActionOutcomeStore={props.widgetActionOutcomeStore}
              widgetActionCoordinator={widgetActionCoordinator.current}
              runtimeGeneration={runtimeGeneration}
              onWidgetActionReport={props.onWidgetActionReport}
              onRuntimeDiagnosticsChange={onRuntimeDiagnosticsChange}
              renderDefinitionForm={props.renderDefinitionForm}
              definitionActionInvoker={props.definitionActionInvoker}
              resolveSemanticControlScope={props.resolveSemanticControlScope}
              resolveSemanticOutputScope={props.resolveSemanticOutputScope}
              onDefinitionActionResult={props.onDefinitionActionResult}
              showExperienceNeeds={props.showExperienceNeeds}
              showThemeNotice={props.showThemeNotice}
              responseActionsDocuments={bundle.responseActions}
              referencesDocuments={bundle.references ?? []}
              ontologyDocuments={bundle.ontologies ?? []}
              onFireTransition={props.onFireTransition}
              checkScreenerTarget={screenerDestination}
              onScreenerTarget={(target) => {
                const destination = screenerDestination(target);
                if (destination.status === 'refused') return destination;
                if (browser) {
                  const dispose = (navigated: boolean) => navigated
                    ? { status: 'accepted' as const }
                    : { status: 'refused' as const, reason: 'screener-navigation-unavailable' };
                  const navigated = browser.navigate(destination.href);
                  return typeof navigated === 'boolean' ? dispose(navigated) : navigated.then(dispose);
                }
                onNavigate(destination.href);
                return { status: 'accepted' };
              }}
              onAdvance={(transition, outcome) => {
                // Reached only after the action reported success. The shell
                // navigates; it never decides that the action succeeded.
                // Defensive final boundary. Planning withholds collision-targeted
                // transition controls, and this check prevents a future or
                // slot-supplied path from publishing the same refused address.
                return browser
                  ? navigateAfterCompletedAction(transition, routePlan.params, outcome?.transitionBindings, browser.navigate)
                  : navigateAfterCompletedAction(transition, routePlan.params, outcome?.transitionBindings, onNavigate);
              }}
            />
          ) : (
            props.renderNotFound?.(location) ?? <NotFound strings={strings} />
          )}
        </main>
      </div>
      {props.footer}
    </div>
  );
}

function SurfaceDocumentTitle({ title }: { title: string }) {
  useLayoutEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => { document.title = previous; };
  }, [title]);
  return null;
}

export interface SurfaceNavProps {
  app: ComposedSurfaceApp;
  location: string;
  routeParams?: Readonly<Record<string, string>> | undefined;
  /**
   * Receives only usable destinations. Collision claimants and routes missing
   * parameter values render as unavailable text with no link or click handler.
   */
  onNavigate: (href: string) => void;
  /** Pure host link destination. Undefined makes the route unavailable as a link. */
  resolveNavigationHref?: ((href: string) => string | undefined) | undefined;
  label?: string | undefined;
  menuLabel?: string | undefined;
  resolveRouteTitle?: SurfaceRouteTitleResolver | undefined;
}

export function SurfaceNav({
  app,
  location,
  routeParams,
  onNavigate,
  resolveNavigationHref,
  label,
  menuLabel,
  resolveRouteTitle,
}: SurfaceNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const activeMatch = matchRoute(app, location).match;
  const activeRoute = activeMatch?.handle;
  const activeNavigationScope = activeRoute
    ? routeNavigationScope(activeRoute)
    : DEFAULT_NAVIGATION_SCOPE;
  const groups = app.groups
    .map((group) => ({
      ...group,
      needAnchors: generationNeedAnchors(group.routes[0]?.surface),
      routes: group.routes
        .map((handle, declarationOrder) => ({ handle, declarationOrder }))
        .filter(
          ({ handle }) =>
            handle.route.navigation?.visible !== false &&
            routeNavigationScope(handle) === activeNavigationScope
        )
        .sort((left, right) => {
          const leftOrder = left.handle.route.navigation?.order;
          const rightOrder = right.handle.route.navigation?.order;
          if (leftOrder === undefined && rightOrder === undefined) {
            return left.declarationOrder - right.declarationOrder;
          }
          if (leftOrder === undefined) return 1;
          if (rightOrder === undefined) return -1;
          return (
            leftOrder - rightOrder ||
            left.declarationOrder - right.declarationOrder
          );
        })
        .map(({ handle }) => handle),
    }))
    .filter((group) => group.routes.length > 0);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  if (groups.length === 0) return null;

  const showGroupLabels = groups.length > 1;
  const navigationNeedAnchors = mergeNeedAnchors(
    ...groups.flatMap((group) => [
      group.needAnchors,
      ...group.routes.map((handle) =>
        mergeNeedAnchors(
          generationNeedAnchors(handle.route.navigation),
          generationNeedAnchors(handle.route)
        )
      ),
    ])
  );
  return (
    <nav
      className="fs-surface-nav"
      aria-label={label ?? "Pages in this app"}
      data-navigation-scope={activeNavigationScope}
      data-menu-open={menuOpen ? "true" : "false"}
    >
      <button
        className="fs-surface-nav__toggle"
        type="button"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        {...needTraceAttributes(navigationNeedAnchors)}
      >
        <span>{menuLabel ?? label ?? "Pages in this app"}</span>
        <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
      </button>
      <div className="fs-surface-nav__content">
        {groups.map((group) => (
          <div className="fs-surface-nav__group" key={group.surfaceId}>
            {showGroupLabels && (
              <p
                className="fs-surface-nav__label"
                {...needTraceAttributes(group.needAnchors)}
              >
                {group.label}
              </p>
            )}
            <ul className="fs-surface-nav__list">
              {group.routes.map((handle, index) => {
                const { href, refusal } = routeHref(handle, routeParams ?? {});
                const navigationLabel = presentedRouteLabel(handle, resolveRouteTitle);
                const navigationAnchors = generationNeedAnchors(
                  handle.route.navigation
                );
                const traceAttributes = needTraceAttributes(
                  handle.route.navigation?.label === undefined
                    ? mergeNeedAnchors(
                        navigationAnchors,
                        generationNeedAnchors(handle.route)
                      )
                    : navigationAnchors
                );
                const navigationHref = refusal
                  ? undefined
                  : resolveNavigationHref ? resolveNavigationHref(href) : href;
                const unavailableReason =
                  refusal === "collision"
                    ? "route-collision"
                    : refusal === "parameters"
                    ? "route-params"
                    : navigationHref === undefined ? "browser-path" : undefined;
                return (
                  <li key={`${handle.surfaceId}/${handle.routeId}/${index}`}>
                    {unavailableReason ? (
                      <span
                        role="link"
                        data-nav-route={handle.routeId}
                        data-nav-unavailable={unavailableReason}
                        aria-disabled="true"
                        {...traceAttributes}
                      >
                        {navigationLabel}
                      </span>
                    ) : (
                      <a
                        href={navigationHref}
                        data-nav-route={handle.routeId}
                        aria-current={activeMatch?.handle === handle &&
                          handle.markers.every(({ name }) => activeMatch.params[name] === routeParams?.[name])
                          ? "page" : undefined}
                        {...traceAttributes}
                        onClick={(event) => {
                          if (!isPlainLinkClick(event)) return;
                          event.preventDefault();
                          setMenuOpen(false);
                          onNavigate(href);
                        }}
                      >
                        {navigationLabel}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function NotFound({ strings }: { strings: SurfaceStrings }) {
  return (
    <div className="fs-surface-notfound" data-probe="route-not-found">
      <h1>{strings("notFoundTitle")}</h1>
      <p>{strings("notFoundBody")}</p>
    </div>
  );
}
