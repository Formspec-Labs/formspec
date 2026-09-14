/** @filedesc Definition form hydration, generation, dirty-state, and mapping regressions. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  initFormspecEngine,
  initFormspecEngineTools,
} from '@formspec-org/engine';
import type {
  DataSource,
  DataSourcesDocument,
  FormDefinition,
  MappingDocument,
  SurfaceDocument,
} from '@formspec-org/types';
import type {
  DataSourceLoadResult,
  ResolvedBundle,
} from '@formspec-org/surface';
import { SurfaceApp } from '../src/SurfaceApp.js';
import type {
  SurfaceDefinitionFormRenderer,
} from '../src/SurfaceSlot.js';

const DEFINITION_REF = 'https://example.test/definitions/profile';
const SURFACE_REF = 'https://example.test/surfaces/profile';
const CATALOG_REF = 'https://example.test/data/profile';
const SOURCE_REF = 'response:profile';

beforeAll(async () => {
  await initFormspecEngine();
  await initFormspecEngineTools();
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
    definitionRef: DEFINITION_REF,
    definitionVersion: '1.0.0',
    responseSelection: {
      status: 'completed',
      cardinality: 'latest',
      orderBy: 'authored-desc',
      tieBreak: 'response-id-asc',
      partitionBy: 'definition',
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

function loaded(
  displayName: string,
  overrides: Partial<Extract<DataSourceLoadResult, { status: 'loaded' }>> = {},
): DataSourceLoadResult {
  return {
    status: 'loaded',
    freshness: 'fresh',
    recordId: `response:${displayName}`,
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

describe('definition-form initial data rendering', () => {
  it('announces loading, mounts afterward, and passes separate record metadata', async () => {
    const pending = deferred<DataSourceLoadResult>();
    const renderer = vi.fn<SurfaceDefinitionFormRenderer>(({ initialData }) => (
      <div
        data-probe="hydrated-custom-form"
        data-name={String(initialData?.data.displayName)}
        data-record={initialData?.recordId}
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
          bundle={bundle()}
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
        loaded('Ada', { recordId: 'response-7', revision: 12 }),
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

    act(() => root.render(app(1)));
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
            recordId: 'profile-record-9',
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
            recordId: 'response-jobs',
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
