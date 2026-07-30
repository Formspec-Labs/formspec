/**
 * @filedesc Browser boot for the generic Surface preview host.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import '@formspec-org/layout/formspec-default.css';
import '@formspec-org/surface-react/formspec-surface.css';
import './app.css';
import {
  App,
  applyInitialPath,
  loadPreviewSelection,
  type PreviewSelection,
} from './App.tsx';

type BootState =
  | { status: 'starting' }
  | { status: 'ready'; selection: PreviewSelection }
  | { status: 'error'; message: string };

function Boot() {
  const [state, setState] = useState<BootState>({ status: 'starting' });

  useEffect(() => {
    let live = true;
    void Promise.all([
      initFormspecEngine(),
      loadPreviewSelection(window.location.search),
    ])
      .then(([, selection]) => {
        if (!live) return;
        applyInitialPath(selection.scenario.initialPath);
        setState({ status: 'ready', selection });
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
      <main className="host-status" role="status">
        <strong>Preparing the Surface preview</strong>
        <p>Loading the runtime and selected preview data…</p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="host-status host-status--error" role="alert">
        <strong>The Surface preview could not start.</strong>
        <pre>{state.message}</pre>
      </main>
    );
  }

  return <App selection={state.selection} />;
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found.');

createRoot(root).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
