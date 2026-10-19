/** @filedesc Retired mounted data effects stop dispatching later owner phases. */
import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import type { DataSourceLoadResult, ResolvedBundle } from '@formspec-org/surface';
import { SurfaceApp } from '../src/SurfaceApp.js';

const definitionRef = 'https://example.test/definitions/lifecycle';
const surfaceRef = 'https://example.test/surfaces/lifecycle';
const catalogRef = 'https://example.test/data/lifecycle';
type Kind = 'definition-form' | 'module-widget';
const measurements: unknown[] = [];
afterAll(() => {
  const file = process.env.LIFECYCLE_METRICS;
  if (file) writeFileSync(file, JSON.stringify(measurements, null, 2) + '\n');
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function settle() { for (let index = 0; index < 12; index++) await Promise.resolve(); }
function loaded(name = 'live'): DataSourceLoadResult {
  return { status: 'loaded', freshness: 'fresh', recordId: 'owner:' + name, value: { name } };
}
function bundle(kind: Kind): ResolvedBundle {
  const surface = { $formspecSurface: '0.2', id: 'lifecycle', entry: 'load', routes: [{
    id: 'load', path: '/load', routeClass: 'operation', slots: [{ id: 'subject', slotType: kind,
      binding: kind === 'definition-form'
        ? { definitionRef, initialData: { catalogRef, sourceRef: 'resource:subject' } }
        : { moduleId: 'x-lifecycle', widgetName: 'LifecycleWidget', dataBindings: { subject: { catalogRef, sourceRef: 'resource:subject' } } },
    }],
  }] };
  return {
    manifest: { $formspecBundle: '2.4', surfaces: [{ url: surfaceRef }], entrySurface: surfaceRef,
      definitions: [{ url: definitionRef, version: '1.0.0' }], dataSources: [{ url: catalogRef }] },
    title: 'Lifecycle', surfaces: [surface], surfaceRefs: new Map([[surface, surfaceRef]]), experiences: [],
    tenantTheme: undefined, responseActions: [], diagnostics: [],
    definitions: new Map([[definitionRef, { $formspec: '1.0', url: definitionRef, version: '1.0.0', items: [] }]]),
    registries: [{ $formspecRegistry: '1.1', publisher: { name: 'Test', url: 'https://example.test' },
      published: '2026-10-19T00:00:00Z', entries: [
        { name: 'x-lifecycle', category: 'module', version: '1.0.0', status: 'stable', contributes: ['x-lifecycle-widget'] },
        { name: 'x-lifecycle-widget', category: 'widget', version: '1.0.0', status: 'stable', widgetShape: {
          widgetName: 'LifecycleWidget', dataInputs: [{ name: 'subject', required: true }], actionOutputs: [] } },
      ] }],
    dataSources: [{ catalogRef, document: { $formspecDataSources: '1.0', id: catalogRef, version: '1.0.0', sources: [{
      id: 'resource:subject', kind: 'document-resource', owner: 'host', scope: 'route', availability: { level: 'app' },
      schema: { type: 'object', properties: { name: { type: 'string' } }, additionalProperties: false },
      runtime: { delivery: 'snapshot', cache: { mode: 'snapshot' }, authorizationBoundary: 'host', failureMode: 'block-render',
        provenance: { kind: 'document-resource', source: 'https://example.test/subject' } },
    }] } }],
  } as unknown as ResolvedBundle;
}
function fixture(kind: Kind, authorize: () => unknown, loader = vi.fn(() => loaded())) {
  const selected = bundle(kind);
  const validate = vi.fn(() => ({ valid: true as const }));
  const modules = [{ moduleId: 'x-lifecycle', widgets: { LifecycleWidget: ({ data }: any) =>
    <p data-probe="lifecycle-ready">{data.subject.name}</p> } }];
  const renderer = ({ initialData }: any) => <p data-probe="lifecycle-ready">{initialData.data.name}</p>;
  const navigate = vi.fn();
  const node = (generation = 1) => <SurfaceApp bundle={selected} location="/load" sessionGeneration={generation}
    onNavigate={navigate} authorizeDataSource={authorize as any} dataSourceLoader={loader}
    validateDataSourcePayload={validate} widgetModules={modules} renderDefinitionForm={renderer} setDocumentTitle={false} />;
  const container = document.createElement('div'); document.body.appendChild(container);
  return { root: createRoot(container), container, node, loader, validate };
}
function ready(container: HTMLElement) { return container.querySelector('[data-probe="lifecycle-ready"]')?.textContent; }
function record(kind: Kind, scenario: string, before: object, after: object) {
  const row = { kind, scenario, before, after }; measurements.push(row); console.log('LIFECYCLE_CALLS', JSON.stringify(row));
}
for (const kind of ['definition-form', 'module-widget'] as const) describe(kind, () => {
  it('StrictMode replay stops obsolete later phases after delayed authorization', async () => {
    const gate = deferred<{ status: 'authorized' }>();
    const authorize = vi.fn().mockImplementationOnce(() => gate.promise).mockResolvedValue({ status: 'authorized' });
    const f = fixture(kind, authorize);
    await act(async () => { f.root.render(<StrictMode>{f.node()}</StrictMode>); await settle(); });
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(ready(f.container)).toBe('live');
    const before = { load: f.loader.mock.calls.length, validate: f.validate.mock.calls.length };
    await act(async () => { gate.resolve({ status: 'authorized' }); await settle(); });
    record(kind, 'StrictMode-delayed-authorize', before, { load: f.loader.mock.calls.length, validate: f.validate.mock.calls.length });
    expect(f.loader).toHaveBeenCalledTimes(1); expect(f.validate).toHaveBeenCalledTimes(1);
    expect(ready(f.container)).toBe('live');
  });
  it('unmount stops later dispatch after delayed authorization', async () => {
    const gate = deferred<{ status: 'authorized' }>();
    const f = fixture(kind, vi.fn(() => gate.promise));
    await act(async () => { f.root.render(f.node()); await settle(); });
    act(() => f.root.unmount());
    await act(async () => { gate.resolve({ status: 'authorized' }); await settle(); });
    record(kind, 'unmount-delayed-authorize', { load: 0, validate: 0 }, { load: f.loader.mock.calls.length, validate: f.validate.mock.calls.length });
    expect(f.loader).not.toHaveBeenCalled(); expect(f.validate).not.toHaveBeenCalled();
  });
  it('genuine generation rerender stops obsolete validation after delayed load', async () => {
    const gate = deferred<DataSourceLoadResult>();
    const loader = vi.fn().mockImplementationOnce(() => gate.promise).mockImplementation(() => loaded());
    const f = fixture(kind, vi.fn(() => ({ status: 'authorized' })), loader);
    await act(async () => { f.root.render(f.node(1)); await settle(); });
    expect(loader).toHaveBeenCalledTimes(1);
    await act(async () => { f.root.render(f.node(2)); await settle(); });
    expect(ready(f.container)).toBe('live');
    const before = { load: loader.mock.calls.length, validate: f.validate.mock.calls.length };
    await act(async () => { gate.resolve(loaded('retired')); await settle(); });
    record(kind, 'generation-delayed-load', before, { load: loader.mock.calls.length, validate: f.validate.mock.calls.length });
    expect(loader).toHaveBeenCalledTimes(2); expect(f.validate).toHaveBeenCalledTimes(1);
    expect(ready(f.container)).toBe('live');
  });
  it('current generation still authorizes loads validates and renders', async () => {
    const authorize = vi.fn(() => ({ status: 'authorized' })); const f = fixture(kind, authorize);
    await act(async () => { f.root.render(f.node()); await settle(); });
    expect(authorize).toHaveBeenCalledTimes(1); expect(f.loader).toHaveBeenCalledTimes(1);
    expect(f.validate).toHaveBeenCalledTimes(1); expect(ready(f.container)).toBe('live');
    record(kind, 'current-positive', {}, { load: f.loader.mock.calls.length, validate: f.validate.mock.calls.length });
  });
});
