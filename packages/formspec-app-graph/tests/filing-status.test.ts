/** @filedesc The app graph resolves tracker destinations and inventories direct Need traces. */
import { expect, it } from 'vitest';
import * as graph from '../src/index.js';
import type { AppGraphContext } from '../src/index.js';

const anchor = { 'x-generation': { anchors: ['need:filings@1'] } };
function fixture() {
  const form = { routeRef: 'apply', slotRef: 'capture', params: { unit: { value: 'north' } }, ...anchor };
  const formSlot = { id: 'capture', slotType: 'definition-form', binding: { definitionRef: 'urn:definition' } };
  const group = { id: 'annual', label: 'Annual forms', forms: [form], ...anchor };
  const binding = { groups: [group], ...anchor };
  const tracker = { id: 'tracker', slotType: 'filing-status', binding, ...anchor };
  const apply = { id: 'apply', path: '/apply/{unit}', params: [{ name: 'unit', type: 'string' }], slots: [formSlot] };
  const surface = {
    $formspecSurface: '0.4', id: 'app', entry: 'home',
    routes: [{ id: 'home', path: '/', slots: [tracker] }, apply],
  };
  const context = {
    manifest: { document: {} },
    hostEvidence: { needsDocuments: [{
      document: { $formspecNeeds: '1.0', needs: [{ id: 'filings', revision: 1, status: 'adopted' }] },
    }] },
    handles: [{ artifactKind: 'surface', status: 'loaded', ref: { url: 'urn:surface' }, document: surface }],
  } as unknown as AppGraphContext;
  return { form, formSlot, group, binding, tracker, apply, surface, context };
}

it('accepts exact tracker references', () => {
  expect(graph.validateFilingStatusTargets(fixture().context)).toEqual([]);
});

it.each([
  ['dangling route', (f: ReturnType<typeof fixture>) => { f.form.routeRef = 'unknown'; }],
  ['ambiguous route', (f: ReturnType<typeof fixture>) => { f.surface.routes.push(f.apply); }],
  ['dangling slot', (f: ReturnType<typeof fixture>) => { f.form.slotRef = 'unknown'; }],
  ['ambiguous slot', (f: ReturnType<typeof fixture>) => { f.apply.slots.push(f.formSlot); }],
  ['wrong slot type', (f: ReturnType<typeof fixture>) => { f.formSlot.slotType = 'static-content'; }],
  ['missing parameter', (f: ReturnType<typeof fixture>) => { Reflect.deleteProperty(f.form, 'params'); }],
  ['undeclared source parameter', (f: ReturnType<typeof fixture>) => {
    Object.assign(f.form, { params: { unit: { routeParam: 'state' } } });
  }],
  ['duplicate resolved row', (f: ReturnType<typeof fixture>) => { f.group.forms.push({ ...f.form }); }],
] as const)('refuses a %s', (_case, alter) => {
  const f = fixture();
  alter(f);
  expect(graph.validateFilingStatusTargets(f.context)).toHaveLength(1);
});

it('requires a direct anchor on each tracker node under the strict profile', () => {
  const f = fixture();
  const tracePointers = [
    '/routes/0/slots/0',
    '/routes/0/slots/0/binding',
    '/routes/0/slots/0/binding/groups/0',
    '/routes/0/slots/0/binding/groups/0/forms/0',
  ];
  for (const [index, node] of [f.tracker, f.binding, f.group, f.form].entries()) {
    Reflect.deleteProperty(node, 'x-generation');
    expect(graph.validateRenderedNeedTrace(f.context)).toEqual(expect.arrayContaining([
      expect.objectContaining({ primarySource: expect.objectContaining({ jsonPointer: tracePointers[index] }) }),
    ]));
    Object.assign(node, anchor);
  }
});

it('refuses a group that mixes distinct singleton filing units', () => {
  const f = fixture();
  f.apply.slots.push({ ...f.formSlot, id: 'second', binding: { definitionRef: 'urn:other' } });
  f.group.forms.push({ ...f.form, slotRef: 'second' });
  const definitions = ['urn:definition', 'urn:other'].map(url => ({
    artifactKind: 'definition', status: 'loaded', ref: { url },
    document: { subject: { type: url, keys: {} } },
  }));
  expect(graph.validateFilingStatusTargets({
    ...f.context,
    handles: [...f.context.handles, ...definitions as unknown as AppGraphContext['handles']],
  })).toEqual([expect.objectContaining({ details: { reason: 'mixed-subject-mappings' } })]);
});

it.each(['north', '01', '9007199254740992'])('refuses literal %s for an integer subject key', value => {
  const f = fixture();
  f.form.params.unit.value = value;
  Object.assign(f.formSlot.binding, { subjectKeys: { year: 'unit' } });
  const definition = {
    artifactKind: 'definition', status: 'loaded', ref: { url: 'urn:definition' },
    document: { subject: { type: 'urn:annual', keys: { year: { dataType: 'integer' } } } },
  } as AppGraphContext['handles'][number];
  expect(graph.validateFilingStatusTargets({
    ...f.context, handles: [...f.context.handles, definition],
  })).toEqual([expect.objectContaining({ details: { reason: 'invalid-subject-value' } })]);
});

it('refuses two parameter sources when their resolved values name the same row', () => {
  const f = fixture();
  const source = { ...f.surface.routes[0]!, params: [{ name: 'state' }] };
  f.group.forms.push({ ...f.form, params: { unit: { routeParam: 'state' } } } as unknown as typeof f.form);
  expect(graph.resolveFilingStatusTargets([f.apply], source, f.binding).issues).toEqual([]);
  expect(graph.resolveFilingStatusTargets([f.apply], source, f.binding, { state: 'north' }).issues)
    .toEqual([expect.objectContaining({ reason: 'duplicate-target' })]);
});

it('refuses a repeating group that cannot distinguish the subjects of its members', () => {
  const f = fixture();
  Object.assign(f.group, { repeat: { catalogRef: 'urn:roster', sourceRef: 'members', labelField: 'name', waitingLabel: 'Waiting for' } });
  expect(graph.validateFilingStatusTargets(f.context).map(issue => issue.details?.reason))
    .toContain('ambiguous-repeat');
});

it('validates the qualified roster shape and the row field bound to the typed subject', () => {
  const f = fixture();
  Object.assign(f.group, { repeat: { catalogRef: 'urn:roster', sourceRef: 'members', rowsField: 'units',
    labelField: 'name', waitingLabel: 'Waiting for' } });
  Object.assign(f.form.params, { unit: { rowField: 'code' } });
  Object.assign(f.formSlot.binding, { subjectKeys: { code: 'unit' } });
  const code = { type: 'integer' };
  const source = { id: 'members', availability: { level: 'app' }, schema: {
    type: 'object', properties: { units: { type: 'array', items: { type: 'object', properties: { code, name: { type: 'string' } } } } },
  } };
  const context = {
    ...f.context,
    manifest: { document: { dataSources: [{ url: 'urn:roster' }] } },
    handles: [...f.context.handles,
      { artifactKind: 'definition', status: 'loaded', ref: { url: 'urn:definition' },
        document: { subject: { type: 'urn:member', keys: { code: { dataType: 'integer' } } } } },
      { artifactKind: 'dataSources', status: 'loaded', ref: { url: 'urn:roster' },
        document: { id: 'urn:roster', sources: [source] } },
    ],
  } as unknown as AppGraphContext;
  expect(graph.validateFilingStatusTargets(context)).toEqual([]);
  code.type = 'object';
  expect(graph.validateFilingStatusTargets(context)).toEqual(expect.arrayContaining([
    expect.objectContaining({ details: { reason: 'invalid-repeat-source' } }),
  ]));
});
