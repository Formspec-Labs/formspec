/**
 * @filedesc Browser boot for the v12 SaaS dogfood demo.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import '@formspec-org/layout/formspec-default.css';
import '@formspec-org/surface-react/formspec-surface.css';
import './app.css';
import { App } from './App.tsx';

type BootState =
  | { status: 'starting' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

function Boot() {
  const [state, setState] = useState<BootState>({ status: 'starting' });

  useEffect(() => {
    let live = true;
    initFormspecEngine()
      .then(() => {
        if (live) setState({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!live) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      live = false;
    };
  }, []);

  if (state.status === 'starting') {
    return (
      <main className="boot">
        <span className="boot__mark" aria-hidden="true">F</span>
        <div>
          <strong>Preparing Formspec Cloud</strong>
          <p>Loading the shared form and Surface runtimes…</p>
        </div>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="boot boot--error">
        <span className="boot__mark" aria-hidden="true">!</span>
        <div>
          <strong>The demo could not start.</strong>
          <p>{state.message}</p>
        </div>
      </main>
    );
  }

  return <App />;
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found.');

if (window.location.pathname === '/') {
  window.history.replaceState({}, '', '/app');
}

createRoot(root).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
