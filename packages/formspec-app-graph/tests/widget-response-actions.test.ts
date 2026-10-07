/** @filedesc Qualified module-widget Response ownership and transition admission. */
import { describe, expect, it } from 'vitest';
import { validateSurfaceWidgetActions, validateSurfaceResponseActionTriggers, type AppGraphContext,
  type ResolvedArtifactHandle } from '../src/index.js';

function handle(kind: string, url: string, document: unknown): ResolvedArtifactHandle {
  return { slot: kind, artifactKind: kind, status: 'loaded', ref: { url }, document };
}
function fixture() {
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
        dataInputs: [input], actionOutputs: [{ name: 'save' }] } },
    ] }), handle('dataSources', 'urn:data', { id: 'urn:data', sources: [source] }),
    handle('responseActions', 'urn:actions', actions),
    handle('surface', 'urn:surface', { routes: [
      { id: 'home', slots: [{ id: 'widget', slotType: 'module-widget', binding: {
        moduleId: 'x-module', widgetName: 'Widget', actionBindings: { save: binding },
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
