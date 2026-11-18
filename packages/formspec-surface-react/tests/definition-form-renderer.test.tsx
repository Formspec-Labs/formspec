/** @filedesc Narrow host form-runtime callback through App -> Route -> Slot. */
import { act, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as engine from '@formspec-org/engine';
import type {
  FormDefinition,
  OntologyDocument,
  ReferencesDocument,
  ResponseActionsDocument,
  SurfaceDocument,
} from '@formspec-org/types';
import {
  createSurfaceSemanticOutputRegistry,
  type ResolvedBundle,
} from '@formspec-org/surface';
import { SurfaceApp } from '../src/SurfaceApp.js';
import {
  createSurfaceSemanticOutputScopeResolver,
} from '../src/semantic-output.js';
import { createSurfaceSemanticControlScopeResolver, renderDefaultDefinitionForm } from '../src/SurfaceSlot.js';
import type {
  SurfaceDefinitionFormRenderer,
  SurfaceSemanticControlScopeRequest,
} from '../src/SurfaceSlot.js';
import { createSemanticControlRegistry } from '@formspec-org/react';
import { render } from './render.js';

const DEFINITION_REF = 'https://example.test/definitions/application';
const SURFACE_REF = 'https://example.test/surfaces/respondent';
const HELP_NEED = 'need:understand-contact-email@1';
const FILING_YEAR_SUBJECT_TYPE = 'urn:example:filing-year';
const FILING_YEAR_2026_SUBJECT_ID = '1ed4d947987ad3ecc9fc167c00591f238bb6f58548dd0c438f204dd795778d0a';

beforeAll(async () => {
  await engine.initFormspecEngine();
});

function fixture(withSubmit = false): ResolvedBundle {
  const surface = {
    $formspecSurface: '0.2',
    id: 'respondent',
    entry: 'apply',
    routes: [
      {
        id: 'apply',
        path: '/apply',
        routeClass: 'intake',
        slots: [
          {
            id: 'form',
            slotType: 'definition-form',
            binding: { definitionRef: DEFINITION_REF },
          },
        ],
      },
    ],
  } as unknown as SurfaceDocument;
  const definition = {
    $formspec: '1.0',
    url: DEFINITION_REF,
    version: '1.0.0',
    title: 'Application',
    items: [],
  } as unknown as FormDefinition;
  const actions = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: { url: DEFINITION_REF },
    actions: [{
      id: 'submitApplication',
      intent: 'submit',
      ...(withSubmit && {
        label: { literal: 'Submit application' },
        effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
      }),
    }],
  } as unknown as ResponseActionsDocument;
  return {
    manifest: {
      $formspecBundle: '2.4',
      surfaces: [{ url: SURFACE_REF }],
      entrySurface: SURFACE_REF,
      definitions: [{ url: DEFINITION_REF }],
    },
    title: 'Application',
    surfaces: [surface],
    surfaceRefs: new Map([[surface, SURFACE_REF]]),
    experiences: [],
    tenantTheme: undefined,
    registries: [],
    responseActions: [actions],
    definitions: new Map([[DEFINITION_REF, definition]]),
    diagnostics: [],
  };
}

function filingYearFixture(key = 'ffy'): ResolvedBundle {
  const bundle = fixture(true);
  const definition = bundle.definitions.get(DEFINITION_REF)!;
  definition.subject = { type: FILING_YEAR_SUBJECT_TYPE, keys: { [key]: { dataType: 'integer' } } };
  definition.items = [
    { type: 'field', key: 'year', dataType: 'integer', label: 'Filing year' },
    { type: 'field', key: 'name', dataType: 'string', label: 'Name' },
  ];
  definition.binds = [{ path: 'year', calculate: `subject('${key}')` }];
  const route = bundle.surfaces[0]!.routes[0]!;
  route.path = '/units/{year}';
  route.params = [{ name: 'year', type: 'string' }];
  route.slots[0]!.binding = { definitionRef: DEFINITION_REF, subjectKeys: { [key]: 'year' } };
  return bundle;
}

describe('filing-unit subject in the default Definition form', () => {
  function mount() {
    const container = document.body.appendChild(document.createElement('div'));
    const root = createRoot(container);
    const show = (node: ReactNode) => act(async () => {
      flushSync(() => root.render(node));
      if (container.querySelector('[aria-busy="true"]')) {
        await vi.waitFor(() => expect(engine.isFormspecEngineToolsInitialized()).toBe(true));
      }
    });
    return { container, show };
  }

  async function submit(container: HTMLElement) {
    const button = container.querySelector<HTMLButtonElement>('button.formspec-submit');
    if (!button) throw new Error('expected a rendered submit control');
    await act(async () => { button.click(); });
  }

  it('renders a Definition with no declared subject using only the runtime engine', async () => {
    const toolsReady = vi.spyOn(engine, 'isFormspecEngineToolsInitialized').mockReturnValue(false);
    const initTools = vi.spyOn(engine, 'initFormspecEngineTools').mockResolvedValue();
    const onDefinitionActionResult = vi.fn();
    try {
      const container = render(<SurfaceApp bundle={fixture(true)} location="/apply" onNavigate={() => {}}
        onDefinitionActionResult={onDefinitionActionResult} setDocumentTitle={false} />);

      await submit(container);
      expect(onDefinitionActionResult.mock.lastCall?.[0].detail.response.subject).toBeUndefined();
      expect(initTools).not.toHaveBeenCalled();
    } finally {
      toolsReady.mockRestore();
      initTools.mockRestore();
    }
  });

  it('calculates from the typed route subject and starts a new Response when the filing year changes', async () => {
    const bundle = filingYearFixture();
    const onDefinitionActionResult = vi.fn();
    const { container, show } = mount();
    const openYear = (year: number, headingBaseLevel = 2) => show(
      <SurfaceApp bundle={bundle} location={`/units/${year}`} onNavigate={() => {}}
        onDefinitionActionResult={onDefinitionActionResult} headingBaseLevel={headingBaseLevel} setDocumentTitle={false} />,
    );

    await openYear(2026);
    await submit(container);
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('2026');
    expect(onDefinitionActionResult.mock.lastCall?.[0].detail.response).toMatchObject({
      data: { year: 2026 },
      subject: { type: FILING_YEAR_SUBJECT_TYPE, keys: { ffy: 2026 }, id: FILING_YEAR_2026_SUBJECT_ID },
    });

    const name = container.querySelector<HTMLInputElement>('input[type="text"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, '2026 answer');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await openYear(2026, 3);
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('2026 answer');

    await openYear(2027, 3);
    await submit(container);
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('');
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('2027');
    expect(onDefinitionActionResult.mock.lastCall?.[0].detail.response).toMatchObject({
      data: { year: 2027 },
      subject: { type: FILING_YEAR_SUBJECT_TYPE, keys: { ffy: 2027 }, id: '920f0b3c9bf4ab59358e70a0e75cd4d6858d273cba465ae4cdc1188d1fcd2d86' },
    });
  });

  it('writes empty keys for an explicitly declared singleton', async () => {
    const bundle = fixture(true);
    const type = 'urn:example:singleton';
    bundle.definitions.get(DEFINITION_REF)!.subject = { type, keys: {} };
    const onDefinitionActionResult = vi.fn();
    const { container, show } = mount();
    await show(<SurfaceApp bundle={bundle} location="/apply" onNavigate={() => {}}
      renderDefinitionForm={renderDefaultDefinitionForm} onDefinitionActionResult={onDefinitionActionResult} setDocumentTitle={false} />);

    await submit(container);
    expect(onDefinitionActionResult.mock.lastCall?.[0].detail.response.subject).toEqual({
      type, keys: {}, id: '66a9472c32eb16c8bf5c57acae4ec4056f2518b98eb36ea1ac0a77a5dc0d5582',
    });
  });

  it.each([false, true])('localizes loading and a tools load failure (delegating renderer: %s)', async (delegating) => {
    let rejectTools!: (error: Error) => void;
    const pending = new Promise<void>((_, reject) => { rejectTools = reject; });
    const toolsReady = vi.spyOn(engine, 'isFormspecEngineToolsInitialized').mockReturnValue(false);
    const initTools = vi.spyOn(engine, 'initFormspecEngineTools').mockReturnValue(pending);
    const renderer = vi.fn(renderDefaultDefinitionForm);
    const container = document.body.appendChild(document.createElement('div'));
    const root = createRoot(container);

    try {
      act(() => root.render(<SurfaceApp bundle={filingYearFixture()} location="/units/2026" onNavigate={() => {}}
        renderDefinitionForm={delegating ? renderer : undefined} setDocumentTitle={false}
        strings={{ transitionPending: 'Preparando el formulario', slotUnavailableWidgetData: 'Faltan datos para mostrar el formulario' }} />));
      const loading = container.querySelector('[data-probe="definition-form-loading"]');
      expect.soft(loading?.className).toBe('fs-surface-loading');
      expect.soft(loading?.getAttribute('role')).toBe('status');
      expect.soft(loading?.getAttribute('aria-live')).toBe('polite');
      expect.soft(loading?.getAttribute('aria-busy')).toBe('true');
      expect.soft(loading?.textContent).toBe('Preparando el formulario');
      expect.soft(renderer).not.toHaveBeenCalled();

      await act(async () => rejectTools(new Error('Tools WASM failed to load')));
      expect(container.querySelector('[data-probe="slot-unavailable"]')?.textContent)
        .toBe('Faltan datos para mostrar el formulario');
    } finally {
      act(() => root.unmount());
      container.remove();
      toolsReady.mockRestore();
      initTools.mockRestore();
    }
  });

  it('keeps the page mounted when the engine refuses the ffy-year key', async () => {
    await engine.initFormspecEngineTools();
    const container = document.body.appendChild(document.createElement('div'));
    const onUncaughtError = vi.fn();
    const root = createRoot(container, { onUncaughtError });
    const bundle = filingYearFixture('ffy-year');
    bundle.surfaces[0]!.routes[0]!.title = 'Annual filing';

    try {
      await act(async () => root.render(<SurfaceApp bundle={bundle} location="/units/2026" onNavigate={() => {}}
        setDocumentTitle={false} />));
      expect(onUncaughtError).not.toHaveBeenCalled();
      expect(container.querySelector('h1')?.textContent).toBe('Annual filing');
      expect(container.querySelector('[data-probe="slot-unavailable"]')?.textContent)
        .toBe('This part of the page cannot load the information it needs.');
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it('uses the host strings when a delegating renderer supplies a refused key value', async () => {
    await engine.initFormspecEngineTools();
    const renderer: SurfaceDefinitionFormRenderer = input => renderDefaultDefinitionForm({
      ...input,
      responseSubject: { type: FILING_YEAR_SUBJECT_TYPE, keys: { ffy: '2026' }, id: FILING_YEAR_2026_SUBJECT_ID },
    });
    const container = render(<SurfaceApp bundle={filingYearFixture()} location="/units/2026" onNavigate={() => {}}
      renderDefinitionForm={renderer} strings={{ slotUnavailableWidgetData: 'Formulario no disponible' }}
      setDocumentTitle={false} />);
    expect(container.querySelector('[data-probe="slot-unavailable"]')?.textContent).toBe('Formulario no disponible');
  });
});

describe('renderDefinitionForm', () => {
  it('reuses native Component and exact Definition Locale resources without resetting entered data', () => {
    const bundle = fixture();
    const definition = bundle.definitions.get(DEFINITION_REF)!;
    definition.items = [{ type: 'field', key: 'name', dataType: 'string', label: 'Name' }];
    const componentDocument = {
      $formspecComponent: '1.2', version: '1.0.0', targetDefinition: { url: DEFINITION_REF },
      tree: { component: 'Stack', children: [
        { component: 'Text', text: 'Native Component layout' }, { component: 'TextInput', bind: 'name' },
      ] },
    };
    const localeDocuments = [
      { $formspecLocale: '2.0', version: '1.0.0', locale: 'es-US', target: { kind: 'definition', url: DEFINITION_REF }, strings: { 'name.label': 'Nombre' } },
      { $formspecLocale: '2.0', version: '1.0.0', locale: 'en', target: { kind: 'definition', url: DEFINITION_REF }, strings: { 'name.label': 'Name' } },
      { $formspecLocale: '2.0', version: '1.0.0', locale: 'es-US', target: { kind: 'definition', url: 'urn:other-definition' }, strings: { 'name.label': 'Wrong target' } },
    ];
    let activeLocale = 'es-US';
    const renderer: SurfaceDefinitionFormRenderer = input => renderDefaultDefinitionForm({
      ...input, componentDocument, localeDocuments, activeLocale,
    } as any);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const show = () => root.render(<SurfaceApp bundle={bundle} location="/apply" onNavigate={() => {}}
      renderDefinitionForm={renderer} setDocumentTitle={false} />);
    act(show);
    expect(container.textContent).toContain('Native Component layout');
    expect(container.textContent).toContain('Nombre');
    expect(container.textContent).not.toContain('Wrong target');
    const input = container.querySelector('input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'User entry');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    activeLocale = 'en';
    act(show);
    expect(container.textContent).toContain('Name');
    expect(container.querySelector('input')!.value).toBe('User entry');
  });
  it('publishes the default form slot only while its renderer is mounted', () => {
    const registry = createSurfaceSemanticOutputRegistry();
    const resolveSemanticOutputScope =
      createSurfaceSemanticOutputScopeResolver({
        registry,
        surfaceArtifactFor: ({ route }) =>
          route.surfaceRef
            ? {
                artifactRef: route.surfaceRef,
                artifactDigest: `sha256:${'s'.repeat(64)}`,
              }
            : undefined,
        renderInstanceIdFor: () => 'render:respondent:apply',
      });
    const target = {
      renderInstanceId: 'render:respondent:apply',
      node: {
        artifactRef: SURFACE_REF,
        artifactDigest: `sha256:${'s'.repeat(64)}`,
        subjectKind: 'surface-node' as const,
        subjectRef: 'apply/form',
      },
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <SurfaceApp
          bundle={fixture()}
          location="/apply"
          onNavigate={() => {}}
          resolveSemanticOutputScope={resolveSemanticOutputScope}
          setDocumentTitle={false}
        />,
      );
    });
    expect(registry.lookup(target)).toMatchObject({
      status: 'resolved',
      output: { rendered: true },
    });

    act(() => root.unmount());
    expect(registry.lookup(target)).toMatchObject({ status: 'missing' });

    const customContainer = document.createElement('div');
    document.body.appendChild(customContainer);
    const customRoot = createRoot(customContainer);
    act(() => {
      customRoot.render(
        <SurfaceApp
          bundle={fixture()}
          location="/apply"
          onNavigate={() => {}}
          renderDefinitionForm={() => <div data-probe="custom-form" />}
          resolveSemanticOutputScope={resolveSemanticOutputScope}
          setDocumentTitle={false}
        />,
      );
    });
    expect(registry.lookup(target)).toMatchObject({ status: 'missing' });
    act(() => customRoot.unmount());
  });

  it('receives the resolved plan, route grant/context, and selected action document', () => {
    const renderer = vi.fn<SurfaceDefinitionFormRenderer>(
      ({ plan, grant, route, responseActionsDocument }) => (
        <div
          data-probe="custom-form"
          data-definition={plan.definitionRef}
          data-theme={grant.posture}
          data-route={route.routeId}
          data-action={responseActionsDocument?.actions?.[0]?.id}
        />
      ),
    );
    const container = render(
      <SurfaceApp
        bundle={fixture()}
        location="/apply"
        onNavigate={() => {}}
        renderDefinitionForm={renderer}
        setDocumentTitle={false}
      />,
    );

    expect(container.querySelector('[data-probe="custom-form"]')).toMatchObject({
      dataset: {
        definition: DEFINITION_REF,
        theme: 'admits',
        route: 'apply',
        action: 'submitApplication',
      },
    });
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer.mock.calls[0]?.[0]).toMatchObject({
      plan: { slotType: 'definition-form', status: 'ready', definitionRef: DEFINITION_REF },
      route: {
        surfaceId: 'respondent',
        surfaceRef: SURFACE_REF,
        routeId: 'apply',
      },
      responseActionsDocument: {
        actions: [{ id: 'submitApplication' }],
      },
    });
  });

  it('pairs one generic Surface form with a caller-supplied semantic-control scope', () => {
    const bundle = fixture();
    const definition = bundle.definitions.get(DEFINITION_REF);
    const actions = bundle.responseActions[0];
    if (!definition || !actions) throw new Error('semantic pairing fixture is incomplete');
    const registry = createSemanticControlRegistry();
    const pairedResolver = createSurfaceSemanticControlScopeResolver({
      registry,
      definitionArtifacts: new Map([[
        definition,
        {
          artifactRef: DEFINITION_REF,
          artifactDigest: `sha256:${'d'.repeat(64)}`,
        },
      ]]),
      responseActionsArtifacts: new Map([[
        actions,
        {
          artifactRef: 'https://example.test/actions/application',
          artifactDigest: `sha256:${'a'.repeat(64)}`,
        },
      ]]),
      renderInstanceIdFor: (request) =>
        `render:${request.route.surfaceId}:${request.route.routeId}`,
      responseBindingFor: () => ({
        responseId: 'response-application-1',
        responseRevision: 0,
      }),
    });
    const resolveSemanticControlScope = vi.fn(
      (request: SurfaceSemanticControlScopeRequest) => pairedResolver(request),
    );
    const renderer = vi.fn<SurfaceDefinitionFormRenderer>(
      ({ semanticControlScope }) => (
        <div
          data-probe="semantic-form"
          data-render-instance={semanticControlScope?.renderInstanceId}
          data-response={semanticControlScope?.responseId}
        />
      ),
    );

    const container = render(
      <SurfaceApp
        bundle={bundle}
        location="/apply"
        onNavigate={() => {}}
        renderDefinitionForm={renderer}
        resolveSemanticControlScope={resolveSemanticControlScope}
        setDocumentTitle={false}
      />,
    );

    expect(container.querySelector('[data-probe="semantic-form"]')).toMatchObject({
      dataset: {
        renderInstance: 'render:respondent:apply',
        response: 'response-application-1',
      },
    });
    expect(resolveSemanticControlScope).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          definitionRef: DEFINITION_REF,
          definition: expect.any(Object),
        }),
        route: expect.objectContaining({
          surfaceId: 'respondent',
          routeId: 'apply',
        }),
        responseActionsDocument: expect.objectContaining({
          actions: [{ id: 'submitApplication', intent: 'submit' }],
        }),
        runtimeGeneration: expect.any(String),
      }),
    );
    const request = resolveSemanticControlScope.mock.calls[0]?.[0];
    if (!request) throw new Error('scope resolver request was not captured');
    const unpairedResolver = createSurfaceSemanticControlScopeResolver({
      registry,
      definitionArtifacts: new Map(),
      responseActionsArtifacts: new Map(),
      renderInstanceIdFor: () => 'render-unpaired',
      responseBindingFor: () => ({
        responseId: 'response-unpaired',
        responseRevision: 0,
      }),
    });
    expect(unpairedResolver(request)).toBeUndefined();
  });

  it('renders manifested human References as Need-traced help without exposing agent or ontology data', () => {
    const bundle = fixture();
    const definition = bundle.definitions.get(DEFINITION_REF);
    if (!definition) throw new Error('Definition fixture is missing');
    definition.items = [
      {
        key: 'email',
        type: 'field',
        label: 'Contact email',
        dataType: 'string',
        semanticType: 'contact-email',
      },
    ];

    const references = {
      $formspecReferences: '1.0',
      version: '1.0.0',
      targetDefinition: { url: DEFINITION_REF },
      references: [
        {
          id: 'human-email-help',
          target: 'email',
          type: 'documentation',
          audience: 'human',
          title: 'Which email should I use?',
          content: 'Use an inbox you check regularly.',
          'x-generation': {
            anchors: [HELP_NEED],
          },
        },
        {
          id: 'agent-email-context',
          target: 'email',
          type: 'knowledge-base',
          audience: 'agent',
          title: 'Agent-only contact enrichment',
          content: 'Never render this retrieval instruction.',
          'x-generation': {
            anchors: [HELP_NEED],
          },
        },
        {
          id: 'human-agent-scheme',
          target: 'email',
          type: 'documentation',
          audience: 'human',
          title: 'Internal help index',
          uri: 'vectorstore:email-help',
          'x-generation': {
            anchors: [HELP_NEED],
          },
        },
      ],
    } as ReferencesDocument;
    const ontology = {
      $formspecOntology: '1.0',
      version: '1.0.0',
      targetDefinition: { url: DEFINITION_REF },
      defaultSystem: 'https://ontology.example.test/contact',
      concepts: {
        email: {
          concept: 'https://ontology.example.test/contact/email-address',
          display: 'Contact email address',
        },
      },
    } as OntologyDocument;
    bundle.references = [references];
    bundle.ontologies = [ontology];

    const container = render(
      <SurfaceApp
        bundle={bundle}
        location="/apply"
        onNavigate={() => {}}
        setDocumentTitle={false}
      />,
    );

    const help = container.querySelector('.formspec-field-help');
    expect(help?.textContent).toContain('Which email should I use?');
    expect(help?.textContent).toContain('Use an inbox you check regularly.');
    expect(help?.getAttribute('data-need-anchors')).toBe(HELP_NEED);
    expect(container.textContent).not.toContain('Agent-only contact enrichment');
    expect(container.textContent).not.toContain('Never render this retrieval instruction.');
    expect(container.textContent).toContain('Internal help index');
    expect(container.querySelector('a[href^="vectorstore:"]')).toBeNull();
    expect(container.innerHTML).not.toContain('ontology.example.test');
  });

  it('shows help only from References bound to this Definition and fails closed on a broken $ref', () => {
    const helpFor = (url: string, extra: ReferencesDocument['references'] = []) => ({
      $formspecReferences: '1.0',
      version: '1.0.0',
      targetDefinition: { url },
      references: [
        { target: '#', type: 'documentation', audience: 'human', title: `Help from ${url}`, content: 'Read me.' },
        ...extra,
      ],
    }) as ReferencesDocument;
    const renderWith = (references: ReferencesDocument[]) => {
      const bundle = fixture();
      bundle.definitions.get(DEFINITION_REF)!.items = [
        { key: 'email', type: 'field', label: 'Contact email', dataType: 'string' },
      ];
      bundle.references = references;
      return render(
        <SurfaceApp bundle={bundle} location="/apply" onNavigate={() => {}} setDocumentTitle={false} />,
      );
    };

    const scoped = renderWith([helpFor(DEFINITION_REF), helpFor('https://example.test/definitions/other')]);
    expect(scoped.textContent).toContain(`Help from ${DEFINITION_REF}`);
    expect(scoped.textContent).not.toContain('definitions/other');

    const broken = renderWith([
      helpFor(DEFINITION_REF),
      helpFor(DEFINITION_REF, [{ target: '#', $ref: '#/referenceDefs/missing' }]),
    ]);
    expect(broken.querySelector('.formspec-field-help')).toBeNull();
    expect(broken.querySelector('input')).not.toBeNull();
  });
});
