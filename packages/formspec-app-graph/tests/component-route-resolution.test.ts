import { describe, expect, it } from 'vitest';
import * as api from '../src/index.js';
import type { AppGraphContext, ResolvedArtifactHandle } from '../src/index.js';

const surface = { url: 'urn:test:surface', version: '1.0.0' };
const definition = { url: 'urn:test:definition', version: '1.0.0' };
const request = { surface, route: 'intake', slot: 'form', role: 'slot' as const, definition };

function handle(kind: string, ref: Record<string, string>, document: unknown): ResolvedArtifactHandle {
  return { artifactKind: kind, slot: kind, status: 'loaded', ref: { ...ref }, document };
}

function fixture(): AppGraphContext {
  const componentRef = { url: 'urn:test:component:intake', version: '1.0.0', handle: 'intake' };
  const correctionRef = { url: 'urn:test:component:correction', version: '1.0.0', handle: 'correction' };
  const component = (route: string, id: string) => ({
    $formspecComponent: '1.2', version: '1.0.0',
    targetDefinition: { url: definition.url, compatibleVersions: '1.0.0' },
    targetSurfaceRoutes: [{ surface: { ...surface }, route, slot: 'form', role: 'slot' }],
    tree: { component: 'Stack', id, children: [{ component: 'TextInput', bind: 'name' }] },
  });
  return {
    manifest: handle('appManifest', {}, {
      $formspecBundle: '2.4', definitions: [{ ...definition }], surfaces: [{ ...surface }],
      components: [componentRef, correctionRef],
    }),
    handles: [
      handle('surface', { ...surface }, { $formspecSurface: '0.2', entry: 'intake', routes: ['intake', 'correction'].map(id => ({
        id, slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: definition.url } }],
      })) }),
      handle('definition', { ...definition }, { $formspec: '1.0', ...definition }),
      handle('component', componentRef, component('intake', 'intakeLayout')),
      handle('component', correctionRef, component('correction', 'correctionLayout')),
    ], schemaResults: [], evidenceResults: [],
  };
}

function document(context: AppGraphContext, index: number): any {
  return context.handles[index].document;
}

function resolve(context = fixture(), selected = request): any {
  return api.resolveComponentRouteTarget({
    manifest: context.manifest, artifacts: { documents: context.handles },
    artifactResolution: { diagnostics: [] }, schemaValidators: () => ({ ok: true }),
  }, selected);
}

describe('exact Component route resolution', () => {
  it('refuses absent schema validation', () => {
    const context = fixture();
    expect(api.resolveComponentRouteTarget({ manifest: context.manifest, artifacts: { documents: context.handles } }, request).status).toBe('unavailable');
  });
  it('selects the exact route claim rather than the first matching Definition', () => {
    const context = fixture();
    const result = resolve(context, { ...request, route: 'correction' });
    expect(result.status, JSON.stringify(result)).toBe('ready');
    expect(result.component).toEqual(context.handles[3]);
    expect(Object.isFrozen(result.component.document)).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it('does not mutate the graph or request', () => {
    const context = fixture();
    const before = JSON.stringify(context);
    const selected = JSON.stringify(request);
    resolve(context);
    expect(JSON.stringify(context)).toBe(before);
    expect(JSON.stringify(request)).toBe(selected);
  });

  it.each(['missing-route', 'missing-slot', 'wrong-role', 'surface-version', 'definition-version'])(
    'refuses %s without selecting a nearby claim', name => {
      const selected: any = structuredClone(request);
      if (name === 'missing-route') selected.route = 'missing';
      if (name === 'missing-slot') selected.slot = 'missing';
      if (name === 'wrong-role') selected.role = 'route';
      if (name === 'surface-version') selected.surface.version = '2.0.0';
      if (name === 'definition-version') selected.definition.version = '2.0.0';
      expect(resolve(fixture(), selected).status).toBe('unavailable');
    },
  );

  it.each(['nonmember', 'component-version', 'loaded-surface-version', 'target-surface-version',
    'definition-range', 'wrong-slot-definition', 'duplicate-claim', 'duplicate-route',
    'duplicate-slot', 'duplicate-definition', 'duplicate-membership'])(
    'refuses %s', name => {
      const context = fixture();
      if (name === 'nonmember') context.handles[2].ref!.url = 'urn:unmanifested';
      if (name === 'component-version') context.handles[2].ref!.version = '2.0.0';
      if (name === 'loaded-surface-version') context.handles[0].ref!.version = '2.0.0';
      if (name === 'target-surface-version') document(context, 2).targetSurfaceRoutes[0].surface.version = '2.0.0';
      if (name === 'definition-range') document(context, 2).targetDefinition.compatibleVersions = '2.0.0';
      if (name === 'wrong-slot-definition') {
        document(context, 0).routes[0].slots[0].binding.definitionRef = 'urn:other';
        document(context, 0).routes[0].slots.push({
          id: 'other', slotType: 'definition-form', binding: { definitionRef: definition.url },
        });
      }
      if (name === 'duplicate-claim') document(context, 2).targetSurfaceRoutes.push(
        structuredClone(document(context, 2).targetSurfaceRoutes[0]),
      );
      if (name === 'duplicate-route') document(context, 0).routes.push(structuredClone(document(context, 0).routes[0]));
      if (name === 'duplicate-slot') document(context, 0).routes[0].slots.push(structuredClone(document(context, 0).routes[0].slots[0]));
      if (name === 'duplicate-definition') context.handles.push(structuredClone(context.handles[1]));
      if (name === 'duplicate-membership') (context.manifest.document as any).components.push(
        structuredClone((context.manifest.document as any).components[0]),
      );
      expect(resolve(context).status).toBe('unavailable');
    },
  );

  it('accepts an omitted optional Component Surface pin using exact graph pins', () => {
    const context = fixture();
    delete document(context, 2).targetSurfaceRoutes[0].surface.version;
    expect(resolve(context).status).toBe('ready');
  });

  it('retains existing route validation diagnostics', () => {
    const context = fixture();
    document(context, 2).targetSurfaceRoutes.push(structuredClone(document(context, 2).targetSurfaceRoutes[0]));
    expect(resolve(context).diagnostics.some((d: any) => d.code === 'APP-GRAPH-COMPONENT-ROUTE-CLAIM-DUPLICATE')).toBe(true);
  });

  it('refuses equal range strings as exact Surface pins', () => {
    const context = fixture();
    (context.manifest.document as any).surfaces[0].version = '^1.0.0';
    context.handles[0].ref!.version = '^1.0.0';
    for (const h of context.handles.filter(h => h.artifactKind === 'component')) {
      (h.document as any).targetSurfaceRoutes[0].surface.version = '^1.0.0';
    }
    expect(resolve(context, { ...request, surface: { ...surface, version: '^1.0.0' } }).status).toBe('unavailable');
  });

  it('producer reuses validation and preserves a detached immutable selection snapshot', async () => {
    const context = fixture();
    let schemaCalls = 0;
    const result = await api.produceAppGraphValidationReport({
      manifest: context.manifest.document,
      loader: ({ ref }) => {
        const h = context.handles.find(h => h.ref?.url === ref.url);
        return h ? { status: 'loaded', document: h.document } : { status: 'missing' };
      }, schemaValidators: () => { schemaCalls++; return { ok: true }; },
    });
    const before = schemaCalls;
    const first = result.componentRouteResolver(request);
    expect(first.status, JSON.stringify(first)).toBe('ready');
    document(context, 2).targetDefinition.url = 'urn:changed-after-validation';
    const again = result.componentRouteResolver(request);
    expect(again).toEqual(first);
    expect(schemaCalls).toBe(before);
    if (again.status === 'ready') expect(Object.isFrozen(again.component)).toBe(true);
  });
});
