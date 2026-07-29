/**
 * @filedesc The spike's app — now a host, not a shell.
 *
 * This file is what the spike became once the shell shipped. Everything that
 * was the hypothesis — reading the Surfaces' routes, matching the URL, building
 * the navigation, dispatching the five slot types, resolving the theme grant,
 * turning `{moduleId, widgetName}` into a component — is `SurfaceApp` from
 * `@formspec-org/surface-react`. What remains here is what a host actually
 * supplies:
 *
 * - **the verified bundle**, and the refusal if it is not;
 * - **which widget modules exist** — the starter set, bound to the module id
 *   this bundle declares;
 * - **runtime data loading and authorization**, through the canonical Data
 *   Sources ports. The signed graph still decides whether any widget binds it;
 * - **a route parameter value**, because a bundle with no submission has no case
 *   reference to put in `/receipt/{caseRef}`;
 * - **spike scaffolding** — the verification chrome, the gap drawer, the
 *   document-root probe.
 *
 * The gap ledger's `surface-shell`, `route-matching`, `slot-dispatch`,
 * `experience-unit-rendering`, `static-content-rendering`,
 * `cross-surface-navigation`, `registry-entries-wiring`,
 * `module-widget-runtime` and the four widget stubs are all closed by the
 * imports at the top of this file. That is the measurement: the diff is the
 * deliverable.
 */
import { useMemo, useState } from 'react';
import {
  SurfaceApp,
  starterWidgetModule,
  useBrowserLocation,
} from '@formspec-org/surface-react';
import type {
  DataSourceAuthorizer,
  DataSourceLoader,
  ResolvedBundle,
  SurfaceDiagnostic,
  SurfaceStaticAssetResolver,
} from '@formspec-org/surface';
import type { VerificationOutcome } from './verify.ts';
import { VerificationChrome } from './chrome/VerificationChrome.tsx';
import { GapDrawer } from './chrome/GapDrawer.tsx';
import { DocumentRootProbe } from './chrome/DocumentRootProbe.tsx';
import { CollisionNavigationProbe } from './chrome/CollisionNavigationProbe.tsx';
import { tenantTokenValues } from './tenant-theme-probe.ts';

/**
 * The module the bundle's Registry declares. The starter widgets are bound to
 * it by name, which is the whole point of the seam: a module declares widgets,
 * a host supplies components for them, and the binding resolves through
 * `widgetShape.widgetName` — the module's own name, not the contribution id
 * (ADR 0160 §2.4).
 */
const TENANT_CHROME_MODULE = 'x-formspec-tenant-chrome';

/**
 * `/receipt/{caseRef}` needs a value and there is no submission to take one from.
 * Supplied here, by the host, and still recorded — gap ledger `no-runtime-state`.
 * The shell refuses to invent it: without this the link raises
 * `ROUTE-PARAM-UNSUPPLIED` rather than publishing a marker-bearing URL.
 */
const HOST_ROUTE_PARAMS = { caseRef: 'RA-2026-0412' } as const;

/**
 * Static image sources cross a host policy boundary before the binding sees
 * them. This deployment admits same-origin preview assets and the application
 * publisher's HTTPS origin; every other origin and every malformed source is
 * refused.
 */
const STATIC_ASSET_ORIGINS = new Set([
  window.location.origin,
  'https://benefits.example.gov',
]);

const staticAssetResolver: SurfaceStaticAssetResolver = ({ source }) => {
  try {
    const resolved = new URL(source, window.location.origin);
    return STATIC_ASSET_ORIGINS.has(resolved.origin)
      ? { status: 'admitted', source: resolved.href }
      : { status: 'refused', reason: 'origin-not-allowed' };
  } catch {
    return { status: 'refused', reason: 'invalid-source' };
  }
};

export function App({
  bundle,
  verification,
}: {
  bundle: ResolvedBundle;
  verification: VerificationOutcome;
}) {
  const [location, navigate] = useBrowserLocation('/apply');
  const [diagnostics, setDiagnostics] = useState<readonly SurfaceDiagnostic[]>([]);
  const tenantValues = useMemo(() => tenantTokenValues(bundle), [bundle]);
  const showCollisionProbe = new URLSearchParams(window.location.search).has(
    'surface-nav-collision-probe',
  );

  /**
   * Canonical Data Sources host ports. They receive only a source the verified
   * manifest/catalog and exact Surface binding already resolved.
   *
   * The current signed spike export declares no widget data binding, so these
   * ports are not called and the widgets render honest empty states. If a
   * future signed export binds the explicitly named host-state source below,
   * it receives release-verification facts — still not invented submission or
   * queue state.
   */
  const dataSourceLoader = useMemo<DataSourceLoader>(
    () => ({ descriptor }) => {
      const source = descriptor.source;
      if (
        source.kind !== 'host-state' ||
        source.runtime.provenance.source !== 'spike:verified-release'
      ) {
        return {
          status: 'unavailable',
          reason: 'this spike host does not implement the declared source family',
        };
      }
      return {
        status: 'loaded',
        freshness: 'fresh',
        value: {
          facts: [
            { label: 'Release signed off by', value: verification.signerName },
            {
              label: 'Signed off on',
              value: new Date(verification.signedAt).toLocaleString(),
            },
          ],
        },
      };
    },
    [verification],
  );
  const authorizeDataSource: DataSourceAuthorizer = ({ descriptor }) =>
    descriptor.source.runtime.authorizationBoundary === 'host'
      ? { status: 'authorized' }
      : {
          status: 'refused',
          reason: 'this spike host admits only host-boundary sources',
        };

  return (
    <SurfaceApp
      bundle={bundle}
      location={location}
      onNavigate={navigate}
      routeParams={HOST_ROUTE_PARAMS}
      staticAssetResolver={staticAssetResolver}
      widgetModules={[starterWidgetModule(TENANT_CHROME_MODULE)]}
      dataSourceLoader={dataSourceLoader}
      authorizeDataSource={authorizeDataSource}
      onDiagnostics={setDiagnostics}
      header={
        <>
          <VerificationChrome
            outcome={verification}
            bundleTitle={bundle.title ?? 'this release'}
          />
          <DocumentRootProbe
            routeId={location}
            tenantTokenValues={tenantValues}
          />
        </>
      }
      footer={
        <>
          <GapDrawer diagnostics={diagnostics} />
          {showCollisionProbe && <CollisionNavigationProbe />}
        </>
      }
    />
  );
}
