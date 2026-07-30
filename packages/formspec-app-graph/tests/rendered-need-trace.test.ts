/** @filedesc Focused coverage for the opt-in rendered-node-to-Needs trace profile. */

import { describe, expect, it } from 'vitest';
import {
  collectRenderedNeedTraceNodes,
  RENDERED_NEED_TRACE_CODES,
  validateRenderedNeedTrace,
  type AppGraphContext,
  type ResolvedArtifactHandle,
} from '../src/index.js';

const NEEDS_SCHEMA_ID = 'https://formspec.org/schemas/needs/1.0';
const APP_URL = 'https://example.gov/apps/traced';

function handle(
  slot: string,
  artifactKind: string,
  document: unknown,
): ResolvedArtifactHandle {
  return {
    slot,
    artifactKind,
    status: 'loaded',
    source: `memory://${slot}`,
    ref: { url: `${APP_URL}/${slot}`, version: '1.0.0' },
    document,
  };
}

function generation(anchor: string) {
  return { 'x-generation': { anchors: [anchor] } };
}

function widgetRegistry(
  moduleId: string,
  widgetName: string,
  renderedConfigNodes: Array<{ pointerPattern: string; kind: string }>,
): ResolvedArtifactHandle {
  const contributionName = `x-test-${widgetName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return handle(`registry-${widgetName}`, 'registry', {
    $formspecRegistry: '1.1',
    entries: [{
      name: moduleId,
      category: 'module',
      version: '1.0.0',
      status: 'stable',
      contributes: [contributionName],
    }, {
      name: contributionName,
      category: 'widget',
      version: '1.0.0',
      status: 'stable',
      widgetShape: {
        widgetName,
        deliveryContractId: `test/${widgetName}@1`,
        renderedConfigNodes,
      },
    }],
  });
}

const STRUCTURED_PANEL_INVENTORY = [
  { pointerPattern: '', kind: 'structured-panel' },
  { pointerPattern: '/blocks/*', kind: 'structured-panel-block' },
  { pointerPattern: '/blocks/*/items/*', kind: 'structured-panel-field' },
  { pointerPattern: '/blocks/*/columns/*', kind: 'structured-panel-column' },
  { pointerPattern: '/blocks/*/rowAction', kind: 'structured-panel-row-action' },
  { pointerPattern: '/actions/*', kind: 'structured-panel-action' },
  { pointerPattern: '/stateViews/*', kind: 'module-widget-state-view' },
  { pointerPattern: '/stateViews/*/actions/*', kind: 'module-widget-state-action' },
];

function context(
  siblings: ResolvedArtifactHandle[],
  needs: unknown[] | null = [{
    id: 'current',
    statement: { who: 'operator', want: 'use the product', why: 'complete work', done: 'work is complete' },
    origin: 'human-authored',
    status: 'adopted',
    revision: 2,
    ungroundedReason: { code: 'not-yet-researched', explanation: 'Test fixture.' },
    adoptedBy: { kind: 'human', id: 'reviewer' },
  }],
): AppGraphContext {
  const manifest = handle('manifest', 'appManifest', {
    $formspecBundle: '2.3',
    id: APP_URL,
    version: '1.0.0',
  });
  return {
    manifest,
    handles: [manifest, ...siblings],
    schemaResults: [],
    evidenceResults: [],
    ...(needs === null
      ? {}
      : {
        hostEvidence: {
          needsDocuments: [{
            schemaId: NEEDS_SCHEMA_ID,
            source: 'memory://needs',
            document: {
              $formspecNeeds: '1.0',
              version: '1.0.0',
              needs,
            },
          }],
        },
      }),
  };
}

describe('validateRenderedNeedTrace', () => {
  it('exposes the authoritative direct-anchor inventory for navigation, nested Definition options, and StructuredPanel children', () => {
    const current = 'need:current@2';
    const surface = handle('surface', 'surface', {
      ...generation(current),
      routes: [{
        id: 'home',
        ...generation(current),
        navigation: {
          label: 'Home',
          ...generation(current),
        },
        slots: [{
          id: 'panel',
          slotType: 'module-widget',
          ...generation(current),
          binding: {
            moduleId: 'x-standard',
            widgetName: 'StructuredPanel',
            config: {
              id: 'summary',
              ...generation(current),
              blocks: [{
                id: 'facts',
                type: 'key-value',
                ...generation(current),
                items: [{
                  id: 'status',
                  label: 'Status',
                  path: 'status',
                  ...generation(current),
                }],
              }, {
                id: 'records',
                type: 'table',
                path: 'records',
                ...generation(current),
                columns: [{
                  id: 'name',
                  label: 'Name',
                  path: 'name',
                  ...generation(current),
                }],
              }],
              actions: [{
                outputName: 'open',
                ...generation(current),
              }],
            },
          },
        }],
      }],
    });
    const definition = handle('definition', 'definition', {
      title: 'Preferences',
      ...generation(current),
      items: [{
        key: 'contact',
        type: 'group',
        label: 'Contact',
        ...generation(current),
        children: [{
          key: 'channel',
          type: 'field',
          label: 'Preferred channel',
          dataType: 'choice',
          ...generation(current),
          options: [{
            value: 'email',
            label: 'Email',
            ...generation(current),
          }],
        }],
      }],
    });

    const graph = context([
      surface,
      widgetRegistry('x-standard', 'StructuredPanel', STRUCTURED_PANEL_INVENTORY),
      definition,
    ]);
    const nodes = collectRenderedNeedTraceNodes(graph);
    const inventory = nodes.map((node) => ({
      kind: node.kind,
      slot: node.source.artifactSlot,
      pointer: node.pointer,
      anchorPointer: node.anchors[0]?.pointer,
    }));

    expect(inventory).toEqual(expect.arrayContaining([
      {
        kind: 'surface-route-navigation',
        slot: 'surface',
        pointer: '/routes/0/navigation',
        anchorPointer: '/routes/0/navigation/x-generation/anchors/0',
      },
      {
        kind: 'definition-item',
        slot: 'definition',
        pointer: '/items/0/children/0',
        anchorPointer: '/items/0/children/0/x-generation/anchors/0',
      },
      {
        kind: 'definition-option',
        slot: 'definition',
        pointer: '/items/0/children/0/options/0',
        anchorPointer: '/items/0/children/0/options/0/x-generation/anchors/0',
      },
      {
        kind: 'structured-panel',
        slot: 'surface',
        pointer: '/routes/0/slots/0/binding/config',
        anchorPointer: '/routes/0/slots/0/binding/config/x-generation/anchors/0',
      },
      {
        kind: 'structured-panel-field',
        slot: 'surface',
        pointer: '/routes/0/slots/0/binding/config/blocks/0/items/0',
        anchorPointer: '/routes/0/slots/0/binding/config/blocks/0/items/0/x-generation/anchors/0',
      },
      {
        kind: 'structured-panel-column',
        slot: 'surface',
        pointer: '/routes/0/slots/0/binding/config/blocks/1/columns/0',
        anchorPointer: '/routes/0/slots/0/binding/config/blocks/1/columns/0/x-generation/anchors/0',
      },
    ]));
    expect(nodes.every((node) =>
      node.anchors.every((anchor) => (
        anchor.raw === current
        && anchor.needId === 'current'
        && anchor.revision === 2
      ))
    )).toBe(true);
  });

  it('exposes manifest, Response Action, Component subnode, and Locale string sources', () => {
    const current = 'need:current@2';
    const responseActions = handle('responseActions', 'responseActions', {
      actions: [{
        id: 'continue',
        intent: 'continue',
        effects: [],
        ...generation(current),
      }],
    });
    const component = handle('component', 'component', {
      tree: {
        component: 'Stack',
        ...generation(current),
        children: [{
          component: 'Summary',
          ...generation(current),
          items: [{
            label: 'Status',
            bind: 'status',
            ...generation(current),
          }],
        }, {
          component: 'DataTable',
          ...generation(current),
          columns: [{
            header: 'Name',
            bind: 'name',
            ...generation(current),
          }],
        }, {
          component: 'Tabs',
          ...generation(current),
          tabLabels: ['Overview'],
          tabLabelGeneration: [{ anchors: [current] }],
          children: [],
        }],
      },
    });
    const locale = handle('locale', 'locale', {
      strings: { '$form.title': 'Overview' },
      stringGeneration: {
        '$form.title': { anchors: [current] },
      },
    });
    const graph = context([responseActions, component, locale]);
    graph.manifest.document = {
      $formspecBundle: '2.3',
      id: APP_URL,
      version: '1.0.0',
      title: 'Traced app',
      ...generation(current),
    };

    const nodes = collectRenderedNeedTraceNodes(graph);
    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'app-manifest-title',
        pointer: '',
        source: expect.objectContaining({ artifactSlot: 'manifest' }),
      }),
      expect.objectContaining({
        kind: 'response-action',
        pointer: '/actions/0',
      }),
      expect.objectContaining({
        kind: 'component-summary-item',
        pointer: '/tree/children/0/items/0',
      }),
      expect.objectContaining({
        kind: 'component-data-table-column',
        pointer: '/tree/children/1/columns/0',
      }),
      expect.objectContaining({
        kind: 'component-tab-label',
        pointer: '/tree/children/2/tabLabels/0',
        anchors: [expect.objectContaining({
          pointer: '/tree/children/2/tabLabelGeneration/0/anchors/0',
        })],
      }),
      expect.objectContaining({
        kind: 'locale-string',
        pointer: '/strings/$form.title',
        anchors: [expect.objectContaining({
          pointer: '/stringGeneration/$form.title/anchors/0',
        })],
      }),
    ]));
  });

  it('inventories every widget data binding, widget action binding, and Data Source directly', () => {
    const current = 'need:current@2';
    const catalogRef = `${APP_URL}/data-sources`;
    const surface = handle('surface', 'surface', {
      ...generation(current),
      routes: [{
        id: 'home',
        ...generation(current),
        navigation: { visible: false, ...generation(current) },
        slots: [{
          id: 'records',
          slotType: 'module-widget',
          ...generation(current),
          binding: {
            moduleId: 'x-example',
            widgetName: 'RecordList',
            dataBindings: {
              records: {
                catalogRef,
                sourceRef: 'query:records',
                ...generation(current),
              },
              selection: {
                catalogRef,
                sourceRef: 'host:selection',
                ...generation(current),
              },
            },
            actionBindings: {
              open: {
                actionRef: 'open-record',
                ...generation(current),
              },
            },
          },
        }],
      }],
    });
    const dataSources = handle('dataSources', 'dataSources', {
      sources: [{
        id: 'query:records',
        ...generation(current),
      }, {
        id: 'host:selection',
        ...generation(current),
      }],
    });
    const graph = context([surface, dataSources]);

    const inventory = collectRenderedNeedTraceNodes(graph)
      .filter((node) => [
        'surface-widget-data-binding',
        'surface-widget-action-binding',
        'data-source',
      ].includes(node.kind))
      .map((node) => ({
        kind: node.kind,
        slot: node.source.artifactSlot,
        pointer: node.pointer,
        anchorPointer: node.anchors[0]?.pointer,
      }));

    expect(inventory).toEqual([
      {
        kind: 'surface-widget-data-binding',
        slot: 'surface',
        pointer: '/routes/0/slots/0/binding/dataBindings/records',
        anchorPointer: '/routes/0/slots/0/binding/dataBindings/records/x-generation/anchors/0',
      },
      {
        kind: 'surface-widget-data-binding',
        slot: 'surface',
        pointer: '/routes/0/slots/0/binding/dataBindings/selection',
        anchorPointer: '/routes/0/slots/0/binding/dataBindings/selection/x-generation/anchors/0',
      },
      {
        kind: 'surface-widget-action-binding',
        slot: 'surface',
        pointer: '/routes/0/slots/0/binding/actionBindings/open',
        anchorPointer: '/routes/0/slots/0/binding/actionBindings/open/x-generation/anchors/0',
      },
      {
        kind: 'data-source',
        slot: 'dataSources',
        pointer: '/sources/0',
        anchorPointer: '/sources/0/x-generation/anchors/0',
      },
      {
        kind: 'data-source',
        slot: 'dataSources',
        pointer: '/sources/1',
        anchorPointer: '/sources/1/x-generation/anchors/0',
      },
    ]);
    expect(validateRenderedNeedTrace(graph)).toEqual([]);
  });

  it('inventories only customer-help References and requires each bound entry own direct Need anchor', () => {
    const current = 'need:current@2';
    const references = handle('references', 'references', {
      $formspecReferences: '1.0',
      version: '1.0.0',
      targetDefinition: { url: `${APP_URL}/definition` },
      referenceDefs: {
        reusableHelp: {
          type: 'documentation',
          audience: 'human',
          title: 'Reusable help',
          uri: 'https://example.gov/help/reusable',
          ...generation(current),
        },
      },
      references: [{
        target: '#',
        $ref: '#/referenceDefs/reusableHelp',
      }, {
        target: 'contact.email',
        type: 'documentation',
        audience: 'both',
        title: 'Email help',
        uri: 'https://example.gov/help/email',
        ...generation(current),
      }, {
        target: '#',
        type: 'knowledge-base',
        audience: 'agent',
        content: 'Agent-only context.',
      }],
    });
    const graph = context([references]);

    expect(collectRenderedNeedTraceNodes(graph)
      .filter((node) => node.kind === 'reference-entry')).toEqual([
      expect.objectContaining({
        pointer: '/references/0',
        label: 'Reusable help',
        anchors: [],
      }),
      expect.objectContaining({
        pointer: '/references/1',
        label: 'Email help',
        anchors: [expect.objectContaining({
          pointer: '/references/1/x-generation/anchors/0',
          raw: current,
        })],
      }),
    ]);
    expect(validateRenderedNeedTrace(graph)).toEqual([
      expect.objectContaining({
        code: RENDERED_NEED_TRACE_CODES.missing,
        primarySource: expect.objectContaining({
          artifactSlot: 'references',
          jsonPointer: '/references/0',
        }),
        details: expect.objectContaining({
          renderedNodeKind: 'reference-entry',
          reason: 'direct-need-anchor-missing',
        }),
      }),
    ]);
  });

  it('validates preview scenario roots, grouped route params, source outcomes, and action outcomes without inheritance', () => {
    const current = 'need:current@2';
    const graph = context([], [{
      id: 'current',
      status: 'adopted',
      revision: 2,
    }, {
      id: 'candidate',
      status: 'proposed',
      revision: 1,
    }]);
    const scenario = handle('previewScenario', 'surfaceScenario', {
      $formspecSurfaceScenario: '0.1',
      version: '1.0.0',
      initialPath: '/matters/123',
      routeParams: { matterId: '123' },
      routeParamsGeneration: { anchors: ['need:current@1'] },
      defaultProfile: 'loaded',
      ...generation(current),
      profiles: {
        loaded: {
          authorization: { default: 'authorized' },
          sources: [{
            catalogRef: `${APP_URL}/data-sources`,
            sourceRef: 'query:records',
            status: 'loaded',
            freshness: 'fresh',
            value: [{ id: 'row-without-its-own-trace' }],
          }, {
            catalogRef: `${APP_URL}/data-sources`,
            sourceRef: 'host:selection',
            status: 'loaded',
            freshness: 'fresh',
            value: { selected: null },
            ...generation(current),
          }],
        },
      },
      actions: {
        default: {
          status: 'complete',
          ...generation(current),
        },
        byAction: {
          submit: {
            status: 'defer',
            ...generation('need:candidate@1'),
          },
        },
      },
    });

    expect(collectRenderedNeedTraceNodes(graph)).toEqual([]);
    const scenarioInventory = collectRenderedNeedTraceNodes(graph, [scenario])
      .map((node) => ({ kind: node.kind, pointer: node.pointer }));
    expect(scenarioInventory).toEqual([
      { kind: 'surface-preview-scenario', pointer: '' },
      { kind: 'surface-preview-route-params', pointer: '/routeParams' },
      {
        kind: 'surface-preview-source-outcome',
        pointer: '/profiles/loaded/sources/0',
      },
      {
        kind: 'surface-preview-source-outcome',
        pointer: '/profiles/loaded/sources/1',
      },
      { kind: 'surface-preview-action-outcome', pointer: '/actions/default' },
      {
        kind: 'surface-preview-action-outcome',
        pointer: '/actions/byAction/submit',
      },
    ]);

    const diagnostics = validateRenderedNeedTrace(graph, [scenario]);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      RENDERED_NEED_TRACE_CODES.stale,
      RENDERED_NEED_TRACE_CODES.missing,
      RENDERED_NEED_TRACE_CODES.nonAdopted,
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.primarySource?.jsonPointer))
      .toEqual([
        '/routeParamsGeneration/anchors/0',
        '/profiles/loaded/sources/0',
        '/actions/byAction/submit/x-generation/anchors/0',
      ]);
    expect(diagnostics[1]?.details).toMatchObject({
      reason: 'direct-need-anchor-missing',
      renderedNodeKind: 'surface-preview-source-outcome',
    });
  });

  it('requires mounted Experience unit titles to cite a current adopted Need through typed needRefs', () => {
    const current = 'need:current@2';
    const surface = handle('surface', 'surface', {
      ...generation(current),
      routes: [{
        id: 'home',
        ...generation(current),
        navigation: { visible: false, ...generation(current) },
        slots: ['missing', 'unknown', 'candidate', 'good'].map((unitRef) => ({
          id: unitRef,
          slotType: 'experience-unit',
          binding: { unitRef },
          ...generation(current),
        })),
      }],
    });
    const experience = handle('experience', 'experience', {
      units: [{
        id: 'missing',
        kind: 'review',
        title: 'Missing reason',
      }, {
        id: 'unknown',
        kind: 'review',
        title: 'Unknown reason',
        needRefs: [{ id: 'does-not-exist' }],
      }, {
        id: 'candidate',
        kind: 'review',
        title: 'Candidate reason',
        needRefs: [{ id: 'candidate' }],
      }, {
        id: 'good',
        kind: 'review',
        title: 'Current reason',
        needRefs: [{ id: 'current', description: 'Direct typed reason.' }],
      }],
    });
    const graph = context([surface, experience], [{
      id: 'current',
      status: 'adopted',
      revision: 2,
    }, {
      id: 'candidate',
      status: 'proposed',
      revision: 1,
    }]);

    expect(collectRenderedNeedTraceNodes(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'experience-unit-title',
        pointer: '/units/3/title',
        label: 'Current reason',
        anchors: [],
        typedNeedRefs: [{
          needId: 'current',
          pointer: '/units/3/needRefs/0/id',
          description: 'Direct typed reason.',
        }],
      }),
    ]));
    const diagnostics = validateRenderedNeedTrace(graph);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      RENDERED_NEED_TRACE_CODES.missing,
      RENDERED_NEED_TRACE_CODES.unresolved,
      RENDERED_NEED_TRACE_CODES.nonAdopted,
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.primarySource?.jsonPointer))
      .toEqual([
        '/units/0/title',
        '/units/1/needRefs/0/id',
        '/units/2/needRefs/0/id',
      ]);
  });

  it('fails closed when rendered nodes exist but the caller pairs no Needs Document', () => {
    const surface = handle('surface', 'surface', {
      $formspecSurface: '0.2',
      id: 'main',
      entry: 'home',
      routes: [{
        id: 'home',
        path: '/',
        slots: [{ id: 'content', slotType: 'static-content', binding: { kind: 'text', content: 'Hello' } }],
      }],
    });

    expect(validateRenderedNeedTrace(context([surface], null))).toMatchObject([{
      code: RENDERED_NEED_TRACE_CODES.needsUnpaired,
      severity: 'error',
      details: {
        reason: 'needs-document-unpaired',
        renderedNodeCount: 5,
      },
    }]);
  });

  it('accepts direct current adopted anchors on every supported rendered node', () => {
    const current = 'need:current@2';
    const surface = handle('surface', 'surface', {
      $formspecSurface: '0.2',
      id: 'main',
      entry: 'home',
      ...generation(current),
      routes: [{
        id: 'home',
        path: '/',
        ...generation(current),
        navigation: {
          label: 'Home',
          ...generation(current),
        },
        slots: [{
          id: 'content',
          slotType: 'module-widget',
          ...generation(current),
          binding: {
            moduleId: 'x-example',
            widgetName: 'x-card-list',
            config: {
              heading: {
                text: 'Current work',
                needAnchor: current,
              },
              cards: [{
                title: 'First card',
                needAnchors: [current],
              }],
              arbitraryUnmarkedConfiguration: {
                label: 'Not guessed as a separate rendered node',
              },
            },
          },
        }],
        transitions: [{
          trigger: 'open',
          to: 'home',
          ...generation(current),
        }],
      }],
    });
    const definition = handle('definition', 'definition', {
      $formspec: '1.0',
      url: `${APP_URL}/definition`,
      version: '1.0.0',
      status: 'draft',
      title: 'Setup',
      ...generation(current),
      items: [{
        key: 'account',
        type: 'group',
        label: 'Account',
        ...generation(current),
        children: [{
          key: 'name',
          type: 'field',
          label: 'Name',
          dataType: 'string',
          ...generation(current),
          children: [{
            key: 'nameHelp',
            type: 'display',
            label: 'Use the public name.',
            ...generation(current),
          }],
        }],
      }],
    });
    const responseActions = handle('responseActions', 'responseActions', {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      targetDefinition: { url: `${APP_URL}/definition` },
      actions: [{
        id: 'open',
        intent: 'review',
        effects: [{ type: 'host-event', event: 'open' }],
        ...generation(current),
      }],
    });
    const component = handle('component', 'component', {
      $formspecComponent: '1.2',
      version: '1.0.0',
      components: {
        HelpText: {
          params: [],
          tree: {
            component: 'Text',
            text: 'Help',
            ...generation(current),
          },
        },
      },
      tree: {
        component: 'Stack',
        ...generation(current),
        children: [{
          component: 'Heading',
          text: 'Account',
          ...generation(current),
        }],
      },
    });

    expect(validateRenderedNeedTrace(context([
      surface,
      widgetRegistry('x-example', 'x-card-list', [
        { pointerPattern: '/heading', kind: 'card-list-heading' },
        { pointerPattern: '/cards/*', kind: 'card-list-card' },
      ]),
      definition,
      responseActions,
      component,
    ]))).toEqual([]);
  });

  it('requires a direct anchor on every route, navigation object, slot, transition, Item, Action, and Component node', () => {
    const surface = handle('surface', 'surface', {
      routes: [{
        id: 'home',
        navigation: { label: 'Home' },
        slots: [{ id: 'content', slotType: 'static-content', binding: { kind: 'text', content: 'Hello' } }],
        transitions: [{ trigger: 'next', to: 'home' }],
      }],
    });
    const definition = handle('definition', 'definition', {
      items: [{
        key: 'group',
        type: 'group',
        children: [{ key: 'field', type: 'field' }],
      }],
    });
    const responseActions = handle('responseActions', 'responseActions', {
      actions: [{ id: 'next', intent: 'review', effects: [] }],
    });
    const component = handle('component', 'component', {
      tree: {
        component: 'Stack',
        children: [{ component: 'Text', text: 'Hello' }],
      },
    });

    const diagnostics = validateRenderedNeedTrace(context([
      surface,
      definition,
      responseActions,
      component,
    ]));

    expect(diagnostics).toHaveLength(12);
    expect(diagnostics.every((diagnostic) =>
      diagnostic.code === RENDERED_NEED_TRACE_CODES.missing
      && diagnostic.severity === 'error'
      && diagnostic.phase === 'cross-artifact'
    )).toBe(true);
    expect(diagnostics.map((diagnostic) => diagnostic.primarySource?.jsonPointer)).toEqual([
      '',
      '/routes/0',
      '/routes/0/navigation',
      '/routes/0/slots/0',
      '/routes/0/slots/0/binding',
      '/routes/0/transitions/0',
      '',
      '/items/0',
      '/items/0/children/0',
      '/actions/0',
      '/tree',
      '/tree/children/0',
    ]);
  });

  it('requires direct traces for option labels, Component subnodes, and Locale strings', () => {
    const current = 'need:current@2';
    const definition = handle('definition', 'definition', {
      title: 'Choices',
      ...generation(current),
      items: [{
        key: 'choice',
        type: 'field',
        label: 'Choice',
        ...generation(current),
        options: [
          { value: 'a', label: 'Traced', ...generation(current) },
          { value: 'b', label: 'Missing' },
        ],
      }],
    });
    const component = handle('component', 'component', {
      tree: {
        component: 'Stack',
        ...generation(current),
        children: [{
          component: 'Summary',
          ...generation(current),
          items: [
            { label: 'Traced row', bind: 'choice', ...generation(current) },
            { label: 'Missing row', bind: 'choice' },
          ],
        }, {
          component: 'DataTable',
          ...generation(current),
          columns: [
            { header: 'Traced column', bind: 'choice', ...generation(current) },
            { header: 'Missing column', bind: 'choice' },
          ],
        }, {
          component: 'Tabs',
          ...generation(current),
          tabLabels: ['Traced tab', 'Missing tab'],
          tabLabelGeneration: [{
            anchors: [current],
          }],
          children: [],
        }],
      },
    });
    const locale = handle('locale', 'locale', {
      $formspecLocale: '2.0',
      strings: {
        '$form.title': 'Traced title',
        'choice.label': 'Missing translation',
      },
      stringGeneration: {
        '$form.title': { anchors: [current] },
      },
    });

    expect(validateRenderedNeedTrace(context([definition, component, locale])))
      .toEqual([
        expect.objectContaining({
          code: RENDERED_NEED_TRACE_CODES.missing,
          primarySource: expect.objectContaining({
            jsonPointer: '/items/0/options/1',
          }),
        }),
        expect.objectContaining({
          code: RENDERED_NEED_TRACE_CODES.missing,
          primarySource: expect.objectContaining({
            jsonPointer: '/tree/children/0/items/1',
          }),
        }),
        expect.objectContaining({
          code: RENDERED_NEED_TRACE_CODES.missing,
          primarySource: expect.objectContaining({
            jsonPointer: '/tree/children/1/columns/1',
          }),
        }),
        expect.objectContaining({
          code: RENDERED_NEED_TRACE_CODES.missing,
          primarySource: expect.objectContaining({
            jsonPointer: '/tree/children/2/tabLabels/1',
          }),
        }),
        expect.objectContaining({
          code: RENDERED_NEED_TRACE_CODES.missing,
          primarySource: expect.objectContaining({
            jsonPointer: '/strings/choice.label',
          }),
        }),
      ]);
  });

  it('requires a direct trace on each Definition bind and validation shape', () => {
    const current = 'need:current@2';
    const definition = handle('definition', 'definition', {
      title: 'Behavior',
      ...generation(current),
      binds: [{
        path: 'details',
        relevant: '$showDetails = true',
        required: '$showDetails = true',
        readonly: 'false',
        constraint: 'length($) > 0',
      }],
      shapes: [{
        id: 'details-complete',
        target: 'details',
        constraint: 'present($)',
        message: 'Provide details.',
      }],
    });

    expect(validateRenderedNeedTrace(context([definition]))).toEqual([
      expect.objectContaining({
        code: RENDERED_NEED_TRACE_CODES.missing,
        primarySource: expect.objectContaining({
          jsonPointer: '/binds/0',
        }),
        details: expect.objectContaining({
          renderedNodeKind: 'definition-bind',
        }),
      }),
      expect.objectContaining({
        code: RENDERED_NEED_TRACE_CODES.missing,
        primarySource: expect.objectContaining({
          jsonPointer: '/shapes/0',
        }),
        details: expect.objectContaining({
          renderedNodeKind: 'definition-shape',
        }),
      }),
    ]);
  });

  it('accepts independently traced Definition binds and validation shapes', () => {
    const current = 'need:current@2';
    const definition = handle('definition', 'definition', {
      title: 'Behavior',
      ...generation(current),
      binds: [{
        path: 'details',
        relevant: '$showDetails = true',
        required: '$showDetails = true',
        readonly: 'false',
        constraint: 'length($) > 0',
        ...generation(current),
      }],
      shapes: [{
        id: 'details-complete',
        target: 'details',
        constraint: 'present($)',
        message: 'Provide details.',
        ...generation(current),
      }],
    });
    const graph = context([definition]);

    expect(collectRenderedNeedTraceNodes(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'definition-bind',
        pointer: '/binds/0',
        label: 'details',
        anchors: [expect.objectContaining({
          pointer: '/binds/0/x-generation/anchors/0',
        })],
      }),
      expect.objectContaining({
        kind: 'definition-shape',
        pointer: '/shapes/0',
        label: 'details-complete',
        anchors: [expect.objectContaining({
          pointer: '/shapes/0/x-generation/anchors/0',
        })],
      }),
    ]));
    expect(validateRenderedNeedTrace(graph)).toEqual([]);
  });

  it('requires one direct root trace for each loaded Theme', () => {
    const theme = handle('theme', 'theme', {
      $formspecTheme: '1.0',
      name: 'Public theme',
      version: '1.0.0',
      defaults: {},
    });

    expect(validateRenderedNeedTrace(context([theme]))).toEqual([
      expect.objectContaining({
        code: RENDERED_NEED_TRACE_CODES.missing,
        primarySource: expect.objectContaining({
          artifactSlot: 'theme',
          jsonPointer: '',
        }),
        details: expect.objectContaining({
          renderedNodeKind: 'theme-document',
        }),
      }),
    ]);
  });

  it('accepts a loaded Theme with its own current adopted Need trace', () => {
    const current = 'need:current@2';
    const theme = handle('theme', 'theme', {
      $formspecTheme: '1.0',
      name: 'Public theme',
      version: '1.0.0',
      defaults: {},
      ...generation(current),
    });
    const graph = context([theme]);

    expect(collectRenderedNeedTraceNodes(graph)).toContainEqual(
      expect.objectContaining({
        kind: 'theme-document',
        pointer: '',
        label: 'Public theme',
        anchors: [expect.objectContaining({
          pointer: '/x-generation/anchors/0',
        })],
      }),
    );
    expect(validateRenderedNeedTrace(graph)).toEqual([]);
  });

  it('requires direct traces for a StructuredPanel root, blocks, fields, columns, and actions', () => {
    const current = 'need:current@2';
    const surface = handle('surface', 'surface', {
      ...generation(current),
      routes: [{
        id: 'home',
        ...generation(current),
        navigation: { visible: false, ...generation(current) },
        slots: [{
          id: 'panel',
          slotType: 'module-widget',
          ...generation(current),
          binding: {
            moduleId: 'x-standard',
            widgetName: 'StructuredPanel',
            config: {
              id: 'summary',
              ...generation(current),
              blocks: [
                {
                  id: 'facts',
                  type: 'key-value',
                  ...generation(current),
                  items: [{
                    id: 'status',
                    label: 'Status',
                    path: 'status',
                  }],
                },
                {
                  id: 'records',
                  type: 'table',
                  path: 'records',
                  ...generation(current),
                  columns: [{
                    id: 'name',
                    label: 'Name',
                    path: 'name',
                  }],
                },
              ],
              actions: [{ outputName: 'open' }],
            },
          },
        }],
      }],
    });

    const diagnostics = validateRenderedNeedTrace(context([
      surface,
      widgetRegistry('x-standard', 'StructuredPanel', STRUCTURED_PANEL_INVENTORY),
    ]));

    expect(diagnostics.map((diagnostic) => diagnostic.primarySource?.jsonPointer)).toEqual([
      '/routes/0/slots/0/binding/config/blocks/0/items/0',
      '/routes/0/slots/0/binding/config/blocks/1/columns/0',
      '/routes/0/slots/0/binding/config/actions/0',
    ]);
    expect(diagnostics.every(
      (diagnostic) => diagnostic.code === RENDERED_NEED_TRACE_CODES.missing,
    )).toBe(true);
  });

  it('accepts independently traced StructuredPanel fields and controls', () => {
    const current = 'need:current@2';
    const surface = handle('surface', 'surface', {
      ...generation(current),
      routes: [{
        id: 'home',
        ...generation(current),
        navigation: { visible: false, ...generation(current) },
        slots: [{
          id: 'panel',
          slotType: 'module-widget',
          ...generation(current),
          binding: {
            moduleId: 'x-standard',
            widgetName: 'x-structured-panel',
            config: {
              id: 'summary',
              ...generation(current),
              blocks: [{
                id: 'facts',
                type: 'key-value',
                ...generation(current),
                items: [{
                  id: 'status',
                  label: 'Status',
                  path: 'status',
                  ...generation(current),
                }],
              }, {
                id: 'records',
                type: 'table',
                path: 'records',
                ...generation(current),
                columns: [{
                  id: 'name',
                  label: 'Name',
                  path: 'name',
                  ...generation(current),
                }],
              }],
              actions: [{
                outputName: 'open',
                ...generation(current),
              }],
            },
          },
        }],
      }],
    });

    expect(validateRenderedNeedTrace(context([
      surface,
      widgetRegistry('x-standard', 'x-structured-panel', STRUCTURED_PANEL_INVENTORY),
    ]))).toEqual([]);
  });

  it('requires a direct trace on each generic widget state and state action', () => {
    const current = 'need:current@2';
    const surface = handle('surface', 'surface', {
      ...generation(current),
      routes: [{
        id: 'home',
        ...generation(current),
        navigation: { visible: false, ...generation(current) },
        slots: [{
          id: 'panel',
          slotType: 'module-widget',
          ...generation(current),
          binding: {
            moduleId: 'x-standard',
            widgetName: 'StructuredPanel',
            config: {
              ...generation(current),
              stateViews: {
                error: {
                  heading: 'Could not load',
                  actions: [{
                    kind: 'retry',
                    label: 'Try again',
                  }],
                },
              },
            },
          },
        }],
      }],
    });

    expect(validateRenderedNeedTrace(context([
      surface,
      widgetRegistry('x-standard', 'StructuredPanel', STRUCTURED_PANEL_INVENTORY),
    ])).map((diagnostic) => diagnostic.primarySource?.jsonPointer)).toEqual([
      '/routes/0/slots/0/binding/config/stateViews/error',
      '/routes/0/slots/0/binding/config/stateViews/error/actions/0',
    ]);
  });

  it('refuses a custom widget when the Registry does not declare its rendered config scope', () => {
    const current = 'need:current@2';
    const surface = handle('surface', 'surface', {
      ...generation(current),
      routes: [{
        id: 'home',
        ...generation(current),
        navigation: { visible: false, ...generation(current) },
        slots: [{
          id: 'cards',
          slotType: 'module-widget',
          ...generation(current),
          binding: {
            moduleId: 'x-example',
            widgetName: 'Cards',
            config: {
              cards: [{ id: 'first', title: 'Visible but not inventoried' }],
            },
          },
        }],
      }],
    });
    const registry = widgetRegistry('x-example', 'Cards', []);
    const graph = context([surface, registry]);

    expect(collectRenderedNeedTraceNodes(graph)).toContainEqual(
      expect.objectContaining({
        kind: 'module-widget-config',
        pointer: '/routes/0/slots/0/binding/config',
        failure: expect.objectContaining({
          code: RENDERED_NEED_TRACE_CODES.scopeUnknown,
          reason: 'rendered-config-inventory-missing',
        }),
      }),
    );
    expect(validateRenderedNeedTrace(graph)).toContainEqual(
      expect.objectContaining({
        code: RENDERED_NEED_TRACE_CODES.scopeUnknown,
        primarySource: expect.objectContaining({
          jsonPointer: '/routes/0/slots/0/binding/config',
        }),
        details: expect.objectContaining({
          reason: 'rendered-config-inventory-missing',
        }),
      }),
    );
  });

  it('uses Registry inventory to catch an untraced rendered child of a custom widget', () => {
    const current = 'need:current@2';
    const surface = handle('surface', 'surface', {
      ...generation(current),
      routes: [{
        id: 'home',
        ...generation(current),
        navigation: { visible: false, ...generation(current) },
        slots: [{
          id: 'cards',
          slotType: 'module-widget',
          ...generation(current),
          binding: {
            moduleId: 'x-example',
            widgetName: 'Cards',
            config: {
              ...generation(current),
              cards: [
                { id: 'traced', title: 'Traced', ...generation(current) },
                { id: 'missing', title: 'Missing' },
              ],
            },
          },
        }],
      }],
    });

    const diagnostics = validateRenderedNeedTrace(context([
      surface,
      widgetRegistry('x-example', 'Cards', [
        { pointerPattern: '', kind: 'cards-root' },
        { pointerPattern: '/cards/*', kind: 'cards-card' },
      ]),
    ]));
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: RENDERED_NEED_TRACE_CODES.missing,
        primarySource: expect.objectContaining({
          jsonPointer: '/routes/0/slots/0/binding/config/cards/1',
        }),
      }),
    ]);
  });

  it('refuses implicit navigation because its label has no independently reviewable source', () => {
    const current = 'need:current@2';
    const surface = handle('surface', 'surface', {
      ...generation(current),
      routes: [{
        id: 'home',
        title: 'Home',
        ...generation(current),
        slots: [],
      }],
    });

    expect(validateRenderedNeedTrace(context([surface]))).toContainEqual(
      expect.objectContaining({
        code: RENDERED_NEED_TRACE_CODES.navigationImplicit,
        primarySource: expect.objectContaining({
          jsonPointer: '/routes/0/navigation',
        }),
        details: expect.objectContaining({
          reason: 'implicit-navigation-derived-from-route',
        }),
      }),
    );
  });

  it('inventories hidden authored navigation because membership and scope affect shell behavior', () => {
    const current = 'need:current@2';
    const surface = handle('surface', 'surface', {
      ...generation(current),
      routes: [{
        id: 'hidden-missing',
        ...generation(current),
        navigation: {
          visible: false,
          scope: 'public',
        },
        slots: [],
      }, {
        id: 'hidden-traced',
        ...generation(current),
        navigation: {
          visible: false,
          scope: 'workspace',
          ...generation(current),
        },
        slots: [],
      }],
    });
    const graph = context([surface]);

    expect(collectRenderedNeedTraceNodes(graph)
      .filter((node) => node.kind === 'surface-route-navigation')
      .map((node) => ({
        pointer: node.pointer,
        anchors: node.anchors.map((anchor) => anchor.raw),
      }))).toEqual([
      {
        pointer: '/routes/0/navigation',
        anchors: [],
      },
      {
        pointer: '/routes/1/navigation',
        anchors: [current],
      },
    ]);
    expect(validateRenderedNeedTrace(graph)).toEqual([
      expect.objectContaining({
        code: RENDERED_NEED_TRACE_CODES.missing,
        primarySource: expect.objectContaining({
          jsonPointer: '/routes/0/navigation',
        }),
        details: expect.objectContaining({
          renderedNodeKind: 'surface-route-navigation',
        }),
      }),
    ]);
  });

  it('separates malformed or unresolved links, non-adopted links, and stale links', () => {
    const needs = [
      {
        id: 'current',
        status: 'adopted',
        revision: 2,
      },
      {
        id: 'candidate',
        status: 'proposed',
        revision: 1,
      },
    ];
    const surface = handle('surface', 'surface', {
      ...generation('need:current@2'),
      routes: [{
        id: 'home',
        ...generation('need:current@2'),
        navigation: {
          label: 'Home',
          ...generation('need:missing@1'),
        },
        slots: [{
          id: 'content',
          slotType: 'module-widget',
          ...generation('need:candidate@1'),
          binding: {
            moduleId: 'x-example',
            widgetName: 'x-card-list',
            config: {
              malformed: { needAnchor: 42 },
              empty: { needAnchors: [] },
              ignored: { why: 'No declared trace field, so this object is not guessed.' },
            },
          },
        }],
        transitions: [{
          trigger: 'next',
          to: 'home',
          ...generation('need:current@1'),
        }],
      }],
    });

    const diagnostics = validateRenderedNeedTrace(context([
      surface,
      widgetRegistry('x-example', 'x-card-list', [
        { pointerPattern: '/malformed', kind: 'card-list-malformed' },
        { pointerPattern: '/empty', kind: 'card-list-empty' },
      ]),
    ], needs));
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      RENDERED_NEED_TRACE_CODES.unresolved,
      RENDERED_NEED_TRACE_CODES.nonAdopted,
      RENDERED_NEED_TRACE_CODES.unresolved,
      RENDERED_NEED_TRACE_CODES.missing,
      RENDERED_NEED_TRACE_CODES.stale,
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.primarySource?.jsonPointer)).toEqual([
      '/routes/0/navigation/x-generation/anchors/0',
      '/routes/0/slots/0/x-generation/anchors/0',
      '/routes/0/slots/0/binding/config/malformed/needAnchor',
      '/routes/0/slots/0/binding/config/empty',
      '/routes/0/transitions/0/x-generation/anchors/0',
    ]);
    expect(diagnostics[1]?.relatedSources?.[0]?.jsonPointer).toBe('/needs/1');
    expect(diagnostics[4]?.details).toMatchObject({
      needId: 'current',
      anchoredRevision: 1,
      currentRevision: 2,
      direction: 'older',
    });
  });

  it('does not let one valid anchor hide another malformed anchor on the same node', () => {
    const component = handle('component', 'component', {
      tree: {
        component: 'Text',
        text: 'Hello',
        'x-generation': {
          anchors: ['need:current@2', 'need:not-pinned'],
        },
      },
    });

    const diagnostics = validateRenderedNeedTrace(context([component]));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: RENDERED_NEED_TRACE_CODES.unresolved,
      primarySource: {
        jsonPointer: '/tree/x-generation/anchors/1',
      },
      details: {
        reason: 'need-anchor-malformed',
      },
    });
  });
});
