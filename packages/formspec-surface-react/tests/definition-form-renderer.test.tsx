/** @filedesc Narrow host form-runtime callback through App -> Route -> Slot. */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine';
import type {
  FormDefinition,
  OntologyDocument,
  ReferencesDocument,
  ResponseActionsDocument,
  SurfaceDocument,
} from '@formspec-org/types';
import type { ResolvedBundle } from '@formspec-org/surface';
import { SurfaceApp } from '../src/SurfaceApp.js';
import type { SurfaceDefinitionFormRenderer } from '../src/SurfaceSlot.js';
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
});
