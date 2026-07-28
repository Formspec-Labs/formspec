/**
 * @filedesc Matching a browser location to an authored Surface route.
 *
 * Hand-built — gap ledger `route-matching`. Two things worth recording beyond
 * "no matcher exists":
 *
 * 1. **The path grammar in this bundle is not the one the spec defines.**
 *    `surface-spec.md` §3 "Route Parameters" pins v0.1 markers as URI-Template
 *    style — `/matter/{matterId}` — and pairs them with a `params[]`
 *    declaration. The signed bundle authors `/receipt/:caseRef`: Express style,
 *    no `params[]`. Both are schema-valid, because `path` is only constrained
 *    to a non-empty string. So a shipped, signed bundle carries a parameter the
 *    spec's own grammar does not recognise, and nothing caught it — not lint,
 *    not the validator, not the signing ceremony. This matcher accepts both
 *    forms, which is the pragmatic choice and also the wrong one long-term:
 *    two grammars for one thing is how renderers diverge.
 *
 * 2. **Nothing supplies parameter values.** `:caseRef` has to come from
 *    somewhere. There is no submission, so the shell invents one. See gap
 *    ledger `no-runtime-state`.
 */
import type { SurfaceDocument } from '@formspec-org/types';

type Route = SurfaceDocument['routes'][number];

export interface RouteHandle {
  surface: SurfaceDocument;
  route: Route;
  /** Path with every parameter marker filled in. What the nav links to. */
  href: string;
  paramNames: readonly string[];
}

/** Matches `:name` (this bundle) and `{name}` (the spec's stated v0.1 grammar). */
const PARAM_PATTERN = /:([A-Za-z][A-Za-z0-9_]*)|\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export function paramNamesOf(path: string): string[] {
  const names: string[] = [];
  for (const match of path.matchAll(PARAM_PATTERN)) {
    names.push(match[1] ?? match[2] ?? '');
  }
  return names.filter(Boolean);
}

/** Substitutes placeholder values so a parameterised route is reachable at all. */
export function fillParams(path: string, values: Readonly<Record<string, string>>): string {
  return path.replace(PARAM_PATTERN, (_full, colon: string | undefined, braced: string | undefined) => {
    const name = colon ?? braced ?? '';
    return values[name] ?? name;
  });
}

export function toRegExp(path: string): RegExp {
  const source = path
    .replace(/[.*+?^${}()|[\]\\]/g, (char) => (char === '{' || char === '}' ? char : `\\${char}`))
    .replace(PARAM_PATTERN, '([^/]+)');
  return new RegExp(`^${source}/?$`);
}

/** Every route across every Surface in the bundle, in manifest then author order. */
export function buildRouteTable(
  surfaces: readonly SurfaceDocument[],
  paramValues: Readonly<Record<string, string>>,
): RouteHandle[] {
  return surfaces.flatMap((surface) =>
    surface.routes.map((route) => ({
      surface,
      route,
      href: fillParams(route.path, paramValues),
      paramNames: paramNamesOf(route.path),
    })),
  );
}

export interface RouteMatch {
  handle: RouteHandle;
  params: Record<string, string>;
}

export function matchRoute(table: readonly RouteHandle[], pathname: string): RouteMatch | undefined {
  for (const handle of table) {
    const matched = toRegExp(handle.route.path).exec(pathname);
    if (!matched) continue;
    const params: Record<string, string> = {};
    handle.paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(matched[index + 1] ?? '');
    });
    return { handle, params };
  }
  return undefined;
}
