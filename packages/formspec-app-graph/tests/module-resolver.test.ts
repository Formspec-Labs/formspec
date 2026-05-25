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

  it('normalizes widget token-slot evidence for resolved widget contributions', () => {
    const report = resolveModules({
      appModules: [{
        id: 'x-reviewer',
        version: '1.0.0',
        source: {
          artifactSlot: 'app',
          artifactKind: 'appManifest',
          source: 'memory://app',
          jsonPointer: '/modules/0',
          module: { id: 'x-reviewer', version: '1.0.0' },
        },
      }],
      documents: [{
        artifactSlot: 'hostEvidence.uiGraphPolicies[0]',
        artifactKind: 'hostEvidence',
        uses: [{
          site: 'ui-graph-policy.theme.assignments.widgetRef',
          name: 'x-review-panel',
          expectedCategory: 'widget',
          source: {
            artifactSlot: 'hostEvidence.uiGraphPolicies[0]',
            artifactKind: 'hostEvidence',
            source: 'host://policy/review',
            jsonPointer: '/theme/assignments/0/widgetRef',
          },
        }],
      }],
      registries: registry([
        { name: 'x-reviewer', category: 'module', version: '1.0.0', contributes: ['x-review-panel'] },
        {
          name: 'x-review-panel',
          category: 'widget',
          version: '1.0.0',
          widgetShape: {
            tokenSlots: [
              { name: 'accent', acceptedTokenCategories: ['color'] },
              { name: 'gap', acceptedTokenCategories: ['spacing', 'x-agency-spacing'] },
            ],
          },
        },
      ]),
    });

    expect(report.ok).toBe(true);
    expect(report.contributions[0]).toMatchObject({
      status: 'resolved',
      widgetTokenSlots: [
        {
          name: 'accent',
          acceptedTokenCategories: ['color'],
          source: {
            artifactSlot: 'registries[0]',
            artifactKind: 'registry',
            source: 'memory://registry',
            jsonPointer: '/entries/1/widgetShape/tokenSlots/0',
          },
        },
        {
          name: 'gap',
          acceptedTokenCategories: ['spacing', 'x-agency-spacing'],
          source: {
            artifactSlot: 'registries[0]',
            artifactKind: 'registry',
            source: 'memory://registry',
            jsonPointer: '/entries/1/widgetShape/tokenSlots/1',
          },
        },
      ],
    });
    expect(report.diagnostics).toEqual([]);
  });

  it('normalizes admitted token-category evidence from categoryShape.prefix', () => {
    const report = resolveModules({
      appModules: [{
        id: 'x-reviewer',
        version: '1.0.0',
        source: {
          artifactSlot: 'app',
          artifactKind: 'appManifest',
          source: 'memory://app',
          jsonPointer: '/modules/0',
          module: { id: 'x-reviewer', version: '1.0.0' },
        },
      }],
      registries: registry([
        { name: 'x-reviewer', category: 'module', version: '1.0.0', contributes: ['x-agency-token-category'] },
        {
          name: 'x-agency-token-category',
          category: 'token-category',
          version: '1.0.0',
          categoryShape: {
            prefix: 'x-agency',
            type: 'color',
            tokens: {
              'x-agency.seal-color': { description: 'Official agency seal color', type: 'color' },
            },
          },
        },
      ]),
    });

    expect(report.ok).toBe(true);
    expect(report.tokenCategories).toEqual([
      {
        prefix: 'x-agency',
        status: 'admitted',
        entryName: 'x-agency-token-category',
        entryVersion: '1.0.0',
        owningModules: [{ id: 'x-reviewer', version: '1.0.0' }],
        source: {
          artifactSlot: 'registries[0]',
          artifactKind: 'registry',
          source: 'memory://registry',
          jsonPointer: '/entries/1/categoryShape',
        },
      },
    ]);
    expect(report.diagnostics).toEqual([]);
  });

  it('diagnoses duplicate admitted token-category prefixes without losing duplicate Registry names', () => {
    const report = resolveModules({
      appModules: [{
        id: 'x-reviewer',
        version: '1.0.0',
        source: {
          artifactSlot: 'app',
          artifactKind: 'appManifest',
          source: 'memory://app',
          jsonPointer: '/modules/0',
          module: { id: 'x-reviewer', version: '1.0.0' },
        },
      }],
      registries: registry([
        { name: 'x-reviewer', category: 'module', version: '1.0.0', contributes: ['x-agency-token-category'] },
        {
          name: 'x-agency-token-category',
          category: 'token-category',
          version: '1.0.0',
          categoryShape: {
            prefix: 'x-agency',
            type: 'color',
            tokens: { 'x-agency.seal-color': { type: 'color' } },
          },
        },
        {
          name: 'x-agency-token-category',
          category: 'token-category',
          version: '1.0.0',
          categoryShape: {
            prefix: 'x-agency',
            type: 'color',
            tokens: { 'x-agency.alert-color': { type: 'color' } },
          },
        },
      ]),
    });

    expect(report.ok).toBe(false);
    expect(report.tokenCategories).toMatchObject([
      {
        prefix: 'x-agency',
        status: 'conflict',
        owningModules: [
          { id: 'x-reviewer', version: '1.0.0' },
          { id: 'x-reviewer', version: '1.0.0' },
        ],
      },
    ]);
    expect(report.diagnostics.map((entry) => entry.code)).toEqual(['MODULE-TOKEN-CATEGORY-CONFLICT']);
  });
});
