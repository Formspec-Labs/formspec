/** @filedesc React handoff for qualified widget data and emitted actions. */
import { act, useEffect, useState } from 'react';
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
import { StructuredPanel } from '../src/widgets/structured-panel.js';
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
  scope: 'app',
  actions: [
    {
      id: 'acceptReceipt',
      intent: 'review',
      label: { literal: 'Accept receipt' },
      validation: {
        profile: 'off',
        blocking: 'non-blocking',
        persistence: 'none',
      },
      'x-generation': {
        anchors: [
          'need:accept-receipt@3',
          'need:shared-action-control@1',
        ],
      },
    },
  ],
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
  transitions: readonly {
    trigger: string;
    to: string;
    params?: Readonly<Record<string, string>> | undefined;
  }[] = [
    { trigger: 'acceptReceipt', to: 'done' },
  ],
  config?: Readonly<Record<string, unknown>>,
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
    ...(config === undefined ? {} : { config }),
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

function parameterBundle(): ResolvedBundle {
  const base = bundle(false, [
    {
      trigger: 'acceptReceipt',
      to: 'detail',
      params: { formId: 'formId' },
    },
  ]);
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
            binding: {
              moduleId: 'x-runtime',
              widgetName: 'RuntimeWidget',
              actionBindings: { accepted: { actionRef: 'acceptReceipt' } },
            },
          },
        ],
        transitions: [
          {
            trigger: 'acceptReceipt',
            to: 'detail',
            params: { formId: 'formId' },
          },
        ],
      },
      {
        id: 'detail',
        path: '/forms/{formId}',
        params: [{ name: 'formId', type: 'string' }],
        routeClass: 'operation',
        slots: [],
      },
    ],
  } as unknown as SurfaceDocument;
  return {
    ...base,
    surfaces: [surface],
    surfaceRefs: new Map([[surface, SURFACE_REF]]),
  };
}

function completed() {
  return {
    status: 'completed',
    resolution: {
      resolved: true,
      action: { id: 'acceptReceipt', intent: 'review', validation: { profile: 'off', blocking: 'non-blocking', persistence: 'none' } },
    },
    validationTuple: { profile: 'off', blocking: 'non-blocking', persistence: 'none' },
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

function responseBundle(): ResolvedBundle {
  const b = bundle(true);
  b.definitions.set('urn:def', { $formspec: '1.0', url: 'urn:def', version: '1.0.0', items: [] } as never);
  b.responseActions = [{ ...responseActions, scope: 'response', targetDefinition: { url: 'urn:def', compatibleVersions: '1.0.0' } } as ResponseActionsDocument];
  const binding = b.surfaces[0]!.routes[0]!.slots[0]!.binding as unknown as { actionBindings: { accepted: { responseInput?: string } } };
  binding.actionBindings.accepted.responseInput = 'receipt';
  b.dataSources[0]!.document.sources[0]!.schema = { $ref: 'https://formspec.org/schemas/response/1.0' };
  return b;
}

describe('qualified widget data', () => {
  it.each([['completed', 'completion-outcome-unknown', 'completed'], ['failed', 'private failure text', 'failed']])('classifies only the closed failed invocation: %s / %s', async (status, failureReason, expected) => {
    const feedback: string[] = [];
    const Widget: SurfaceWidget = ({ emitAction }) => <button data-probe="classification" onClick={() => {
      void emitAction('accepted')?.completion.then(result => { feedback.push(result.status); });
    }}>Submit</button>;
    const executor = vi.fn<SurfaceWidgetActionExecutor>(async () => ({ ...completed(), status, failureReason }));
    const container = render(<SurfaceApp bundle={bundle()} location="/receipt" onNavigate={() => {}}
      widgetModules={runtimeModule(Widget)} widgetActionExecutor={executor} setDocumentTitle={false} />);
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-probe="classification"]')!.click(); await Promise.resolve(); });
    expect(feedback).toEqual([expected]);
  });
  it.each([[false, false], [true, false], [false, true], [true, true]])('preserves unknown action feedback without navigation for joined=%s obsolete=%s', async (joined, obsolete) => {
    let finish!: (value: ReturnType<typeof completed>) => void;
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => new Promise(resolve => { finish = resolve; }));
    const feedback: string[] = [];
    const Widget: SurfaceWidget = ({ emitAction }) => <button data-probe="unknown" onClick={() => {
      const emission = emitAction('accepted');
      void emission?.completion.then(result => { feedback.push(result.status); });
    }}>Submit</button>;
    const onNavigate = vi.fn();
    function Host() {
      const [generation, setGeneration] = useState(1);
      return <><button data-probe="rotate-unknown" onClick={() => setGeneration(value => value + 1)}>Rotate</button>
        <SurfaceApp bundle={bundle()} location="/receipt" onNavigate={onNavigate} sessionGeneration={generation}
          widgetModules={runtimeModule(Widget)} widgetActionExecutor={executor} setDocumentTitle={false} /></>;
    }
    const container = render(<Host />);
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-probe="unknown"]')!.click(); await Promise.resolve(); });
    if (joined) await act(async () => { container.querySelector<HTMLButtonElement>('[data-probe="unknown"]')!.click(); await Promise.resolve(); });
    if (obsolete) act(() => container.querySelector<HTMLButtonElement>('[data-probe="rotate-unknown"]')!.click());
    await act(async () => { finish({ ...completed(), status: 'failed', failureReason: 'completion-outcome-unknown' }); await Promise.resolve(); });
    const status = obsolete ? 'obsolete' : 'outcome-unknown';
    expect(feedback).toEqual(joined ? [status, status] : [status]);
    expect(executor).toHaveBeenCalledOnce(); expect(onNavigate).not.toHaveBeenCalled();
  });
  it('captures the qualified Response before widget mutation and preserves response-scoped completion', async () => {
    const b = responseBundle();
    const saved = { $formspecResponse: '1.0', definitionUrl: 'urn:def', definitionVersion: '1.0.0',
      id: 'response-1', status: 'completed', authored: '2026-10-06T12:00:00Z', data: { answer: 'original' },
      extensions: { 'x-proof': { literal: 'preserved' } }, authoredSignatures: [{
        signatureId: 'sig-1', documentId: 'declaration', signingIntent: 'urn:intent:test', signatureValue: 'AA==',
        signerId: 'owner-1', signerName: 'Test Person', consentAccepted: true, consentTextRef: 'urn:consent:test',
        consentVersion: '1.0', affirmationText: 'Test affirmation', documentHash: 'b'.repeat(64),
        documentHashAlgorithm: 'sha-256', signatureProvider: 'urn:provider:test', ceremonyId: 'ceremony-1',
        signedPayload: { canonicalization: 'formspec-response-signing-v1', digest: 'c'.repeat(64), digestAlgorithm: 'sha-256',
          responseId: 'response-1', definitionUrl: 'urn:def', definitionVersion: '1.0.0', signedAt: '2026-10-06T12:00:00Z', signingIntent: 'urn:intent:test' },
      }] };
    const Widget: SurfaceWidget = (props) => {
      const value = props.data?.receipt as typeof saved;
      value.data.answer = 'widget-changed';
      return <button data-probe="emit-response" onClick={() => props.emitAction('accepted', { frozenResponse: { data: { answer: 'forged' } } })}>Run</button>;
    };
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const navigate = vi.fn();
    const validator = vi.fn(() => ({ valid: true as const }));
    const container = render(<SurfaceApp bundle={b} location="/receipt" onNavigate={navigate}
      widgetModules={runtimeModule(Widget)} widgetActionExecutor={executor}
      authorizeDataSource={() => ({ status: 'authorized' })}
      dataSourceLoader={() => ({ status: 'loaded', freshness: 'fresh', value: saved })}
      validateDataSourcePayload={validator} setDocumentTitle={false} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-probe="emit-response"]')?.click(); await Promise.resolve(); });
    expect(executor).toHaveBeenCalledTimes(1);
    const subject = executor.mock.calls[0]![0].responseContext!;
    expect(subject.response.data.answer).toBe('original');
    expect(subject.response.extensions).toEqual(saved.extensions);
    expect(subject.response.authoredSignatures).toEqual(saved.authoredSignatures);
    expect(Object.isFrozen(subject.response.data)).toBe(true);
    expect(executor.mock.calls[0]![0].input).toEqual({ frozenResponse: { data: { answer: 'forged' } } });
    expect(validator).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith('/done');
  });
  it.each(['wrong-url', 'wrong-version', 'accessor', 'unauthorized', 'invalid-frozen-copy', 'stale'])('withholds widget access for %s', async (failure) => {
    const saved = { $formspecResponse: '1.0', definitionUrl: 'urn:def', definitionVersion: '1.0.0', status: 'in-progress',
      authored: '2026-10-06T12:00:00Z', data: { answer: 'original' } };
    if (failure === 'wrong-url') saved.definitionUrl = 'urn:other';
    if (failure === 'wrong-version') saved.definitionVersion = '2.0.0';
    const getter = vi.fn();
    if (failure === 'accessor') Object.defineProperty(saved.data, 'secret', { enumerable: true, get: getter });
    const Widget = vi.fn<SurfaceWidget>(() => <button data-probe="subject-widget">Run</button>);
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const validator = vi.fn().mockReturnValue({ valid: true });
    if (failure === 'invalid-frozen-copy') validator.mockReturnValueOnce({ valid: true }).mockReturnValue({ valid: false });
    const container = render(<SurfaceApp bundle={responseBundle()} location="/receipt" onNavigate={() => {}}
      widgetModules={runtimeModule(Widget)} widgetActionExecutor={executor}
      authorizeDataSource={() => failure === 'unauthorized' ? { status: 'refused' } : { status: 'authorized' }}
      dataSourceLoader={() => ({ status: 'loaded', freshness: failure === 'stale' ? 'stale' : 'fresh', value: saved })}
      validateDataSourcePayload={validator} setDocumentTitle={false} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.querySelector('[data-probe="subject-widget"]')).toBeNull();
    expect(Widget).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });
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
    expect(seen.at(-1)?.actions).toEqual([
      {
        outputName: 'accepted',
        actionRef: 'acceptReceipt',
        intent: 'review',
        label: { literal: 'Accept receipt' },
        needAnchors: [
          'need:accept-receipt@3',
          'need:shared-action-control@1',
        ],
      },
    ]);
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

  it('renders traced loading and empty views from configuration', async () => {
    let finish:
      | ((value: {
          status: 'loaded';
          freshness: 'fresh';
          value: { items: unknown[] };
        }) => void)
      | undefined;
    const loader = vi.fn(
      () =>
        new Promise<{
          status: 'loaded';
          freshness: 'fresh';
          value: { items: unknown[] };
        }>((resolve) => {
          finish = resolve;
        }),
    );
    const config = {
      emptyWhen: { inputName: 'receipt', path: 'items' },
      stateViews: {
        loading: {
          heading: 'Loading resources',
          body: 'The current list is on its way.',
          'x-generation': { anchors: ['need:see-resources@1'] },
        },
        empty: {
          heading: 'No resources',
          body: 'There are no resources in this workspace.',
          actions: [{
            kind: 'output',
            outputName: 'accepted',
            'x-generation': { anchors: ['need:create-resource@1'] },
          }],
          'x-generation': { anchors: ['need:see-resources@1'] },
        },
      },
    };
    const container = render(
      <SurfaceApp
        bundle={bundle(true, [], config)}
        location="/receipt"
        onNavigate={() => {}}
        widgetModules={runtimeModule(() => <div data-probe="ready" />)}
        authorizeDataSource={() => ({ status: 'authorized' })}
        dataSourceLoader={loader}
        validateDataSourcePayload={() => ({ valid: true })}
        setDocumentTitle={false}
      />,
    );

    expect(container.querySelector('[data-widget-state="loading"]')?.textContent).toContain(
      'Loading resources',
    );
    await act(async () => {
      await Promise.resolve();
      finish?.({ status: 'loaded', freshness: 'fresh', value: { items: [] } });
      await Promise.resolve();
    });
    expect(container.querySelector('[data-widget-state="empty"]')?.textContent).toContain(
      'No resources',
    );
    expect(
      container.querySelector<HTMLButtonElement>('[data-state-action-output="accepted"]')
        ?.textContent,
    ).toBe('Accept receipt');
    expect(container.querySelector('[data-probe="ready"]')).toBeNull();
  });

  it('renders an authored unavailable state for an explicit unavailable source result', async () => {
    const config = {
      stateViews: {
        unavailable: {
          heading: 'This resource is temporarily unavailable',
          body: 'Use the alternate route while service is restored.',
          'x-generation': { anchors: ['need:see-resource@1'] },
        },
      },
    };
    const container = render(
      <SurfaceApp
        bundle={bundle(true, [], config)}
        location="/receipt"
        onNavigate={() => {}}
        widgetModules={runtimeModule(() => <div data-probe="ready">Ready</div>)}
        authorizeDataSource={() => ({ status: 'authorized' })}
        dataSourceLoader={() => ({
          status: 'unavailable',
          reason: 'private maintenance window 42',
        })}
        validateDataSourcePayload={() => ({ valid: true })}
        setDocumentTitle={false}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[data-widget-state="unavailable"]')?.textContent,
    ).toContain('This resource is temporarily unavailable');
    expect(container.textContent).not.toContain('private maintenance window 42');
    expect(container.querySelector('[data-probe="ready"]')).toBeNull();
  });

  it('keeps load details in diagnostics and retries from traced customer copy', async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('private backend shard 12 timed out'))
      .mockResolvedValueOnce({
        status: 'loaded',
        freshness: 'fresh',
        value: { caseRef: 'case-7' },
      });
    const delivered: SurfaceDiagnostic[][] = [];
    const config = {
      stateViews: {
        error: {
          heading: 'We could not load this section',
          body: 'Try again.',
          actions: [{
            kind: 'retry',
            label: 'Try again',
            'x-generation': { anchors: ['need:recover-resource@1'] },
          }],
          'x-generation': { anchors: ['need:see-resource@1'] },
        },
      },
    };
    const container = render(
      <SurfaceApp
        bundle={bundle(true, [], config)}
        location="/receipt"
        onNavigate={() => {}}
        widgetModules={runtimeModule(() => <div data-probe="ready">Ready</div>)}
        authorizeDataSource={() => ({ status: 'authorized' })}
        dataSourceLoader={loader}
        validateDataSourcePayload={() => ({ valid: true })}
        onDiagnostics={(diagnostics) => delivered.push([...diagnostics])}
        setDocumentTitle={false}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-widget-state="error"]')?.textContent).toContain(
      'We could not load this section',
    );
    expect(container.textContent).not.toContain('private backend shard 12');
    expect(delivered.at(-1)?.some((diagnostic) =>
      diagnostic.message.includes('private backend shard 12 timed out'),
    )).toBe(true);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-state-action="retry"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-probe="ready"]')?.textContent).toBe('Ready');
  });
});

describe('widget action runtime', () => {
  it('puts the action presentation and resolved Response Action Needs on the DOM control once', async () => {
    const container = render(
      <SurfaceApp
        bundle={bundle(false, [], {
          actions: [
            {
              outputName: 'accepted',
              'x-generation': {
                anchors: [
                  'need:show-accept-control@2',
                  'need:shared-action-control@1',
                ],
              },
            },
          ],
        })}
        location="/receipt"
        onNavigate={() => {}}
        widgetModules={runtimeModule(
          (props) => (
            <StructuredPanel {...props} />
          ),
        )}
        setDocumentTitle={false}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const button = container.querySelector<HTMLButtonElement>(
      '[data-action-ref="acceptReceipt"]',
    );
    expect(button?.textContent).toBe('Accept receipt');
    expect(button?.getAttribute('data-need-anchors')).toBe(
      'need:show-accept-control@2 need:shared-action-control@1 need:accept-receipt@3',
    );
    expect(button?.getAttribute('data-need-ids')).toBe(
      'show-accept-control shared-action-control accept-receipt',
    );
  });

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

  it('advances a completed app action with structured input and no fake Response', async () => {
    const appActions = {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      scope: 'app',
      actions: [{
        id: 'acceptReceipt',
        intent: 'review',
        label: { literal: 'Accept receipt' },
        validation: {
          profile: 'off',
          blocking: 'non-blocking',
          persistence: 'none',
        },
      }],
    } as unknown as ResponseActionsDocument;
    const appBundle = {
      ...bundle(),
      responseActions: [appActions],
    };
    const executor = vi.fn<SurfaceWidgetActionExecutor>(({ input }) => ({
      ...completed(),
      detail: input ?? null,
    }));
    const Widget: SurfaceWidget = ({ emitAction }) => (
      <button
        data-probe="emit"
        onClick={() => emitAction('accepted', {
          resource: {
            href: '/records/response-1',
            label: 'Review response',
          },
        })}
      >
        Open
      </button>
    );
    const onNavigate = vi.fn();
    const container = render(
      <SurfaceApp
        bundle={appBundle}
        location="/receipt"
        onNavigate={onNavigate}
        widgetModules={runtimeModule(Widget)}
        widgetActionExecutor={executor}
        setDocumentTitle={false}
      />,
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-probe="emit"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(executor.mock.calls[0]?.[0].input).toEqual({
      resource: {
        href: '/records/response-1',
        label: 'Review response',
      },
    });
    expect(onNavigate).toHaveBeenCalledWith('/done');
  });

  it('uses only a safe top-level row value for parameterized navigation', async () => {
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const Widget: SurfaceWidget = ({ emitAction }) => (
      <button
        data-probe="emit"
        onClick={() => emitAction('accepted', {
          formId: 'form-from-row',
          nested: { formId: 'nested-must-not-navigate' },
          numericId: 42,
          emptyId: '',
        })}
      >
        Open
      </button>
    );
    const onNavigate = vi.fn();
    const reports: SurfaceWidgetActionReport[] = [];
    const container = render(
      <SurfaceApp
        bundle={parameterBundle()}
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
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith('/forms/form-from-row');
    expect(reports.at(-1)?.navigation).toBe('advanced');
    expect(reports.at(-1)?.result?.transitionBindings).toBeUndefined();
    expect(reports.at(-1)?.result?.effectTrace).toEqual([]);
    expect(JSON.stringify(reports)).not.toContain('form-from-row');
    expect(JSON.stringify(reports)).not.toContain('nested-must-not-navigate');
  });

  it('keeps declared service output navigation for widget actions', async () => {
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => ({
      ...completed(),
      transitionBindings: Object.freeze({ formId: 'form-from-service' }),
    }));
    const Widget: SurfaceWidget = ({ emitAction }) => (
      <button data-probe="emit" onClick={() => emitAction('accepted')}>
        Open
      </button>
    );
    const onNavigate = vi.fn();
    const container = render(
      <SurfaceApp
        bundle={parameterBundle()}
        location="/receipt"
        onNavigate={onNavigate}
        widgetModules={runtimeModule(Widget)}
        widgetActionExecutor={executor}
        setDocumentTitle={false}
      />,
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-probe="emit"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith('/forms/form-from-service');
  });

  it('coalesces equal service and widget binding values', async () => {
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => ({
      ...completed(),
      transitionBindings: Object.freeze({ formId: 'form-shared' }),
    }));
    const Widget: SurfaceWidget = ({ emitAction }) => (
      <button
        data-probe="emit"
        onClick={() => emitAction('accepted', { formId: 'form-shared' })}
      >
        Open
      </button>
    );
    const onNavigate = vi.fn();
    const container = render(
      <SurfaceApp
        bundle={parameterBundle()}
        location="/receipt"
        onNavigate={onNavigate}
        widgetModules={runtimeModule(Widget)}
        widgetActionExecutor={executor}
        setDocumentTitle={false}
      />,
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-probe="emit"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith('/forms/form-shared');
  });

  it('diagnoses and refuses conflicting service and widget binding values', async () => {
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => ({
      ...completed(),
      transitionBindings: Object.freeze({ formId: 'private-service-value' }),
    }));
    const Widget: SurfaceWidget = ({ emitAction }) => (
      <button
        data-probe="emit"
        onClick={() => emitAction('accepted', { formId: 'private-widget-value' })}
      >
        Open
      </button>
    );
    const onNavigate = vi.fn();
    const delivered: SurfaceDiagnostic[][] = [];
    const container = render(
      <SurfaceApp
        bundle={parameterBundle()}
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
    expect(JSON.stringify(delivered)).not.toContain('private-service-value');
    expect(JSON.stringify(delivered)).not.toContain('private-widget-value');
  });

  it('refuses nested, non-string, and empty widget values as route bindings', async () => {
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const Widget: SurfaceWidget = ({ emitAction }) => (
      <button
        data-probe="emit"
        onClick={() => emitAction('accepted', {
          formId: 42,
          nested: { formId: 'nested-value' },
          empty: '',
        })}
      >
        Open
      </button>
    );
    const onNavigate = vi.fn();
    const reports: SurfaceWidgetActionReport[] = [];
    const container = render(
      <SurfaceApp
        bundle={parameterBundle()}
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
      await Promise.resolve();
    });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(reports.at(-1)?.navigation).toBe('none');
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

  it('rejects non-JSON action input before calling the executor', async () => {
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const Widget: SurfaceWidget = ({ emitAction }) => (
      <button
        data-probe="emit"
        onClick={() =>
          emitAction('accepted', { unsafe: () => 'not data' } as never)}
      >
        Accept
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
      'WIDGET-ACTION-INPUT-INVALID',
    );
  });

  it('rejects a response-scoped widget action before calling the executor', async () => {
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const Widget: SurfaceWidget = ({ emitAction }) => (
      <button data-probe="emit" onClick={() => emitAction('accepted')}>
        Accept
      </button>
    );
    const delivered: SurfaceDiagnostic[][] = [];
    const responseScopedBundle = {
      ...bundle(),
      responseActions: [{
        ...responseActions,
        scope: 'response',
        targetDefinition: { url: 'urn:def' },
      } as unknown as ResponseActionsDocument],
    };
    const container = render(
      <SurfaceApp
        bundle={responseScopedBundle}
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
      'WIDGET-ACTION-REF-UNRESOLVED',
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

describe("public generation registration before mounted loading", () => {
  it("pairs initial loads and Prepare navigation with the independently registered destination", async () => {
    const { deriveSurfaceRuntimeGeneration } = await import("../src/index.js");
    const { composeSurfaceApp } = await import("@formspec-org/surface");
    const candidate = bundle(true);
    const surface = candidate.surfaces[0] as any;
    surface.routes[0].id = "intake";
    surface.routes[0].path = "/intake";
    surface.routes[0].transitions = [
      { trigger: "acceptReceipt", to: "ceremony" },
    ];
    surface.routes[1].id = "ceremony";
    surface.routes[1].path = "/ceremony";
    surface.routes[1].slots = structuredClone(surface.routes[0].slots);
    surface.routes[1].slots[0].binding.dataBindings.receipt.sourceRef =
      "resource:prepared";
    const catalog = candidate.dataSources[0]!.document as any;
    catalog.sources[0].availability.routeRef = "intake";
    catalog.sources.push({
      ...structuredClone(catalog.sources[0]),
      id: "resource:prepared",
      availability: {
        ...catalog.sources[0].availability,
        routeRef: "ceremony",
      },
    });
    const app = composeSurfaceApp(candidate.surfaces, {
      entrySurface: candidate.entrySurface,
    });
    let prepared = false;
    const loads: Array<{ route: string; generation: string }> = [];
    let finish!: (value: ReturnType<typeof completed>) => void;
    const executor: SurfaceWidgetActionExecutor = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const Widget: SurfaceWidget = ({ data, route, emitAction }) => (
      <div>
        <span data-probe="phase">{String((data.receipt as any)?.message)}</span>
        {route.routeId === "intake" && (
          <button data-probe="prepare" onClick={() => emitAction("accepted")}>
            Prepare
          </button>
        )}
      </div>
    );
    function Host() {
      const [location, setLocation] = useState("/intake");
      const epoch = 1;
      // Register independently before SurfaceApp mounts any loading children.
      const expected = deriveSurfaceRuntimeGeneration({
        app,
        sessionGeneration: epoch,
        location,
      });
      return (
        <SurfaceApp
          bundle={candidate}
          location={location}
          sessionGeneration={epoch}
          onNavigate={setLocation}
          widgetModules={runtimeModule(Widget)}
          widgetActionExecutor={executor}
          authorizeDataSource={() => ({ status: "authorized" })}
          validateDataSourcePayload={() => ({ valid: true })}
          dataSourceLoader={async (request) => {
            expect(request.context.sessionGeneration).toBe(expected);
            expect(request.context.sessionGeneration).not.toBe(String(epoch));
            const route = request.context.routeId!;
            loads.push({ route, generation: expected });
            if (route === "ceremony" && !prepared)
              return { status: "unavailable" };
            return {
              status: "loaded",
              freshness: "current",
              value: {
                message:
                  route === "ceremony"
                    ? "Recorded prepared candidate"
                    : "Intake candidate",
              },
            };
          }}
          setDocumentTitle={false}
        />
      );
    }
    const container = render(<Host />);
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
      });
      expect(container.querySelector('[data-probe="phase"]')?.textContent).toBe(
        "Intake candidate"
      );
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-probe="prepare"]')!
        .click();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-probe="phase"]')?.textContent).toBe(
      "Intake candidate"
    );
    await act(async () => {
      prepared = true;
      finish(completed());
      await Promise.resolve();
    });
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
      });
      expect(container.querySelector('[data-probe="phase"]')?.textContent).toBe(
        "Recorded prepared candidate"
      );
    });
    expect(loads.some((load) => load.route === "intake")).toBe(true);
    expect(loads.some((load) => load.route === "ceremony")).toBe(true);
    expect(loads.find((load) => load.route === "intake")?.generation).not.toBe(
      loads.find((load) => load.route === "ceremony")?.generation
    );
  });
});

it("refuses a terminal navigation after the mounted shell is disposed", async () => {
  let finish!: (value: ReturnType<typeof completed>) => void;
  const navigate = vi.fn();
  const reports: SurfaceWidgetActionReport[] = [];
  const Widget: SurfaceWidget = ({ emitAction }) => (
    <button data-probe="pending" onClick={() => emitAction("accepted")}>
      Prepare
    </button>
  );
  function Host() {
    const [active, setActive] = useState(true);
    return (
      <>
        <button data-probe="dispose" onClick={() => setActive(false)}>
          Dispose
        </button>
        {active && (
          <SurfaceApp
            bundle={bundle()}
            location="/receipt"
            sessionGeneration={1}
            onNavigate={navigate}
            widgetModules={runtimeModule(Widget)}
            widgetActionExecutor={() =>
              new Promise((resolve) => {
                finish = resolve;
              })
            }
            onWidgetActionReport={(report) => reports.push(report)}
            setDocumentTitle={false}
          />
        )}
      </>
    );
  }
  const container = render(<Host />);
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[data-probe="pending"]')!
      .click();
    await Promise.resolve();
  });
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[data-probe="dispose"]')!
      .click()
  );
  await act(async () => {
    finish(completed());
    await Promise.resolve();
  });
  expect(navigate).not.toHaveBeenCalled();
  expect(reports.at(-1)?.navigation).toBe("obsolete-generation");
});


it('refreshes only consumers of a changed qualified source without unmounting unchanged widgets', async () => {
  const candidate = bundle(true, []);
  const route = candidate.surfaces[0]!.routes[0]!;
  const extra = structuredClone(route.slots![0]!) as any;
  extra.id = 'ceremony';
  extra.binding.dataBindings.receipt.sourceRef = 'resource:readiness';
  route.slots!.push(extra);
  const source = structuredClone(candidate.dataSources[0]!.document.sources[0]!);
  source.id = 'resource:readiness';
  (source.availability as any).slotId = 'ceremony';
  candidate.dataSources[0]!.document.sources.push(source);
  const mounts: string[] = [];
  const unmounts: string[] = [];
  const Widget: SurfaceWidget = props => {
    const slot = props.slot.id;
    useEffect(() => { mounts.push(slot); return () => { unmounts.push(slot); }; }, []);
    return <output data-source-slot={slot}>{JSON.stringify(props.data)}</output>;
  };
  const modules = runtimeModule(Widget);
  let version = 0;
  let refresh!: () => void;
  const loader = vi.fn((request: any) => ({ status: 'loaded' as const, freshness: 'fresh' as const,
    value: { value: request.descriptor.sourceRef === 'resource:readiness' ? version : 'saved-photo' } }));
  const authorize = vi.fn(() => ({ status: 'authorized' as const }));
  const validate = vi.fn(() => ({ valid: true }));
  const navigate = () => {};
  function Host() {
    const [, setTick] = useState(0);
    refresh = () => { version++; setTick(tick => tick + 1); };
    return <SurfaceApp bundle={candidate} location="/receipt" onNavigate={navigate} widgetModules={modules}
      authorizeDataSource={authorize} dataSourceLoader={loader} validateDataSourcePayload={validate}
      dataSourceRevision={(request: any) => request.descriptor.sourceRef === 'resource:readiness' ? version : 0}
      setDocumentTitle={false} />;
  }
  const container = render(<Host />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const saved = container.querySelector('[data-source-slot="panel"]');
  expect(saved?.textContent).toContain('saved-photo');
  expect(loader).toHaveBeenCalledTimes(2);
  await act(async () => { refresh(); await Promise.resolve(); await Promise.resolve(); });
  expect(loader).toHaveBeenCalledTimes(3);
  expect(container.querySelector('[data-source-slot="panel"]')).toBe(saved);
  expect(container.querySelector('[data-source-slot="ceremony"]')?.textContent).toContain('1');
  expect(mounts.filter(slot => slot === 'panel')).toHaveLength(1);
  expect(unmounts).toEqual(['ceremony']);
  expect(authorize).toHaveBeenCalledTimes(3);
  expect(validate).toHaveBeenCalledTimes(3);
});

it.each([false, true])('refuses invalid hints through required/optional source policy (optional=%s)', async optional => {
  const candidate = bundle(true, []);
  if (optional) {
    (candidate.registries[0]!.entries[1]!.widgetShape!.dataInputs![0] as any).required = false;
    candidate.dataSources[0]!.document.sources[0]!.runtime.failureMode = 'degraded-widget';
  }
  const loader = vi.fn();
  const authorize = vi.fn();
  const diagnostics: SurfaceDiagnostic[] = [];
  const container = render(<SurfaceApp bundle={candidate} location="/receipt" onNavigate={() => {}}
    widgetModules={runtimeModule(props => <output data-probe="invalid-hint-data">{JSON.stringify(props.data)}</output>)}
    dataSourceLoader={loader} authorizeDataSource={authorize}
    dataSourceRevision={() => { throw new Error('private-host-detail'); }}
    onDiagnostics={next => { diagnostics.splice(0, diagnostics.length, ...next); }} setDocumentTitle={false} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(loader).not.toHaveBeenCalled();
  expect(authorize).not.toHaveBeenCalled();
  if (optional) expect(container.querySelector('[data-probe="invalid-hint-data"]')?.textContent).toBe('{}');
  else expect(container.querySelector('[data-widget-data="unavailable"]')).not.toBeNull();
  expect(JSON.stringify(diagnostics)).not.toContain('private-host-detail');
});

it('discards a pending delivery superseded by a qualified source revision', async () => {
  const candidate = bundle(true, []);
  let version = 0;
  let refresh!: () => void;
  const pending: ((value: any) => void)[] = [];
  const loader = vi.fn(() => new Promise<any>(resolve => { pending.push(resolve); }));
  const authorize = () => ({ status: 'authorized' as const });
  const validate = () => ({ valid: true });
  const modules = runtimeModule(props => <output data-probe="latest-delivery">{JSON.stringify(props.data)}</output>);
  const navigate = () => {};
  function Host() {
    const [, setTick] = useState(0);
    refresh = () => { version++; setTick(value => value + 1); };
    return <SurfaceApp bundle={candidate} location="/receipt" onNavigate={navigate} widgetModules={modules}
      dataSourceLoader={loader} authorizeDataSource={authorize} validateDataSourcePayload={validate}
      dataSourceRevision={() => version} setDocumentTitle={false} />;
  }
  const container = render(<Host />);
  await act(async () => { await Promise.resolve(); });
  await act(async () => { refresh(); await Promise.resolve(); });
  expect(pending).toHaveLength(2);
  await act(async () => { pending[0]!({ status: 'loaded', freshness: 'fresh', value: { value: 'obsolete' } }); await Promise.resolve(); });
  expect(container.querySelector('[data-probe="latest-delivery"]')).toBeNull();
  await act(async () => { pending[1]!({ status: 'loaded', freshness: 'fresh', value: { value: 'current' } }); await Promise.resolve(); });
  expect(container.querySelector('[data-probe="latest-delivery"]')?.textContent).toContain('current');
});
