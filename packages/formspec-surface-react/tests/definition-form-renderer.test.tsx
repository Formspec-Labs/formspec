/** @filedesc Narrow host form-runtime callback through App -> Route -> Slot. */
import { describe, expect, it, vi } from 'vitest';
import type {
  FormDefinition,
  ResponseActionsDocument,
  SurfaceDocument,
} from '@formspec-org/types';
import type { ResolvedBundle } from '@formspec-org/surface';
import { SurfaceApp } from '../src/SurfaceApp.js';
import type { SurfaceDefinitionFormRenderer } from '../src/SurfaceSlot.js';
import { render } from './render.js';

const DEFINITION_REF = 'https://example.test/definitions/application';
const SURFACE_REF = 'https://example.test/surfaces/respondent';

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
});
