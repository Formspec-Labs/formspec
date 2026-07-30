/** @filedesc Focused tests for Experience Need completion usable-outcome advice. */

import { describe, expect, it } from 'vitest';
import {
  NEED_USABLE_OUTCOME_CODES,
  validateAppGraph,
  validateNeedUsableOutcomes,
  type AppGraphContext,
  type NeedCompletionShape,
  type ResolvedArtifactHandle,
} from '../src/index.js';

const APP_URL = 'https://example.gov/apps/completion';
const SURFACE_URL = `${APP_URL}/surface`;
const DEFINITION_URL = `${APP_URL}/definition`;
const NEED_ID = 'usable-outcome';
const CURRENT_ANCHOR = `need:${NEED_ID}@2`;
const NON_BLOCKING_VALIDATION = {
  profile: 'off',
  blocking: 'non-blocking',
  persistence: 'none',
};

function hostEvent(eventName: string) {
  return { type: 'hostEvent', eventName };
}

function retryAction(): Record<string, unknown> {
  return {
    id: 'retry',
    intent: 'x-retry',
    validation: NON_BLOCKING_VALIDATION,
    effects: [hostEvent('retry')],
  };
}

function handle(
  slot: string,
  artifactKind: string,
  document: unknown,
  url = `${APP_URL}/${slot}`,
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

function generation(anchor = CURRENT_ANCHOR) {
  return { 'x-generation': { anchors: [anchor] } };
}

function experience(shape: NeedCompletionShape): ResolvedArtifactHandle {
  return handle('experience', 'experience', {
    $formspecExperience: '1.0',
    version: '1.0.0',
    units: [{
      id: 'complete',
      kind: 'review',
      needRefs: [{
        id: NEED_ID,
        completion: { shape },
      }],
    }],
  });
}

function needsDocument(
  status = 'adopted',
  revision: number | undefined = 2,
) {
  return {
    schemaId: 'https://formspec.org/schemas/needs/1.0',
    source: 'memory://needs',
    document: {
      $formspecNeeds: '1.0',
      version: '1.0.0',
      needs: [{
        id: NEED_ID,
        status,
        origin: 'human-asserted',
        statement: {
          who: 'operator',
          want: 'finish the task',
          why: 'serve the person',
          done: 'the usable outcome is available',
        },
        ungroundedReason: 'hypothesis',
        ...(status === 'adopted'
          ? {
              adoptedBy: {
                kind: 'human',
                actChannel: 'human',
                id: 'urn:formspec:actor:human:reviewer',
              },
            }
          : {}),
        ...(revision === undefined ? {} : { revision }),
      }],
    },
  };
}

function context(
  shape: NeedCompletionShape,
  artifacts: ResolvedArtifactHandle[] = [],
  needs: ReturnType<typeof needsDocument> | null = needsDocument(),
): AppGraphContext {
  const mountedExperience = experience(shape);
  const siblingRef = (artifact: ResolvedArtifactHandle) => ({
    url: artifact.ref!.url,
    version: artifact.ref!.version,
  });
  const byKind = (artifactKind: string) =>
    artifacts.filter((artifact) =>
      artifact.status === 'loaded' && artifact.artifactKind === artifactKind
    );
  const definitions = byKind('definition').map(siblingRef);
  const surfaces = byKind('surface').map(siblingRef);
  const components = byKind('component');
  const references = byKind('references').map(siblingRef);
  const responseActions = byKind('responseActions').map(siblingRef);
  const registries = byKind('registry').map(siblingRef);
  const manifestDocument: Record<string, unknown> = {
    $formspecBundle: '2.4',
    version: '1.0.0',
    id: APP_URL,
    definitions,
    experience: siblingRef(mountedExperience),
    ...(surfaces.length > 0 ? { surfaces } : {}),
    ...(surfaces.length > 1 ? { entrySurface: surfaces[0]!.url } : {}),
    ...(components.length === 1
      ? { component: siblingRef(components[0]!) }
      : components.length > 1
        ? {
            components: components.map((component, index) => ({
              ...siblingRef(component),
              handle: `component${index + 1}`,
            })),
          }
        : {}),
    ...(references.length === 1
      ? { references: references[0] }
      : references.length > 1
        ? { referenceDocuments: references }
        : {}),
    ...(responseActions.length === 1
      ? { responseActions: responseActions[0] }
      : responseActions.length > 1
        ? { responseActionDocuments: responseActions }
        : {}),
    ...(registries.length > 0 ? { registries } : {}),
  };
  const manifest = handle('manifest', 'appManifest', manifestDocument, APP_URL);
  return {
    manifest,
    handles: [manifest, mountedExperience, ...artifacts],
    schemaResults: [],
    evidenceResults: [],
    ...(needs === null ? {} : { hostEvidence: { needsDocuments: [needs] } }),
  };
}

function staticSurface(
  binding: Record<string, unknown>,
): ResolvedArtifactHandle {
  return handle('surface', 'surface', {
    $formspecSurface: '0.2',
    version: '1.0.0',
    id: 'main',
    entry: 'home',
    routes: [{
      id: 'home',
      path: '/',
      slots: [{
        id: 'content',
        slotType: 'static-content',
        binding,
      }],
    }],
  }, SURFACE_URL);
}

function definitionSurface(
  extraSlots: unknown[] = [],
): ResolvedArtifactHandle {
  return handle('surface', 'surface', {
    $formspecSurface: '0.2',
    version: '1.0.0',
    id: 'main',
    entry: 'home',
    routes: [{
      id: 'home',
      path: '/',
      slots: [{
        id: 'form',
        slotType: 'definition-form',
        binding: { definitionRef: DEFINITION_URL },
      }, ...extraSlots],
    }],
  }, SURFACE_URL);
}

function definition(): ResolvedArtifactHandle {
  return handle('definition', 'definition', {
    $formspec: '1.0',
    url: DEFINITION_URL,
    version: '1.0.0',
    title: 'Completion form',
    items: [],
  }, DEFINITION_URL);
}

function actionButtonArtifacts(
  action: Record<string, unknown>,
  responseScope: 'app' | 'response',
): ResolvedArtifactHandle[] {
  const responseActions = handle('responseActions', 'responseActions', {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    ...(responseScope === 'app'
      ? { scope: 'app' }
      : { targetDefinition: { url: DEFINITION_URL } }),
    actions: [action],
  });
  const component = handle('component', 'component', {
    $formspecComponent: '1.2',
    version: '1.0.0',
    ...(responseScope === 'response'
      ? { targetDefinition: { url: DEFINITION_URL } }
      : {}),
    targetSurfaceRoutes: [{
      surface: { url: SURFACE_URL, version: '1.0.0' },
      route: 'home',
      slot: responseScope === 'response' ? 'form' : 'content',
      role: 'slot',
    }],
    tree: {
      component: 'ActionButton',
      actionRef: String(action.id),
      ...generation(),
    },
  });
  const surface = responseScope === 'response'
    ? definitionSurface()
    : staticSurface({ kind: 'text', content: 'Workspace' });
  return [
    surface,
    ...(responseScope === 'response' ? [definition()] : []),
    responseActions,
    component,
  ];
}

function expectCantTell(contextValue: AppGraphContext): void {
  const diagnostics = validateNeedUsableOutcomes(contextValue);
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]).toMatchObject({
    code: NEED_USABLE_OUTCOME_CODES.cantTell,
    severity: 'info',
    details: {
      outcome: 'cantTell',
    },
  });
}

describe('validateNeedUsableOutcomes', () => {
  it('recognizes each closed completion shape only from mounted, resolved output', () => {
    const actionArtifacts = actionButtonArtifacts(retryAction(), 'app');
    const submitArtifacts = actionButtonArtifacts({
      id: 'submit',
      intent: 'submit',
      effects: [hostEvent('submitted')],
    }, 'response');
    const reference = handle('references', 'references', {
      $formspecReferences: '1.0',
      version: '1.0.0',
      targetDefinition: { url: DEFINITION_URL },
      references: [{
        target: '#',
        type: 'documentation',
        audience: 'human',
        title: 'Instructions',
        uri: 'https://example.gov/help',
        ...generation(),
      }],
    });
    const navigation = handle('surface', 'surface', {
      $formspecSurface: '0.2',
      version: '1.0.0',
      id: 'main',
      entry: 'home',
      routes: [{
        id: 'home',
        path: '/',
        navigation: {
          label: 'Home',
          ...generation(),
        },
        slots: [{
          id: 'content',
          slotType: 'static-content',
          binding: { kind: 'text', content: 'Home' },
        }],
      }],
    }, SURFACE_URL);

    const cases: Array<{
      shape: NeedCompletionShape;
      artifacts: ResolvedArtifactHandle[];
    }> = [
      { shape: 'action', artifacts: actionArtifacts },
      { shape: 'submitted-definition', artifacts: submitArtifacts },
      {
        shape: 'resource',
        artifacts: [definitionSurface(), definition(), reference],
      },
      { shape: 'navigation', artifacts: [navigation] },
      {
        shape: 'observable-result',
        artifacts: [staticSurface({
          kind: 'text',
          content: 'Request accepted',
          ...generation(),
        })],
      },
    ];

    for (const candidate of cases) {
      expect(
        validateNeedUsableOutcomes(context(candidate.shape, candidate.artifacts)),
        candidate.shape,
      ).toEqual([]);
    }

    expect(validateNeedUsableOutcomes(context(
      'submitted-definition',
      submitArtifacts.filter((artifact) => artifact.artifactKind !== 'definition'),
    ))).toMatchObject([{
      code: NEED_USABLE_OUTCOME_CODES.cantTell,
      details: {
        candidateReasons: ['component-action-unmounted'],
      },
    }]);
  });

  it('returns cantTell when a traced Component or Surface is loaded but not manifested', () => {
    const graph = context('action', actionButtonArtifacts(retryAction(), 'app'));
    const manifestDocument = graph.manifest.document as Record<string, unknown>;
    delete manifestDocument.component;
    delete manifestDocument.components;

    expectCantTell(graph);

    const surfaceGraph = context('observable-result', [staticSurface({
      kind: 'text',
      content: 'Request accepted',
      ...generation(),
    })]);
    delete (surfaceGraph.manifest.document as Record<string, unknown>).surfaces;

    expectCantTell(surfaceGraph);
  });

  it('recognizes the unique default submit control rendered by a mounted Definition form', () => {
    const responseActions = handle('responseActions', 'responseActions', {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      targetDefinition: { url: DEFINITION_URL },
      actions: [{
        id: 'submit',
        intent: 'submit',
        effects: [hostEvent('submitted')],
        ...generation(),
      }],
    });

    expect(validateNeedUsableOutcomes(context('submitted-definition', [
      definitionSurface(),
      definition(),
      responseActions,
    ]))).toEqual([]);

    const ambiguousActions = responseActions.document as Record<string, unknown>;
    ambiguousActions.actions = [
      ...(ambiguousActions.actions as unknown[]),
      {
        id: 'submitAlternate',
        intent: 'submit',
        effects: [hostEvent('submitted-alternate')],
      },
    ];
    expectCantTell(context('submitted-definition', [
      definitionSurface(),
      definition(),
      responseActions,
    ]));
  });

  it('returns cantTell when an ancestor condition controls the traced ActionButton', () => {
    const artifacts = actionButtonArtifacts(retryAction(), 'app');
    const component = artifacts.find(
      (artifact) => artifact.artifactKind === 'component',
    )!;
    (component.document as Record<string, unknown>).tree = {
      component: 'Stack',
      when: '$showRetry = true',
      children: [{
        component: 'ActionButton',
        actionRef: 'retry',
        ...generation(),
      }],
    };

    expectCantTell(context('action', artifacts));
  });

  it('returns cantTell for a traced ActionButton in an unused custom template', () => {
    const artifacts = actionButtonArtifacts(retryAction(), 'app');
    const component = artifacts.find(
      (artifact) => artifact.artifactKind === 'component',
    )!;
    const componentDocument = component.document as Record<string, unknown>;
    componentDocument.components = {
      RetryControl: {
        tree: {
          component: 'ActionButton',
          actionRef: 'retry',
          ...generation(),
        },
      },
    };
    componentDocument.tree = {
      component: 'Text',
      text: 'No retry control is mounted.',
    };

    expectCantTell(context('action', artifacts));
  });

  it('returns cantTell when two manifested visible routes have the same path', () => {
    const primaryUrl = `${APP_URL}/surface-primary`;
    const secondaryUrl = `${APP_URL}/surface-secondary`;
    const navigationSurface = (
      slot: string,
      url: string,
      id: string,
      traced: boolean,
    ) => handle(slot, 'surface', {
      $formspecSurface: '0.2',
      version: '1.0.0',
      id,
      entry: 'home',
      routes: [{
        id: 'home',
        path: '/',
        navigation: {
          label: id,
          ...(traced ? generation() : {}),
        },
        slots: [{
          id: 'content',
          slotType: 'static-content',
          binding: { kind: 'text', content: id },
        }],
      }],
    }, url);

    expectCantTell(context('navigation', [
      navigationSurface('surface-primary', primaryUrl, 'primary', true),
      navigationSurface('surface-secondary', secondaryUrl, 'secondary', false),
    ]));
  });

  it('returns cantTell when a Reference targets a nonexistent Definition item', () => {
    const reference = handle('references', 'references', {
      $formspecReferences: '1.0',
      version: '1.0.0',
      targetDefinition: { url: DEFINITION_URL },
      references: [{
        target: 'missingItem',
        type: 'documentation',
        audience: 'human',
        title: 'Instructions',
        uri: 'https://example.gov/help',
        ...generation(),
      }],
    });

    expectCantTell(context('resource', [
      definitionSurface(),
      definition(),
      reference,
    ]));
  });

  it('resolves generic widget controls through Registry output names and Surface action bindings', () => {
    const registry = handle('registry', 'registry', {
      $formspecRegistry: '1.1',
      entries: [{
        name: 'x-resource-module',
        category: 'module',
        contributes: ['x-resource-widget'],
      }, {
        name: 'x-resource-widget',
        category: 'widget',
        widgetShape: {
          widgetName: 'ResourceWidget',
          deliveryContractId: 'test/ResourceWidget@1',
          actionOutputs: [{ name: 'openResource' }],
          renderedConfigNodes: [{
            pointerPattern: '/actions/*',
            kind: 'test-resource-action',
          }],
        },
      }],
    });
    const surface = handle('surface', 'surface', {
      $formspecSurface: '0.2',
      version: '1.0.0',
      id: 'main',
      entry: 'home',
      routes: [{
        id: 'home',
        path: '/',
        slots: [{
          id: 'resource',
          slotType: 'module-widget',
          binding: {
            moduleId: 'x-resource-module',
            widgetName: 'ResourceWidget',
            config: {
              actions: [{
                outputName: 'openResource',
                ...generation(),
              }],
            },
            actionBindings: {
              openResource: { actionRef: 'open-resource' },
            },
          },
        }],
      }],
    }, SURFACE_URL);
    const responseActions = handle('responseActions', 'responseActions', {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      scope: 'app',
      actions: [{
        id: 'open-resource',
        intent: 'x-open-resource',
        validation: NON_BLOCKING_VALIDATION,
        label: { literal: 'Open resource' },
        effects: [{
          type: 'browserResource',
          operation: 'open',
          resourceRef: 'resource',
        }],
      }],
    });
    const artifacts = [surface, registry, responseActions];

    expect(validateNeedUsableOutcomes(context('action', artifacts))).toEqual([]);
    expect(validateNeedUsableOutcomes(context('resource', artifacts))).toEqual([]);

    const unlabeledActions = handle('responseActions', 'responseActions', {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      scope: 'app',
      actions: [{
        id: 'open-resource',
        intent: 'x-open-resource',
        validation: NON_BLOCKING_VALIDATION,
        effects: [hostEvent('open-resource')],
      }],
    });
    expect(validateNeedUsableOutcomes(
      context('action', [surface, registry, unlabeledActions]),
    )).toMatchObject([{
      code: NEED_USABLE_OUTCOME_CODES.cantTell,
      details: {
        candidateReasons: ['widget-action-label-unresolved'],
      },
    }]);
  });

  it('warns when no current directly traced candidate exists', () => {
    expect(validateNeedUsableOutcomes(context('action'))).toMatchObject([{
      code: NEED_USABLE_OUTCOME_CODES.missing,
      severity: 'warning',
      primarySource: {
        artifactSlot: 'experience',
        jsonPointer: '/units/0/needRefs/0/completion/shape',
      },
      details: {
        reason: 'direct-current-need-trace-missing',
        outcome: 'failed',
        completionShape: 'action',
        runtimeAuthorization: 'not-evaluated',
        runtimeCompletion: 'not-evaluated',
      },
    }]);
  });

  it('warns when an affordance declaration is backed only by prose', () => {
    const prose = staticSurface({
      kind: 'text',
      content: 'Click the unavailable link to continue.',
      ...generation(),
    });

    expect(validateNeedUsableOutcomes(context('resource', [prose]))).toMatchObject([{
      code: NEED_USABLE_OUTCOME_CODES.proseOnly,
      severity: 'warning',
      details: {
        reason: 'direct-output-prose-only',
        outcome: 'failed',
        candidateKinds: ['surface-static-content'],
      },
    }]);
  });

  it('returns cantTell for a traced action that has no mounted control', () => {
    const responseActions = handle('responseActions', 'responseActions', {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      scope: 'app',
      actions: [{
        id: 'retry',
        intent: 'x-retry',
        validation: NON_BLOCKING_VALIDATION,
        effects: [hostEvent('retry')],
        ...generation(),
      }],
    });

    expect(validateNeedUsableOutcomes(context('action', [responseActions]))).toMatchObject([{
      code: NEED_USABLE_OUTCOME_CODES.cantTell,
      severity: 'info',
      details: {
        reason: 'candidate-static-shape-unproven',
        outcome: 'cantTell',
        candidateKinds: ['response-action'],
        runtimeAuthorization: 'not-evaluated',
      },
    }]);
  });

  it('returns cantTell for stale, non-adopted, ambiguous, and unpaired Needs', () => {
    const staleOutput = staticSurface({
      kind: 'text',
      content: 'Old result',
      ...generation(`need:${NEED_ID}@1`),
    });
    const proposed = needsDocument('proposed', 2);
    const ambiguousContext = context('observable-result', [staleOutput]);
    ambiguousContext.hostEvidence!.needsDocuments!.push({
      ...needsDocument(),
      source: 'memory://other-needs',
    });

    const cases = [
      validateNeedUsableOutcomes(context('observable-result', [staleOutput])),
      validateNeedUsableOutcomes(context('observable-result', [staleOutput], proposed)),
      validateNeedUsableOutcomes(ambiguousContext),
      validateNeedUsableOutcomes(context('observable-result', [staleOutput], null)),
    ];

    expect(cases.map((diagnostics) => diagnostics[0]?.details?.reason)).toEqual([
      'need-trace-not-current',
      'need-not-adopted',
      'need-id-ambiguous',
      'needs-document-unpaired',
    ]);
    expect(cases.every((diagnostics) =>
      diagnostics[0]?.code === NEED_USABLE_OUTCOME_CODES.cantTell
      && diagnostics[0]?.severity === 'info'
    )).toBe(true);
  });

  it('stays opt-in and its warnings do not make an otherwise clean report fail', () => {
    const manifest = handle('manifest', 'appManifest', {
      $formspecBundle: '2.4',
      version: '1.0.0',
      id: APP_URL,
      definitions: [],
      surfaces: [{ url: SURFACE_URL, version: '1.0.0' }],
      experience: { url: `${APP_URL}/experience`, version: '1.0.0' },
    }, APP_URL);
    const mountedExperience = experience('action');
    mountedExperience.ref = { url: `${APP_URL}/experience`, version: '1.0.0' };
    const surface = handle('surface', 'surface', {
      $formspecSurface: '0.2',
      version: '1.0.0',
      id: 'main',
      entry: 'home',
      routes: [{
        id: 'home',
        path: '/',
        navigation: { visible: false },
        slots: [{
          id: 'unit',
          slotType: 'experience-unit',
          binding: { experienceRef: `${APP_URL}/experience`, unitRef: 'complete' },
        }],
      }],
    }, SURFACE_URL);
    const request = {
      manifest,
      artifacts: {
        surfaces: [surface],
        experiences: [mountedExperience],
      },
      hostEvidence: { needsDocuments: [needsDocument()] },
      schemaValidators: () => ({ ok: true }),
      evidenceSchemaValidators: () => ({ ok: true }),
    };

    const builtIn = validateAppGraph(request);
    const optedIn = validateAppGraph({
      ...request,
      crossArtifactValidators: [validateNeedUsableOutcomes],
    });

    expect(builtIn.diagnostics.some((diagnostic) =>
      diagnostic.code === NEED_USABLE_OUTCOME_CODES.missing
    )).toBe(false);
    expect(optedIn.diagnostics).toContainEqual(expect.objectContaining({
      code: NEED_USABLE_OUTCOME_CODES.missing,
      severity: 'warning',
    }));
    expect(optedIn.ok).toBe(true);
  });
});
