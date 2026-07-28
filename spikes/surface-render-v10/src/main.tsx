/**
 * @filedesc Boot. Verify first, render second — in that order, always.
 *
 * The app does not render and then check. If the signature does not verify, or
 * the bytes on disk are not the bytes that were signed, nothing from the bundle
 * reaches the screen: the person gets a refusal instead of an app. A shell that
 * renders an unverified bundle and puts a warning on it has already shown the
 * person the thing it cannot vouch for.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import '@formspec-org/layout/formspec-default.css';
import './app.css';
import { SurfaceShell } from './shell/SurfaceShell.tsx';
import { isTrustworthy, verifyBundleSignature, type VerificationOutcome } from './verify.ts';

type BootState =
  | { status: 'checking' }
  | { status: 'ready'; outcome: VerificationOutcome }
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
      .then(([outcome]) => {
        if (!live) return;
        setState(isTrustworthy(outcome) ? { status: 'ready', outcome } : { status: 'refused', outcome });
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

  return <SurfaceShell verification={state.outcome} />;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
