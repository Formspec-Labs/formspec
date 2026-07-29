/** @filedesc React handoff for qualified widget data and emitted actions. */
import { act, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  DataSourcesDocument,
  RegistryDocument,
  ResponseActionsDocument,
  SurfaceDocument,
} from '@formspec-org/types';
import type {
  ResolvedBundle,
  SurfaceDiagnostic,
} from '@formspec-org/surface';
import { SurfaceApp } from '../src/SurfaceApp.js';
import type {
  SurfaceWidget,
  SurfaceWidgetActionExecutor,
  SurfaceWidgetActionReport,
  SurfaceWidgetProps,
} from '../src/widget-api.js';
import { render } from './render.js';

const SURFACE_REF = 'https://example.test/surfaces/respondent';
const CATALOG_REF = 'https://example.test/data/runtime';

const responseActions = {
  $formspecResponseActions: '1.0',
  version: '1.0.0',
  targetDefinition: { url: 'urn:def' },
  actions: [{ id: 'acceptReceipt', intent: 'review' }],
} as unknown as ResponseActionsDocument;

function registry(withData: boolean): RegistryDocument {
  return {
    $formspecRegistry: '1.1',
    publisher: { name: 'Test', url: 'https://example.test' },
    published: '2026-07-28T00:00:00Z',
    entries: [
      {
        name: 'x-runtime',
        category: 'module',
        version: '1.0.0',
        status: 'stable',
        contributes: ['x-runtime-widget'],
      },
      {
        name: 'x-runtime-widget',
        category: 'widget',
        version: '1.0.0',
        status: 'stable',
        widgetShape: {
          widgetName: 'RuntimeWidget',
          ...(withData
            ? { dataInputs: [{ name: 'receipt', required: true }] }
            : {}),
          actionOutputs: [{ name: 'accepted' }],
        },
      },
    ],
  } as unknown as RegistryDocument;
}

function dataCatalog(): DataSourcesDocument {
  return {
    $formspecDataSources: '1.0',
    id: CATALOG_REF,
    version: '1.0.0',
    sources: [
      {
        id: 'resource:receipt',
        kind: 'document-resource',
        owner: 'host',
        scope: 'route',
        availability: {
          level: 'slot',
          surfaceRef: SURFACE_REF,
          routeRef: 'receipt',
          slotId: 'panel',
        },
        schema: { type: 'object' },
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
      },
    ],
  } as DataSourcesDocument;
}

function bundle(
  withData = false,
  transitions: readonly { trigger: string; to: string }[] = [
    { trigger: 'acceptReceipt', to: 'done' },
  ],
): ResolvedBundle {
  const binding = {
    moduleId: 'x-runtime',
    widgetName: 'RuntimeWidget',
    ...(withData
      ? {
          dataBindings: {
            receipt: {
              catalogRef: CATALOG_REF,
              sourceRef: 'resource:receipt',
            },
          },
        }
      : {}),
    actionBindings: { accepted: { actionRef: 'acceptReceipt' } },
  };
  const surface = {
    $formspecSurface: '0.2',
    id: 'respondent',
    entry: 'receipt',
    routes: [
      {
        id: 'receipt',
        path: '/receipt',
        routeClass: 'proof',
        slots: [
          {
            id: 'panel',
            slotType: 'module-widget',
            binding,
          },
        ],
        transitions,
      },
      {
        id: 'done',
        path: '/done',
        routeClass: 'proof',
        slots: [],
      },
      {
        id: 'alternate',
        path: '/alternate',
        routeClass: 'proof',
        slots: [],
      },
    ],
  } as unknown as SurfaceDocument;
  return {
    manifest: {
      $formspecBundle: '2.4',
      surfaces: [{ url: SURFACE_REF }],
      entrySurface: SURFACE_REF,
      dataSources: withData ? [{ url: CATALOG_REF }] : [],
    },
    title: 'Runtime',
    surfaces: [surface],
    surfaceRefs: new Map([[surface, SURFACE_REF]]),
    experiences: [],
    tenantTheme: undefined,
    registries: [registry(withData)],
    responseActions: [responseActions],
    dataSources: withData
      ? [{ catalogRef: CATALOG_REF, document: dataCatalog() }]
      : [],
    definitions: new Map(),
    diagnostics: [],
  };
}

function completed() {
  return {
    status: 'completed',
    resolution: {
      resolved: true,
      action: { id: 'acceptReceipt', intent: 'review' },
    },
    validationTuple: null,
    detail: {
      response: {},
      validationReport: { valid: true },
    },
    effectTrace: [],
  } as never;
}

function runtimeModule(widget: SurfaceWidget) {
  return [{ moduleId: 'x-runtime', widgets: { RuntimeWidget: widget } }];
}

describe('qualified widget data', () => {
  it('delivers only the frozen named object after every admission stage', async () => {
    const seen: SurfaceWidgetProps[] = [];
    const Widget: SurfaceWidget = (props) => {
      seen.push(props);
      return <output data-probe="widget-data">{JSON.stringify(props.data)}</output>;
    };
    const authorize = vi.fn(() => ({ status: 'authorized' as const }));
    const loader = vi.fn(() => ({
      status: 'loaded' as const,
      freshness: 'fresh' as const,
      value: { caseRef: 'case-7' },
    }));
    const validate = vi.fn(() => ({ valid: true as const }));
    const container = render(
      <SurfaceApp
        bundle={bundle(true)}
        location="/receipt"
        onNavigate={() => {}}
        widgetModules={runtimeModule(Widget)}
        authorizeDataSource={authorize}
        dataSourceLoader={loader}
        validateDataSourcePayload={validate}
        setDocumentTitle={false}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-probe="widget-data"]')?.textContent).toBe(
      '{"receipt":{"caseRef":"case-7"}}',
    );
    expect(Object.isFrozen(seen.at(-1)?.data)).toBe(true);
    expect(loader).toHaveBeenCalledWith(
      expect.objectContaining({
        descriptor: expect.objectContaining({
          catalogRef: CATALOG_REF,
          sourceRef: 'resource:receipt',
        }),
        context: expect.objectContaining({
          surfaceRef: SURFACE_REF,
          routeId: 'receipt',
          slotId: 'panel',
          moduleId: 'x-runtime',
        }),
      }),
    );
    expect(authorize).toHaveBeenCalledBefore(loader);
    expect(loader).toHaveBeenCalledBefore(validate);
  });
});

describe('widget action runtime', () => {
  it('coalesces a double emission and navigates exactly once with one shell id', async () => {
    let finish: ((value: ReturnType<typeof completed>) => void) | undefined;
    const executor = vi.fn<SurfaceWidgetActionExecutor>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const Widget: SurfaceWidget = ({ emitAction }) => (
      <button
        data-probe="emit"
        onClick={() => {
          emitAction('accepted');
          emitAction('accepted');
        }}
      >
        Accept
      </button>
    );
    const onNavigate = vi.fn();
    const reports: SurfaceWidgetActionReport[] = [];
    const container = render(
      <SurfaceApp
        bundle={bundle()}
        location="/receipt"
        onNavigate={onNavigate}
        widgetModules={runtimeModule(Widget)}
        widgetActionExecutor={executor}
        onWidgetActionReport={(report) => reports.push(report)}
        setDocumentTitle={false}
      />,
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-probe="emit"]')?.click();
      await Promise.resolve();
    });
    expect(executor).toHaveBeenCalledTimes(1);
    const invocationId = executor.mock.calls[0]?.[0].invocationId;
    expect(invocationId).toMatch(/^surface-widget-/);

    await act(async () => {
      finish?.(completed());
      await Promise.resolve();
    });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('/done');
    expect(reports.filter((report) => report.navigation === 'advanced')).toHaveLength(1);
    expect(reports.at(-1)?.invocationId).toBe(invocationId);
  });

  it('discards navigation from a terminal after the session generation changes', async () => {
    let finish: ((value: ReturnType<typeof completed>) => void) | undefined;
    const executor = vi.fn<SurfaceWidgetActionExecutor>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const Widget: SurfaceWidget = ({ emitAction }) => (
      <button data-probe="emit" onClick={() => emitAction('accepted')}>
        Accept
      </button>
    );
    const onNavigate = vi.fn();
    const reports: SurfaceWidgetActionReport[] = [];

    function Host() {
      const [generation, setGeneration] = useState(1);
      return (
        <>
          <button data-probe="rotate" onClick={() => setGeneration((value) => value + 1)}>
            Rotate
          </button>
          <SurfaceApp
            bundle={bundle()}
            location="/receipt"
            onNavigate={onNavigate}
            sessionGeneration={generation}
            widgetModules={runtimeModule(Widget)}
            widgetActionExecutor={executor}
            onWidgetActionReport={(report) => reports.push(report)}
            setDocumentTitle={false}
          />
        </>
      );
    }

    const container = render(<Host />);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-probe="emit"]')?.click();
      await Promise.resolve();
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-probe="rotate"]')?.click();
    });
    await act(async () => {
      finish?.(completed());
      await Promise.resolve();
    });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(reports.at(-1)?.navigation).toBe('obsolete-generation');
  });

  it('rejects an undeclared output before calling the executor', async () => {
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const Widget: SurfaceWidget = ({ emitAction }) => (
      <button data-probe="emit" onClick={() => emitAction('ghost')}>
        Ghost
      </button>
    );
    const delivered: SurfaceDiagnostic[][] = [];
    const container = render(
      <SurfaceApp
        bundle={bundle()}
        location="/receipt"
        onNavigate={() => {}}
        widgetModules={runtimeModule(Widget)}
        widgetActionExecutor={executor}
        onDiagnostics={(diagnostics) => delivered.push([...diagnostics])}
        setDocumentTitle={false}
      />,
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-probe="emit"]')?.click();
      await Promise.resolve();
    });
    expect(executor).not.toHaveBeenCalled();
    expect(delivered.at(-1)?.map((diagnostic) => diagnostic.code)).toContain(
      'WIDGET-ACTION-OUTPUT-UNDECLARED',
    );
  });

  it('refuses ambiguous completed-action navigation instead of choosing document order', async () => {
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const Widget: SurfaceWidget = ({ emitAction }) => (
      <button data-probe="emit" onClick={() => emitAction('accepted')}>
        Accept
      </button>
    );
    const onNavigate = vi.fn();
    const delivered: SurfaceDiagnostic[][] = [];
    const ambiguousBundle = bundle(false, [
      { trigger: 'acceptReceipt', to: 'done' },
      { trigger: 'acceptReceipt', to: 'alternate' },
    ]);
    const container = render(
      <SurfaceApp
        bundle={ambiguousBundle}
        location="/receipt"
        onNavigate={onNavigate}
        widgetModules={runtimeModule(Widget)}
        widgetActionExecutor={executor}
        onDiagnostics={(diagnostics) => delivered.push([...diagnostics])}
        setDocumentTitle={false}
      />,
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-probe="emit"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(delivered.at(-1)?.map((diagnostic) => diagnostic.code)).toContain(
      'WIDGET-ACTION-TRANSITION-AMBIGUOUS',
    );
  });
});
