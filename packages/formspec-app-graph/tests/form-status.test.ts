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
  const tracker = { id: 'tracker', slotType: 'form-status', binding, ...anchor };
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
  expect(graph.validateFormStatusTargets(fixture().context)).toEqual([]);
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
  expect(graph.validateFormStatusTargets(f.context)).toHaveLength(1);
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
  expect(graph.validateFormStatusTargets({
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
  expect(graph.validateFormStatusTargets({
    ...f.context, handles: [...f.context.handles, definition],
  })).toEqual([expect.objectContaining({ details: { reason: 'invalid-subject-value' } })]);
});

it('refuses two parameter sources when their resolved values name the same row', () => {
  const f = fixture();
  const source = { ...f.surface.routes[0]!, params: [{ name: 'state' }] };
  f.group.forms.push({ ...f.form, params: { unit: { routeParam: 'state' } } } as unknown as typeof f.form);
  expect(graph.resolveFormStatusTargets([f.apply], source, f.binding).issues).toEqual([]);
  expect(graph.resolveFormStatusTargets([f.apply], source, f.binding, { state: 'north' }).issues)
    .toEqual([expect.objectContaining({ reason: 'duplicate-target' })]);
});

it('refuses a repeating group that cannot distinguish the subjects of its members', () => {
  const f = fixture();
  Object.assign(f.group, { repeat: { catalogRef: 'urn:roster', sourceRef: 'members', labelField: 'name', waitingLabel: 'Waiting for' } });
  expect(graph.validateFormStatusTargets(f.context).map(issue => issue.details?.reason))
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
  expect(graph.validateFormStatusTargets(context)).toEqual([]);
  code.type = 'string';
  expect(graph.validateFormStatusTargets(context)).toEqual(expect.arrayContaining([
    expect.objectContaining({ details: { reason: 'invalid-repeat-source' } }),
  ]));
  code.type = 'object';
  expect(graph.validateFormStatusTargets(context)).toEqual(expect.arrayContaining([
    expect.objectContaining({ details: { reason: 'invalid-repeat-source' } }),
  ]));
});

function periodPlanFixture() {
  const planEntry = {
    routeRef: 'plan', slotRef: 'form',
    subject: [
      { key: 'first_period', op: 'le', from: { routeParam: 'period' } },
      { key: 'last_period', op: 'ge', from: { routeParam: 'period' } },
    ],
    ...anchor,
  };
  const planSlot = {
    id: 'form', slotType: 'definition-form',
    binding: { definitionRef: 'urn:plan', subjectKeys: { first_period: 'first_period', last_period: 'last_period' } },
  };
  const group = { id: 'period', label: 'Period plan', forms: [planEntry], ...anchor };
  const binding = { groups: [group], ...anchor };
  const tracker = { id: 'tracker', slotType: 'form-status', binding, ...anchor };
  const overview = {
    id: 'overview', path: '/years/{period}', params: [{ name: 'period', type: 'string' }], slots: [tracker],
  };
  const planRoute = {
    id: 'plan', path: '/plans/{first_period}/{last_period}',
    params: [{ name: 'first_period', type: 'string' }, { name: 'last_period', type: 'string' }],
    slots: [planSlot],
  };
  const surface = { $formspecSurface: '0.4', id: 'app', entry: 'overview', routes: [overview, planRoute] };
  const planDefinition = {
    artifactKind: 'definition', status: 'loaded', ref: { url: 'urn:plan' },
    document: {
      subject: {
        type: 'urn:period-plan',
        keys: { first_period: { dataType: 'integer' }, last_period: { dataType: 'integer' } },
      },
    },
  };
  const context = {
    manifest: { document: { definitions: [{ url: 'urn:plan' }] } },
    hostEvidence: { needsDocuments: [{
      document: { $formspecNeeds: '1.0', needs: [{ id: 'filings', revision: 1, status: 'adopted' }] },
    }] },
    handles: [
      { artifactKind: 'surface', status: 'loaded', ref: { url: 'urn:surface' }, document: surface },
      planDefinition,
    ],
  } as unknown as AppGraphContext;
  return { planEntry, planSlot, group, binding, overview, planRoute, planDefinition, context };
}

it('validates subject-key range predicates against target route subjectKeys and Definition key types', () => {
  const valid = periodPlanFixture();
  expect(graph.validateFormStatusTargets(valid.context)).toEqual([]);

  // Accepts combining direct params for a known route parameter with subject range predicates.
  const combined = periodPlanFixture();
  combined.overview.params.push({ name: 'org', type: 'string' });
  combined.planRoute.path = '/orgs/{org}/plans/{first_period}/{last_period}';
  combined.planRoute.params.push({ name: 'org', type: 'string' });
  Object.assign(combined.planSlot.binding.subjectKeys, { org: 'org' });
  Object.assign(combined.planDefinition.document.subject.keys, { org: { dataType: 'string' } });
  Object.assign(combined.planEntry, { params: { org: { routeParam: 'org' } } });
  expect(graph.validateFormStatusTargets(combined.context)).toEqual([]);

  const cases: readonly [string, (f: ReturnType<typeof periodPlanFixture>) => void, string][] = [
    ['range operator on string key', f => {
      f.planDefinition.document.subject.keys.first_period = { dataType: 'string' } as never;
    }, 'invalid-subject-predicate'],
    ['offset on string key', f => {
      f.planDefinition.document.subject.keys.first_period = { dataType: 'string' } as never;
      f.planEntry.subject[0] = { key: 'first_period', op: 'eq', from: { routeParam: 'period' }, offset: -1 } as never;
    }, 'invalid-subject-predicate'],
    ['undeclared subject key', f => {
      f.planEntry.subject[0]!.key = 'unknown_key';
    }, 'invalid-subject-predicate'],
    ['target Definition without subject', f => {
      Reflect.deleteProperty(f.planDefinition.document, 'subject');
    }, 'invalid-subject-predicate'],
    ['duplicate key across params and subject', f => {
      Object.assign(f.planEntry, { params: { first_period: { value: '2024' } } });
    }, 'invalid-subject-predicate'],
    ['invalid integer literal in subject predicate', f => {
      f.planEntry.subject[0]!.from = { value: 'not-an-integer' } as never;
    }, 'invalid-subject-value'],
    ['undeclared host routeParam in subject predicate', f => {
      f.planEntry.subject[0]!.from = { routeParam: 'missing' };
    }, 'invalid-parameters'],
    ['unsupplied non-subject target route parameter', f => {
      f.planRoute.params.push({ name: 'tab', type: 'string' });
    }, 'invalid-parameters'],
    ['duplicate predicate-bound target row', f => {
      f.group.forms.push(structuredClone(f.planEntry));
    }, 'duplicate-target'],
    ['mixed subject predicates in one group', f => {
      f.planRoute.slots.push({ ...f.planSlot, id: 'second' });
      f.group.forms.push({
        ...structuredClone(f.planEntry), slotRef: 'second',
        subject: [
          { key: 'first_period', op: 'le', from: { routeParam: 'period' }, offset: -1 },
          { key: 'last_period', op: 'ge', from: { routeParam: 'period' } },
        ] as never,
      });
    }, 'mixed-subject-mappings'],
  ];
  for (const [label, mutate, expectedReason] of cases) {
    const f = periodPlanFixture();
    mutate(f);
    expect(
      graph.validateFormStatusTargets(f.context).map(d => d.details?.reason),
      label,
    ).toContain(expectedReason);
  }
});

it.each([true, false])('refuses an incompatible loaded Definition version regardless of handle order (stringsLast=%s)', stringsLast => {
  const f = periodPlanFixture();
  const intDef = structuredClone(f.planDefinition);
  Object.assign(intDef.ref, { version: '2.0.0' });
  Object.assign(intDef.document, {
    $formspec: '1.0', url: 'urn:plan', version: '2.0.0', title: 'Period plan',
    items: [{ key: 'answer', type: 'field', dataType: 'string' }],
  });
  const strDef = structuredClone(intDef);
  Object.assign(strDef.ref, { version: '1.0.0' });
  Object.assign(strDef.document, { version: '1.0.0' });
  strDef.document.subject.keys.first_period = { dataType: 'string' } as never;
  const context = {
    ...f.context,
    handles: [f.context.handles[0]!, ...(stringsLast ? [intDef, strDef] : [strDef, intDef])],
  } as unknown as AppGraphContext;
  const issues = graph.validateFormStatusTargets(context);
  expect(issues).toEqual(expect.arrayContaining([
    expect.objectContaining({
      details: { reason: 'invalid-subject-predicate' },
      primarySource: expect.objectContaining({
        jsonPointer: '/routes/0/slots/0/binding/groups/0/forms/0/subject/0',
      }),
    }),
  ]));
});

it('points repeat-row predicate field type mismatches directly at the offending subject predicate', () => {
  const f = periodPlanFixture();
  (f.group as Record<string, unknown>).repeat = {
    catalogRef: 'urn:roster', sourceRef: 'response:years', rowsField: 'rows', labelField: 'name', waitingLabel: 'Waiting',
  };
  f.planEntry.subject = [
    { key: 'first_period', op: 'le', from: { rowField: 'year' } },
    { key: 'last_period', op: 'ge', from: { rowField: 'year' } },
  ] as never;
  const yearField = { type: 'integer' };
  const catalogHandle = {
    artifactKind: 'dataSources',
    status: 'loaded',
    ref: { url: 'urn:roster' },
    document: {
      $formspecDataSources: '1.0', id: 'urn:roster', version: '1.0.0',
      sources: [{
        id: 'response:years', kind: 'host-state', owner: 'host', scope: 'route', availability: { level: 'app' },
        schema: {
          type: 'object',
          properties: {
            rows: {
              type: 'array',
              items: { type: 'object', properties: { name: { type: 'string' }, year: yearField } },
            },
          },
        },
        runtime: { delivery: 'snapshot', cache: { mode: 'snapshot' }, failureMode: 'block-render', authorizationBoundary: 'host' },
      }],
    },
  };
  const context = {
    ...f.context,
    manifest: { document: { dataSources: [{ url: 'urn:roster' }] } },
    handles: [...f.context.handles, catalogHandle],
  } as unknown as AppGraphContext;
  expect(graph.validateFormStatusTargets(context)).toEqual([]);
  yearField.type = 'string';
  expect(graph.validateFormStatusTargets(context)).toEqual(expect.arrayContaining([
    expect.objectContaining({
      details: { reason: 'invalid-repeat-source' },
      primarySource: expect.objectContaining({
        jsonPointer: '/routes/0/slots/0/binding/groups/0/forms/0/subject/0',
      }),
    }),
  ]));
});
