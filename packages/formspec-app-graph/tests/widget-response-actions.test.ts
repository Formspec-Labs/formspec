/** @filedesc Qualified module-widget Response ownership and transition admission. */
import corpus from '../../../tests/conformance/fixtures/app-graph-validator/ceremony-sign-operation.case.json';
import prepareCorpus from '../../../tests/conformance/fixtures/app-graph-validator/ceremony-prepare-producer.case.json';
import { describe, expect, it } from 'vitest';
import { validateSurfaceWidgetActions, validateSurfaceResponseActionTriggers, type AppGraphContext,
  type ResolvedArtifactHandle } from '../src/index.js';

function handle(kind: string, url: string, document: unknown): ResolvedArtifactHandle {
  return { slot: kind, artifactKind: kind, status: 'loaded', ref: { url }, document };
}
function fixture(output = 'save', deliveryContractId?: string) {
  const input = { name: 'saved', required: true };
  const binding = { actionRef: 'save', responseInput: 'saved' };
  const source = { id: 'saved', schema: { $ref: 'https://formspec.org/schemas/response/1.0' },
    availability: { level: 'slot', surfaceRef: 'urn:surface', routeRef: 'home', slotId: 'widget' } };
  const actions = { scope: 'response', targetDefinition: { url: 'urn:def', compatibleVersions: '1.0.0' },
    actions: [{ id: 'save', intent: 'save-draft' }] };
  const definition = handle('definition', 'urn:def', { url: 'urn:def', version: '1.0.0' });
  const context: AppGraphContext = {
    manifest: handle('appManifest', 'urn:app', { definitions: [{ url: 'urn:def' }], dataSources: [{ url: 'urn:data' }] }),
    handles: [definition, handle('registry', 'urn:registry', { entries: [
      { name: 'x-module', category: 'module', contributes: ['x-widget'] },
      { name: 'x-widget', category: 'widget', widgetShape: { widgetName: 'Widget',
        dataInputs: [input], deliveryContractId, actionOutputs: [{ name: output }] } },
    ] }), handle('dataSources', 'urn:data', { id: 'urn:data', sources: [source] }),
    handle('responseActions', 'urn:actions', actions),
    handle('surface', 'urn:surface', { routes: [
      { id: 'home', slots: [{ id: 'widget', slotType: 'module-widget', binding: {
        moduleId: 'x-module', widgetName: 'Widget', actionBindings: { [output]: binding },
        dataBindings: { saved: { catalogRef: 'urn:data', sourceRef: 'saved' } },
      } }], transitions: [{ trigger: 'save', to: 'done' }] },
      { id: 'done', slots: [] },
    ] }), ], schemaResults: [], evidenceResults: [],
  };
  return { context, input, binding, source, actions, definition };
}
function refuses(context: AppGraphContext) {
  expect(validateSurfaceWidgetActions(context)).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'E612', details: expect.objectContaining({ reason: 'widget-action-scope-mismatch' }) }),
  ]));
  expect(validateSurfaceResponseActionTriggers(context)).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'E611' }),
  ]));
}
describe('qualified widget Response actions', () => {
  it('admits the unique manifested target and qualified required input as a transition source', () => {
    const { context } = fixture();
    expect(validateSurfaceWidgetActions(context)).toEqual([]);
    expect(validateSurfaceResponseActionTriggers(context)).toEqual([]);
  });
  it.each(['missing-input', 'optional-input', 'wrong-schema', 'composed-schema', 'unavailable-source',
    'wrong-version', 'duplicate-definition', 'unmanifested-definition', 'app-context'])('refuses %s', (failure) => {
    const f = fixture();
    if (failure === 'missing-input') f.binding.responseInput = 'unknown';
    if (failure === 'optional-input') f.input.required = false;
    if (failure === 'wrong-schema') f.source.schema.$ref += '#/properties/data';
    if (failure === 'composed-schema') Object.assign(f.source.schema, { allOf: [] });
    if (failure === 'unavailable-source') f.source.availability.slotId = 'other';
    if (failure === 'wrong-version') f.actions.targetDefinition.compatibleVersions = '2.0.0';
    if (failure === 'duplicate-definition') f.context.handles.push({ ...f.definition });
    if (failure === 'unmanifested-definition') (f.context.manifest.document as { definitions: unknown[] }).definitions = [];
    if (failure === 'app-context') { f.actions.scope = 'app'; delete (f.actions as Partial<typeof f.actions>).targetDefinition; }
    refuses(f.context);
  });
});

describe('signing ceremony Sign output', () => {
  it.each(corpus.cases)('checks the bound request operation ($id)', ({ operation, expected }) => {
    const { context, actions } = fixture('sign', '@formspec-org/surface-react/SigningCeremony@0.1');
    Object.assign(actions.actions[0]!, { effects: [{ type: 'serviceRequest', requestRef: 'record' }] });
    Object.assign(actions, { 'x-formspec-runtime': { requests: [
      { id: 'record', operation }, { id: 'unrelated', operation: 'sign' },
    ] } });
    const findings = validateSurfaceWidgetActions(context);
    expect(findings.map(({ code }) => ({ code }))).toEqual(expected.diagnostics);
    for (const finding of findings) expect(finding.details?.reason).toBe('ceremony-sign-operation');
    expect(validateSurfaceResponseActionTriggers(context).some(finding => finding.code === 'E611'))
      .toBe(expected.diagnostics.length > 0);
    expect(validateSurfaceWidgetActions(fixture('sign', 'urn:other:widget').context)).toEqual([]);
  });
});

function ceremonyPrepareFixture(options: {
  producer?: Record<string, unknown> | null;
  includeUpstreamRoute?: boolean;
  upstreamDefinitionUrl?: string;
  mountUpstreamDefinition?: boolean;
  prepareOperation?: string;
  includeUnrelatedPrepare?: boolean;
  includeMappingRelation?: boolean;
  signDefinitionUrl?: string;
} = {}) {
  const upstreamUrl = options.upstreamDefinitionUrl ?? 'urn:def:intake';
  const signUrl = options.signDefinitionUrl ?? upstreamUrl;
  const defs: ResolvedArtifactHandle[] = [
    handle('definition', upstreamUrl, { url: upstreamUrl, version: '1.0.0' }),
  ];
  const manifestDefs: Array<{ url: string }> = [{ url: upstreamUrl }];
  if (signUrl !== upstreamUrl) {
    defs.push(handle('definition', signUrl, { url: signUrl, version: '1.0.0' }));
    manifestDefs.push({ url: signUrl });
  }
  const mappings: ResolvedArtifactHandle[] = [];
  const manifestMappings: Array<{ handle: string; url: string }> = [];
  if (options.includeMappingRelation) {
    manifestMappings.push({ handle: 'intakeToSign', url: 'urn:mapping:intake-to-sign' });
    mappings.push(handle('mapping', 'urn:mapping:intake-to-sign', {
      $formspecMapping: '1.0',
      version: '1.0.0',
      definitionRef: upstreamUrl,
      definitionVersion: '1.0.0',
      targetSchema: { format: 'json', url: signUrl },
      rules: [],
    }));
  }
  const draftBinding: Record<string, unknown> = {
    catalogRef: 'urn:data',
    sourceRef: 'host:draft',
  };
  if (options.producer !== null) {
    draftBinding.producer = options.producer ?? {
      routeRef: 'intake',
      definitionRef: upstreamUrl,
      actionRef: 'prepare',
      ...(options.includeMappingRelation ? { relation: { kind: 'mapping', mappingRef: 'intakeToSign' } } : {}),
    };
  }
  const requests: Array<Record<string, unknown>> = [
    { id: 'prep-req', ...(options.prepareOperation !== undefined ? { operation: options.prepareOperation } : {}) },
    { id: 'sign-req', operation: 'sign' },
  ];
  if (options.includeUnrelatedPrepare) {
    requests.push({ id: 'unrelated-prep', operation: 'prepare' });
  }
  const prepareActionDoc = {
    scope: 'response',
    targetDefinition: { url: upstreamUrl, compatibleVersions: '1.0.0' },
    actions: [
      { id: 'prepare', intent: 'review', effects: [{ type: 'serviceRequest', requestRef: 'prep-req' }] },
      ...(signUrl === upstreamUrl
        ? [{ id: 'sign', intent: 'x-sign', effects: [{ type: 'serviceRequest', requestRef: 'sign-req' }] }]
        : []),
    ],
    'x-formspec-runtime': { requests },
  };
  const actionHandles = [handle('responseActions', 'urn:actions', prepareActionDoc)];
  if (signUrl !== upstreamUrl) {
    actionHandles.push(handle('responseActions', 'urn:actions:sign', {
      scope: 'response',
      targetDefinition: { url: signUrl, compatibleVersions: '1.0.0' },
      actions: [{ id: 'sign', intent: 'x-sign', effects: [{ type: 'serviceRequest', requestRef: 'sign-req' }] }],
      'x-formspec-runtime': { requests: [{ id: 'sign-req', operation: 'sign' }] },
    }));
  }
  const routes: Array<Record<string, unknown>> = [];
  if (options.includeUpstreamRoute !== false) {
    routes.push({
      id: 'intake',
      slots: options.mountUpstreamDefinition === false
        ? []
        : [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: upstreamUrl } }],
      transitions: [{ trigger: 'prepare', to: 'ceremony' }],
    });
  }
  routes.push({
    id: 'ceremony',
    slots: [{
      id: 'signing',
      slotType: 'module-widget',
      binding: {
        moduleId: 'x-module',
        widgetName: 'SigningCeremony',
        dataBindings: {
          response: { catalogRef: 'urn:data', sourceRef: 'host:response' },
          draft: draftBinding,
        },
        actionBindings: {
          sign: { actionRef: 'sign', responseInput: 'response' },
        },
      },
    }],
    transitions: [{ trigger: 'sign', to: 'done' }],
  });
  routes.push({ id: 'done', slots: [] });

  const context: AppGraphContext = {
    manifest: handle('appManifest', 'urn:app', {
      definitions: manifestDefs,
      dataSources: [{ url: 'urn:data' }],
      ...(manifestMappings.length ? { mappings: manifestMappings } : {}),
    }),
    handles: [
      ...defs,
      ...mappings,
      handle('registry', 'urn:registry', {
        entries: [
          { name: 'x-module', category: 'module', contributes: ['x-ceremony'] },
          {
            name: 'x-ceremony',
            category: 'widget',
            widgetShape: {
              widgetName: 'SigningCeremony',
              deliveryContractId: '@formspec-org/surface-react/SigningCeremony@0.1',
              dataInputs: [
                { name: 'response', required: true },
                { name: 'draft', required: true },
              ],
              actionOutputs: [{ name: 'sign' }],
            },
          },
        ],
      }),
      handle('dataSources', 'urn:data', {
        id: 'urn:data',
        sources: [
          {
            id: 'host:response',
            schema: { $ref: 'https://formspec.org/schemas/response/1.0' },
            availability: { level: 'route', surfaceRef: 'urn:surface', routeRef: 'ceremony' },
          },
          {
            id: 'host:draft',
            schema: { type: 'object' },
            availability: { level: 'route', surfaceRef: 'urn:surface', routeRef: 'ceremony' },
          },
        ],
      }),
      ...actionHandles,
      handle('surface', 'urn:surface', { routes }),
    ],
    schemaResults: [],
    evidenceResults: [],
  };
  return context;
}

describe('signing ceremony draft producer binding (fs-wqof)', () => {
  it.each(prepareCorpus.cases)('validates $id', ({ id, expected }) => {
    const context = (() => {
      switch (id) {
        case 'valid-same-definition':
          return ceremonyPrepareFixture({ prepareOperation: 'prepare' });
        case 'valid-cross-definition-with-mapping-relation':
          return ceremonyPrepareFixture({
            prepareOperation: 'prepare',
            upstreamDefinitionUrl: 'urn:def:intake',
            signDefinitionUrl: 'urn:def:signing',
            includeMappingRelation: true,
          });
        case 'missing-producer':
          return ceremonyPrepareFixture({ prepareOperation: 'prepare', producer: null });
        case 'missing-upstream-route':
          return ceremonyPrepareFixture({ prepareOperation: 'prepare', includeUpstreamRoute: false });
        case 'missing-upstream-definition-on-route':
          return ceremonyPrepareFixture({ prepareOperation: 'prepare', mountUpstreamDefinition: false });
        case 'cross-definition-without-relation':
          return ceremonyPrepareFixture({
            prepareOperation: 'prepare',
            upstreamDefinitionUrl: 'urn:def:intake',
            signDefinitionUrl: 'urn:def:signing',
            includeMappingRelation: false,
          });
        case 'missing-operation':
          return ceremonyPrepareFixture({ prepareOperation: undefined });
        case 'wrong-operation-sign':
          return ceremonyPrepareFixture({ prepareOperation: 'sign' });
        case 'unrelated-prepare-elsewhere':
          return ceremonyPrepareFixture({ prepareOperation: undefined, includeUnrelatedPrepare: true });
        default:
          throw new Error(`Unhandled case ${id}`);
      }
    })();

    const findings = validateSurfaceWidgetActions(context);
    expect(findings.map(({ code, details }) => ({ code, reason: details?.reason }))).toEqual(expected.diagnostics);
    expect(validateSurfaceResponseActionTriggers(context).some(f => f.code === 'E611'))
      .toBe(expected.diagnostics.length > 0);
  });
});
