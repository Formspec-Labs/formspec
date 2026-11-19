/** @filedesc Load declared preview files and mount the maintained browser app in hash mode. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { initFormspecEngine, initFormspecEngineTools } from '@formspec-org/engine/init-formspec-engine';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import type { BundleExport } from '@formspec-org/surface';
import { BrowserSurfaceApp, createSurfacePreviewEdition } from '@formspec-org/surface-react';
import '@formspec-org/layout/formspec-default.css';
import '@formspec-org/surface-react/formspec-surface.css';
import { previewValidators } from './validation';

const root = createRoot(document.getElementById('surface')!);
const directory = new URL('.', document.baseURI);

function asset(path: unknown): string {
  if (typeof path !== 'string' || !path.trim()) throw new Error('Expected a preview asset path.');
  const url = new URL(path, directory);
  if (url.origin !== directory.origin || !url.pathname.startsWith(directory.pathname)) {
    throw new Error('Preview assets must be hosted with the page.');
  }
  return url.href;
}

async function json(path: unknown): Promise<any> {
  const result = await fetch(asset(path));
  if (!result.ok) throw new Error(`Could not load ${path} (HTTP ${result.status}).`);
  return parseJsonExact(await result.text());
}

async function mount() {
  const config = await json('preview.json');
  if (!Array.isArray(config?.editions) || !config.editions.length) throw new Error('Declare at least one preview edition.');
  if (config.fontStylesheet !== undefined) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = asset(config.fontStylesheet);
    document.head.append(link);
  }
  await initFormspecEngine();
  await initFormspecEngineTools();
  const scopes = new Set<string>();
  const editions = await Promise.all(config.editions.map(async (entry: { scope: string; bundle: string; scenario?: string }) => {
    if (typeof entry?.scope !== 'string' || !entry.scope.trim() || scopes.has(entry.scope)) {
      throw new Error('Preview editions require distinct, non-empty scopes.');
    }
    scopes.add(entry.scope);
    const [source, scenario] = await Promise.all([
      json(entry.bundle), entry.scenario === undefined ? undefined : json(entry.scenario),
    ]);
    return createSurfacePreviewEdition({
      scope: entry.scope, source: source as BundleExport, scenario,
      ...previewValidators,
    });
  }));
  root.render(<BrowserSurfaceApp previewEditions={[editions[0]!, ...editions.slice(1)]} />);
}

void mount().catch(error => root.render(<p role="alert">{String(error)}</p>));
