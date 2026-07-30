/** @filedesc Conformance suite for the one canonical DataSourceLoader port. */
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, DataSourcesDocument } from '@formspec-org/types';
import {
  createDocumentResourceDataSourceLoader,
  dataSourceAvailableToWidget,
  loadWidgetDataInputs,
  resolveDataSourceDescriptor,
  type DataSourceActiveContext,
  type DataSourceDescriptor,
  type DataSourceLoader,
} from '../src/data-source-loader.js';

const CATALOG_REF = 'https://example.test/data/catalog';
const SURFACE_REF = 'https://example.test/surfaces/respondent';

function source(
  overrides: Partial<DataSource> = {},
): DataSource {
  return {
    id: 'resource:receipt',
    kind: 'document-resource',
    owner: 'host',
    scope: 'route',
    availability: { level: 'app' },
    runtime: {
      delivery: 'snapshot',
      cache: { mode: 'snapshot' },
      authorizationBoundary: 'host',
      failureMode: 'block-render',
      provenance: {
        kind: 'document-resource',
        source: 'https://api.example.test/receipt',
      },
    },
    ...overrides,
  };
}

function catalog(sources: DataSource[] = [source()]): DataSourcesDocument {
  return {
    $formspecDataSources: '1.0',
    id: CATALOG_REF,
    version: '1.0.0',
    sources: sources as DataSourcesDocument['sources'],
  };
}

function descriptor(value = source()): DataSourceDescriptor {
  const document = catalog([value]);
  return {
    catalogRef: CATALOG_REF,
    sourceRef: value.id,
    catalog: document,
    source: value,
  };
}

const context: DataSourceActiveContext = {
  surfaceId: 'respondent',
  surfaceRef: SURFACE_REF,
  routeId: 'receipt',
  slotId: 'panel',
  moduleId: 'x-receipts',
  widgetName: 'ReceiptPanel',
  params: { caseRef: 'case-123' },
  sessionGeneration: 'session-7',
};

describe('qualified descriptor resolution', () => {
  it('requires one exact catalog URL and one exact source id', () => {
    const document = catalog();
    expect(
      resolveDataSourceDescriptor(
        [{ catalogRef: CATALOG_REF, document }],
        { catalogRef: CATALOG_REF, sourceRef: 'resource:receipt' },
      ),
    ).toMatchObject({
      catalogRef: CATALOG_REF,
      sourceRef: 'resource:receipt',
    });
    expect(
      resolveDataSourceDescriptor(
        [{ catalogRef: CATALOG_REF, document }],
        { catalogRef: 'catalog', sourceRef: 'resource:receipt' },
      ),
    ).toBeUndefined();
    expect(
      resolveDataSourceDescriptor(
        [
          { catalogRef: CATALOG_REF, document },
          { catalogRef: CATALOG_REF, document },
        ],
        { catalogRef: CATALOG_REF, sourceRef: 'resource:receipt' },
      ),
    ).toBeUndefined();
  });
});

describe('widget availability', () => {
  it.each([
    [{ level: 'app' }, true],
    [{ level: 'surface', surfaceRef: SURFACE_REF }, true],
    [{ level: 'route', surfaceRef: SURFACE_REF, routeRef: 'receipt' }, true],
    [
      {
        level: 'slot',
        surfaceRef: SURFACE_REF,
        routeRef: 'receipt',
        slotId: 'panel',
      },
      true,
    ],
    [{ level: 'module', moduleId: 'x-receipts' }, true],
    [{ level: 'definition', definitionRef: 'urn:def' }, false],
    [{ level: 'route', surfaceRef: SURFACE_REF, routeRef: 'other' }, false],
  ] as const)('evaluates %j as %s', (availability, expected) => {
    expect(
      dataSourceAvailableToWidget(
        descriptor(source({ availability })),
        context,
      ),
    ).toBe(expected);
  });
});

describe('loadWidgetDataInputs', () => {
  it('authorizes, loads, validates, and freezes the named object in that order', async () => {
    const calls: string[] = [];
    const value = { caseRef: 'case-123' };
    const described = descriptor(source({ schema: { type: 'object' } }));
    const result = await loadWidgetDataInputs({
      inputs: [
        {
          name: 'receipt',
          required: true,
          status: 'ready',
          descriptor: described,
        },
      ],
      context,
      authorize: () => {
        calls.push('authorize');
        return { status: 'authorized' };
      },
      loader: () => {
        calls.push('load');
        return { status: 'loaded', freshness: 'fresh', value };
      },
      validatePayload: ({ value: candidate }) => {
        calls.push('validate');
        return { valid: candidate === value };
      },
      site: { surfaceId: 'respondent', routeId: 'receipt', slotId: 'panel' },
    });

    expect(calls).toEqual(['authorize', 'load', 'validate']);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.data).toEqual({ receipt: value });
    expect(Object.isFrozen(result.data)).toBe(true);
  });

  it('fails closed before loading when the host supplies no authorization verdict', async () => {
    const loader = vi.fn<DataSourceLoader>();
    const result = await loadWidgetDataInputs({
      inputs: [
        {
          name: 'receipt',
          required: true,
          status: 'ready',
          descriptor: descriptor(),
        },
      ],
      context,
      loader,
      site: { surfaceId: 'respondent', routeId: 'receipt', slotId: 'panel' },
    });

    expect(result.status).toBe('unavailable');
    expect(loader).not.toHaveBeenCalled();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'WIDGET-DATA-REQUIRED-UNAVAILABLE',
    ]);
  });

  it('requires a payload validator when the source declares a schema', async () => {
    const result = await loadWidgetDataInputs({
      inputs: [
        {
          name: 'receipt',
          required: true,
          status: 'ready',
          descriptor: descriptor(source({ schema: { type: 'object' } })),
        },
      ],
      context,
      authorize: () => ({ status: 'authorized' }),
      loader: () => ({ status: 'loaded', freshness: 'fresh', value: {} }),
      site: { surfaceId: 'respondent', routeId: 'receipt', slotId: 'panel' },
    });

    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.failures[0]?.reason).toBe('payload-invalid');
  });

  it('accepts stale payloads only when the exact source declares stale-ok', async () => {
    const run = (failureMode: DataSource['runtime']['failureMode']) =>
      loadWidgetDataInputs({
        inputs: [
          {
            name: 'receipt',
            required: true,
            status: 'ready',
            descriptor: descriptor(
              source({
                runtime: {
                  ...source().runtime,
                  failureMode,
                },
              }),
            ),
          },
        ],
        context,
        authorize: () => ({ status: 'authorized' }),
        loader: () => ({ status: 'loaded', freshness: 'stale', value: { cached: true } }),
        site: { surfaceId: 'respondent', routeId: 'receipt', slotId: 'panel' },
      });

    await expect(run('stale-ok')).resolves.toMatchObject({ status: 'ready' });
    await expect(run('block-render')).resolves.toMatchObject({
      status: 'unavailable',
      failures: [{ reason: 'stale-disallowed' }],
    });
  });

  it('omits a failed optional degraded-widget input without inventing a value', async () => {
    const result = await loadWidgetDataInputs({
      inputs: [
        {
          name: 'optional',
          required: false,
          status: 'ready',
          descriptor: descriptor(
            source({
              runtime: {
                ...source().runtime,
                failureMode: 'degraded-widget',
              },
            }),
          ),
        },
      ],
      context,
      authorize: () => ({ status: 'authorized' }),
      loader: () => ({ status: 'unavailable', reason: 'offline' }),
      site: { surfaceId: 'respondent', routeId: 'receipt', slotId: 'panel' },
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.data).toEqual({});
    expect(result.degradedInputs).toMatchObject([
      { inputName: 'optional', reason: 'unavailable', failureMode: 'degraded-widget' },
    ]);
  });

  it('distinguishes an unavailable result from a loader exception', async () => {
    const run = (loader: NonNullable<Parameters<typeof loadWidgetDataInputs>[0]['loader']>) =>
      loadWidgetDataInputs({
        inputs: [{
          name: 'receipt',
          required: true,
          status: 'ready',
          descriptor: descriptor(),
        }],
        context,
        authorize: () => ({ status: 'authorized' }),
        loader,
        site: { surfaceId: 'respondent', routeId: 'receipt', slotId: 'panel' },
      });

    await expect(run(() => ({
      status: 'unavailable',
      reason: 'service is offline',
    }))).resolves.toMatchObject({
      status: 'unavailable',
      failures: [{ reason: 'unavailable' }],
    });
    await expect(run(() => {
      throw new Error('request crashed');
    })).resolves.toMatchObject({
      status: 'unavailable',
      failures: [{ reason: 'load-failed' }],
    });
  });
});

describe('document-resource host bridge', () => {
  it('passes the exact HTTP provenance URL to the injected reader', async () => {
    const read = vi.fn(() => ({
      status: 'loaded' as const,
      freshness: 'fresh' as const,
      value: { ok: true },
    }));
    const loader = createDocumentResourceDataSourceLoader(read);
    await expect(loader({ descriptor: descriptor(), context })).resolves.toMatchObject({
      status: 'loaded',
      value: { ok: true },
    });
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://api.example.test/receipt' }),
    );
  });

  it('does not pass a non-URL provenance pointer to the reader', async () => {
    const read = vi.fn();
    const loader = createDocumentResourceDataSourceLoader(read);
    const nonUrl = descriptor(
      source({
        runtime: {
          ...source().runtime,
          provenance: { kind: 'document-resource', source: 'formspec-fn:receipt' },
        },
      }),
    );
    await expect(loader({ descriptor: nonUrl, context })).resolves.toMatchObject({
      status: 'unavailable',
    });
    expect(read).not.toHaveBeenCalled();
  });
});
