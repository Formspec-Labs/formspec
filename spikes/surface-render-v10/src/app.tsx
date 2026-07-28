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
 * - **runtime data for widgets**, through the host port, because the bundle has
 *   no channel for it;
 * - **a route parameter value**, because a bundle with no submission has no case
 *   reference to put in `/receipt/:caseRef`;
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
import { useState } from 'react';
import {
  SurfaceApp,
  starterWidgetModule,
  useBrowserLocation,
  type SurfaceWidgetDataResolver,
} from '@formspec-org/surface-react';
import type { SurfaceDiagnostic } from '@formspec-org/surface';
import { resolvedBundle } from './bundle.ts';
import type { VerificationOutcome } from './verify.ts';
import { VerificationChrome } from './chrome/VerificationChrome.tsx';
import { GapDrawer } from './chrome/GapDrawer.tsx';
import { DocumentRootProbe } from './chrome/DocumentRootProbe.tsx';

/**
 * The module the bundle's Registry declares. The starter widgets are bound to
 * it by name, which is the whole point of the seam: a module declares widgets,
 * a host supplies components for them, and the binding resolves through
 * `widgetShape.widgetName` — the module's own name, not the contribution id
 * (ADR 0160 §2.4).
 */
const TENANT_CHROME_MODULE = 'x-formspec-tenant-chrome';

/**
 * `/receipt/:caseRef` needs a value and there is no submission to take one from.
 * Supplied here, by the host, and still recorded — gap ledger `no-runtime-state`.
 * The shell refuses to invent it: without this the link raises
 * `ROUTE-PARAM-UNSUPPLIED` rather than pointing at `/receipt/:caseRef`.
 */
const HOST_ROUTE_PARAMS = { caseRef: 'RA-2026-0412' } as const;

export function App({ verification }: { verification: VerificationOutcome }) {
  const [location, navigate] = useBrowserLocation('/apply');
  const [diagnostics, setDiagnostics] = useState<readonly SurfaceDiagnostic[]>([]);

  /**
   * The host's runtime-data port.
   *
   * The receipt panel gets the only true runtime facts this app has: who signed
   * the release off and when. They are labelled as what they are — a release
   * sign-off is not a submission, and calling it one would be the invention this
   * spike exists to avoid.
   *
   * The queue panel gets nothing, and shows its empty state. That is the honest
   * rendering of `widget-data-binding`: a `module-widget` binding carries
   * `{moduleId, widgetName, config}` and there is no channel from a Surface slot
   * to a Data Source. The spike's first pass drew four applications with
   * invented rents and invented waiting times, and it was the most convincing
   * thing on the screen.
   */
  const widgetData: SurfaceWidgetDataResolver = ({ widgetName }) => {
    if (widgetName !== 'x-receipt-panel') return undefined;
    return {
      facts: [
        { label: 'Release signed off by', value: verification.signerName },
        { label: 'Signed off on', value: new Date(verification.signedAt).toLocaleString() },
      ],
    };
  };

  return (
    <SurfaceApp
      bundle={resolvedBundle}
      location={location}
      onNavigate={navigate}
      routeParams={HOST_ROUTE_PARAMS}
      widgetModules={[starterWidgetModule(TENANT_CHROME_MODULE)]}
      widgetData={widgetData}
      onDiagnostics={setDiagnostics}
      header={
        <>
          <VerificationChrome
            outcome={verification}
            bundleTitle={resolvedBundle.title ?? 'this release'}
          />
          <DocumentRootProbe routeId={location} />
        </>
      }
      footer={<GapDrawer diagnostics={diagnostics} />}
    />
  );
}
