/** @filedesc Narrow host form-runtime callback through App -> Route -> Slot. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine';
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
import { createSurfaceSemanticControlScopeResolver } from '../src/SurfaceSlot.js';
import type {
  SurfaceDefinitionFormRenderer,
  SurfaceSemanticControlScopeRequest,
} from '../src/SurfaceSlot.js';
import { createSemanticControlRegistry } from '@formspec-org/react';
import { render } from './render.js';

const DEFINITION_REF = 'https://example.test/definitions/application';
const SURFACE_REF = 'https://example.test/surfaces/respondent';
const HELP_NEED = 'need:understand-contact-email@1';

beforeAll(async () => {
  await initFormspecEngine();
});

function fixture(): ResolvedBundle {
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
    actions: [{ id: 'submitApplication', intent: 'submit' }],
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

describe('renderDefinitionForm', () => {
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
