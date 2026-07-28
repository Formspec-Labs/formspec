/**
 * @filedesc The Surface shell. Hand-built, and the hypothesis this spike set
 * out to test — gap ledger `surface-shell` and `cross-surface-navigation`.
 *
 * **Nothing in the stack reads a `SurfaceDocument`'s routes and composes a
 * navigable app.** Every Surface consumer that exists is authoring-side
 * (`studio-core`'s kernel, the MCP wireframe verbs) or validation-side (the
 * app-graph validator, `formspec-lint`). The one rendering-adjacent consumer,
 * `formspec-web/src/adapters/browser/surface-router.ts`, never opens a Surface
 * document at all — it takes a pre-flattened `{routeId, nextRouteId}` from
 * config and rewrites a query parameter after a response action.
 *
 * So this file is the shell, and it is short, and it is the whole difference
 * between a description of an app and an app.
 *
 * ## The theme boundary
 *
 * `resolveThemeGrant` is called HERE, once per route, and only
 * `grant.themeDocument` crosses into `RouteView`. That is what makes bar R3
 * structural rather than cosmetic: on a `proof` or `ceremony` route the object
 * that crosses the boundary was built from the platform token registry and
 * never saw the tenant's tokens, so there is nothing for a careless prop to
 * leak.
 *
 * ## Two Surfaces, one app
 *
 * The manifest lists a respondent Surface and a staff Surface, each with its
 * own `entry`. Nothing says how two Surfaces compose into one running app,
 * whether they share a URL space, or how an actor moves between them. The shell
 * puts them in one flat URL space and one navigation, grouped by Surface,
 * because their paths happen not to collide. That is an assumption this spike
 * made, not a rule the platform states — gap ledger `cross-surface-navigation`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { bundleExport, surfaces } from '../bundle.ts';
import { resolveThemeGrant } from '../theme-grant.ts';
import type { VerificationOutcome } from '../verify.ts';
import { buildRouteTable, matchRoute, type RouteHandle } from './route-match.ts';
import { RouteView } from './RouteView.tsx';
import { VerificationChrome } from './VerificationChrome.tsx';
import { GapDrawer } from './GapDrawer.tsx';

/**
 * `/receipt/:caseRef` needs a value and there is no submission to take one
 * from. Invented — gap ledger `no-runtime-state`.
 */
const PLACEHOLDER_PARAMS = { caseRef: 'RA-2026-0412' } as const;

function currentPath(): string {
  return window.location.pathname === '/' ? '' : window.location.pathname;
}

export function SurfaceShell({ verification }: { verification: VerificationOutcome }) {
  const table = useMemo(() => buildRouteTable(surfaces, PLACEHOLDER_PARAMS), []);
  const entryHref = useMemo(() => entryRoute(table).href, [table]);
  const [path, setPath] = useState<string>(() => currentPath() || entryHref);

  useEffect(() => {
    const onPop = () => setPath(currentPath() || entryHref);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [entryHref]);

  // The app's name is content the export carries (`manifest.title`), so under
  // R1 it may not be typed into the shell. `index.html` ships a neutral
  // pre-verification label; the real title is set here, and this component
  // mounts only after the signature verifies — so an unverified bundle never
  // gets to name the tab either.
  useEffect(() => {
    document.title = bundleExport.manifest.title;
  }, []);

  const navigate = useCallback((href: string) => {
    window.history.pushState({}, '', href);
    setPath(href);
    window.scrollTo(0, 0);
  }, []);

  const match = matchRoute(table, path);

  if (!match) {
    return (
      <Frame verification={verification} table={table} path={path} navigate={navigate}>
        <div className="route">
          <h1>This address is not part of this app.</h1>
          <p>Pick a page from the list above.</p>
        </div>
      </Frame>
    );
  }

  const grant = resolveThemeGrant(match.handle.route);
  const transition = (match.handle.route.transitions ?? [])[0];
  const nextHandle = transition
    ? table.find(
        (candidate) =>
          candidate.surface.id === match.handle.surface.id && candidate.route.id === transition.to,
      )
    : undefined;

  return (
    <Frame verification={verification} table={table} path={path} navigate={navigate}>
      <RouteView
        key={`${match.handle.surface.id}/${match.handle.route.id}`}
        handle={match.handle}
        params={{ ...PLACEHOLDER_PARAMS, ...match.params }}
        grant={grant}
        verification={verification}
        {...(nextHandle
          ? {
              onAdvance: () => navigate(nextHandle.href),
              nextRouteTitle: nextHandle.route.title ?? nextHandle.route.id,
            }
          : {})}
      />
    </Frame>
  );
}

function entryRoute(table: readonly RouteHandle[]): RouteHandle {
  const first = table.find((handle) => handle.route.id === handle.surface.entry) ?? table[0];
  if (!first) throw new Error('The bundle declares no routes, so there is no app to show.');
  return first;
}

function Frame({
  verification,
  table,
  path,
  navigate,
  children,
}: {
  verification: VerificationOutcome;
  table: readonly RouteHandle[];
  path: string;
  navigate: (href: string) => void;
  children: React.ReactNode;
}) {
  const bySurface = surfaces.map((surface) => ({
    surface,
    handles: table.filter((handle) => handle.surface.id === surface.id),
  }));

  return (
    <div className="shell">
      <VerificationChrome outcome={verification} bundleTitle={bundleExport.manifest.title} />
      <nav className="nav" aria-label="Pages in this app">
        {bySurface.map(({ surface, handles }) => (
          <div className="nav__group" key={surface.id}>
            <p className="nav__group-label">{surfaceLabel(surface.id)}</p>
            <ul className="nav__list">
              {handles.map((handle) => (
                <li key={`${surface.id}/${handle.route.id}`}>
                  <a
                    href={handle.href}
                    aria-current={handle.href === path ? 'page' : undefined}
                    data-nav-route={handle.route.id}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(handle.href);
                    }}
                  >
                    {handle.route.title ?? handle.route.id}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <main className="main">{children}</main>
      <footer className="foot">
        <GapDrawer />
      </footer>
    </div>
  );
}

/**
 * Surface ids are `respondent` and `staff`. Turning an id into a label people
 * read is a shell decision the platform does not carry: `SurfaceDocument.title`
 * is optional and this bundle omits it on both Surfaces.
 */
function surfaceLabel(surfaceId: string): string {
  if (surfaceId === 'respondent') return 'For the person applying';
  if (surfaceId === 'staff') return 'For staff';
  return surfaceId;
}
