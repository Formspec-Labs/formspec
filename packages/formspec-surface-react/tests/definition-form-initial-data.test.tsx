/** @filedesc Definition form hydration, generation, dirty-state, and mapping regressions. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Observe every tools load; the page starts cold (runtime WASM only).
vi.mock('@formspec-org/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@formspec-org/engine')>();
  return { ...actual, initFormspecEngineTools: vi.fn(actual.initFormspecEngineTools) };
});

import {
  initFormspecEngine,
  initFormspecEngineTools,
  isFormspecEngineToolsInitialized,
  responseSubjectId,
} from '@formspec-org/engine';
import type {
  DataSource,
  DataSourcesDocument,
  FormDefinition,
  MappingDocument,
  SurfaceDocument,
} from '@formspec-org/types';
import type {
  DataSourceLoader,
  DataSourceLoadResult,
  ResolvedBundle,
} from '@formspec-org/surface';
import { SurfaceApp } from '../src/SurfaceApp.js';
import { BrowserSurfaceApp } from '../src/BrowserSurfaceApp.js';
import type {
  SurfaceDefinitionFormRenderer,
} from '../src/SurfaceSlot.js';

const DEFINITION_REF = 'https://example.test/definitions/profile';
const SURFACE_REF = 'https://example.test/surfaces/profile';
const CATALOG_REF = 'https://example.test/data/profile';
const SOURCE_REF = 'response:profile';

beforeAll(async () => {
  await initFormspecEngine();
});

const definition = {
  $formspec: '1.0',
  url: DEFINITION_REF,
  version: '1.0.0',
  title: 'Profile',
  items: [
    {
      key: 'displayName',
      type: 'field',
      label: 'Display name',
      dataType: 'string',
    },
  ],
} as unknown as FormDefinition;

const mapping = {
  $formspecMapping: '1.0',
  version: '1.0.0',
  definitionRef: DEFINITION_REF,
  definitionVersion: '1.0.0',
  targetSchema: { format: 'json' },
  direction: 'both',
  conformanceLevel: 'bidirectional',
  rules: [
    {
      sourcePath: 'displayName',
      targetPath: 'display_name',
      transform: 'preserve',
    },
  ],
} as MappingDocument;

function dataSource(): DataSource {
  return {
    id: SOURCE_REF,
    kind: 'definition-response',
    responseSelection: {
      definition: { url: DEFINITION_REF, compatibleVersions: '^1.0.0' },
      subject: [],
      status: 'completed',
      cardinality: 'latest',
      pin: 'none',
    },
    owner: 'formspec',
    scope: 'definition',
    availability: { level: 'definition', definitionRef: DEFINITION_REF },
    runtime: {
      delivery: 'snapshot',
      cache: { mode: 'snapshot' },
      authorizationBoundary: 'host',
      failureMode: 'block-render',
      provenance: {
        kind: 'definition-response',
        source: 'selected completed profile response',
      },
    },
    schema: {
      type: 'object',
      properties: { displayName: { type: 'string' } },
      additionalProperties: false,
    },
  } as DataSource;
}

function bundle(
  mappingRef?: string,
  formDefinition: FormDefinition = definition,
): ResolvedBundle {
  const surface = {
    $formspecSurface: '0.2',
    id: 'profile',
    entry: 'edit',
    routes: [
      {
        id: 'edit',
        path: '/edit',
        routeClass: 'intake',
        title: 'Edit profile',
        slots: [
          {
            id: 'profileForm',
            slotType: 'definition-form',
            binding: {
              definitionRef: DEFINITION_REF,
              initialData: {
                catalogRef: CATALOG_REF,
                sourceRef: SOURCE_REF,
                ...(mappingRef ? { mappingRef } : {}),
              },
            },
          },
        ],
      },
      {
        id: 'other',
        path: '/other',
        routeClass: 'operation',
        title: 'Other page',
        slots: [],
      },
    ],
  } as unknown as SurfaceDocument;
  return {
    manifest: {
      $formspecBundle: '2.4',
      definitions: [{ url: DEFINITION_REF, version: '1.0.0' }],
      surfaces: [{ url: SURFACE_REF, version: '1.0.0' }],
      entrySurface: SURFACE_REF,
      dataSources: [{ url: CATALOG_REF, version: '1.0.0' }],
      ...(mappingRef
        ? {
            mappings: [
              {
                url: 'https://example.test/mappings/profile',
                version: '1.0.0',
                handle: mappingRef,
              },
            ],
          }
        : {}),
    },
    title: 'Profile',
    surfaces: [surface],
    surfaceRefs: new Map([[surface, SURFACE_REF]]),
    experiences: [],
    tenantTheme: undefined,
    registries: [],
    responseActions: [],
    dataSources: [
      {
        catalogRef: CATALOG_REF,
        document: {
          $formspecDataSources: '1.0',
          id: CATALOG_REF,
          version: '1.0.0',
          sources: [dataSource()],
        } as DataSourcesDocument,
      },
    ],
    ...(mappingRef
      ? {
          mappings: [
            {
              mappingRef,
              artifactRef: 'https://example.test/mappings/profile',
              document: mapping,
            },
          ],
        }
      : {}),
    definitions: new Map([[DEFINITION_REF, formDefinition]]),
    diagnostics: [],
  };
}

function selectionEvidence(responseId: string) {
  return {
    catalogRef: CATALOG_REF, sourceRef: SOURCE_REF, none: false,
    records: [{ responseId, definitionVersion: '1.0.0', responseHash: 'sha256:' + 'b'.repeat(64) }],
    valueDigest: 'sha256:' + 'a'.repeat(64),
  };
}

function loaded(
  displayName: string,
  overrides: Partial<Extract<DataSourceLoadResult, { status: 'loaded' }>> = {},
): DataSourceLoadResult {
  return {
    status: 'loaded',
    freshness: 'fresh',
    ...selectionEvidence(`response:${displayName}`),
    value: { displayName },
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function profileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    'input[name="displayName"]',
  );
  if (!input) throw new Error('profile input did not render');
  return input;
}

describe('mapped initial data on a cold page', () => {
  function unitBundle(invalidTransform = false): ResolvedBundle {
    const candidate = bundle('profileRecord', {
      ...definition, subject: { type: 'urn:unit', keys: { unit: { dataType: 'string' } } },
    });
    if (invalidTransform && candidate.mappings?.[0]) {
      candidate.mappings[0] = {
        ...candidate.mappings[0],
        document: {
          ...candidate.mappings[0].document,
          rules: [{ sourcePath: 'displayName', targetPath: 'display_name', transform: 'unsupported-transform' as never }],
        },
      };
    }
    const route = candidate.surfaces[0]!.routes[0]!;
    route.path = '/units/{unit}';
    route.params = [{ name: 'unit', type: 'string' }];
    const slot = route.slots[0]!;
    if (slot.slotType !== 'definition-form') throw new Error('expected a definition-form slot');
    slot.binding = { ...slot.binding, subjectKeys: { unit: 'unit' } };
    candidate.surfaces[0]!.routes.push({
      id: 'plain', path: '/plain/{unit}', routeClass: 'intake', title: 'Plain',
      params: [{ name: 'unit', type: 'string' }],
      slots: [{ id: 'plainForm', slotType: 'definition-form',
        binding: { definitionRef: DEFINITION_REF, subjectKeys: { unit: 'unit' } } }],
    } as SurfaceDocument['routes'][number]);
    return candidate;
  }

  async function open(root: ReturnType<typeof createRoot>, candidate: ResolvedBundle, location: string) {
    await act(async () => {
      root.render(<SurfaceApp bundle={candidate} location={location} onNavigate={() => {}}
        authorizeDataSource={() => ({ status: 'authorized' })}
        dataSourceLoader={() => ({ status: 'loaded', freshness: 'fresh', ...selectionEvidence('profile-record-9'),
          value: { display_name: 'Mapped Grace' } })}
        validateDataSourcePayload={() => ({ valid: true })} setDocumentTitle={false} />);
      await flush();
    });
    await vi.waitFor(async () => {
      await act(flush);
      expect(container().querySelector('[aria-busy="true"]')).toBeNull();
    }, { timeout: 10_000 });
  }
  let host: HTMLElement | undefined;
  const container = () => host!;

  it('prefills a standard Mapping on a cold page using runtime WASM only, without loading tools WASM (fs-tco0)', async () => {
    host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    const candidate = unitBundle(false);
    try {
      vi.mocked(initFormspecEngineTools).mockClear();
      await open(root, candidate, '/plain/A');
      expect(profileInput(host).value).toBe('');
      expect(initFormspecEngineTools).not.toHaveBeenCalled();
      expect(isFormspecEngineToolsInitialized()).toBe(false);

      await open(root, candidate, '/units/A');
      expect(profileInput(host).value).toBe('Mapped Grace');
      expect(initFormspecEngineTools).not.toHaveBeenCalled();
      expect(isFormspecEngineToolsInitialized()).toBe(false);

      await open(root, candidate, '/units/B');
      expect(profileInput(host).value).toBe('Mapped Grace');
      expect(initFormspecEngineTools).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  it('shows the localized unavailable message when a Mapping fails execution without loading tools WASM', async () => {
    host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    vi.mocked(initFormspecEngineTools).mockClear();
    try {
      await open(root, unitBundle(true), '/units/C');
      expect(initFormspecEngineTools).not.toHaveBeenCalled();
      expect(host.querySelector('input[name="displayName"]')).toBeNull();
      expect(host.querySelector('[data-probe="slot-unavailable"]')?.textContent)
        .toBe('This part of the page cannot load the information it needs.');
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});

describe('definition-form initial data rendering', () => {
  it.each([false, true])('keeps defaults and minimum repeat rows with prefill (draft storage: %s)', async (useDraftStorage) => {
    const candidate = bundle(undefined, {
      ...definition,
      items: [
        ...definition.items,
        { key: 'b', type: 'field', label: 'Default', dataType: 'string', initialValue: 'B' },
        { key: 'rows', type: 'group', label: 'Rows', repeatable: true, minRepeat: 2, children: [
          { key: 'entry', type: 'field', label: 'Entry', dataType: 'string' },
        ] },
      ],
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const address = window.location.href;
    const props = {
      bundle: candidate,
      authorizeDataSource: () => ({ status: 'authorized' } as const),
      dataSourceLoader: async () => loaded('A'),
      validateDataSourcePayload: () => ({ valid: true } as const),
      setDocumentTitle: false,
    };
    try {
      if (useDraftStorage) window.history.replaceState(null, '', '/edit');
      await act(async () => {
        root.render(useDraftStorage ? <BrowserSurfaceApp bundle={props.bundle} adapters={{ ...props,
        draftStorage: { scope: 'test', port: {
            load: async () => ({ status: 'absent' }), save: vi.fn(), readSummaries: vi.fn(),
          } } }} /> : <SurfaceApp {...props} location="/edit" onNavigate={() => {}} />);
        await flush();
      });
      expect(profileInput(container).value).toBe('A');
      expect(container.querySelector<HTMLInputElement>('input[name="b"]')?.value).toBe('B');
      expect(container.querySelector('input[name="rows[0].entry"]')).not.toBeNull();
      expect(container.querySelector('input[name="rows[1].entry"]')).not.toBeNull();
    } finally {
      act(() => root.unmount());
      if (useDraftStorage) window.history.replaceState(null, '', address);
      container.remove();
    }
  });

  it.each([true, false])('isolates answers by filing unit on the same route (prefill: %s)', async (withPrefill) => {
    const candidate = bundle(undefined, {
      ...definition,
      subject: { type: 'urn:unit', keys: { unit: { dataType: 'string' } } },
    });
    const route = candidate.surfaces[0]!.routes[0]!;
    route.path = '/units/{unit}';
    route.params = [{ name: 'unit', type: 'string' }];
    const slot = route.slots[0]!;
    if (slot.slotType !== 'definition-form') throw new Error('expected a definition-form slot');
    const binding: Record<string, unknown> = { ...slot.binding, subjectKeys: { unit: 'unit' } };
    if (!withPrefill) delete binding.initialData;
    slot.binding = binding;

    const second = deferred<DataSourceLoadResult>();
    const loader = vi.fn<DataSourceLoader>(request =>
      request.context.subject?.keys.unit === 'B' ? second.promise : loaded('Unit A'),
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const app = (location: string) => (
      <SurfaceApp bundle={candidate} location={location} onNavigate={() => {}}
        authorizeDataSource={() => ({ status: 'authorized' })}
        dataSourceLoader={loader} validateDataSourcePayload={() => ({ valid: true })}
        setDocumentTitle={false} />
    );

    try {
      await act(async () => { root.render(app('/units/A')); await flush(); });
      const input = profileInput(container);
      expect(input.value).toBe(withPrefill ? 'Unit A' : '');
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'typed for A');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(profileInput(container).value).toBe('typed for A');

      await act(async () => { root.render(app('/units/B')); await flush(); });
      if (withPrefill) {
        expect(loader.mock.calls.map(([request]) => request.context.subject?.keys.unit)).toEqual(['A', 'B']);
        expect(container.querySelector('input[name="displayName"]')).toBeNull();
        await act(async () => { second.resolve(loaded('Unit B')); await flush(); });
      } else {
        expect(loader).not.toHaveBeenCalled();
      }
      expect(profileInput(container).value).toBe(withPrefill ? 'Unit B' : '');
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it('announces loading and delivers the filing subject with data and separate record metadata', async () => {
    const subject = { type: 'urn:example:profile', keys: {} };
    const pending = deferred<DataSourceLoadResult>();
    const renderer = vi.fn<SurfaceDefinitionFormRenderer>(({ initialData }) => (
      <div
        data-probe="hydrated-custom-form"
        data-name={String(initialData?.data?.displayName)}
        data-record={initialData?.selection?.records[0]?.responseId}
        data-generation={String(initialData?.generation)}
        data-revision={String(initialData?.revision)}
      />
    ));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <SurfaceApp
          bundle={bundle(undefined, { ...definition, subject })}
          location="/edit"
          sessionGeneration="session-7"
          onNavigate={() => {}}
          authorizeDataSource={() => ({ status: 'authorized' })}
          dataSourceLoader={() => pending.promise}
          validateDataSourcePayload={() => ({ valid: true })}
          renderDefinitionForm={renderer}
          setDocumentTitle={false}
        />,
      );
    });

    const loading = container.querySelector('[data-probe="definition-form-loading"]');
    expect(loading?.getAttribute('role')).toBe('status');
    expect(loading?.getAttribute('aria-live')).toBe('polite');
    expect(loading?.getAttribute('aria-busy')).toBe('true');
    expect(renderer).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(
        loaded('Ada', { ...selectionEvidence('response-7'), revision: 12 }),
      );
      await flush();
    });

    expect(
      container.querySelector('[data-probe="hydrated-custom-form"]'),
    ).toMatchObject({
      dataset: {
        name: 'Ada',
        record: 'response-7',
        revision: '12',
      },
    });
    const custom = container.querySelector<HTMLElement>(
      '[data-probe="hydrated-custom-form"]',
    );
    expect(custom?.dataset.generation).toContain('session-7');
    expect(renderer.mock.lastCall?.[0]).toMatchObject({
      initialData: { data: { displayName: 'Ada' } },
      responseSubject: { ...subject, id: responseSubjectId(subject.type, subject.keys) },
    });
  });

  it('restores saved data after navigating away and revisiting the route', async () => {
    const loader = vi.fn(() => Promise.resolve(loaded('Saved Ada')));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const app = (location: string) => (
      <SurfaceApp
        bundle={bundle()}
        location={location}
        onNavigate={() => {}}
        authorizeDataSource={() => ({ status: 'authorized' })}
        dataSourceLoader={loader}
        validateDataSourcePayload={() => ({ valid: true })}
        setDocumentTitle={false}
      />
    );

    await act(async () => {
      root.render(app('/edit'));
      await flush();
    });
    expect(profileInput(container).value).toBe('Saved Ada');

    act(() => root.render(app('/other')));
    expect(container.querySelector('input[name="displayName"]')).toBeNull();

    await act(async () => {
      root.render(app('/edit'));
      await flush();
    });
    expect(profileInput(container).value).toBe('Saved Ada');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not replace a dirty mounted form when a delayed refresh completes', async () => {
    const refresh = deferred<DataSourceLoadResult>();
    const loader = vi.fn()
      .mockResolvedValueOnce(loaded('Server Ada'))
      .mockReturnValueOnce(refresh.promise);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const app = (generation: number) => (
      <SurfaceApp
        bundle={bundle()}
        location="/edit"
        sessionGeneration={generation}
        onNavigate={() => {}}
        authorizeDataSource={() => ({ status: 'authorized' })}
        dataSourceLoader={loader}
        validateDataSourcePayload={() => ({ valid: true })}
        setDocumentTitle={false}
      />
    );

    await act(async () => {
      root.render(app(1));
      await flush();
    });
    const input = profileInput(container);
    expect(input.value).toBe('Server Ada');

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, 'Local edit');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(profileInput(container).value).toBe('Local edit');

    act(() => root.render(app(2)));
    await act(async () => {
      refresh.resolve(loaded('Late server value'));
      await flush();
    });

    expect(profileInput(container).value).toBe('Local edit');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('rejects a late result from an obsolete route/session generation', async () => {
    const first = deferred<DataSourceLoadResult>();
    const second = deferred<DataSourceLoadResult>();
    const loader = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const app = (generation: number) => (
      <SurfaceApp
        bundle={bundle()}
        location="/edit"
        sessionGeneration={generation}
        onNavigate={() => {}}
        authorizeDataSource={() => ({ status: 'authorized' })}
        dataSourceLoader={loader}
        validateDataSourcePayload={() => ({ valid: true })}
        setDocumentTitle={false}
      />
    );

    await act(async () => {
      root.render(app(1));
      await flush();
    });
    expect(loader).toHaveBeenCalledTimes(1);
    act(() => root.render(app(2)));
    await act(async () => {
      second.resolve(loaded('Current generation'));
      await flush();
    });
    expect(profileInput(container).value).toBe('Current generation');

    await act(async () => {
      first.resolve(loaded('Obsolete generation'));
      await flush();
    });
    expect(profileInput(container).value).toBe('Current generation');
  });

  it('uses the existing Mapping DSL in reverse for mismatched source data', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SurfaceApp
          bundle={bundle('profileRecord')}
          location="/edit"
          onNavigate={() => {}}
          authorizeDataSource={() => ({ status: 'authorized' })}
          dataSourceLoader={() => ({
            status: 'loaded',
            freshness: 'fresh',
            ...selectionEvidence('profile-record-9'),
            value: { display_name: 'Mapped Grace' },
          })}
          validateDataSourcePayload={() => ({ valid: true })}
          setDocumentTitle={false}
        />,
      );
      await flush();
    });

    expect(profileInput(container).value).toBe('Mapped Grace');
  });

  it('keeps saved repeat rows past maxRepeat', async () => {
    const jobsDefinition = {
      ...definition,
      items: [
        {
          key: 'jobs',
          type: 'group',
          label: 'Job',
          repeatable: true,
          maxRepeat: 2,
          children: [
            { key: 'employer', type: 'field', label: 'Employer', dataType: 'string' },
          ],
        },
      ],
    } as unknown as FormDefinition;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SurfaceApp
          bundle={bundle(undefined, jobsDefinition)}
          location="/edit"
          onNavigate={() => {}}
          authorizeDataSource={() => ({ status: 'authorized' })}
          dataSourceLoader={() => ({
            status: 'loaded',
            freshness: 'fresh',
            ...selectionEvidence('response-jobs'),
            value: {
              jobs: [{ employer: 'ACME' }, { employer: 'Globex' }, { employer: 'Initech' }],
            },
          })}
          validateDataSourcePayload={() => ({ valid: true })}
          setDocumentTitle={false}
        />,
      );
      await flush();
    });

    const employers = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[name^="jobs["]'),
      (input) => [input.name, input.value],
    );
    expect(employers).toEqual([
      ['jobs[0].employer', 'ACME'],
      ['jobs[1].employer', 'Globex'],
      ['jobs[2].employer', 'Initech'],
    ]);
  });

  it.each([
    {
      name: 'authorization refusal',
      authorize: () => ({ status: 'refused' as const, reason: 'private policy detail' }),
      validate: () => ({ valid: true as const }),
    },
    {
      name: 'schema failure',
      authorize: () => ({ status: 'authorized' as const }),
      validate: () => ({ valid: false as const, reason: 'private schema detail' }),
    },
  ])('withholds the form after $name', async ({ authorize, validate }) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SurfaceApp
          bundle={bundle()}
          location="/edit"
          onNavigate={() => {}}
          authorizeDataSource={authorize}
          dataSourceLoader={() => loaded('Hidden')}
          validateDataSourcePayload={validate}
          setDocumentTitle={false}
        />,
      );
      await flush();
    });

    expect(container.querySelector('input[name="displayName"]')).toBeNull();
    expect(container.querySelector('[data-probe="slot-unavailable"]')?.textContent)
      .toContain('cannot load the information it needs');
    expect(container.textContent).not.toContain('private policy detail');
    expect(container.textContent).not.toContain('private schema detail');
  });
});

it('keeps an edited engine when a source-revision refresh completes or its selector fails', async () => {
  const refresh = deferred<DataSourceLoadResult>();
  const loader = vi.fn().mockResolvedValueOnce(loaded('Server Ada')).mockReturnValueOnce(refresh.promise);
  const authorize = () => ({ status: 'authorized' as const });
  const validate = () => ({ valid: true });
  const candidate = bundle();
  const navigate = () => {};
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const app = (revision: number, fails = false) => <SurfaceApp bundle={candidate} location="/edit"
    onNavigate={navigate} dataSourceLoader={loader} authorizeDataSource={authorize}
    validateDataSourcePayload={validate} dataSourceRevision={() => {
      if (fails) throw new Error('unavailable revision');
      return revision;
    }} setDocumentTitle={false} />;
  await act(async () => { root.render(app(1)); await flush(); });
  const input = profileInput(container);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Local edit');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { root.render(app(2)); await flush(); });
  expect(profileInput(container)).toBe(input);
  await act(async () => { refresh.resolve(loaded('Late server value')); await flush(); });
  expect(profileInput(container)).toBe(input);
  expect(input.value).toBe('Local edit');
  expect(loader).toHaveBeenCalledTimes(2);
  await act(async () => { root.render(app(3, true)); await flush(); });
  expect(profileInput(container)).toBe(input);
  expect(input.value).toBe('Local edit');
  expect(loader).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
});

it('makes initial form data unavailable when its revision selector fails before admission', async () => {
  const loader = vi.fn();
  const authorize = vi.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<SurfaceApp bundle={bundle()} location="/edit" onNavigate={() => {}}
      dataSourceLoader={loader} authorizeDataSource={authorize} dataSourceRevision={() => Infinity}
      setDocumentTitle={false} />);
    await flush();
  });
  expect(container.querySelector('input')).toBeNull();
  expect(loader).not.toHaveBeenCalled();
  expect(authorize).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it('resumes the saved snapshot when the original seed is unavailable', async () => {
  const address = window.location.href;
  window.history.replaceState(null, '', '/edit');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<BrowserSurfaceApp bundle={bundle()} adapters={{ draftStorage: {
          scope: 'edition',
          port: {
            async load() {
              return { status: 'loaded', draft: {
                revision: 'saved-revision',
                snapshotJson: JSON.stringify({ definitionUrl: DEFINITION_REF, definitionVersion: '1.0.0', data: { displayName: 'Saved name' } }),
                responseJson: JSON.stringify({ id: 'saved-response', data: {} }),
              } };
            },
            save: vi.fn(), readSummaries: vi.fn(),
          },
        },
        authorizeDataSource: () => ({ status: 'authorized' }),
        dataSourceLoader: () => ({ status: 'unavailable', reason: 'the seed was removed' }) }} />);
      await flush();
    });
    expect(profileInput(container).value).toBe('Saved name');
  } finally {
    act(() => root.unmount());
    window.history.replaceState(null, '', address);
  }
});

it('opens an absent draft with the seed that arrives during a slower lookup', async () => {
  const address = window.location.href;
  window.history.replaceState(null, '', '/edit');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const pending = deferred<{ status: 'absent' }>();
  try {
    await act(async () => {
      root.render(<BrowserSurfaceApp bundle={bundle()} adapters={{ draftStorage: { scope: 'edition', port: { load: () => pending.promise, save: vi.fn(), readSummaries: vi.fn() } },
        authorizeDataSource: () => ({ status: 'authorized' }),
        dataSourceLoader: () => loaded('Seed arrived first'),
        validateDataSourcePayload: () => ({ valid: true }) }} />);
      await flush();
    });
    expect(container.querySelector('input')).toBeNull();
    await act(async () => { pending.resolve({ status: 'absent' }); await flush(); });
    expect(profileInput(container).value).toBe('Seed arrived first');
  } finally {
    act(() => root.unmount());
    window.history.replaceState(null, '', address);
  }
});
