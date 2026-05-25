import { describe, expect, it } from 'vitest';
import {
  resolveModules,
  type ModuleResolverInput,
} from '../src/index.js';

function useSource() {
  return {
    artifactSlot: 'surfaces[0]',
    artifactKind: 'surface',
    source: 'memory://surface',
    jsonPointer: '/routes/0/slots/main/0/binding/widgetName',
  };
}

function registry(entries: ModuleResolverInput['registries'][number]['entries']) {
  return [{ entries, artifactSlot: 'registries[0]', artifactKind: 'registry', source: 'memory://registry' }];
}

describe('resolveModules', () => {
  it('treats duplicate Registry claimants as a conflict only when more than one owner is admitted', () => {
    const report = resolveModules({
      appModules: [{
        id: 'x-admitted',
        version: '1.0.0',
        source: {
          artifactSlot: 'app',
          artifactKind: 'appManifest',
          source: 'memory://app',
          jsonPointer: '/modules/0',
          module: { id: 'x-admitted', version: '1.0.0' },
        },
      }],
      documents: [{
        artifactSlot: 'surfaces[0]',
        artifactKind: 'surface',
        uses: [{ site: 'surface.module-widget.binding.widgetName', name: 'x-shared-widget', expectedCategory: 'widget', source: useSource() }],
      }],
      registries: registry([
        { name: 'x-admitted', category: 'module', version: '1.0.0', contributes: ['x-shared-widget'] },
        { name: 'x-not-in-app', category: 'module', version: '1.0.0', contributes: ['x-shared-widget'] },
        { name: 'x-shared-widget', category: 'widget', version: '1.0.0' },
      ]),
    });

    expect(report.ok).toBe(true);
    expect(report.contributions[0]).toMatchObject({
      status: 'resolved',
      owningModules: [{ id: 'x-admitted', version: '1.0.0' }],
    });
    expect(report.diagnostics).toEqual([]);
  });

  it('reports sibling module version mismatches instead of accepting id-only coherence', () => {
    const report = resolveModules({
      appModules: [{
        id: 'x-versioned',
        version: '1.0.0',
        source: {
          artifactSlot: 'app',
          artifactKind: 'appManifest',
          source: 'memory://app',
          jsonPointer: '/modules/0',
          module: { id: 'x-versioned', version: '1.0.0' },
        },
      }],
      documents: [{
        artifactSlot: 'experience',
        artifactKind: 'experience',
        modules: [{ id: 'x-versioned', version: '2.0.0' }],
      }],
      registries: registry([
        { name: 'x-versioned', category: 'module', version: '1.0.0', contributes: [] },
      ]),
    });

    expect(report.ok).toBe(false);
    expect(report.documents[0]).toMatchObject({ status: 'version-mismatch' });
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['MODULE-SIBLING-VERSION-MISMATCH']);
  });

  it('records defaulted document module evidence when a support profile supplies default modules', () => {
    const report = resolveModules({
      appModules: [],
      documents: [{ artifactSlot: 'component', artifactKind: 'component' }],
      registries: registry([
        { name: 'x-formspec-core-task', category: 'module', version: '1.0.0', contributes: [] },
      ]),
      support: {
        defaultModules: [{
          id: 'x-formspec-core-task',
          version: '1.0.0',
          source: {
            artifactSlot: 'app',
            artifactKind: 'appManifest',
            source: 'memory://app',
            jsonPointer: '/modules/default/x-formspec-core-task',
            module: { id: 'x-formspec-core-task', version: '1.0.0' },
          },
        }],
      },
    });

    expect(report.documents[0]).toMatchObject({
      artifactSlot: 'component',
      artifactKind: 'component',
      status: 'defaulted',
      effectiveModules: [{ id: 'x-formspec-core-task', version: '1.0.0' }],
    });
  });

  it('selects the payload validator that matches the owning contribution shape', () => {
    const report = resolveModules({
      appModules: [{
        id: 'x-widgets',
        version: '1.0.0',
        source: {
          artifactSlot: 'app',
          artifactKind: 'appManifest',
          source: 'memory://app',
          jsonPointer: '/modules/0',
          module: { id: 'x-widgets', version: '1.0.0' },
        },
      }],
      documents: [{
        artifactSlot: 'surfaces[0]',
        artifactKind: 'surface',
        uses: [{
          site: 'surface.module-widget.binding.widgetName',
          name: 'x-counter',
          expectedCategory: 'widget',
          payload: { count: 'bad' },
          source: {
            ...useSource(),
            jsonPointer: '/routes/0/slots/main/0/binding/config',
          },
        }],
      }],
      registries: registry([
        { name: 'x-widgets', category: 'module', version: '1.0.0', contributes: ['x-counter'] },
        {
          name: 'x-counter',
          category: 'widget',
          version: '1.0.0',
          widgetShape: { props: { type: 'object' } },
        },
      ]),
      support: {
        payloadSchemaValidators: ['row', 'widgetShape.props'],
        payloadValidators: {
          row: () => ({ ok: true }),
          'widgetShape.props': () => ({ ok: false, path: 'count' }),
        },
      },
    });

    expect(report.ok).toBe(false);
    expect(report.contributions[0]).toMatchObject({
      status: 'payload-schema-mismatch',
      payloadStatus: 'failed',
    });
    expect(report.diagnostics[0]).toMatchObject({
      code: 'MODULE-PAYLOAD-SCHEMA-MISMATCH',
      details: { validator: 'widgetShape.props' },
    });
  });
});
