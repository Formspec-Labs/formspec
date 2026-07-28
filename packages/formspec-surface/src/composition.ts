/**
 * @filedesc Cross-surface composition — N Surface documents, one navigable app.
 *
 * A bundle manifest admits `surfaces[]`, each with its own `entry` route, and
 * nothing anywhere stated how they compose into one running app: whether they
 * share a URL space, which one the app opens on, or how an actor moves between
 * them. `surface-shell-spec.md` §2 states the rules; this implements them.
 *
 * 1. **One flat URL space, manifest order** (§2.1). Route paths are taken
 *    verbatim; Surfaces are not namespaced under a prefix, because `path` is
 *    authored as an absolute app path and prefixing would make the same route
 *    resolve at different URLs depending on manifest position.
 * 2. **A collision resolves to NO route** (§2.4). Both handles stay in the
 *    table and stay reachable by handle; the *address* answers with nothing and
 *    `ROUTE-PATH-COLLISION` names every member of the group. Picking a winner
 *    by declaration order is the fail-open shape: one signed, authored,
 *    validated route silently becomes unreachable and nothing on screen says
 *    so. Collision is tested over **patterns**, not authored strings — see
 *    `routePathPatternKey`.
 * 3. **The app entry is the FIRST Surface's entry route** (§2.5), and an
 *    unresolved `entry` yields no app entry at all. Never the Surface's first
 *    route, and **never another Surface's entry**: falling through lands a
 *    respondent on a caseworker screen because someone mistyped a route id, and
 *    the diagnostic that would have explained it is the one nobody reads
 *    because the app appeared to work.
 * 4. **A group's label is `surface.title ?? surface.id`, and nothing else.**
 *    `SurfaceDocument.title` is optional and the spike's bundle omits it on
 *    both Surfaces, which is how the spike ended up typing "For the person
 *    applying" into a shell. A shell inventing product copy for an artifact
 *    that declined to carry it is a shell putting words in the author's mouth.
 *    A host that wants better labels supplies
 *    {@link SurfaceCompositionOptions.surfaceLabel}; the default falls back to
 *    the id and the missing title stays visible.
 */
import type { SurfaceDocument } from '@formspec-org/types';
import { surfaceDiagnostic, type SurfaceDiagnostic } from './diagnostics.js';
import {
  compareRouteSpecificity,
  fillRoutePath,
  inspectRouteParams,
  matchRouteSegments,
  routePathPatternKey,
  type RouteParamMarker,
  type RouteSegment,
  type SurfaceRoute,
} from './route-path.js';

export interface SurfaceRouteHandle {
  surface: SurfaceDocument;
  surfaceId: string;
  /** What a person reads above this Surface's routes in a navigation. */
  surfaceLabel: string;
  route: SurfaceRoute;
  routeId: string;
  /** The authored path, markers intact. */
  path: string;
  /** The parsed path. Literal-vs-parameter is decided once, here. */
  segments: readonly RouteSegment[];
  markers: readonly RouteParamMarker[];
  /** True when this route is its own Surface's `entry`. */
  isSurfaceEntry: boolean;
  /**
   * True when another composed route claims the same pattern. Such a route
   * keeps its handle and loses its address (§2.4).
   */
  pathCollides: boolean;
}

export interface SurfaceRouteGroup {
  surfaceId: string;
  label: string;
  routes: readonly SurfaceRouteHandle[];
}

export interface SurfaceApp {
  routes: readonly SurfaceRouteHandle[];
  groups: readonly SurfaceRouteGroup[];
  /**
   * Where the app opens: the FIRST Surface's entry route in manifest order.
   * `undefined` when that Surface's `entry` names no route it declares — the
   * app then has no entry and the shell reports rather than searches (§2.5).
   */
  entry: SurfaceRouteHandle | undefined;
  diagnostics: readonly SurfaceDiagnostic[];
}

export interface SurfaceCompositionOptions {
  /**
   * Host-supplied navigation label. Called only when the shell needs a label;
   * returning `undefined` falls back to `title ?? id`. This is the seam for a
   * host that has product copy the bundle does not carry — it is a host input,
   * not a shell invention.
   */
  surfaceLabel?: (surface: SurfaceDocument) => string | undefined;
}

export function composeSurfaceApp(
  surfaces: readonly SurfaceDocument[],
  options: SurfaceCompositionOptions = {},
): SurfaceApp {
  const diagnostics: SurfaceDiagnostic[] = [];
  const routes: SurfaceRouteHandle[] = [];
  const groups: SurfaceRouteGroup[] = [];
  const byPattern = new Map<string, SurfaceRouteHandle[]>();
  const byHandle = new Map<string, SurfaceRouteHandle[]>();
  /** Per-Surface entry handle, in manifest order. Index 0 is the app entry. */
  const surfaceEntries: (SurfaceRouteHandle | undefined)[] = [];

  for (const surface of surfaces) {
    const surfaceId = surface.id;
    const label = options.surfaceLabel?.(surface) ?? surface.title ?? surfaceId;
    const groupRoutes: SurfaceRouteHandle[] = [];
    let surfaceEntry: SurfaceRouteHandle | undefined;

    for (const route of surface.routes) {
      const site = { surfaceId, routeId: route.id };
      const inspected = inspectRouteParams(route, site);
      diagnostics.push(...inspected.diagnostics);

      const handle: SurfaceRouteHandle = {
        surface,
        surfaceId,
        surfaceLabel: label,
        route,
        routeId: route.id,
        path: route.path,
        segments: inspected.segments,
        markers: inspected.markers,
        isSurfaceEntry: route.id === surface.entry,
        pathCollides: false,
      };
      if (handle.isSurfaceEntry && surfaceEntry === undefined) surfaceEntry = handle;

      const pattern = routePathPatternKey(route.path);
      const claimants = byPattern.get(pattern);
      if (claimants) claimants.push(handle);
      else byPattern.set(pattern, [handle]);

      const handleKey = `${surfaceId}\u0000${route.id}`;
      const handleClaimants = byHandle.get(handleKey);
      if (handleClaimants) handleClaimants.push(handle);
      else byHandle.set(handleKey, [handle]);

      routes.push(handle);
      groupRoutes.push(handle);
    }

    if (surfaceEntry === undefined) {
      diagnostics.push(
        surfaceDiagnostic(
          'SURFACE-ENTRY-UNRESOLVED',
          `Surface "${surfaceId}" names entry route "${surface.entry}", which it does not declare.`,
          { surfaceId },
          { entry: surface.entry },
        ),
      );
    }
    surfaceEntries.push(surfaceEntry);

    groups.push({ surfaceId, label, routes: groupRoutes });
  }

  // One diagnostic per colliding GROUP, naming every member (§7.3). Fired after
  // the walk because a group is not known to be one until its second member
  // arrives, and reporting per-arrival would name only half the group.
  for (const [pattern, claimants] of byPattern) {
    if (claimants.length < 2) continue;
    const members = claimants.map((handle) => `${handle.surfaceId}/${handle.routeId}`);
    for (const handle of claimants) handle.pathCollides = true;
    diagnostics.push(
      surfaceDiagnostic(
        'ROUTE-PATH-COLLISION',
        `Routes ${members.map((member) => `"${member}"`).join(' and ')} claim the same address (${claimants
          .map((handle) => `"${handle.path}"`)
          .join(', ')}). The shell answers that address with none of them. Their qualified route records remain available to the host, but the shell promises no person-facing route to either claimant.`,
        { surfaceId: claimants[0]?.surfaceId ?? '', routeId: claimants[0]?.routeId ?? '' },
        { pattern, routes: members, paths: claimants.map((handle) => handle.path) },
      ),
    );
  }

  const ambiguousHandles = new Set<string>();
  for (const [handleKey, claimants] of byHandle) {
    if (claimants.length < 2) continue;
    ambiguousHandles.add(handleKey);
    const members = claimants.map((handle) => `${handle.surfaceId}/${handle.routeId}`);
    diagnostics.push(
      surfaceDiagnostic(
        'ROUTE-HANDLE-AMBIGUOUS',
        `Route handle "${members[0]}" names more than one route. The shell resolves the handle to none of them.`,
        {
          surfaceId: claimants[0]?.surfaceId ?? '',
          routeId: claimants[0]?.routeId ?? '',
        },
        {
          routes: members,
          paths: claimants.map((handle) => handle.path),
        },
      ),
    );
  }

  // §2.5: the FIRST Surface's entry, or nothing. Never a later Surface's.
  const candidateEntry = surfaceEntries[0];
  const entry =
    candidateEntry === undefined ||
    ambiguousHandles.has(`${candidateEntry.surfaceId}\u0000${candidateEntry.routeId}`)
      ? undefined
      : candidateEntry;

  return { routes, groups, entry, diagnostics };
}

export interface SurfaceRouteMatch {
  handle: SurfaceRouteHandle;
  params: Readonly<Record<string, string>>;
}

/** Why an address answered with no route, when it did. */
export type SurfaceRouteRefusal =
  /** Nothing in the table matched. `ROUTE-UNMATCHED` is in `diagnostics`. */
  | 'unmatched'
  /**
   * Candidates matched and tied on specificity. `ROUTE-PATH-COLLISION` was
   * already reported once at compose time and is not repeated per navigation
   * (§7.3: `ROUTE-UNMATCHED` does not fire when the collision rule owns it).
   */
  | 'collision';

export interface SurfaceRouteResolution {
  match: SurfaceRouteMatch | undefined;
  /** Why `match` is absent. `undefined` when a route resolved. */
  refusal: SurfaceRouteRefusal | undefined;
  diagnostics: readonly SurfaceDiagnostic[];
}

/**
 * The route for an incoming path, plus what the shell has to say about it.
 *
 * Not a first-match scan. Every candidate that matches is collected, then §2.4's
 * specificity rule picks the one whose leftmost differing segment is literal.
 * A tie is a **collision** and resolves to no route: answering the URL with one
 * of them makes a signed, authored, validated route silently unreachable.
 *
 * Returning the resolution rather than `handle | undefined` is what closes the
 * `ROUTE-UNMATCHED` half — a state with no code is a state a host cannot act
 * on, and a broken deep link becomes invisible to operations.
 */
export function matchRoute(app: SurfaceApp, pathname: string): SurfaceRouteResolution {
  const candidates: { handle: SurfaceRouteHandle; params: Record<string, string> }[] = [];
  for (const handle of app.routes) {
    const params = matchRouteSegments(handle.segments, pathname);
    if (params) candidates.push({ handle, params });
  }

  if (candidates.length === 0) {
    return {
      match: undefined,
      refusal: 'unmatched',
      diagnostics: [
        surfaceDiagnostic(
          'ROUTE-UNMATCHED',
          `No page in this app answers "${pathname}".`,
          {},
          { path: pathname },
        ),
      ],
    };
  }

  let best = candidates[0] as { handle: SurfaceRouteHandle; params: Record<string, string> };
  let tied = false;
  for (const candidate of candidates.slice(1)) {
    const order = compareRouteSpecificity(candidate.handle.segments, best.handle.segments);
    if (order > 0) {
      best = candidate;
      tied = false;
    } else if (order === 0) {
      tied = true;
    }
  }

  if (tied) return { match: undefined, refusal: 'collision', diagnostics: [] };
  return { match: { handle: best.handle, params: best.params }, refusal: undefined, diagnostics: [] };
}

/**
 * A candidate URL plus the reason it cannot become live navigation.
 *
 * Collision claimants retain their authored path and qualified route record,
 * but `refusal: "collision"` prevents bindings and transition handlers from
 * publishing that path as a destination. Markers with no supplied value stay
 * in the string and raise `ROUTE-PARAM-UNSUPPLIED`; their
 * `refusal: "parameters"` likewise prevents a link that goes nowhere. The
 * shell never substitutes the parameter's name or its `example`, which are the
 * two substitutions §2.7 forbids by name.
 */
export type SurfaceRouteHrefRefusal = 'collision' | 'parameters';

export function routeHref(
  handle: SurfaceRouteHandle,
  params: Readonly<Record<string, string>> = {},
): {
  href: string;
  diagnostics: readonly SurfaceDiagnostic[];
  refusal: SurfaceRouteHrefRefusal | undefined;
} {
  const missing = handle.markers.filter((marker) => params[marker.name] === undefined);
  const diagnostics = missing.map((marker) =>
    surfaceDiagnostic(
      'ROUTE-PARAM-UNSUPPLIED',
      `Route "${handle.surfaceId}/${handle.routeId}" needs a value for "${marker.name}" before it can be linked to. Nothing in the bundle supplies one.`,
      { surfaceId: handle.surfaceId, routeId: handle.routeId },
      { path: handle.path, name: marker.name },
    ),
  );
  const refusal: SurfaceRouteHrefRefusal | undefined = handle.pathCollides
    ? 'collision'
    : diagnostics.length > 0
      ? 'parameters'
      : undefined;
  return { href: fillRoutePath(handle.path, params), diagnostics, refusal };
}

/** The route a transition targets, resolved within the transition's own Surface. */
export function routeInSurface(
  app: SurfaceApp,
  surfaceId: string,
  routeId: string,
): SurfaceRouteHandle | undefined {
  const matches = app.routes.filter(
    (handle) => handle.surfaceId === surfaceId && handle.routeId === routeId,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
