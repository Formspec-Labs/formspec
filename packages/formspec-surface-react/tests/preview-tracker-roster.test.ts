/** @filedesc A keyed roster draft and its filing feed the same preview tracker through the real selector. */
import { expect, it } from 'vitest';
import Ajv from 'ajv';
import { composeSurfaceApp, createThemeAuthority, createWidgetRegistry, dereferenceBundleExport,
  planMatchedRoute, responseSourceLoader } from '@formspec-org/surface';
import { createMemoryFilingStore, previewResponseRecordTools } from '../src/browser-draft-port.js';

const scope = 'preview-edition';
const version = '1.0.0';
const list = 'urn:test:directory';
const report = 'urn:test:report';
const catalog = 'urn:test:roster';
const schema = { type: 'object', required: ['units'], properties: {
  units: { type: 'array', items: { type: 'object', required: ['id', 'name'], properties: {
    id: { type: 'string' }, name: { type: 'string' },
  } } },
} };
const parameter = (name: string) => ({ name, type: 'string' });
const bundle = dereferenceBundleExport({
  manifest: { $formspecBundle: '2.4', id: 'urn:test:app', surfaces: [{ url: 'urn:test:surface' }],
    definitions: [{ url: list }, { url: report }], dataSources: [{ url: catalog }] },
  documents: {
    [list]: { $formspec: '1.0', url: list, version, title: 'Directory',
      subject: { type: list, keys: { region: { dataType: 'string' } } },
      items: [{ key: 'units', type: 'group', repeatable: true, children: [
        { key: 'id', type: 'field', dataType: 'string' }, { key: 'name', type: 'field', dataType: 'string' },
      ] }] },
    [report]: { $formspec: '1.0', url: report, version, title: 'Report',
      subject: { type: report, keys: { unit: { dataType: 'string' } } },
      items: [{ key: 'answer', type: 'field', dataType: 'string' }] },
    [catalog]: { $formspecDataSources: '1.0', id: catalog, version, sources: [{
      id: 'response:units', kind: 'definition-response', owner: 'formspec', scope: 'route',
      availability: { level: 'app' }, schema,
      responseSelection: { definition: { url: list }, status: 'current', cardinality: 'latest', pin: 'none',
        subject: [{ key: 'region', op: 'eq', from: { routeParam: 'region' } }] },
      runtime: { delivery: 'snapshot', cache: { mode: 'snapshot' }, failureMode: 'block-render',
        authorizationBoundary: 'host', provenance: { kind: 'definition-response', source: list } },
    }] },
    'urn:test:surface': { $formspecSurface: '0.4', id: 'app', entry: 'home', routes: [
      { id: 'home', path: '/overview/{region}', params: [parameter('region')], slots: [
        { id: 'tracker', slotType: 'filing-status', binding: { groups: [{ id: 'reports', label: 'Reports',
          repeat: { catalogRef: catalog, sourceRef: 'response:units', rowsField: 'units', labelField: 'name', waitingLabel: 'Waiting for' },
          forms: [{ routeRef: 'report', slotRef: 'form', params: { unit: { rowField: 'id' } } }],
        }] } },
      ] },
      { id: 'report', path: '/report/{unit}', params: [parameter('unit')], slots: [
        { id: 'form', slotType: 'definition-form', binding: { definitionRef: report, subjectKeys: { unit: 'unit' } } },
      ] },
    ] },
  },
});

it('loads the authorized roster from its keyed draft and then its filed Response and reads each member separately', async () => {
  const tools = await previewResponseRecordTools();
  let allowOther = true;
  const store = createMemoryFilingStore({ scope, definitions: bundle.definitions, catalogs: bundle.dataSources,
    authorize: key => allowOther || key.subject?.keys.region !== 'other' });
  async function checkpoint(definitionUrl: string, keys: Record<string, string>, data: object) {
    const subject = { type: definitionUrl, keys, id: tools.subjectId(definitionUrl, keys) };
    const key = { scope, definitionUrl, subject };
    const response = { $formspecResponse: '1.0', id: definitionUrl + ':' + Object.values(keys).join('-'),
      definitionUrl, definitionVersion: version, authored: '2026-01-01T00:00:00Z', subject, data };
    const responseJson = JSON.stringify({ ...response, status: 'in-progress' });
    const saved = await store.drafts.save({ key, definitionVersion: version, expectedRevision: null, responseJson,
      snapshotJson: JSON.stringify({ definitionUrl, definitionVersion: version, data }), summary: null });
    if (saved.status !== 'saved') throw new Error(saved.status);
    return () => store.submit({ key, definitionVersion: version, revision: saved.revision, responseJson },
      JSON.stringify({ ...response, status: 'completed' }));
  }
  const fileRoster = await checkpoint(list, { region: 'north' }, {
    units: [{ id: 'b', name: 'Beta' }, { id: 'a', name: 'Alpha' }],
  });
  await checkpoint(list, { region: 'other' }, { units: [{ id: 'c', name: 'Gamma' }] });
  const fileMember = await checkpoint(report, { unit: 'a' }, { answer: 'Complete' });
  expect((await fileMember()).status).toBe('filed');

  const app = composeSurfaceApp(bundle.surfaces);
  const validate = new Ajv().compile(schema);
  const load = async (region: string) => {
    const plan = planMatchedRoute({ handle: app.entry!, app, params: { region }, definitions: bundle.definitions,
      dataSources: bundle.dataSources, experiences: [], widgets: createWidgetRegistry(), registryEntries: [],
      themeAuthority: createThemeAuthority() });
    const tracker = plan.slots[0];
    if (tracker?.slotType !== 'filing-status' || tracker.tracker.status !== 'roster') throw new Error('Expected a roster');
    const result = await tracker.tracker.load({ loader: responseSourceLoader(store.responses),
      authorize: () => ({ status: 'authorized' }), validatePayload: ({ value }) => validate(value) ? { valid: true } : { valid: false } });
    if (result.status !== 'ready') throw new Error(JSON.stringify(result));
    return result.groups;
  };
  async function expectMembers() {
    const groups = await load('north');
    expect(groups.map(g => g.member?.label)).toEqual(['Beta', 'Alpha']);
    const rows = groups.flatMap(group => group.rows);
    const queries = rows.flatMap(row => row.status === 'ready' ? [row.query] : []);
    expect(queries.map(q => q.subject?.keys.unit)).toEqual(['b', 'a']);
    expect(queries[0]?.sections).toBe(queries[1]?.sections);
    expect(queries.every(query => !query.key.includes('"answer"'))).toBe(true);
    const summary = await store.drafts.readSummaries(queries, { previewScope: scope, signal: new AbortController().signal });
    expect(queries.map(q => summary.get(q.key)?.filing)).toMatchObject([
      { status: 'none' }, { status: 'filed', receiptRef: report + ':a' },
    ]);
  }
  await expectMembers();
  expect((await fileRoster()).status).toBe('filed');
  await expectMembers();
  expect((await load('other')).map(g => g.member?.label)).toEqual(['Gamma']);
  allowOther = false;
  expect(await load('other')).toMatchObject([{ unavailable: true, rows: [] }]);
});
