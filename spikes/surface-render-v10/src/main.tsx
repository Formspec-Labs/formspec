/**
 * @filedesc Boot. Verify first, render second — in that order, always.
 *
 * The host does not construct shell core and then check. If the signature does
 * not verify, or the bytes on disk are not the bytes that were signed, the
 * dynamic core and binding loaders never run. The person gets a refusal
 * instead of an app, and no bundle-derived input crosses into shell code.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import '@formspec-org/layout/formspec-default.css';
import '@formspec-org/surface-react/formspec-surface.css';
import './app.css';
import {
  loadAdmittedSurfaceApp,
  type AdmittedSurfaceApp,
} from './bundle-admission.ts';
import { bundleExport } from './bundle-input.ts';
import { isTrustworthy, verifyBundleSignature, type VerificationOutcome } from './verify.ts';
// Spike scaffolding: hands `scripts/probe.mjs` the app's own verification path,
// so evidence/signature-verification-current.json reports what the browser did
// rather than what a second Node implementation computed. Gap ledger
// `shell-visual-design`.
import './probe-hooks.ts';

type BootState =
  | { status: 'checking' }
  | {
      status: 'ready';
      outcome: VerificationOutcome;
      admitted: AdmittedSurfaceApp;
    }
  | { status: 'refused'; outcome: VerificationOutcome }
  | { status: 'error'; message: string };

function Boot() {
  const [state, setState] = useState<BootState>({ status: 'checking' });

  useEffect(() => {
    let live = true;
    // The engine's WASM runtime has to be up before `FormspecForm` can plan a
    // layout — same call `formspec-web` makes at its own boot. Documented and
    // exported, so this is friction rather than a gap; noted in the README.
    Promise.all([verifyBundleSignature(), initFormspecEngine()])
      .then(async ([outcome]) => {
        if (!live) return;
        const trustworthy = isTrustworthy(outcome);
        if (!trustworthy) {
          setState({ status: 'refused', outcome });
          return;
        }
        const admitted = await loadAdmittedSurfaceApp(
          trustworthy,
          bundleExport,
        );
        if (!admitted) {
          throw new Error('Verified bundle admission returned no shell app.');
        }
        if (live) setState({ status: 'ready', outcome, admitted });
      })
      .catch((error: unknown) => {
        if (!live) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      live = false;
    };
  }, []);

  if (state.status === 'checking') {
    return (
      <main className="boot" data-probe="boot-checking">
        <p>Checking that this app is what was signed off…</p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="boot boot--bad" data-probe="boot-error">
        <h1>This app could not be checked, so it is not being shown.</h1>
        <p>{state.message}</p>
      </main>
    );
  }

  if (state.status === 'refused') {
    return (
      <main className="boot boot--bad" data-probe="boot-refused">
        <h1>This app is not what was signed off, so it is not being shown.</h1>
        <p>
          Signature check: <strong>{state.outcome.result}</strong>
          {state.outcome.reason ? ` — ${state.outcome.reason}` : ''}.
        </p>
        <p>
          Contents match the signature: <strong>{state.outcome.digestMatches ? 'yes' : 'no'}</strong>.
        </p>
      </main>
    );
  }

  const AdmittedApp = state.admitted.App;
  return (
    <AdmittedApp
      bundle={state.admitted.bundle}
      verification={state.outcome}
    />
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
