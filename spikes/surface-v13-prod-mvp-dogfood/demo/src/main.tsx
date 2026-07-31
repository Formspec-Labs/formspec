/** @filedesc Browser boot for the generic Formspec bundle host. */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import '@formspec-org/layout/formspec-default.css';
import '@formspec-org/surface-react/formspec-surface.css';
import './app.css';
import {
  App,
  applyInitialPath,
  loadBundleHost,
  type BundleHostModel,
} from './App.tsx';

type BootState =
  | { status: 'starting' }
  | { status: 'ready'; model: BundleHostModel }
  | { status: 'error'; message: string };

function Boot() {
  const [state, setState] = useState<BootState>({ status: 'starting' });

  useEffect(() => {
    let live = true;
    void initFormspecEngine()
      .then(() => loadBundleHost(window.location.search))
      .then((model) => {
        if (!live) return;
        applyInitialPath(model.initialPath);
        setState({ status: 'ready', model });
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
        <strong>Preparing the Formspec app</strong>
        <p>Loading the renderer and structured bundle…</p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="host-status host-status--error" role="alert">
        <strong>The Formspec app could not start.</strong>
        <pre>{state.message}</pre>
      </main>
    );
  }

  return <App model={state.model} />;
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found.');

createRoot(root).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
