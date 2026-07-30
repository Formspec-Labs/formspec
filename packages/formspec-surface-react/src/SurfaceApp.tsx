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
 * {@link useBrowserLocation} for hosts that want the address bar, and stays out
 * of the way of hosts that already have a router — which every host of any size
 * does. A shell that owned history would be a shell that could not be embedded.
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
  type SurfaceStringOverrides,
  type SurfaceStrings,
  type SurfaceStaticAssetResolver,
  type ThemeAuthority,
  type TransitionConditionEvaluator,
  type WidgetRegistry,
} from '@formspec-org/surface';
import type { RegistryEntry } from '@formspec-org/types';
import { SurfaceRouteView } from './SurfaceRoute.js';
import type {
  SurfaceWidget,
  SurfaceWidgetActionExecutor,
  SurfaceWidgetActionOutcomeStore,
  SurfaceWidgetActionReport,
  SurfaceWidgetModule,
} from './widget-api.js';
import type { SurfaceDefinitionFormRenderer } from './SurfaceSlot.js';
import { createWidgetActionCoordinator } from './widget-action-runtime.js';
import {
  diagnosticListsEqual,
  useDiagnosticDelivery,
} from './diagnostic-delivery.js';
import { needTraceAttributes } from './need-trace.js';

export type FireTransition = (
  transition: PlannedTransition,
  from: SurfaceRouteHandle,
) => Promise<{ advanced: boolean; reason?: string }>;

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
  onNavigate: (href: string) => void,
): 'advanced' | 'refused' {
  if (!transition.target) return 'refused';
  const destination = routeHref(transition.target, routeParams);
  if (destination.refusal !== undefined) return 'refused';
  onNavigate(destination.href);
  return 'advanced';
}

export interface UseSurfaceAppInput {
  bundle: ResolvedBundle;
  widgetModules?: readonly SurfaceWidgetModule[] | undefined;
  /** Host-supplied navigation labels. See `composeSurfaceApp`. */
  surfaceLabel?: SurfaceCompositionOptions['surfaceLabel'] | undefined;
  /** Host-supplied token aliases. Not a platform rule — see `createThemeAuthority`. */
  tokenAliases?: Readonly<Record<string, readonly string[]>> | undefined;
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
  const { bundle, surfaceLabel, tokenAliases, widgetModules } = input;

  return useMemo(() => {
    const compositionOptions: SurfaceCompositionOptions = {
      ...(surfaceLabel ? { surfaceLabel } : {}),
      entrySurface: bundle.entrySurface,
    };
    const app = composeSurfaceApp(bundle.surfaces, compositionOptions);
    const registry = flattenRegistryEntries(bundle.registries);
    const themeAuthority = createThemeAuthority({
      tenantTheme: bundle.tenantTheme,
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
  }, [bundle, surfaceLabel, tokenAliases, widgetModules]);
}

export interface SurfaceAppProps extends UseSurfaceAppInput {
  /** Current path, e.g. `window.location.pathname`. */
  location: string;
  onNavigate: (href: string) => void;
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
  onWidgetActionReport?: ((report: SurfaceWidgetActionReport) => void) | undefined;
  /** Host form runtime seam; the current `FormspecForm` remains the default. */
  renderDefinitionForm?: SurfaceDefinitionFormRenderer | undefined;
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
  onDiagnostics?: ((diagnostics: readonly SurfaceDiagnostic[]) => void) | undefined;
}

/**
 * Inline `--formspec-*` custom properties on the document root, in a DOM
 * medium. Read, never removed: §4.5's no-scrubbing rule.
 */
function documentRootFormspecProperties(): string[] {
  if (typeof document === 'undefined') return [];
  const style = document.documentElement.style;
  const properties: string[] = [];
  for (let index = 0; index < style.length; index += 1) {
    const property = style[index];
    if (property?.startsWith('--formspec-')) properties.push(property);
  }
  return properties;
}

const DEFAULT_NAVIGATION_SCOPE = 'default';

function routeNavigationScope(handle: SurfaceRouteHandle): string {
  return handle.route.navigation?.scope ?? DEFAULT_NAVIGATION_SCOPE;
}

export function SurfaceApp(props: SurfaceAppProps) {
  const model = useSurfaceApp(props);
  const { bundle, location, onNavigate, onDiagnostics } = props;
  const setDocumentTitle = props.setDocumentTitle ?? true;
  const widgetActionCoordinator = useRef(createWidgetActionCoordinator());

  const strings: SurfaceStrings = useMemo(
    () => (typeof props.strings === 'function' ? props.strings : resolveSurfaceStrings(props.strings)),
    [props.strings],
  );

  const resolution = useMemo(() => matchRoute(model.app, location), [model.app, location]);
  const activeNavigationScope = resolution.match
    ? routeNavigationScope(resolution.match.handle)
    : DEFAULT_NAVIGATION_SCOPE;

  const runtimeGeneration = useMemo(() => {
    const params = Object.entries(props.routeParams ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key.length}:${key}${value.length}:${value}`)
      .join('|');
    const parts = [
      String(props.sessionGeneration ?? 'default'),
      location,
      resolution.match?.handle.surfaceId ?? '',
      resolution.match?.handle.routeId ?? '',
      params,
    ];
    return parts.map((part) => `${part.length}:${part}`).join('|');
  }, [location, props.routeParams, props.sessionGeneration, resolution.match]);

  const routePlan: SurfaceRoutePlan<SurfaceWidget> | undefined = useMemo(() => {
    if (!resolution.match) return undefined;
    return planMatchedRoute<SurfaceWidget>({
      handle: resolution.match.handle,
      app: model.app,
      params: { ...(props.routeParams ?? {}), ...resolution.match.params },
      experiences: bundle.experiences,
      experienceHandles: bundle.experienceHandles,
      definitions: bundle.definitions,
      registryEntries: model.registryEntries,
      widgets: model.widgets,
      dataSources: bundle.dataSources,
      surfaceRef: bundle.surfaceRefs?.get(resolution.match.handle.surface),
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
    props.routeParams,
    props.onFireTransition,
    props.widgetActionExecutor,
    props.evaluateTransitionCondition,
    props.headingBaseLevel,
    props.staticAssetResolver,
    strings,
  ]);

  const [runtimeDiagnosticsByScope, setRuntimeDiagnosticsByScope] = useState(
    () =>
      new Map<
        string,
        { generation: string; diagnostics: readonly SurfaceDiagnostic[] }
      >(),
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
          updated.set(scope, { generation: runtimeGeneration, diagnostics: next });
        }
        return updated;
      });
    },
    [runtimeGeneration],
  );
  const runtimeDiagnostics = useMemo(
    () =>
      [...runtimeDiagnosticsByScope.values()]
        .filter((entry) => entry.generation === runtimeGeneration)
        .flatMap((entry) => entry.diagnostics),
    [runtimeDiagnosticsByScope, runtimeGeneration],
  );

  const navigationDiagnostics = useMemo(
    () =>
      model.app.routes
        .filter(
          (handle) =>
            handle.route.navigation?.visible !== false &&
            routeNavigationScope(handle) === activeNavigationScope,
        )
        .flatMap(
          (handle) => routeHref(handle, props.routeParams ?? {}).diagnostics,
        ),
    [activeNavigationScope, model.app, props.routeParams],
  );

  // Read after the route's `useLayoutEffect` has emitted its own tokens, so a
  // property found here is one something ELSE wrote globally. `join` is the
  // dependency so a re-render with the same root state does not loop.
  const [rootProperties, setRootProperties] = useState<string>('');
  useEffect(() => {
    const observed = documentRootFormspecProperties().join(',');
    setRootProperties((previous) => (previous === observed ? previous : observed));
  });

  const diagnostics = useMemo(() => {
    const rootDiagnostic = documentRootContaminationDiagnostic(
      rootProperties === '' ? [] : rootProperties.split(','),
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
    if (!setDocumentTitle || typeof document === 'undefined') return;
    if (!bundle.title) return;
    const previous = document.title;
    document.title = bundle.title;
    return () => {
      document.title = previous;
    };
  }, [bundle.title, setDocumentTitle]);

  return (
    <div
      className="fs-surface-app"
      {...needTraceAttributes(generationNeedAnchors(bundle.manifest))}
    >
      {props.header}
      <SurfaceNav
        app={model.app}
        location={location}
        routeParams={props.routeParams}
        onNavigate={onNavigate}
        label={props.navigationLabel ?? strings('navigationLabel')}
      />
      <main className="fs-surface-main">
        {routePlan ? (
          <SurfaceRouteView
            key={`${routePlan.handle.surfaceId}/${routePlan.handle.routeId}`}
            plan={routePlan}
            strings={strings}
            dataSourceLoader={props.dataSourceLoader}
            authorizeDataSource={props.authorizeDataSource}
            validateDataSourcePayload={props.validateDataSourcePayload}
            widgetActionExecutor={props.widgetActionExecutor}
            widgetActionOutcomeStore={props.widgetActionOutcomeStore}
            widgetActionCoordinator={widgetActionCoordinator.current}
            runtimeGeneration={runtimeGeneration}
            onWidgetActionReport={props.onWidgetActionReport}
            onRuntimeDiagnosticsChange={onRuntimeDiagnosticsChange}
            renderDefinitionForm={props.renderDefinitionForm}
            showExperienceNeeds={props.showExperienceNeeds}
            showThemeNotice={props.showThemeNotice}
            responseActionsDocuments={bundle.responseActions}
            onFireTransition={props.onFireTransition}
            onAdvance={(transition) => {
              // Reached only after the action reported success. The shell
              // navigates; it never decides that the action succeeded.
              // Defensive final boundary. Planning withholds collision-targeted
              // transition controls, and this check prevents a future or
              // slot-supplied path from publishing the same refused address.
              navigateAfterCompletedAction(
                transition,
                routePlan.params,
                onNavigate,
              );
            }}
          />
        ) : (
          (props.renderNotFound?.(location) ?? <NotFound strings={strings} />)
        )}
      </main>
      {props.footer}
    </div>
  );
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
  label?: string | undefined;
}

export function SurfaceNav({ app, location, routeParams, onNavigate, label }: SurfaceNavProps) {
  const activeRoute = matchRoute(app, location).match?.handle;
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
            routeNavigationScope(handle) === activeNavigationScope,
        )
        .sort((left, right) => {
          const leftOrder = left.handle.route.navigation?.order;
          const rightOrder = right.handle.route.navigation?.order;
          if (leftOrder === undefined && rightOrder === undefined) {
            return left.declarationOrder - right.declarationOrder;
          }
          if (leftOrder === undefined) return 1;
          if (rightOrder === undefined) return -1;
          return leftOrder - rightOrder || left.declarationOrder - right.declarationOrder;
        })
        .map(({ handle }) => handle),
    }))
    .filter((group) => group.routes.length > 0);
  if (groups.length === 0) return null;

  const showGroupLabels = groups.length > 1;
  return (
    <nav
      className="fs-surface-nav"
      aria-label={label ?? 'Pages in this app'}
      data-navigation-scope={activeNavigationScope}
    >
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
              const navigationLabel =
                handle.route.navigation?.label ?? handle.route.title ?? handle.routeId;
              const navigationAnchors = generationNeedAnchors(handle.route.navigation);
              const traceAttributes = needTraceAttributes(
                handle.route.navigation?.label === undefined
                  ? mergeNeedAnchors(
                    navigationAnchors,
                    generationNeedAnchors(handle.route),
                  )
                  : navigationAnchors,
              );
              const unavailableReason =
                refusal === 'collision'
                  ? 'route-collision'
                  : refusal === 'parameters'
                    ? 'route-params'
                    : undefined;
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
                      href={href}
                      data-nav-route={handle.routeId}
                      aria-current={href === location ? 'page' : undefined}
                      {...traceAttributes}
                      onClick={(event) => {
                        event.preventDefault();
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
    </nav>
  );
}

function NotFound({ strings }: { strings: SurfaceStrings }) {
  return (
    <div className="fs-surface-notfound" data-probe="route-not-found">
      <h1>{strings('notFoundTitle')}</h1>
      <p>{strings('notFoundBody')}</p>
    </div>
  );
}

/**
 * Address-bar location plus a navigate function, for hosts with no router.
 *
 * Deliberately minimal — `pushState` + `popstate`. A host with a real router
 * passes its own `location`/`onNavigate` and never calls this.
 */
export function useBrowserLocation(fallback = '/'): [string, (href: string) => void] {
  const read = useCallback(
    () => (typeof window === 'undefined' ? fallback : window.location.pathname || fallback),
    [fallback],
  );
  const [location, setLocation] = useState<string>(read);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = () => setLocation(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [read]);

  const navigate = useCallback((href: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', href);
      window.scrollTo(0, 0);
    }
    setLocation(href);
  }, []);

  return [location, navigate];
}
