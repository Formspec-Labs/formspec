/** @filedesc Focused coverage for scoped duplicate visible-title warnings. */

import { describe, expect, it } from 'vitest';
import {
  UX_TITLE_DUPLICATE_CODE,
  validateUxTitleDuplicates,
} from '../src/ux-title-duplicates.js';
import type {
  AppGraphContext,
  ResolvedArtifactHandle,
} from '../src/types.js';

function handle(
  slot: string,
  artifactKind: string,
  document: unknown,
  url = `https://example.gov/${slot}`,
): ResolvedArtifactHandle {
  return {
    slot,
    artifactKind,
    status: 'loaded',
    source: `memory://${slot}`,
    ref: { url, version: '1.0.0' },
    document,
  };
}

function context(...artifacts: ResolvedArtifactHandle[]): AppGraphContext {
  const manifest = handle('manifest', 'appManifest', { definitions: [] });
  return {
    manifest,
    handles: [manifest, ...artifacts],
    schemaResults: [],
    evidenceResults: [],
  };
}

describe('validateUxTitleDuplicates', () => {
  it('compares effective visible navigation labels only within one scope', () => {
    const surface = handle('surface', 'surface', {
      routes: [{
        id: 'cases',
        title: '  Café\t Cases ',
        slots: [],
      }, {
        id: 'case-list',
        title: 'Ignored fallback',
        navigation: { label: 'Cafe\u0301 Cases' },
        slots: [],
      }, {
        id: 'admin-cases',
        navigation: { scope: 'admin', label: 'Café Cases' },
        slots: [],
      }, {
        id: 'hidden-cases',
        navigation: { visible: false, label: 'Café Cases' },
        slots: [],
      }, {
        id: 'upper-cases',
        navigation: { label: 'CAFÉ Cases' },
        slots: [],
      }],
    });

    const diagnostics = validateUxTitleDuplicates(context(surface));

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: UX_TITLE_DUPLICATE_CODE,
      severity: 'warning',
      phase: 'cross-artifact',
      origin: 'app-graph-validator',
      primarySource: {
        artifactSlot: 'surface',
        jsonPointer: '/routes/1/navigation/label',
      },
      relatedSources: [{
        artifactSlot: 'surface',
        jsonPointer: '/routes/0/title',
      }],
      details: {
        scopeKind: 'surface-navigation',
        normalizedTitle: 'Café Cases',
        comparison: 'nfc-trim-collapse-whitespace-case-sensitive',
      },
    });
  });

  it('warns when a visible slot immediately repeats its route title', () => {
    const surface = handle('surface', 'surface', {
      routes: [{
        id: 'summary',
        title: 'Summary',
        slots: [{
          id: 'main',
          slotType: 'definition-form',
          title: ' Summary ',
          binding: { definitionRef: 'https://example.gov/forms/main' },
        }, {
          id: 'experience',
          slotType: 'experience-unit',
          title: 'Summary',
          binding: { unitRef: 'review' },
        }, {
          id: 'aside',
          slotType: 'static-content',
          title: 'summary',
          binding: { kind: 'text', content: 'Details' },
        }],
      }],
    });

    const diagnostics = validateUxTitleDuplicates(context(surface));

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      primarySource: {
        jsonPointer: '/routes/0/slots/0/title',
      },
      relatedSources: [{
        jsonPointer: '/routes/0/title',
      }],
      details: {
        scopeKind: 'surface-route-slot',
        normalizedTitle: 'Summary',
      },
    });
  });

  it('keeps task comparisons inside one Experience', () => {
    const first = handle('experience-a', 'experience', {
      tasks: [{
        id: 'review',
        title: 'Review Cafe\u0301',
      }, {
        id: 'confirm',
        title: 'Review Café',
      }, {
        id: 'uppercase',
        title: 'REVIEW CAFÉ',
      }],
    });
    const second = handle('experience-b', 'experience', {
      tasks: [{
        id: 'review-again',
        title: 'Review Café',
      }],
    });

    const diagnostics = validateUxTitleDuplicates(context(first, second));

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      primarySource: {
        artifactSlot: 'experience-a',
        jsonPointer: '/tasks/1/title',
      },
      relatedSources: [{
        artifactSlot: 'experience-a',
        jsonPointer: '/tasks/0/title',
      }],
      details: {
        scopeKind: 'experience-tasks',
        normalizedTitle: 'Review Café',
      },
    });
  });

  it('checks sibling and immediate parent-child Section or Panel titles without crossing branches', () => {
    const component = handle('component', 'component', {
      tree: {
        component: 'Stack',
        children: [{
          component: 'Section',
          title: ' Account   summary ',
          children: [{
            component: 'Panel',
            title: 'Account summary',
            children: [],
          }],
        }, {
          component: 'Panel',
          title: 'Account summary',
          children: [],
        }, {
          component: 'Section',
          title: 'Review',
          children: [{
            component: 'Panel',
            title: 'Details',
            children: [],
          }],
        }, {
          component: 'Section',
          title: 'Other',
          children: [{
            component: 'Panel',
            title: 'Details',
            children: [],
          }],
        }],
      },
    });

    const diagnostics = validateUxTitleDuplicates(context(component));

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((diagnostic) => ({
      pointer: diagnostic.primarySource?.jsonPointer,
      scopeKind: diagnostic.details?.scopeKind,
    }))).toEqual([
      {
        pointer: '/tree/children/1/title',
        scopeKind: 'component-siblings',
      },
      {
        pointer: '/tree/children/0/children/0/title',
        scopeKind: 'component-parent-child',
      },
    ]);
  });

  it('checks block titles and panel-to-block repetition within each StructuredPanel only', () => {
    const registry = handle('registry', 'registry', {
      entries: [{
        name: 'x-panel-module',
        category: 'module',
        contributes: ['x-panel-widget'],
      }, {
        name: 'x-panel-widget',
        category: 'widget',
        widgetShape: {
          widgetName: 'StructuredPanel',
          deliveryContractId: '@formspec-org/surface-react/StructuredPanel@0.1',
        },
      }],
    });
    const surface = handle('surface', 'surface', {
      routes: [{
        id: 'home',
        title: 'Home',
        slots: [{
          id: 'evidence',
          slotType: 'module-widget',
          binding: {
            moduleId: 'x-panel-module',
            widgetName: 'StructuredPanel',
            config: {
              title: 'Evidence',
              blocks: [{
                id: 'first',
                type: 'metric',
                title: 'Result',
                path: 'first',
              }, {
                id: 'second',
                type: 'metric',
                title: ' Result ',
                path: 'second',
              }, {
                id: 'third',
                type: 'metric',
                title: 'Evidence',
                path: 'third',
              }],
            },
          },
        }, {
          id: 'other-panel',
          slotType: 'module-widget',
          binding: {
            moduleId: 'x-panel-module',
            widgetName: 'StructuredPanel',
            config: {
              title: 'Other',
              blocks: [{
                id: 'result',
                type: 'metric',
                title: 'Result',
                path: 'result',
              }],
            },
          },
        }],
      }],
    });

    const diagnostics = validateUxTitleDuplicates(context(registry, surface));

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((diagnostic) => ({
      pointer: diagnostic.primarySource?.jsonPointer,
      scopeKind: diagnostic.details?.scopeKind,
    }))).toEqual([
      {
        pointer: '/routes/0/slots/0/binding/config/blocks/1/title',
        scopeKind: 'structured-panel-blocks',
      },
      {
        pointer: '/routes/0/slots/0/binding/config/blocks/2/title',
        scopeKind: 'structured-panel-parent-child',
      },
    ]);
  });
});
