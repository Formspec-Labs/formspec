import { describe, expect, it } from 'vitest';
import type {
  DataSourcesDocument,
  ResponseActionsDocument,
  SurfacePreviewScenario,
} from '@formspec-org/types';
import {
  createSurfacePreviewRuntime,
  deriveSurfacePreviewScenario,
  validateSurfacePreviewScenario,
} from '../src/preview-scenario.js';
import {
  prepareDraftFixtures,
  validateDraftFixtures,
  type ResponseRecordTools,
} from '../src/response-records.js';
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

// Successful Response reads require admitted filings and the Rust selector.
it('refuses scenario outcomes for Response sources and Submit actions', async () => {
  const document = scenario();
  const request = loadRequest();
  const source = { ...request.descriptor.source, kind: 'definition-response' as const,
    responseSelection: { definition: { url: 'urn:fixture' }, subject: [], status: 'completed' as const,
      cardinality: 'latest' as const, pin: 'none' as const },
  };
  request.descriptor.source = source;
  document.actions.byAction = { submit: { status: 'complete' } };
  const { scope: _scope, ...definitionActions } = responseActions;
  const result = await validateSurfacePreviewScenario({
    scenario: document,
    bundle: resolvedBundle([{ catalogRef: CATALOG_REF, document: { ...catalog(), sources: [source] } }], [
      { ...definitionActions, targetDefinition: { url: 'urn:fixture' }, actions: [{ id: 'submit', intent: 'submit' }] },
    ]),
  });
  expect(result.valid).toBe(false);
  expect(result.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'SURFACE-SCENARIO-SOURCE-UNRESOLVED', message: expect.stringContaining('supplies this Response source') }),
    expect.objectContaining({ code: 'SURFACE-SCENARIO-ACTION-UNRESOLVED', message: expect.stringContaining('supplies this Submit outcome') }),
  ]));
  expect(await createSurfacePreviewRuntime(document).loader(request)).toMatchObject({ status: 'unavailable' });
});

it('stages unavailable and failed Response reads per profile without calling the store', async () => {
  const document = scenario();
  const request = loadRequest();
  request.descriptor.source = { ...request.descriptor.source, kind: 'definition-response' };
  const bundle = resolvedBundle([{ catalogRef: CATALOG_REF, document: { ...catalog(), sources: [request.descriptor.source] } }]);
  document.profiles = { unavailable: document.profiles.unavailable!, error: document.profiles.error! };
  document.defaultProfile = 'unavailable';
  expect((await validateSurfacePreviewScenario({ scenario: document, bundle })).valid).toBe(true);
  const store = () => { throw new Error('Unexpected filing read'); };
  const unavailable = createSurfacePreviewRuntime(document).withResponseLoader(store);
  expect(await unavailable(request)).toMatchObject({ status: 'unavailable', reason: document.profiles.unavailable!.sources[0]!.reason });
  const failed = createSurfacePreviewRuntime(document, 'error').withResponseLoader(store);
  await expect(async () => failed(request)).rejects.toThrow(document.profiles.error!.sources[0]!.reason);
});

it('reports a malformed filing action as a scenario diagnostic', async () => {
  const document = scenario();
  const invalidActionDocument = {
    ...responseActions,
    'x-formspec-runtime': { requests: [] },
    actions: [...responseActions.actions, {
      id: 'submit', intent: 'submit', effects: [{ type: 'serviceRequest', requestRef: 'missing' }],
    }],
  } as unknown as ResponseActionsDocument;
  const result = await validateSurfacePreviewScenario({ scenario: document, bundle: resolvedBundle(undefined, [invalidActionDocument]) });
  expect(result).toMatchObject({ valid: false, diagnostics: [
    { code: 'SURFACE-SCENARIO-ACTION-UNRESOLVED', actionId: 'submit' },
  ] });
});

it('derives only an addressable entry and leaves fixture facts empty', async () => {
  const bundle = resolvedBundle();
  const scenario = deriveSurfacePreviewScenario(bundle);
  expect(scenario.initialPath).toBe('/app');
  expect(scenario.profiles[scenario.defaultProfile]?.sources).toEqual([]);
  expect(scenario['x-generation']).toBeUndefined();
  expect(await validateSurfacePreviewScenario({ scenario, bundle })).toMatchObject({ valid: true });
  expect(() => deriveSurfacePreviewScenario({ ...bundle, surfaces: [], entrySurface: null })).toThrow();
});

describe('validateSurfacePreviewScenario seeded drafts', () => {
  const REPORT_URL = 'https://example.test/definitions/report';
  const INTAKE_URL = 'https://example.test/definitions/intake';

  function bundleWithDefinitions(): ResolvedBundle {
    const base = resolvedBundle();
    return {
      ...base,
      definitions: new Map([
        [REPORT_URL, {
          $formspec: '1.0',
          url: REPORT_URL,
          version: '1.0.0',
          title: 'Annual Report',
          subject: {
            type: REPORT_URL,
            keys: {
              year: { dataType: 'integer' },
              unit: { dataType: 'string' },
            },
          },
          items: [
            { key: 'summary', type: 'field', dataType: 'string', label: 'Summary' },
            { key: 'count', type: 'field', dataType: 'integer', label: 'Count' },
            {
              key: 'details',
              type: 'group',
              label: 'Details',
              children: [
                { key: 'note', type: 'field', dataType: 'string', label: 'Note' },
              ],
            },
            {
              key: 'entries',
              type: 'group',
              repeatable: true,
              label: 'Entries',
              children: [
                { key: 'code', type: 'field', dataType: 'string', label: 'Code' },
                { key: 'active', type: 'field', dataType: 'boolean', label: 'Active' },
              ],
            },
            { key: 'fee', type: 'field', dataType: 'money', label: 'Fee' },
            { key: 'receipt', type: 'field', dataType: 'attachment', label: 'Receipt' },
          ],
        }],
        [INTAKE_URL, {
          $formspec: '1.0',
          url: INTAKE_URL,
          version: '2.0.0',
          title: 'Implicit Intake',
          items: [
            { key: 'applicantName', type: 'field', dataType: 'string', label: 'Applicant name' },
          ],
        }],
      ]),
    };
  }

  function draftScenario(drafts: unknown[]): unknown {
    const base = scenario() as unknown as Record<string, unknown>;
    const profiles = base.profiles as Record<string, Record<string, unknown>>;
    profiles.loaded = {
      ...profiles.loaded,
      drafts,
    };
    return base;
  }

  it('accepts valid subject-keyed and implicit seeded drafts with nested groups and repeats', async () => {
    const result = await validateSurfacePreviewScenario({
      bundle: bundleWithDefinitions(),
      scenario: draftScenario([
        {
          definitionUrl: REPORT_URL,
          subject: { type: REPORT_URL, keys: { year: 2026, unit: 'north' } },
          data: {
            summary: 'Half finished',
            count: null,
            details: { note: 'Checking totals' },
            entries: [{ code: 'A1', active: true }],
          },
          responseId: 'urn:draft:report-north-2026',
          authored: '2026-01-15T12:00:00Z',
          'x-generation': { anchors: ['need:seed-draft@1'] },
        },
        {
          definitionUrl: INTAKE_URL,
          definitionVersion: '2.0.0',
          data: { applicantName: 'Alex Rivera' },
        },
      ]),
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it('rejects unknown definitionUrl and mismatched definitionVersion with actionable diagnostics', async () => {
    const result = await validateSurfacePreviewScenario({
      bundle: bundleWithDefinitions(),
      scenario: draftScenario([
        {
          definitionUrl: 'https://example.test/definitions/missing',
          data: {},
        },
        {
          definitionUrl: INTAKE_URL,
          definitionVersion: '9.9.9',
          data: { applicantName: 'Alex' },
        },
      ]),
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        profileId: 'loaded',
        path: '$.profiles.loaded.drafts[0].definitionUrl',
      }),
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        profileId: 'loaded',
        path: '$.profiles.loaded.drafts[1].definitionVersion',
      }),
    ]));
  });

  it('rejects missing, unexpected, mismatched, incomplete, or wrongly typed draft subjects', async () => {
    const result = await validateSurfacePreviewScenario({
      bundle: bundleWithDefinitions(),
      scenario: draftScenario([
        // Missing required subject on subject-keyed Definition
        { definitionUrl: REPORT_URL, data: { summary: 'Missing subject' } },
        // Unexpected subject on implicit Definition
        {
          definitionUrl: INTAKE_URL,
          subject: { type: INTAKE_URL, keys: { id: '1' } },
          data: { applicantName: 'Unexpected subject' },
        },
        // Wrong subject.type
        {
          definitionUrl: REPORT_URL,
          subject: { type: 'urn:wrong:type', keys: { year: 2026, unit: 'north' } },
          data: {},
        },
        // Missing key + wrong key type + extra key
        {
          definitionUrl: REPORT_URL,
          subject: { type: REPORT_URL, keys: { year: '2026', extra: 'nope' } },
          data: {},
        },
      ]),
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[0].subject',
      }),
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[1].subject',
      }),
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[2].subject.type',
      }),
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[3].subject.keys',
      }),
    ]));
  });

  it('rejects duplicate active draft keys and duplicate responseIds within a profile', async () => {
    const result = await validateSurfacePreviewScenario({
      bundle: bundleWithDefinitions(),
      scenario: draftScenario([
        {
          definitionUrl: REPORT_URL,
          subject: { type: REPORT_URL, keys: { year: 2026, unit: 'north' } },
          data: { summary: 'First' },
          responseId: 'urn:draft:shared',
        },
        {
          definitionUrl: REPORT_URL,
          subject: { type: REPORT_URL, keys: { unit: 'north', year: 2026 } },
          data: { summary: 'Duplicate key' },
        },
        {
          definitionUrl: INTAKE_URL,
          data: { applicantName: 'Collision' },
          responseId: 'urn:draft:shared',
        },
      ]),
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[1]',
        message: expect.stringMatching(/duplicate/i),
      }),
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[2].responseId',
        message: expect.stringMatching(/unique|duplicate/i),
      }),
    ]));
  });

  it('rejects unknown item keys and structurally invalid data values in drafts', async () => {
    const result = await validateSurfacePreviewScenario({
      bundle: bundleWithDefinitions(),
      scenario: draftScenario([
        {
          definitionUrl: REPORT_URL,
          subject: { type: REPORT_URL, keys: { year: 2026, unit: 'north' } },
          data: {
            unknownField: 'typo',
            count: 'not-an-integer',
            details: ['not-a-group-object'],
            entries: 'not-a-repeat-array',
          },
        },
      ]),
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[0].data.unknownField',
      }),
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[0].data.count',
      }),
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[0].data.details',
      }),
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[0].data.entries',
      }),
    ]));
  });

  it('validates structured money and attachment fields, repeat row indices, and canonical authored instants', async () => {
    const validStructured = await validateSurfacePreviewScenario({
      bundle: bundleWithDefinitions(),
      scenario: draftScenario([
        {
          definitionUrl: REPORT_URL,
          subject: { type: REPORT_URL, keys: { year: 2026, unit: 'north' } },
          authored: '2026-03-01t10:30:00z',
          data: {
            fee: { amount: '42.50', currency: 'USD' },
            receipt: { contentType: 'application/pdf', url: 'urn:files:receipt-1', size: 1024 },
          },
        },
      ]),
    });
    expect(validStructured.valid).toBe(true);

    const invalidStructured = await validateSurfacePreviewScenario({
      bundle: bundleWithDefinitions(),
      scenario: draftScenario([
        {
          definitionUrl: REPORT_URL,
          subject: { type: REPORT_URL, keys: { year: 2026, unit: 'north' } },
          data: {
            fee: { banana: 42 },
            receipt: { unrelated: true },
            entries: [42],
          },
        },
      ]),
    });
    expect(invalidStructured.valid).toBe(false);
    expect(invalidStructured.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[0].data.fee',
      }),
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[0].data.receipt',
      }),
      expect.objectContaining({
        code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
        path: '$.profiles.loaded.drafts[0].data.entries[0]',
      }),
    ]));

    const invalidCalendarDate = await validateSurfacePreviewScenario({
      bundle: bundleWithDefinitions(),
      scenario: draftScenario([
        {
          definitionUrl: INTAKE_URL,
          authored: '2026-02-30T00:00:00Z',
          data: {},
        },
      ]),
    });
    expect(invalidCalendarDate.valid).toBe(false);
  });

  it('rejects numeric money amounts and malformed URI-reference attachment URLs while deriving scope-distinct default responseIds', () => {
    const definitions = bundleWithDefinitions().definitions;

    for (const badAmount of [42.5, '+42.5', '01', '42.', '.5', '1e5', ''] as const) {
      const moneyIssues = validateDraftFixtures(definitions, [
        {
          definitionUrl: REPORT_URL,
          subject: { type: REPORT_URL, keys: { year: 2026, unit: 'north' } },
          data: { fee: { amount: badAmount, currency: 'USD' } },
        },
      ]);
      expect(moneyIssues, `expected bad money amount ${String(badAmount)} to be rejected`).toEqual([
        expect.objectContaining({ subpath: 'drafts[0].data.fee' }),
      ]);
    }

    for (const badUrl of ['%ZZ', '%2', 'https://[::gggg]/file.pdf', 'file with spaces.pdf'] as const) {
      const attachmentIssues = validateDraftFixtures(definitions, [
        {
          definitionUrl: REPORT_URL,
          subject: { type: REPORT_URL, keys: { year: 2026, unit: 'north' } },
          data: { receipt: { contentType: 'application/pdf', url: badUrl } },
        },
      ]);
      expect(attachmentIssues, `expected bad attachment url ${badUrl} to be rejected`).toEqual([
        expect.objectContaining({ subpath: 'drafts[0].data.receipt' }),
      ]);
    }

    const validUrlIssues = validateDraftFixtures(definitions, [
      {
        definitionUrl: REPORT_URL,
        subject: { type: REPORT_URL, keys: { year: 2026, unit: 'north' } },
        data: { receipt: { contentType: 'application/pdf', url: '/files/a%20b.pdf' } },
      },
    ]);
    expect(validUrlIssues).toEqual([]);

    const stubTools: ResponseRecordTools = {
      parseResponse: text => JSON.parse(text),
      subjectId: (type, keys) => `${type}:${JSON.stringify(keys)}`,
      selectResponses: () => ({ status: 'unavailable' }),
    };
    const scopedIds = ['edition-1', 'edition-2'].map(
      editionScope => prepareDraftFixtures(editionScope, definitions, [{ definitionUrl: INTAKE_URL, data: {} }], stubTools)[0]!.responseId,
    );
    expect(scopedIds[0]).not.toBe(scopedIds[1]);
  });
});
