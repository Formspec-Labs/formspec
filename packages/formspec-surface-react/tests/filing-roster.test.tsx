/** @filedesc Exercises the authored roster, summary batch, and named waiting state through SurfaceApp. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { dereferenceBundleExport, type DataSourceAuthorizer, type DataSourceLoader, type FilingStatusReader } from '@formspec-org/surface';
import { SurfaceApp } from '../src/SurfaceApp.js';

const source = {
  id: 'response:members', kind: 'definition-response', owner: 'host', definitionRef: 'urn:directory',
  scope: 'route', availability: { level: 'app' },
  schema: { type: 'object', properties: { units: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, id: { type: 'string' } } } } } },
  runtime: { delivery: 'draft', authorizationBoundary: 'host', failureMode: 'block-render',
    cache: { mode: 'draft' }, provenance: { kind: 'definition-response', source: 'urn:directory' } },
};

const bundle = dereferenceBundleExport({
  manifest: { $formspecBundle: '2.4', id: 'urn:roster-app', surfaces: [{ url: 'urn:surface' }],
    definitions: [{ url: 'urn:report' }, { url: 'urn:directory' }], dataSources: [{ url: 'urn:roster' }] },
  documents: {
    'urn:roster': { $formspecDataSources: '1.0', id: 'urn:roster', version: '1.0.0', sources: [source] },
    'urn:report': { $formspec: '1.0', url: 'urn:report', version: '1.0.0', title: 'Report',
      items: [{ key: 'count', type: 'field', dataType: 'integer' }],
      subject: { type: 'urn:unit', keys: { unit: { dataType: 'string' } } } },
    'urn:directory': { $formspec: '1.0', url: 'urn:directory', version: '1.0.0', title: 'Directory', items: [
      { key: 'units', type: 'group', repeatable: true, children: [
        { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
        { key: 'id', type: 'field', dataType: 'string', label: 'Unit identifier' },
      ] },
    ] },
    'urn:surface': { $formspecSurface: '0.4', id: 'app', entry: 'home', routes: [
      { id: 'home', path: '/', slots: [{ id: 'tracker', slotType: 'filing-status', binding: { groups: [
        { id: 'directory', label: 'Directory', forms: [{ routeRef: 'directory', slotRef: 'form' }] },
        { id: 'reports', label: 'Unit reports', repeat: {
          catalogRef: 'urn:roster', sourceRef: 'response:members', rowsField: 'units', labelField: 'name', waitingLabel: 'Waiting for',
        }, forms: [{ routeRef: 'report', slotRef: 'form', params: { unit: { rowField: 'id' } } }] },
      ] } }] },
      { id: 'directory', path: '/directory', slots: [
        { id: 'form', slotType: 'definition-form', binding: { definitionRef: 'urn:directory' } },
      ] },
      { id: 'report', path: '/report/{unit}', params: [{ name: 'unit', type: 'string' }], slots: [
        { id: 'form', slotType: 'definition-form', binding: { definitionRef: 'urn:report', subjectKeys: { unit: 'unit' } } },
      ] },
    ] },
  },
});

it('reads fixed and expanded forms together and names only confirmed waiting members', async () => {
  const members = ['North', 'South', 'West'];
  const load = vi.fn<DataSourceLoader>(async () => ({ status: 'loaded', freshness: 'fresh',
    value: { units: members.map(name => ({ name, id: name.toLowerCase() })) } }));
  const authorize = vi.fn<DataSourceAuthorizer>(() => ({ status: 'authorized' }));
  const validate = vi.fn(() => ({ valid: true as const }));
  const read = vi.fn<FilingStatusReader>(async queries => new Map(queries.map(query => [query.key, {
    draft: query.subject?.keys.unit === 'north'
      ? { status: 'current', form: { filled: 1, total: 1, toFix: 0, toCheck: 0, ready: true }, sections: {} }
      : { status: query.subject?.keys.unit === 'west' ? 'denied' : 'absent' },
    filing: { status: query.subject?.keys.unit === 'south' ? 'unavailable' : 'none' },
  }])));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const view = (revision: number) => <SurfaceApp bundle={bundle} location="/" onNavigate={() => {}}
    readSummaries={read} authorizeDataSource={authorize} validateDataSourcePayload={validate}
    dataSourceLoader={load} dataSourceRevision={() => {
      if (revision === 5) throw new Error('No revision available');
      return revision;
    }} />;
  try {
    await act(async () => root.render(view(1)));
    expect([authorize.mock.calls.length, load.mock.calls.length, validate.mock.calls.length]).toEqual([1, 1, 1]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]![0].map(query => query.subject?.keys.unit)).toEqual([undefined, 'north', 'south', 'west']);
    const waiting = () => container.querySelector('[data-state="waiting-on-named-members"]');
    expect(waiting()?.textContent).toContain('Waiting for');
    expect([...waiting()!.querySelectorAll('li')].map(item => item.textContent)).toEqual(['North']);
    expect(container.querySelector('a[href="/report/north?slot=form"]')?.closest('li')?.textContent).toContain('1 of 1 answered');
    expect(container.querySelector('a[href="/report/south?slot=form"]')?.closest('li')?.textContent).toContain('Progress unavailable');
    members.splice(0, members.length, 'East');
    await act(async () => root.render(view(2)));
    expect(load).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain('North');
    expect(waiting()?.textContent).toContain('East');

    let release!: () => void;
    authorize.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ status: 'authorized' }); }));
    await act(async () => root.render(view(3)));
    expect(container.textContent).not.toContain('East');
    authorize.mockImplementationOnce(() => ({ status: 'refused' }));
    await act(async () => root.render(view(4)));
    expect(container.textContent).toContain('Progress unavailable');
    expect(container.querySelector('a[href="/directory?slot=form"]')).not.toBeNull();
    expect(waiting()).toBeNull();
    await act(async () => release());
    expect(load).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls[2]![0].map(query => query.definitionUrl)).toEqual(['urn:directory']);
    await act(async () => root.render(view(5)));
    expect(load).toHaveBeenCalledTimes(2);
    expect(waiting()).toBeNull();
    expect(container.textContent).toContain('Progress unavailable');
    expect(read.mock.calls[3]![0].map(query => query.definitionUrl)).toEqual(['urn:directory']);
  } finally {
    act(() => root.unmount());
  }
});
