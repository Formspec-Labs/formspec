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
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  canonicalFiniteJson,
  collectSlotBreakpointThresholds,
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
  /** Stable opaque viewer identity for browser preferences on a shared browser profile. */
  viewerPreferenceKey?: string | undefined;
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
  lastSeenParams?: Readonly<Record<string, string>> | undefined;
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
  const headerRef = useRef<HTMLElement>(null);
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
  const lastSeenParamsKey = canonicalFiniteJson(browser?.lastSeenParams ?? {});
  const navigationParams = useMemo(() => browser
    ? {
        ...routeParams,
        ...(browser.lastSeenParams ?? {}),
        ...(resolution.match?.params ?? {}),
      }
    : routeParams, [browser !== undefined, lastSeenParamsKey, resolution.match, routeParams]);
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
  const [breakpointEpoch, setBreakpointEpoch] = useState(0);
  const [slotVisibilityEpoch, setSlotVisibilityEpoch] = useState(0);
  const slotFormEnginesRef = useRef(
    new Map<string, { generation: string; engine: import('@formspec-org/engine').IFormEngine }>(),
  );
  const slotRenderedActionRefsRef = useRef(
    new Map<string, { generation: string; key: string; refs: ReadonlySet<string> }>(),
  );
  const onSlotFormEngineChange = useCallback(
    (slotKey: string, engine: import('@formspec-org/engine').IFormEngine | undefined) => {
      if (engine) {
        slotFormEnginesRef.current.set(slotKey, { generation: runtimeGeneration, engine });
      } else {
        const current = slotFormEnginesRef.current.get(slotKey);
        if (current?.generation === runtimeGeneration) {
          slotFormEnginesRef.current.delete(slotKey);
        }
        const rendered = slotRenderedActionRefsRef.current.get(slotKey);
        if (rendered?.generation === runtimeGeneration) {
          slotRenderedActionRefsRef.current.delete(slotKey);
        }
      }
    },
    [runtimeGeneration],
  );
  const onSlotVisibilityChange = useCallback(
    (slotKey: string, nextRefs: ReadonlySet<string> | undefined, baselineKey: string) => {
      if (nextRefs === undefined) {
        const current = slotRenderedActionRefsRef.current.get(slotKey);
        if (current?.generation === runtimeGeneration) {
          slotRenderedActionRefsRef.current.delete(slotKey);
        }
        return;
      }
      const nextKey = [...nextRefs].sort().join('\0');
      const current = slotRenderedActionRefsRef.current.get(slotKey);
      const recordedKey = current?.generation === runtimeGeneration ? current.key : baselineKey;
      slotRenderedActionRefsRef.current.set(slotKey, {
        generation: runtimeGeneration,
        key: nextKey,
        refs: nextRefs,
      });
      if (recordedKey === nextKey) return;
      setSlotVisibilityEpoch((prev) => prev + 1);
    },
    [runtimeGeneration],
  );
  const routePlan: SurfaceRoutePlan<SurfaceWidget> | undefined = useMemo(() => {
    if (!resolution.match) return undefined;
    const matchesMinWidth = (minWidthPx: number): boolean =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(`(min-width: ${minWidthPx}px)`).matches
        : false;
    const activeSlotFormEngines = new Map<string, import('@formspec-org/engine').IFormEngine>();
    for (const [slotKey, entry] of slotFormEnginesRef.current) {
      if (entry.generation === runtimeGeneration) {
        activeSlotFormEngines.set(slotKey, entry.engine);
      }
    }
    const activeSlotRenderedActionRefs = new Map<string, ReadonlySet<string>>();
    for (const [slotKey, entry] of slotRenderedActionRefsRef.current) {
      if (entry.generation === runtimeGeneration) {
        activeSlotRenderedActionRefs.set(slotKey, entry.refs);
      }
    }
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
      matchesMinWidth,
      ...(activeSlotFormEngines.size > 0 ? { slotFormEngines: activeSlotFormEngines } : {}),
      ...(activeSlotRenderedActionRefs.size > 0
        ? { slotRenderedActionRefs: activeSlotRenderedActionRefs }
        : {}),
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
    runtimeGeneration,
    breakpointEpoch,
    slotVisibilityEpoch,
  ]);
  const breakpointThresholdsKey = useMemo(() => {
    if (!routePlan) return "";
    return collectSlotBreakpointThresholds(
      routePlan.slots,
      routePlan.grant.themeDocument,
    ).join(",");
  }, [routePlan]);
  useEffect(() => {
    if (
      !breakpointThresholdsKey ||
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const thresholds = breakpointThresholdsKey.split(",").map(Number);
    const queries = thresholds.map((minWidth) =>
      window.matchMedia(`(min-width: ${minWidth}px)`),
    );
    let lastSignature = queries.map((mql) => (mql.matches ? "1" : "0")).join("");
    const update = () => {
      const nextSignature = queries.map((mql) => (mql.matches ? "1" : "0")).join("");
      if (nextSignature !== lastSignature) {
        lastSignature = nextSignature;
        setBreakpointEpoch((prev) => prev + 1);
      }
    };
    for (const mql of queries) mql.addEventListener("change", update);
    return () => {
      for (const mql of queries) mql.removeEventListener("change", update);
    };
  }, [breakpointThresholdsKey]);
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
    if (routeIdentity === undefined || previous === undefined || routeIdentity === previous || browser?.anchor || browser?.workspace?.focusField) return;
    // A section may already have taken focus during its child's layout effect. A form
    // still loading will focus its selected heading when it mounts.
    if (workspace?.activeSection && main.current?.contains(document.activeElement)
        && document.activeElement?.closest('.formspec-workspace__content[data-formspec-section]')) return;
    const target = main.current?.querySelector<HTMLElement>('.fs-surface-route__title, h1, [role="heading"][aria-level="1"]') ?? main.current;
    target?.setAttribute('tabindex', '-1');
    target?.focus({ preventScroll: true });
  }, [routeIdentity, browser?.anchor, browser?.workspace?.focusField, workspace?.activeSection]);

  const overviewDestination = useMemo(
    () =>
      routePlan
        ? resolveOverviewDestination(model.app, routePlan, browser?.entryPath, navigationParams)
        : browser?.entryPath,
    [model.app, routePlan, browser?.entryPath, navigationParams],
  );

  useEffect(() => {
    const rootEl = appRoot.current;
    const headerEl = headerRef.current;
    if (!rootEl) return;
    let lastHeaderHeight = "";
    let lastStickyOffset = "";
    const syncHeaderOffset = () => {
      if (!headerEl || typeof window === "undefined") {
        rootEl.style.removeProperty("--fs-surface-header-height");
        rootEl.style.removeProperty("--formspec-sticky-offset");
        lastHeaderHeight = "";
        lastStickyOffset = "";
        return;
      }
      const position = window.getComputedStyle(headerEl).position;
      const isSticky = position === "sticky" || position === "fixed";
      const rect = headerEl.getBoundingClientRect();
      const height = isSticky ? Math.ceil(rect.height) : 0;
      const maxStickyBottom = rect.height + 200;
      const stuckBottom = isSticky
        ? Math.ceil(Math.max(rect.height, Math.min(rect.bottom, maxStickyBottom)))
        : 0;
      const nextHeaderHeight = height > 0 ? `${stuckBottom}px` : "0px";
      const nextStickyOffset = height > 0 ? `${stuckBottom + 16}px` : "0.75rem";
      if (nextHeaderHeight !== lastHeaderHeight) {
        rootEl.style.setProperty("--fs-surface-header-height", nextHeaderHeight);
        lastHeaderHeight = nextHeaderHeight;
      }
      if (nextStickyOffset !== lastStickyOffset) {
        rootEl.style.setProperty("--formspec-sticky-offset", nextStickyOffset);
        lastStickyOffset = nextStickyOffset;
      }
    };
    syncHeaderOffset();
    if (typeof ResizeObserver === "undefined" || !headerEl) {
      if (typeof window !== "undefined") {
        window.addEventListener("resize", syncHeaderOffset);
        window.addEventListener("scroll", syncHeaderOffset, { passive: true });
        return () => {
          window.removeEventListener("resize", syncHeaderOffset);
          window.removeEventListener("scroll", syncHeaderOffset);
        };
      }
      return;
    }
    const observer = new ResizeObserver(syncHeaderOffset);
    observer.observe(headerEl);
    window.addEventListener("resize", syncHeaderOffset);
    window.addEventListener("scroll", syncHeaderOffset, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncHeaderOffset);
      window.removeEventListener("scroll", syncHeaderOffset);
    };
  }, [browser, appTitle, props.header]);

  return (
    <div
      ref={appRoot}
      className="fs-surface-app"
      data-fs-appearance={formSession?.appearance}
      lang={browser ? props.activeLocale : undefined}
      dir={browser && props.activeLocale ? browser.direction : undefined}
      {...brandTrace}
    >
      <a
        className="fs-surface-skip-link"
        href="#fs-surface-main"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to main content
      </a>
      {setDocumentTitle && title && <SurfaceDocumentTitle title={title} />}
      {(props.header !== undefined || appTitle || browser) && (
        <header ref={headerRef} className="fs-surface-header">
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
        <main ref={main} id="fs-surface-main" tabIndex={-1} className="fs-surface-main">
          {routePlan ? (
            <SurfaceRouteView
              key={browser ? runtimeGeneration : `${routePlan.handle.surfaceId}/${routePlan.handle.routeId}`}
              plan={routePlan}
              formSession={formSession}
              overviewDestination={overviewDestination}
              bandPreferenceScope={JSON.stringify([bundle.manifest.id, props.viewerPreferenceKey, browser?.previewScope])}
              filingStatus={{
                readSummaries: props.readSummaries,
                revision: props.filingDraftRevision,
                navigate: (href) => browser ? browser.navigate(href) : onNavigate(href),
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
              onSlotFormEngineChange={onSlotFormEngineChange}
              onSlotVisibilityChange={onSlotVisibilityChange}
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

interface NavNode {
  handle: SurfaceRouteHandle;
  index: number;
  key: string;
  isFilingHub: boolean;
  children: NavNode[];
}

interface NavTree {
  roots: NavNode[];
  hasHubs: boolean;
  ancestorHubKeys: Map<SurfaceRouteHandle, string[]>;
}

function filingStatusGroupRouteRefs(
  handle: SurfaceRouteHandle,
  repeatOnly: boolean
): { isFilingHub: boolean; refs: string[] } {
  const refs: string[] = [];
  let isFilingHub = false;
  for (const slot of handle.route.slots ?? []) {
    if (slot.slotType !== "filing-status") continue;
    const binding = slot.binding as { groups?: unknown } | undefined;
    if (!binding || typeof binding !== "object" || !Array.isArray(binding.groups)) continue;
    isFilingHub = true;
    for (const group of binding.groups) {
      if (!group || typeof group !== "object") continue;
      const hasRepeat = Boolean((group as { repeat?: unknown }).repeat);
      if (hasRepeat !== repeatOnly) continue;
      const forms = (group as { forms?: unknown }).forms;
      if (!Array.isArray(forms)) continue;
      for (const form of forms) {
        const routeRef =
          form && typeof form === "object"
            ? (form as { routeRef?: unknown }).routeRef
            : undefined;
        if (typeof routeRef === "string" && routeRef.length > 0) {
          refs.push(routeRef);
        }
      }
    }
  }
  return { isFilingHub, refs };
}

function hubPathAffinity(hubPath: string, childPath: string): number {
  const hubSegs = hubPath.split('/').filter(Boolean);
  const childSegs = childPath.split('/').filter(Boolean);
  if (hubSegs.length === 0 || hubSegs.length > childSegs.length) return 0;
  for (let i = 0; i < hubSegs.length; i += 1) {
    if (hubSegs[i] !== childSegs[i]) return 0;
  }
  return hubSegs.length;
}

function hubDraftStartRouteRefs(handle: SurfaceRouteHandle): string[] {
  const refs: string[] = [];
  for (const slot of handle.route.slots ?? []) {
    if (slot.slotType !== "draft-start") continue;
    const routeRef = (slot.binding as { routeRef?: unknown } | undefined)?.routeRef;
    if (typeof routeRef === "string" && routeRef.length > 0) refs.push(routeRef);
  }
  return refs;
}

function resolveOverviewDestination(
  app: ComposedSurfaceApp,
  routePlan: SurfaceRoutePlan<SurfaceWidget>,
  fallbackEntryPath: string | undefined,
  navigationParams: Readonly<Record<string, string>>,
): string | undefined {
  const { handle, params, transitions } = routePlan;
  const effectiveParams: Readonly<Record<string, string>> = {
    ...navigationParams,
    ...params,
  };
  const scope = routeNavigationScope(handle);

  const resolveCandidateHref = (candidate: SurfaceRouteHandle): string | undefined => {
    const matchingTransition = transitions.find(
      (transition) => transition.status === "fireable" && transition.target === candidate,
    );
    const nextParams: Record<string, string> = { ...effectiveParams };
    if (matchingTransition?.params) {
      for (const [targetParam, bindingName] of Object.entries(matchingTransition.params)) {
        const value = effectiveParams[bindingName];
        if (typeof value === "string" && value.length > 0) nextParams[targetParam] = value;
      }
    }
    const resolved = routeHref(candidate, nextParams);
    return resolved.refusal === undefined ? resolved.href : undefined;
  };

  // 1. Explicit navigation.parent when it resolves cleanly in the same surface and scope.
  const explicitParentId = handle.route.navigation?.parent;
  if (typeof explicitParentId === "string" && explicitParentId !== handle.routeId) {
    const parent = app.routes.find(
      (candidate) =>
        candidate.surface === handle.surface &&
        candidate.routeId === explicitParentId &&
        routeNavigationScope(candidate) === scope,
    );
    if (parent) {
      const parentHref = resolveCandidateHref(parent);
      if (parentHref !== undefined) return parentHref;
    }
  }

  // 2. Nearest addressable filing-status overview hub in the same surface and scope
  //    (path prefix affinity -> direct reference -> repeat reference -> entry -> declaration order).
  const candidates: Array<{
    href: string;
    affinity: number;
    directRef: boolean;
    repeatRef: boolean;
    isEntry: boolean;
    order: number;
  }> = [];

  app.routes.forEach((candidate, order) => {
    if (
      candidate === handle ||
      candidate.surface !== handle.surface ||
      routeNavigationScope(candidate) !== scope
    ) {
      return;
    }
    const nonRepeat = filingStatusGroupRouteRefs(candidate, false);
    const repeat = filingStatusGroupRouteRefs(candidate, true);
    if (!nonRepeat.isFilingHub && !repeat.isFilingHub) return;
    const href = resolveCandidateHref(candidate);
    if (href === undefined) return;
    const draftStarts = hubDraftStartRouteRefs(candidate);
    const directRef =
      nonRepeat.refs.includes(handle.routeId) ||
      draftStarts.includes(handle.routeId);
    const repeatRef = repeat.refs.includes(handle.routeId);
    const affinity = hubPathAffinity(candidate.route.path, handle.route.path);
    candidates.push({
      href,
      affinity,
      directRef,
      repeatRef,
      isEntry: candidate === app.entry,
      order,
    });
  });

  if (candidates.length > 0) {
    candidates.sort(
      (a, b) =>
        (b.affinity - a.affinity) ||
        (Number(b.directRef) - Number(a.directRef)) ||
        (Number(b.repeatRef) - Number(a.repeatRef)) ||
        (Number(b.isEntry) - Number(a.isEntry)) ||
        (a.order - b.order),
    );
    return candidates[0]!.href;
  }

  // 3. Fall back to the surface entry route resolved with active params, then static entryPath.
  if (app.entry && app.entry !== handle && app.entry.surface === handle.surface) {
    const entryHref = resolveCandidateHref(app.entry);
    if (entryHref !== undefined) return entryHref;
  }
  return fallbackEntryPath;
}

function buildNavTree(routes: readonly SurfaceRouteHandle[]): NavTree {
  const byId = new Map<string, SurfaceRouteHandle>();
  for (const handle of routes) {
    if (!byId.has(handle.routeId)) byId.set(handle.routeId, handle);
  }

  const parentOf = new Map<SurfaceRouteHandle, SurfaceRouteHandle>();
  const filingHubs = new Set<SurfaceRouteHandle>();

  // Pass 1: explicit route.navigation.parent
  for (const handle of routes) {
    const explicitParent = handle.route.navigation?.parent;
    if (typeof explicitParent === "string" && explicitParent !== handle.routeId) {
      const parent = byId.get(explicitParent);
      if (parent && parent !== handle) parentOf.set(handle, parent);
    }
  }

  // Pass 2: score filing-status hub candidates (path prefix affinity -> non-repeat -> declared order)
  const candidatesByChild = new Map<SurfaceRouteHandle, Array<{ hub: SurfaceRouteHandle; nonRepeat: boolean; affinity: number; hubOrder: number }>>();
  routes.forEach((hub, hubOrder) => {
    for (const repeatOnly of [false, true]) {
      const { isFilingHub, refs } = filingStatusGroupRouteRefs(hub, repeatOnly);
      if (isFilingHub) filingHubs.add(hub);
      for (const routeRef of refs) {
        if (routeRef === hub.routeId) continue;
        const child = byId.get(routeRef);
        if (!child || child === hub || parentOf.has(child)) continue;
        const list = candidatesByChild.get(child) ?? [];
        list.push({ hub, nonRepeat: !repeatOnly, affinity: hubPathAffinity(hub.route.path, child.route.path), hubOrder });
        candidatesByChild.set(child, list);
      }
    }
  });
  for (const [child, candidates] of candidatesByChild) {
    candidates.sort((a, b) =>
      (b.affinity - a.affinity) ||
      (Number(b.nonRepeat) - Number(a.nonRepeat)) ||
      (a.hubOrder - b.hubOrder));
    if (candidates[0]) parentOf.set(child, candidates[0].hub);
  }

  // Break any cycle so every visible route stays reachable in the tree.
  for (const handle of routes) {
    const seen = new Set<SurfaceRouteHandle>([handle]);
    let cursor = parentOf.get(handle);
    while (cursor) {
      if (seen.has(cursor)) {
        parentOf.delete(handle);
        break;
      }
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
  }

  const nodesByHandle = new Map<SurfaceRouteHandle, NavNode>();
  const allNodes: NavNode[] = routes.map((handle, index) => {
    const node: NavNode = {
      handle,
      index,
      key: `${handle.surfaceId}/${handle.routeId}/${index}`,
      isFilingHub: filingHubs.has(handle),
      children: [],
    };
    nodesByHandle.set(handle, node);
    return node;
  });

  const roots: NavNode[] = [];
  for (const node of allNodes) {
    const parentHandle = parentOf.get(node.handle);
    const parentNode = parentHandle ? nodesByHandle.get(parentHandle) : undefined;
    if (parentNode) parentNode.children.push(node);
    else roots.push(node);
  }

  const hasHubs = allNodes.some((node) => node.children.length > 0);
  const ancestorHubKeys = new Map<SurfaceRouteHandle, string[]>();
  const recordAncestors = (node: NavNode, ancestors: string[]) => {
    const own = node.children.length > 0 ? [...ancestors, node.key] : ancestors;
    ancestorHubKeys.set(node.handle, own);
    for (const child of node.children) {
      recordAncestors(child, own);
    }
  };
  for (const root of roots) recordAncestors(root, []);

  return { roots, hasHubs, ancestorHubKeys };
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
  const navId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsedHubs, setCollapsedHubs] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const activeMatch = matchRoute(app, location).match;
  const activeRoute = activeMatch?.handle;
  const highlightedRoute = useMemo(() => {
    if (!activeRoute) return undefined;
    if (activeRoute.route.navigation?.visible !== false) return activeRoute;
    for (const slot of activeRoute.route.slots ?? []) {
      if (slot.slotType !== "module-widget") continue;
      const binding = slot.binding as { draftReview?: { routeRef?: unknown } } | undefined;
      if (typeof binding?.draftReview?.routeRef === "string") {
        const target = app.routes.find(
          (candidate) =>
            candidate.surface === activeRoute.surface &&
            candidate.routeId === binding.draftReview!.routeRef &&
            candidate.route.navigation?.visible !== false
        );
        if (target) return target;
      }
    }
    return activeRoute;
  }, [activeRoute, app.routes]);
  const activeNavigationScope = activeRoute
    ? routeNavigationScope(activeRoute)
    : DEFAULT_NAVIGATION_SCOPE;
  const groups = useMemo(
    () =>
      app.groups
        .map((group) => {
          const routes = group.routes
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
            .map(({ handle }) => handle);
          return {
            ...group,
            needAnchors: generationNeedAnchors(group.routes[0]?.surface),
            routes,
            tree: buildNavTree(routes),
          };
        })
        .filter((group) => group.routes.length > 0),
    [app.groups, activeNavigationScope]
  );

  const activeHubKeys = useMemo(() => {
    if (!highlightedRoute) return [];
    for (const group of groups) {
      const keys = group.tree.ancestorHubKeys.get(highlightedRoute);
      if (keys) return keys;
    }
    return [];
  }, [highlightedRoute, groups]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  const previousActiveRouteKey = useRef<string | undefined>(undefined);
  const currentActiveRouteKey = activeRoute ? `${activeRoute.surfaceId}/${activeRoute.routeId}` : undefined;
  useEffect(() => {
    if (previousActiveRouteKey.current === currentActiveRouteKey) return;
    previousActiveRouteKey.current = currentActiveRouteKey;
    if (activeHubKeys.length === 0) return;
    setCollapsedHubs((previous) => {
      if (!activeHubKeys.some((key) => previous.has(key))) return previous;
      const next = new Set(previous);
      for (const key of activeHubKeys) next.delete(key);
      return next;
    });
  }, [currentActiveRouteKey, activeHubKeys]);

  if (groups.length === 0) return null;

  const hasAnyHubs = groups.some((group) => group.tree.hasHubs);
  const showGroupLabels = groups.length > 1;
  const activeNavLabel = activeRoute
    ? presentedRouteLabel(activeRoute, resolveRouteTitle)
    : undefined;
  const toggleHub = (hubKey: string) => {
    setCollapsedHubs((previous) => {
      const next = new Set(previous);
      if (next.has(hubKey)) next.delete(hubKey);
      else next.add(hubKey);
      return next;
    });
  };
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

  const renderLink = (handle: SurfaceRouteHandle) => {
    const { href, refusal } = routeHref(handle, routeParams ?? {});
    const navigationLabel = presentedRouteLabel(handle, resolveRouteTitle);
    const navigationAnchors = generationNeedAnchors(handle.route.navigation);
    const traceAttributes = needTraceAttributes(
      handle.route.navigation?.label === undefined
        ? mergeNeedAnchors(navigationAnchors, generationNeedAnchors(handle.route))
        : navigationAnchors
    );
    const navigationHref = refusal
      ? undefined
      : resolveNavigationHref
      ? resolveNavigationHref(href)
      : href;
    const unavailableReason =
      refusal === "collision"
        ? "route-collision"
        : refusal === "parameters"
        ? "route-params"
        : navigationHref === undefined
        ? "browser-path"
        : undefined;
    const element = unavailableReason ? (
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
        aria-current={
          (activeMatch?.handle === handle || highlightedRoute === handle) &&
          handle.markers.every(
            ({ name }) => activeMatch?.params[name] === routeParams?.[name]
          )
            ? "page"
            : undefined
        }
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
    );
    return { element, navigationLabel };
  };

  const renderNode = (node: NavNode, groupIndex: number): ReactNode => {
    const { element, navigationLabel } = renderLink(node.handle);
    if (node.children.length === 0) {
      return (
        <li className="fs-surface-nav__item" key={node.key}>
          {element}
        </li>
      );
    }
    const expanded = !collapsedHubs.has(node.key);
    const sublistId = `${navId}-hub-${groupIndex}-${node.index}`;
    const showOverviewBadge =
      node.isFilingHub && !/\boverview\b/i.test(navigationLabel);
    return (
      <li
        key={node.key}
        className="fs-surface-nav__item fs-surface-nav__item--hub"
        data-nav-hub={node.handle.routeId}
        data-hub-expanded={expanded ? "true" : "false"}
      >
        <div className="fs-surface-nav__hub-row">
          {element}
          <button
            type="button"
            className="fs-surface-nav__hub-toggle"
            aria-expanded={expanded}
            aria-controls={sublistId}
            aria-label={`${navigationLabel} pages`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleHub(node.key);
            }}
          >
            <span className="fs-surface-nav__hub-badge" aria-hidden="true">
              {showOverviewBadge ? "Overview" : String(node.children.length)}
            </span>
            <span className="fs-surface-nav__hub-chevron" aria-hidden="true" />
          </button>
        </div>
        <ul
          id={sublistId}
          className="fs-surface-nav__sublist"
          hidden={!expanded}
        >
          {node.children.map((child) => renderNode(child, groupIndex))}
        </ul>
      </li>
    );
  };

  return (
    <nav
      className="fs-surface-nav"
      aria-label={label ?? "Pages in this app"}
      data-navigation-scope={activeNavigationScope}
      data-has-hubs={hasAnyHubs ? "true" : "false"}
      data-menu-open={menuOpen ? "true" : "false"}
    >
      <button
        className="fs-surface-nav__toggle"
        type="button"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        {...needTraceAttributes(navigationNeedAnchors)}
      >
        <span className="fs-surface-nav__toggle-main">
          <span className="fs-surface-nav__toggle-chevron" aria-hidden="true">
            {menuOpen ? "▾" : "▸"}
          </span>
          <span>{menuLabel ?? label ?? "Pages in this app"}</span>
        </span>
        {activeNavLabel && (
          <span className="fs-surface-nav__toggle-current">{activeNavLabel}</span>
        )}
      </button>
      <div className="fs-surface-nav__content">
        {groups.map((group, groupIndex) => (
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
              {group.tree.roots.map((node) => renderNode(node, groupIndex))}
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
