import { describe, expect, it } from 'vitest';
import type {
  DataSourcesDocument,
  ResponseActionsDocument,
  SurfacePreviewScenario,
} from '@formspec-org/types';
import {
  createSurfacePreviewRuntime,
  validateSurfacePreviewScenario,
} from '../src/preview-scenario.js';
import type {
  DataSourceDescriptor,
  DataSourceLoadRequest,
} from '../src/data-source-loader.js';
import type { ResolvedBundle } from '../src/bundle.js';
import { route, slot, surface } from './fixtures.js';

const CATALOG_REF = 'https://example.test/data/records';
const OTHER_CATALOG_REF = 'https://example.test/data/other-records';
const SOURCE_REF = 'query:records';

function catalog(
  catalogRef = CATALOG_REF,
  sourceRef = SOURCE_REF,
): DataSourcesDocument {
  return {
    $formspecDataSources: '1.0',
    id: catalogRef,
    version: '1.0.0',
    sources: [
      {
        id: sourceRef,
        kind: 'query-result',
        owner: 'host',
        scope: 'route',
        availability: { level: 'app' },
        schema: { type: 'array' },
        runtime: {
          delivery: 'snapshot',
          cache: { mode: 'snapshot' },
          authorizationBoundary: 'host',
          failureMode: 'empty-state',
          provenance: {
            kind: 'query',
            source: 'records',
          },
        },
      },
    ],
  } as DataSourcesDocument;
}

const appSurface = surface('preview', 'home', [
  route({
    id: 'home',
    path: '/app',
    slots: [
      slot({
        id: 'intro',
        slotType: 'static-content',
        binding: { kind: 'text', content: 'Preview' },
      }),
    ] as never,
  }),
]);

const responseActions = {
  $formspecResponseActions: '1.0',
  version: '1.0.0',
  targetDefinition: { url: 'https://example.test/definition' },
  actions: [
    {
      id: 'refresh',
      intent: 'x-refresh',
      effects: [{ type: 'host-event', event: 'refresh' }],
    },
  ],
} as unknown as ResponseActionsDocument;

function resolvedBundle(
  catalogs: readonly { catalogRef: string; document: DataSourcesDocument }[] = [
    { catalogRef: CATALOG_REF, document: catalog() },
    { catalogRef: OTHER_CATALOG_REF, document: catalog(OTHER_CATALOG_REF) },
  ],
  actions: readonly ResponseActionsDocument[] = [responseActions],
): ResolvedBundle {
  return {
    manifest: {},
    title: 'Preview',
    surfaces: [appSurface],
    entrySurface: appSurface,
    experiences: [],
    tenantTheme: undefined,
    registries: [],
    responseActions: actions,
    dataSources: catalogs,
    definitions: new Map(),
    diagnostics: [],
  };
}

function scenario(): SurfacePreviewScenario {
  return {
    $formspecSurfaceScenario: '0.1',
    version: '1.0.0',
    initialPath: '/app',
    defaultProfile: 'loaded',
    profiles: {
      loaded: {
        authorization: {
          default: 'authorized',
          overrides: [
            {
              catalogRef: CATALOG_REF,
              sourceRef: SOURCE_REF,
              decision: 'refused',
            },
          ],
        },
        sources: [
          {
            catalogRef: CATALOG_REF,
            sourceRef: SOURCE_REF,
            status: 'loaded',
            freshness: 'fresh',
            value: [{ id: 'one' }],
          },
        ],
      },
      empty: {
        authorization: { default: 'authorized' },
        sources: [
          {
            catalogRef: CATALOG_REF,
            sourceRef: SOURCE_REF,
            status: 'loaded',
            freshness: 'fresh',
            value: [],
          },
        ],
      },
      unavailable: {
        authorization: { default: 'authorized' },
        sources: [
          {
            catalogRef: CATALOG_REF,
            sourceRef: SOURCE_REF,
            status: 'unavailable',
            reason: 'preview service is offline',
          },
        ],
      },
      error: {
        authorization: { default: 'authorized' },
        sources: [
          {
            catalogRef: CATALOG_REF,
            sourceRef: SOURCE_REF,
            status: 'error',
            reason: 'preview request crashed',
          },
        ],
      },
    },
    actions: {
      default: { status: 'complete' },
      byAction: {
        refresh: { status: 'defer', message: 'try later' },
      },
    },
  };
}

function descriptor(
  catalogRef = CATALOG_REF,
  sourceRef = SOURCE_REF,
): DataSourceDescriptor {
  const document = catalog(catalogRef, sourceRef);
  return {
    catalogRef,
    sourceRef,
    catalog: document,
    source: document.sources[0]!,
  };
}

function loadRequest(
  value = descriptor(),
): DataSourceLoadRequest {
  return {
    descriptor: value,
    context: {
      surfaceId: 'preview',
      routeId: 'home',
      slotId: 'records',
      moduleId: 'x-standard',
      widgetName: 'StructuredPanel',
      params: {},
    },
  };
}

describe('validateSurfacePreviewScenario', () => {
  it('accepts loaded, empty, unavailable, and error profiles with exact source identities', async () => {
    const validatedProfiles: string[] = [];
    const result = await validateSurfacePreviewScenario({
      scenario: scenario(),
      bundle: resolvedBundle(),
      validatePayload: ({ profileId, value }) => {
        validatedProfiles.push(profileId);
        return {
          valid: Array.isArray(value),
          ...(Array.isArray(value) ? {} : { reason: 'expected an array' }),
        };
      },
    });

    expect(result).toEqual({
      valid: true,
      scenario: scenario(),
      diagnostics: [],
    });
    expect(validatedProfiles).toEqual(['loaded', 'empty']);
  });

  it('admits direct generation provenance on every traced scenario behavior node', async () => {
    const value = scenario();
    value.routeParams = { recordId: 'one' };
    value.routeParamsGeneration = {
      anchors: ['need:view-record@1'],
    };
    value['x-generation'] = {
      anchors: ['need:open-preview@1'],
    };
    value.profiles.loaded!.sources[0]!['x-generation'] = {
      anchors: ['need:view-record@1'],
    };
    value.actions.default['x-generation'] = {
      anchors: ['need:complete-action@1'],
    };

    await expect(
      validateSurfacePreviewScenario({
        scenario: value,
        bundle: resolvedBundle(),
      }),
    ).resolves.toMatchObject({ valid: true });

    value.actions.default['x-generation'] = {
      anchors: ['not-a-generation-anchor'],
    };
    await expect(
      validateSurfacePreviewScenario({
        scenario: value,
        bundle: resolvedBundle(),
      }),
    ).resolves.toMatchObject({
      valid: false,
      diagnostics: [
        expect.objectContaining({
          code: 'SURFACE-SCENARIO-SCHEMA',
        }),
      ],
    });
  });

  it('reports unresolved profile, initial route, source, and action names', async () => {
    const value = scenario();
    value.defaultProfile = 'missing';
    value.initialPath = '/missing';
    value.profiles.loaded!.sources[0]!.catalogRef =
      'https://example.test/data/missing';
    value.actions.byAction = {
      missingAction: { status: 'complete' },
    };

    const result = await validateSurfacePreviewScenario({
      scenario: value,
      bundle: resolvedBundle(),
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'SURFACE-SCENARIO-PROFILE-UNRESOLVED',
        'SURFACE-SCENARIO-INITIAL-ROUTE-UNRESOLVED',
        'SURFACE-SCENARIO-SOURCE-UNRESOLVED',
        'SURFACE-SCENARIO-ACTION-UNRESOLVED',
      ]),
    );
  });

  it('keeps identical source ids in different catalogs distinct', async () => {
    const value = scenario();
    value.profiles.loaded!.sources = [
      {
        catalogRef: OTHER_CATALOG_REF,
        sourceRef: SOURCE_REF,
        status: 'loaded',
        freshness: 'fresh',
        value: [],
      },
    ];
    value.profiles.loaded!.authorization.overrides = [];

    await expect(
      validateSurfacePreviewScenario({
        scenario: value,
        bundle: resolvedBundle(),
      }),
    ).resolves.toMatchObject({ valid: true });
  });

  it('reports duplicate scenario outcomes and duplicate bundle identities as ambiguous', async () => {
    const duplicateScenario = scenario();
    duplicateScenario.profiles.loaded!.sources.push({
      catalogRef: CATALOG_REF,
      sourceRef: SOURCE_REF,
      status: 'loaded',
      freshness: 'fresh',
      value: [],
    });
    const scenarioResult = await validateSurfacePreviewScenario({
      scenario: duplicateScenario,
      bundle: resolvedBundle(),
    });

    const duplicateCatalog = catalog();
    const bundleResult = await validateSurfacePreviewScenario({
      scenario: scenario(),
      bundle: resolvedBundle([
        { catalogRef: CATALOG_REF, document: catalog() },
        { catalogRef: CATALOG_REF, document: duplicateCatalog },
      ]),
    });

    expect(scenarioResult.diagnostics.map(({ code }) => code)).toContain(
      'SURFACE-SCENARIO-SOURCE-AMBIGUOUS',
    );
    expect(bundleResult.diagnostics.map(({ code }) => code)).toContain(
      'SURFACE-SCENARIO-SOURCE-AMBIGUOUS',
    );
  });

  it('reports ambiguous action ids across resolved action documents', async () => {
    const result = await validateSurfacePreviewScenario({
      scenario: scenario(),
      bundle: resolvedBundle(undefined, [responseActions, responseActions]),
    });

    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'SURFACE-SCENARIO-ACTION-AMBIGUOUS',
    );
  });

  it('reports loaded payloads rejected by the supplied schema validator', async () => {
    const result = await validateSurfacePreviewScenario({
      scenario: scenario(),
      bundle: resolvedBundle(),
      validatePayload: () => ({ valid: false, reason: 'expected an array' }),
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SURFACE-SCENARIO-PAYLOAD-SCHEMA',
          profileId: 'loaded',
        }),
        expect.objectContaining({
          code: 'SURFACE-SCENARIO-PAYLOAD-SCHEMA',
          profileId: 'empty',
        }),
      ]),
    );
  });

  it('fails closed on malformed structure and a failing host schema validator', async () => {
    const malformed = await validateSurfacePreviewScenario({
      scenario: { $formspecSurfaceScenario: '0.1' },
      bundle: resolvedBundle(),
    });
    const hostRejected = await validateSurfacePreviewScenario({
      scenario: scenario(),
      bundle: resolvedBundle(),
      validateSchema: () => ({
        valid: false,
        errors: ['canonical schema rejected the document'],
      }),
    });

    expect(malformed.diagnostics.every(({ code }) => code === 'SURFACE-SCENARIO-SCHEMA')).toBe(
      true,
    );
    expect(hostRejected.diagnostics).toContainEqual({
      code: 'SURFACE-SCENARIO-SCHEMA',
      message: 'canonical schema rejected the document',
    });
  });
});

describe('createSurfacePreviewRuntime', () => {
  it('maps loaded, empty, unavailable, and error outcomes to DataSourceLoader', async () => {
    const loaded = createSurfacePreviewRuntime(scenario(), 'loaded');
    const empty = createSurfacePreviewRuntime(scenario(), 'empty');
    const unavailable = createSurfacePreviewRuntime(scenario(), 'unavailable');
    const error = createSurfacePreviewRuntime(scenario(), 'error');

    expect(await loaded.loader(loadRequest())).toEqual({
      status: 'loaded',
      freshness: 'fresh',
      value: [{ id: 'one' }],
    });
    expect(await empty.loader(loadRequest())).toEqual({
      status: 'loaded',
      freshness: 'fresh',
      value: [],
    });
    expect(await unavailable.loader(loadRequest())).toEqual({
      status: 'unavailable',
      reason: 'preview service is offline',
    });
    expect(() => error.loader(loadRequest())).toThrow(
      'preview request crashed',
    );
  });

  it('fails closed for a missing profile, missing exact source, and duplicate authorization', async () => {
    const missingProfile = createSurfacePreviewRuntime(scenario(), 'missing');
    const loaded = createSurfacePreviewRuntime(scenario(), 'loaded');
    const duplicateAuthorization = scenario();
    duplicateAuthorization.profiles.loaded!.authorization.overrides!.push({
      catalogRef: CATALOG_REF,
      sourceRef: SOURCE_REF,
      decision: 'authorized',
    });
    const duplicate = createSurfacePreviewRuntime(
      duplicateAuthorization,
      'loaded',
    );

    expect(await missingProfile.loader(loadRequest())).toMatchObject({
      status: 'unavailable',
    });
    expect(await missingProfile.authorize(loadRequest())).toMatchObject({
      status: 'refused',
    });
    expect(
      await loaded.loader(loadRequest(descriptor(OTHER_CATALOG_REF))),
    ).toMatchObject({
      status: 'unavailable',
    });
    expect(await duplicate.authorize(loadRequest())).toMatchObject({
      status: 'refused',
      reason: expect.stringContaining('ambiguous'),
    });
  });

  it('applies authorization overrides and action outcomes without product rules', async () => {
    const runtime = createSurfacePreviewRuntime(scenario(), 'loaded');

    expect(await runtime.authorize(loadRequest())).toEqual({
      status: 'refused',
      reason: expect.stringContaining(`(${CATALOG_REF}, ${SOURCE_REF})`),
    });
    expect(
      await runtime.authorize(loadRequest(descriptor(OTHER_CATALOG_REF))),
    ).toEqual({ status: 'authorized' });
    expect(runtime.actionOutcome('refresh')).toEqual({
      status: 'defer',
      message: 'try later',
    });
    expect(runtime.actionOutcome('another-action')).toEqual({
      status: 'complete',
    });

    await expect(
      runtime.executeTransition({
        transition: { actionId: 'refresh' },
      } as never),
    ).resolves.toEqual({
      advanced: false,
      reason: 'try later',
    });
    await expect(
      runtime.executeTransition({
        transition: { actionId: 'another-action' },
      } as never),
    ).resolves.toEqual({ advanced: true });
  });
});
