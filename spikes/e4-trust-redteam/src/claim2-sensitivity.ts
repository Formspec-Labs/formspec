/**
 * @filedesc Claim 2 — sensitivity annotation. A Data Sources catalog routing
 * live respondent PII and a webhook signing secret into the slot an AI
 * co-pilot renders (spike v8 finding 27).
 *
 * Two things are being measured, and they are different:
 *
 *   (a) Can the violating shape be authored? Yes — `data-sources.schema.json`
 *       has no sensitivity/classification field anywhere, so routing PII to an
 *       assistant slot is indistinguishable from routing a page title there.
 *   (b) Does anything check it? `dataSources` appears in exactly one file in
 *       `packages/formspec-app-graph/src/` — the ArtifactResolver's slot table.
 *       No cross-artifact validator reads the group. The `dangling-*` control
 *       source below proves that directly: its availability points at a slot id
 *       that does not exist on any route, and the graph still validates.
 */
import type { RedTeamCase } from './harness.js';

const APP = 'https://cloud.formspec.org/apps/workspace';
const SURFACE_URL = `${APP}/surfaces/workspace`;
const REGISTRY_URL = `${APP}/registries/copilot`;
const DATA_SOURCES_URL = `${APP}/data-sources/workspace`;
const DEFINITION_URL = 'https://cloud.formspec.org/definitions/benefits-intake';

const COPILOT_MODULE = { id: 'x-formspec-copilot', version: '1.0.0' };

/**
 * Workspace Surface. `copilot-panel` is the assistant-facing slot: a
 * module-widget contributed by the AI co-pilot module. The graph records that
 * this slot is a widget; it records nothing about the widget being an LLM
 * context sink.
 */
const surface = {
  $formspecSurface: '0.1',
  id: 'workspace',
  entry: 'form-edit',
  modules: [COPILOT_MODULE],
  title: 'Form workspace with AI co-pilot',
  routes: [
    {
      id: 'form-edit',
      path: '/forms/{formId}/edit',
      routeClass: 'operation',
      title: 'Edit form',
      params: [{ name: 'formId', type: 'string' }],
      slots: [
        {
          id: 'editor',
          slotType: 'definition-form',
          title: 'Spec editor',
          binding: { definitionRef: DEFINITION_URL },
        },
        {
          id: 'copilot-panel',
          slotType: 'module-widget',
          title: 'Ask the co-pilot',
          binding: { moduleId: COPILOT_MODULE.id, widgetName: 'x-assistant-panel' },
        },
      ],
    },
  ],
};

const registry = {
  $formspecRegistry: '1.0',
  publisher: { name: 'Formspec Cloud' },
  published: '2026-07-26T00:00:00Z',
  entries: [
    {
      name: COPILOT_MODULE.id,
      category: 'module',
      version: '1.0.0',
      status: 'stable',
      description: 'AI co-pilot module. Reads the resolved app graph as LLM context.',
      compatibility: { formspecVersion: '>=1.0.0' },
      contributes: ['x-assistant-panel'],
    },
    {
      name: 'x-assistant-panel',
      category: 'widget',
      version: '1.0.0',
      status: 'stable',
      description: 'Conversational assistant panel. Projects every advertised Data Source into prompt context.',
      compatibility: { formspecVersion: '>=1.0.0' },
      widgetShape: { tokenSlots: [{ name: 'accent', acceptedTokenCategories: ['color'] }] },
    },
  ],
};

/**
 * Minimal Definition so the `definition-form` slot resolves. Note what these
 * two items are: an SSN and a date of birth. `semanticType` is the closest the
 * Definition schema comes to a classification hook, and its own description
 * says it is "purely metadata — MUST NOT affect validation or behavior", so it
 * cannot gate a projection either.
 */
const definition = {
  $formspec: '1.0',
  url: DEFINITION_URL,
  version: '1.0.0',
  status: 'active',
  title: 'Benefits intake',
  items: [
    {
      key: 'ssn',
      type: 'field',
      dataType: 'string',
      label: 'Social Security Number',
      semanticType: 'us-gov:ssn',
    },
    { key: 'dob', type: 'field', dataType: 'date', label: 'Date of birth' },
  ],
};

/**
 * The violating catalog. Every field below is the shipped shape; nothing is an
 * `x-` workaround. Read each source and ask what stops it reaching an LLM:
 *
 * - `response:applicant-draft` — live draft Response state (SSN, DOB) advertised
 *   *at the co-pilot slot*. `delivery: draft` means the assistant sees keystrokes.
 * - `resource:webhook-signing-secret` — a signing secret advertised to the
 *   co-pilot module. `authorizationBoundary: module` is the strongest statement
 *   the schema can make, and its own description says it is coarse admission,
 *   not authorization.
 * - `host:respondent-identity` — identity attributes advertised app-wide.
 * - `query:dangling-control` — control probe: availability points at slot
 *   `no-such-slot` on route `no-such-route`. If the graph validated Data Sources
 *   at all, this is the cheapest possible thing to catch.
 */
const dataSources = {
  $formspecDataSources: '1.0',
  id: DATA_SOURCES_URL,
  version: '1.0.0',
  title: 'Workspace data sources',
  sources: [
    {
      id: 'response:applicant-draft',
      kind: 'definition-response',
      definitionRef: DEFINITION_URL,
      owner: 'host',
      scope: 'definition',
      description: 'Live draft Response for the open intake, including SSN and date of birth.',
      availability: {
        level: 'slot',
        surfaceRef: SURFACE_URL,
        routeRef: 'form-edit',
        slotId: 'copilot-panel',
      },
      runtime: {
        delivery: 'draft',
        cache: { mode: 'draft' },
        authorizationBoundary: 'module',
        failureMode: 'empty-state',
        provenance: { kind: 'definition-response', source: 'draft-response' },
      },
    },
    {
      id: 'resource:webhook-signing-secret',
      kind: 'document-resource',
      owner: 'host',
      scope: 'resource',
      description: 'Current webhook signing secret for the workspace.',
      availability: { level: 'module', moduleId: COPILOT_MODULE.id },
      runtime: {
        delivery: 'snapshot',
        cache: { mode: 'snapshot', staleAfter: 'PT5M' },
        authorizationBoundary: 'module',
        failureMode: 'empty-state',
        provenance: { kind: 'document-resource', source: 'vault://workspace/webhook-signing-secret' },
      },
    },
    {
      id: 'host:respondent-identity',
      kind: 'host-state',
      owner: 'host',
      scope: 'session',
      description: 'Verified respondent identity attributes for the open session.',
      availability: { level: 'app' },
      runtime: {
        delivery: 'snapshot',
        cache: { mode: 'snapshot' },
        authorizationBoundary: 'host',
        failureMode: 'empty-state',
        provenance: { kind: 'host-state', source: 'host://identity/respondent' },
      },
    },
    {
      id: 'query:dangling-control',
      kind: 'query-result',
      owner: 'host',
      scope: 'route',
      description: 'Control probe — availability targets a slot and route that do not exist.',
      availability: {
        level: 'slot',
        surfaceRef: SURFACE_URL,
        routeRef: 'no-such-route',
        slotId: 'no-such-slot',
      },
      runtime: {
        delivery: 'snapshot',
        cache: { mode: 'snapshot' },
        authorizationBoundary: 'host',
        failureMode: 'empty-state',
        provenance: { kind: 'query-result', source: 'query://nowhere' },
      },
    },
  ],
};

const manifest = {
  $formspecBundle: '2.3',
  version: '1.0.0',
  id: APP,
  title: 'Formspec Cloud — workspace with AI co-pilot',
  definitions: [{ url: DEFINITION_URL, version: '1.0.0' }],
  modules: [COPILOT_MODULE],
  registries: [{ url: REGISTRY_URL, version: '1.0.0' }],
  surfaces: [{ url: SURFACE_URL, version: '1.0.0' }],
  dataSources: [{ url: DATA_SOURCES_URL, version: '1.0.0' }],
};

export const sensitivityCase: RedTeamCase = {
  id: 'claim2-sensitivity',
  claim:
    'The product ships an AI co-pilot that consumes the same app graph, so the graph must be able to say which data is sensitive before a projection reads it.',
  v8Finding: 27,
  violation:
    'A Data Sources catalog advertises live draft Response state (SSN, DOB) at the co-pilot slot and a webhook signing secret to the co-pilot module, with no field anywhere marking either as sensitive. A fourth source points at a nonexistent route/slot as a control.',
  manifest,
  manifestSource: 'e4://claim2/app-manifest',
  documents: {
    [SURFACE_URL]: surface,
    [REGISTRY_URL]: registry,
    [DEFINITION_URL]: definition,
    [DATA_SOURCES_URL]: dataSources,
  },
  /**
   * Empty for the same reason as claim 1: no diagnostic code in the producer
   * mentions Data Sources at all. The `dangling-control` source is the falsifier
   * — if ANY code fires on it, the group is wired and the prediction is wrong
   * for the mechanical half of this claim.
   */
  wouldCatch: [],
};

export const CLAIM2_SURFACE_URL = SURFACE_URL;
