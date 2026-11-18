/** @filedesc Synthetic keyed directory and browser storage for the filing tracker journey. */
import Ajv from 'ajv';
import type { FormDefinition } from '@formspec-org/types';
import { createBrowserFilingStore, previewResponseRecordTools } from '../../../packages/formspec-surface-react/src/index';

export const directory = 'urn:test:browser-directory';
export const rosterCatalog = 'urn:test:browser-directory-catalog';
export const rosterSource = 'response:directory';
const version = '1.0.0';
const schema = { type: 'object', properties: {
  units: { type: 'array', items: { type: 'object', properties: {
    year: { type: 'integer' }, name: { type: 'string' },
  }, required: ['year', 'name'] } },
}, required: ['units'] };

export const directoryDefinition = {
  $formspec: '1.0', url: directory, version, title: 'Directory',
  subject: { type: directory, keys: { year: { dataType: 'integer' } } },
  items: [{ key: 'units', type: 'group', repeatable: true, children: [
    { key: 'year', type: 'field', dataType: 'integer' },
    { key: 'name', type: 'field', dataType: 'string' },
  ] }],
};

export const catalogDocument = {
  $formspecDataSources: '1.0', id: rosterCatalog, version, sources: [{
    id: rosterSource, kind: 'definition-response', owner: 'formspec', scope: 'route',
    availability: { level: 'app' }, schema,
    responseSelection: { definition: { url: directory }, status: 'current', cardinality: 'latest', pin: 'none',
      subject: [{ key: 'year', op: 'eq', from: { routeParam: 'year' } }] },
    runtime: { delivery: 'snapshot', cache: { mode: 'snapshot' }, failureMode: 'block-render',
      authorizationBoundary: 'host', provenance: { kind: 'definition-response', source: directory } },
  }],
};

export async function rosterStorage(definitions: ReadonlyMap<string, FormDefinition>, catalogs: Parameters<typeof createBrowserFilingStore>[0]['catalogs']) {
  const scope = 'edition';
  const store = createBrowserFilingStore({ scope, definitions, catalogs,
    databaseName: 'formspec-browser-roster', authorize: key => key.subject?.keys.year !== 2027 });
  const tools = await previewResponseRecordTools();
  const keys = { year: 2025 };
  const subject = { type: directory, keys, id: tools.subjectId(directory, keys) };
  const key = { scope, definitionUrl: directory, subject };
  const data = { units: [{ year: 2025, name: 'Alpha' }, { year: 2027, name: 'Gamma' }] };
  const response = { $formspecResponse: '1.0', id: 'urn:test:directory-filing', definitionUrl: directory,
    definitionVersion: version, subject, data, authored: '2026-01-01T00:00:00Z' };
  const selection = await store.responses.select([{ key: 'directory', scope, kind: 'definition',
    selection: { definition: { url: directory }, status: 'completed', cardinality: 'latest', pin: 'none', subject: [] },
    projection: ['units[*].year', 'units[*].name'] }]);
  if (selection.get('directory')?.status !== 'available' && (await store.drafts.load(key, version)).status === 'absent') {
    const saved = await store.drafts.save({ key, definitionVersion: version, expectedRevision: null, summary: null,
      snapshotJson: JSON.stringify({ definitionUrl: directory, definitionVersion: version, data }),
      responseJson: JSON.stringify({ ...response, status: 'in-progress' }) });
    if (saved.status !== 'saved') throw Error(saved.status);
  }
  const validate = new Ajv().compile(schema);
  return {
    store,
    validate: ({ value }: { value: unknown }) => ({ valid: validate(value) }),
    async fileDirectory() {
      const loaded = await store.drafts.load(key, version);
      if (loaded.status !== 'loaded') throw Error(loaded.status);
      const filed = await store.submit({ key, definitionVersion: version, revision: loaded.draft.revision,
        responseJson: loaded.draft.responseJson }, JSON.stringify({ ...response, status: 'completed' }));
      if (filed.status !== 'filed') throw Error(filed.status);
    },
  };
}
