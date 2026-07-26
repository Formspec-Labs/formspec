/**
 * @filedesc Route-class theme-authority rule. A tenant Theme token assignment
 * that lands on a proof-bearing route class is refused; the same assignment on
 * an intake or unclassified route is not.
 *
 * This is E4 claim 1 reduced to a unit: the substrate could author a tenant
 * restyle of a certificate and a verifier with zero diagnostics because
 * `surface.schema.json` `Route` could not say what the route was.
 * See `thoughts/experiments/2026-07-26-e4-trust-redteam.md` §Claim 1.
 */
import { describe, expect, it } from 'vitest';
import {
  validateAppGraph,
  type AppGraphValidationRequest,
  type ResolvedArtifactHandle,
} from '../src/index.js';
import {
  ROUTE_CLASS_THEME_AUTHORITY,
  TENANT_THEMING_REFUSING_ROUTE_CLASSES,
} from '../src/ui-graph-policy.js';
import type { ModuleResolutionReport } from '@formspec-org/types';

const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';
const SURFACE_URL = 'https://cloud.formspec.org/apps/proof/surfaces/proof';
const POLICY_SOURCE = 'host://policy/tenant-brand';
const TENANT_MODULE = 'x-northwind-brand';
const CERTIFICATE_WIDGET = 'x-certificate-sheet';

const manifest: ResolvedArtifactHandle = {
  slot: 'app',
  artifactKind: 'appManifest',
  status: 'loaded',
  schemaId: 'https://formspec.org/schemas/bundleManifest/2.3',
  source: 'memory://app',
  document: { $formspecApp: '2.3', id: 'proof-app' },
} as ResolvedArtifactHandle;

const theme: ResolvedArtifactHandle = {
  slot: 'theme',
  artifactKind: 'theme',
  status: 'loaded',
  schemaId: 'https://formspec.org/schemas/theme/1.0',
  source: 'memory://theme/northwind',
  ref: { url: 'https://cloud.formspec.org/apps/proof/themes/northwind', version: '1.0.0' },
  document: {
    $formspecTheme: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://cloud.formspec.org/apps/proof/definitions/unused' },
    tokens: { 'color.accent': '#6D28D9' },
  },
} as ResolvedArtifactHandle;

/** Surface whose single route renders the certificate widget under `routeClass`. */
function surfaceHandle(routeClass?: string): ResolvedArtifactHandle {
  return {
    slot: 'surfaces[0]',
    artifactKind: 'surface',
    status: 'loaded',
    schemaId: 'https://formspec.org/schemas/surface/0.1',
    source: 'memory://surface/proof',
    ref: { url: SURFACE_URL, version: '1.0.0' },
    document: {
      $formspecSurface: '0.1',
      id: 'proof',
      entry: 'certificate',
      routes: [
        {
          id: 'certificate',
          path: '/c/{receiptId}',
          ...(routeClass ? { routeClass } : {}),
          params: [{ name: 'receiptId', type: 'string' }],
          slots: [
            {
              id: 'certificate-body',
              slotType: 'module-widget',
              binding: { moduleId: TENANT_MODULE, widgetName: CERTIFICATE_WIDGET },
            },
          ],
        },
      ],
    },
  } as ResolvedArtifactHandle;
}

/**
 * Surface with author-supplied routes. Used for composition cases, where the
 * class-bearing route and the route that actually binds the widget differ.
 */
function composedSurfaceHandle(entry: string, routes: unknown[]): ResolvedArtifactHandle {
  return {
    slot: 'surfaces[0]',
    artifactKind: 'surface',
    status: 'loaded',
    schemaId: 'https://formspec.org/schemas/surface/0.1',
    source: 'memory://surface/proof',
    ref: { url: SURFACE_URL, version: '1.0.0' },
    document: { $formspecSurface: '0.1', id: 'proof', entry, routes },
  } as ResolvedArtifactHandle;
}

/** A `module-widget` slot binding the certificate widget. */
function widgetSlot(id: string): unknown {
  return {
    id,
    slotType: 'module-widget',
    binding: { moduleId: TENANT_MODULE, widgetName: CERTIFICATE_WIDGET },
  };
}

/** An `embed-route` slot rendering another route of this Surface inside this one. */
function embedSlot(id: string, routeRef: string): unknown {
  return { id, slotType: 'embed-route', binding: { routeRef } };
}

/** ModuleResolver evidence resolving the tenant widget, so THEME-TOKEN-* all pass. */
const moduleResolution = {
  ok: true,
  modules: [{
    ref: { id: TENANT_MODULE, version: '1.0.0' },
    status: 'admitted',
    source: {
      artifactSlot: 'app',
      artifactKind: 'appManifest',
      source: 'memory://app',
      jsonPointer: '/modules/0',
    },
  }],
  documents: [],
  contributions: [{
    site: 'ui-graph-policy.theme.assignments.widgetRef',
    name: CERTIFICATE_WIDGET,
    expectedCategory: 'widget',
    registryCategory: 'widget',
    owningModules: [{ id: TENANT_MODULE, version: '1.0.0' }],
    status: 'resolved',
    source: {
      artifactSlot: 'hostEvidence.uiGraphPolicies[0]',
      artifactKind: 'hostEvidence',
      source: POLICY_SOURCE,
      jsonPointer: '/theme/assignments/0/widgetRef',
    },
    widgetTokenSlots: [{
      name: 'accent',
      acceptedTokenCategories: ['color'],
      source: {
        artifactSlot: 'registries[0]',
        artifactKind: 'registry',
        source: 'memory://registry',
        jsonPointer: '/entries/1/widgetShape/tokenSlots/0',
      },
    }],
  }],
  diagnostics: [],
  summary: {
    modules: 1,
    admittedModules: 1,
    deniedModules: 0,
    documents: 0,
    contributions: 1,
    unresolvedDependencies: 0,
    unresolvedContributions: 0,
    payloadFailures: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
  },
  phase: { phase: 'module-resolution', status: 'completed' },
} as unknown as ModuleResolutionReport;

/**
 * Tenant brand tokens painted onto the certificate widget. `routePolicies`
 * covers every route of the Surface under test so `UI-POLICY-ROUTE-MISSING`
 * never confounds a route-class assertion.
 */
function tenantThemePolicy(routeIds: readonly string[]): unknown {
  return {
    $formspecUiGraphPolicy: '0.1',
    version: '1.0.0',
    targetSurface: { url: SURFACE_URL, version: '1.0.0' },
    routePolicies: routeIds.map((routeId) => ({ routeId })),
    theme: {
      assignments: [{
        widgetRef: { moduleId: TENANT_MODULE, widgetName: CERTIFICATE_WIDGET },
        slot: 'accent',
        token: 'color.accent',
      }],
    },
  };
}

function requestWith(surface: ResolvedArtifactHandle): AppGraphValidationRequest {
  const routeIds = ((surface.document as { routes?: { id: string }[] }).routes ?? [])
    .map((route) => route.id);
  return {
    manifest,
    artifacts: { surfaces: [surface], theme: [theme] },
    hostEvidence: {
      uiGraphPolicies: [{
        schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
        source: POLICY_SOURCE,
        document: tenantThemePolicy(routeIds),
      }],
    },
    schemaValidators: () => ({ ok: true }),
    evidenceSchemaValidators: () => ({ ok: true }),
    moduleResolution,
  } as AppGraphValidationRequest;
}

function requestFor(routeClass?: string): AppGraphValidationRequest {
  return requestWith(surfaceHandle(routeClass));
}

function codesFor(routeClass?: string): string[] {
  return validateAppGraph(requestFor(routeClass)).diagnostics.map((entry) => entry.code);
}

function codesForRoutes(entry: string, routes: unknown[]): string[] {
  return validateAppGraph(requestWith(composedSurfaceHandle(entry, routes)))
    .diagnostics.map((diagnostic) => diagnostic.code);
}

/**
 * The vocabulary is read from the validator's own authority map, never restated
 * here. A new or renamed `routeClass` enum member changes what these tests
 * enumerate without any edit to this file — and breaks the build at
 * `ROUTE_CLASS_THEME_AUTHORITY` if nobody classified it.
 */
const REFUSING_CLASSES: readonly string[] = [...TENANT_THEMING_REFUSING_ROUTE_CLASSES];
const ADMITTING_CLASSES: readonly string[] = Object.keys(ROUTE_CLASS_THEME_AUTHORITY)
  .filter((routeClass) => !REFUSING_CLASSES.includes(routeClass));
/** One representative of each half, for composition cases that need a concrete class. */
const [PROTECTED_CLASS] = REFUSING_CLASSES;
const [ADMITTING_CLASS] = ADMITTING_CLASSES;

describe('UI Graph Policy route-class theme authority', () => {
  it('partitions the whole route-class vocabulary into admitting and refusing', () => {
    expect(REFUSING_CLASSES.length).toBeGreaterThan(0);
    expect(ADMITTING_CLASSES.length).toBeGreaterThan(0);
    expect([...REFUSING_CLASSES, ...ADMITTING_CLASSES].sort())
      .toEqual(Object.keys(ROUTE_CLASS_THEME_AUTHORITY).sort());
  });

  it('admits tenant chrome theming on `intake` and on nothing else', () => {
    // The rule, as one bit. ADR 0159 §The rendering ring: `intake` is the only
    // admitting value, which is what makes `surface-spec.md` §3's "admitted here
    // and only here" true and lets §5.7 stop enumerating refusers. The literal
    // is deliberate — every other assertion in this file derives from the map,
    // so a value silently flipped to `admits` would go undetected here.
    expect(ADMITTING_CLASSES).toEqual(['intake']);
  });

  it('refuses on the whole closed vocabulary except `intake`', () => {
    // Pins the corrected set itself, not just its partition. `operation` flipped
    // from `admits` — a residual bucket on the permissive side of the only rule
    // keyed on the vocabulary is fail-open (closure test §1) — and `attestation`
    // / `authentication` are the two values the corpus needed and the shipped
    // five could not name.
    expect([...REFUSING_CLASSES].sort()).toEqual([
      'attestation',
      'authentication',
      'ceremony',
      'operation',
      'proof',
      'verification',
    ]);
  });

  for (const routeClass of REFUSING_CLASSES) {
    it(`refuses a tenant Theme token assignment bound on a ${routeClass}-class route`, () => {
      const report = validateAppGraph(requestFor(routeClass));

      expect(report.phases).toContainEqual({ phase: 'cross-artifact', status: 'completed' });
      expect(report.diagnostics.map((entry) => entry.code)).toContain('THEME-ROUTE-CLASS');
      expect(report.ok).toBe(false);
      expect(report.diagnostics.find((entry) => entry.code === 'THEME-ROUTE-CLASS')).toMatchObject({
        severity: 'error',
        phase: 'cross-artifact',
        origin: 'ui-graph-policy',
        primarySource: {
          artifactSlot: 'hostEvidence.uiGraphPolicies[0]',
          source: POLICY_SOURCE,
          jsonPointer: '/theme/assignments/0/widgetRef',
        },
        details: {
          moduleId: TENANT_MODULE,
          widgetName: CERTIFICATE_WIDGET,
          slot: 'accent',
          token: 'color.accent',
          routeId: 'certificate',
          routeClass,
          embedChain: ['certificate'],
          reason: 'tenant-theming-refused-by-route-class',
        },
      });
    });
  }

  it('names the Surface slot binding that put the widget on the protected route', () => {
    const report = validateAppGraph(requestFor(PROTECTED_CLASS));
    const diagnostic = report.diagnostics.find((entry) => entry.code === 'THEME-ROUTE-CLASS');

    expect(diagnostic?.relatedSources).toEqual([{
      artifactSlot: 'surfaces[0]',
      artifactKind: 'surface',
      source: 'memory://surface/proof',
      ref: { url: SURFACE_URL, version: '1.0.0' },
      jsonPointer: '/routes/0/slots/0/binding',
    }]);
  });

  for (const routeClass of ADMITTING_CLASSES) {
    it(`admits the same assignment on a ${routeClass}-class route`, () => {
      expect(codesFor(routeClass)).toEqual([]);
    });
  }

  it('admits the same assignment on a route whose routeClass is out of vocabulary', () => {
    // Not protection by accident: an unknown value is `unclassified`, exactly as
    // absence is, and the closed enum in surface.schema.json is what rejects the
    // value itself. `tests/conformance/fixtures/surface/route-class-out-of-vocabulary.surface.json`
    // pins that rejection.
    expect(codesFor('Proof')).toEqual([]);
  });

  it('admits the same assignment on an unclassified route', () => {
    // Decision B: absent routeClass is `unclassified`, not `operation`. It carries
    // no substrate trust claim, so the rule cannot fire — every Surface authored
    // before this concept keeps its exact current behavior.
    expect(codesFor(undefined)).toEqual([]);
  });
});

/**
 * Composition. `embed-route` renders another route of this Surface INSIDE the
 * host route (`surface-spec.md` §6.2), so a widget bound one hop below a
 * protected route is repainted on the protected surface exactly as a directly
 * bound one is. Protection is a property of the rendering context, not of the
 * embedded route's own document: it flows DOWN the embed edges and an embedded
 * route's own class cannot lower it.
 */
describe('UI Graph Policy route-class theme authority through embed-route', () => {
  it('refuses a widget the protected route reaches through one embed hop', () => {
    // The reviewer's reproduction. `certificate` is protected and binds nothing
    // directly; its only slot embeds `certificate-body`, which is unclassified
    // and binds the certificate widget. Before the transitive walk this returned
    // zero diagnostics — the whole guard was restored by one schema-valid hop.
    const report = validateAppGraph(requestWith(composedSurfaceHandle('certificate', [
      {
        id: 'certificate',
        path: '/c/{receiptId}',
        routeClass: PROTECTED_CLASS,
        params: [{ name: 'receiptId', type: 'string' }],
        slots: [embedSlot('body-embed', 'certificate-body')],
      },
      { id: 'certificate-body', path: '/c-body', slots: [widgetSlot('sheet')] },
    ])));

    expect(report.diagnostics.map((entry) => entry.code)).toContain('THEME-ROUTE-CLASS');
    expect(report.ok).toBe(false);
    expect(report.diagnostics.find((entry) => entry.code === 'THEME-ROUTE-CLASS')).toMatchObject({
      relatedSources: [{
        artifactSlot: 'surfaces[0]',
        artifactKind: 'surface',
        source: 'memory://surface/proof',
        ref: { url: SURFACE_URL, version: '1.0.0' },
        // The slot that actually binds the widget — inside the EMBEDDED route.
        jsonPointer: '/routes/1/slots/0/binding',
      }],
      details: {
        routeId: 'certificate',
        routeClass: PROTECTED_CLASS,
        embedChain: ['certificate', 'certificate-body'],
        reason: 'tenant-theming-refused-by-route-class',
      },
    });
  });

  it('refuses a widget two embed hops below the protected route', () => {
    const report = validateAppGraph(requestWith(composedSurfaceHandle('certificate', [
      { id: 'certificate', path: '/c', routeClass: PROTECTED_CLASS, slots: [embedSlot('e1', 'body')] },
      { id: 'body', path: '/body', slots: [embedSlot('e2', 'seal')] },
      { id: 'seal', path: '/seal', slots: [widgetSlot('sheet')] },
    ])));

    expect(report.diagnostics.find((entry) => entry.code === 'THEME-ROUTE-CLASS')?.details)
      .toMatchObject({ embedChain: ['certificate', 'body', 'seal'] });
  });

  it('refuses through an embed cycle instead of looping forever', () => {
    // `routeRef` is constrained to a route id, not to an acyclic graph, so
    // `certificate` ⇄ `panel` is authorable and schema-valid. The walk visits
    // each route once.
    const report = validateAppGraph(requestWith(composedSurfaceHandle('certificate', [
      { id: 'certificate', path: '/c', routeClass: PROTECTED_CLASS, slots: [embedSlot('e1', 'panel')] },
      { id: 'panel', path: '/panel', slots: [embedSlot('e2', 'certificate'), widgetSlot('sheet')] },
    ])));

    expect(report.diagnostics.map((entry) => entry.code)).toContain('THEME-ROUTE-CLASS');
    expect(report.diagnostics.find((entry) => entry.code === 'THEME-ROUTE-CLASS')?.details)
      .toMatchObject({ embedChain: ['certificate', 'panel'] });
  });

  it('refuses on a route that embeds itself', () => {
    const report = validateAppGraph(requestWith(composedSurfaceHandle('certificate', [
      {
        id: 'certificate',
        path: '/c',
        routeClass: PROTECTED_CLASS,
        slots: [embedSlot('self', 'certificate'), widgetSlot('sheet')],
      },
    ])));

    expect(report.diagnostics.map((entry) => entry.code)).toContain('THEME-ROUTE-CLASS');
    expect(report.diagnostics.find((entry) => entry.code === 'THEME-ROUTE-CLASS')?.details)
      .toMatchObject({ embedChain: ['certificate'] });
  });

  it('refuses even when the embedded route declares an admitting class of its own', () => {
    // The inheritance decision, stated as a test: an embedded route's own class
    // is a FLOOR on its protection, never a ceiling on its host's. The embedded
    // route still paints on the protected host's surface, so declaring an
    // admitting class one hop down cannot buy back the repaint.
    const report = validateAppGraph(requestWith(composedSurfaceHandle('certificate', [
      { id: 'certificate', path: '/c', routeClass: PROTECTED_CLASS, slots: [embedSlot('e1', 'body')] },
      { id: 'body', path: '/body', routeClass: ADMITTING_CLASS, slots: [widgetSlot('sheet')] },
    ])));

    expect(report.diagnostics.map((entry) => entry.code)).toContain('THEME-ROUTE-CLASS');
    expect(report.diagnostics.find((entry) => entry.code === 'THEME-ROUTE-CLASS')?.details)
      .toMatchObject({ routeId: 'certificate', routeClass: PROTECTED_CLASS });
  });

  it('does not push protection UP from an embedded protected route to its host', () => {
    // Protection is scoped to what the protected route renders. A proof panel
    // embedded in an operator screen does not make the operator chrome around
    // it proof-bearing, so the host's own widget stays themeable.
    expect(codesForRoutes('host', [
      {
        id: 'host',
        path: '/host',
        slots: [widgetSlot('sheet'), embedSlot('e1', 'sealed')],
      },
      {
        id: 'sealed',
        path: '/sealed',
        routeClass: PROTECTED_CLASS,
        slots: [{ id: 'note', slotType: 'static-content', binding: { kind: 'text', content: 'Sealed.' } }],
      },
    ])).toEqual([]);
  });

  it('names each reachable binding once when two protected routes embed the same route', () => {
    const report = validateAppGraph(requestWith(composedSurfaceHandle('certificate', [
      { id: 'certificate', path: '/c', routeClass: PROTECTED_CLASS, slots: [embedSlot('e1', 'shared')] },
      { id: 'receipt', path: '/r', routeClass: PROTECTED_CLASS, slots: [embedSlot('e2', 'shared')] },
      { id: 'shared', path: '/shared', slots: [widgetSlot('sheet')] },
    ])));

    const caught = report.diagnostics.filter((entry) => entry.code === 'THEME-ROUTE-CLASS');
    expect(caught).toHaveLength(1);
    expect(caught[0]?.relatedSources).toHaveLength(1);
    expect(caught[0]?.relatedSources?.[0]?.jsonPointer).toBe('/routes/2/slots/0/binding');
    expect(caught[0]?.details).toMatchObject({ routeId: 'certificate' });
  });

  it('ignores an embed whose routeRef resolves to no route', () => {
    // Lint E607 owns dangling `routeRef`; the theme-authority check must not
    // throw on one, and must not invent a refusal for a widget it cannot reach.
    expect(codesForRoutes('certificate', [
      { id: 'certificate', path: '/c', routeClass: PROTECTED_CLASS, slots: [embedSlot('e1', 'no-such-route')] },
      { id: 'elsewhere', path: '/e', slots: [widgetSlot('sheet')] },
    ])).toEqual([]);
  });

  it('admits an embed chain reached only from an unclassified route', () => {
    expect(codesForRoutes('host', [
      { id: 'host', path: '/host', slots: [embedSlot('e1', 'body')] },
      { id: 'body', path: '/body', slots: [widgetSlot('sheet')] },
    ])).toEqual([]);
  });
});
