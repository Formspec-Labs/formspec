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

/** Tenant brand tokens painted onto the certificate widget. */
const tenantThemePolicy = {
  $formspecUiGraphPolicy: '0.1',
  version: '1.0.0',
  targetSurface: { url: SURFACE_URL, version: '1.0.0' },
  routePolicies: [{ routeId: 'certificate' }],
  theme: {
    assignments: [{
      widgetRef: { moduleId: TENANT_MODULE, widgetName: CERTIFICATE_WIDGET },
      slot: 'accent',
      token: 'color.accent',
    }],
  },
};

function requestFor(routeClass?: string): AppGraphValidationRequest {
  return {
    manifest,
    artifacts: { surfaces: [surfaceHandle(routeClass)], theme: [theme] },
    hostEvidence: {
      uiGraphPolicies: [{
        schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
        source: POLICY_SOURCE,
        document: tenantThemePolicy,
      }],
    },
    schemaValidators: () => ({ ok: true }),
    evidenceSchemaValidators: () => ({ ok: true }),
    moduleResolution,
  } as AppGraphValidationRequest;
}

function codesFor(routeClass?: string): string[] {
  return validateAppGraph(requestFor(routeClass)).diagnostics.map((entry) => entry.code);
}

describe('UI Graph Policy route-class theme authority', () => {
  for (const routeClass of ['proof', 'ceremony', 'verification'] as const) {
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
          reason: 'tenant-theming-refused-by-route-class',
        },
      });
    });
  }

  it('names the Surface slot binding that put the widget on the protected route', () => {
    const report = validateAppGraph(requestFor('proof'));
    const diagnostic = report.diagnostics.find((entry) => entry.code === 'THEME-ROUTE-CLASS');

    expect(diagnostic?.relatedSources).toEqual([{
      artifactSlot: 'surfaces[0]',
      artifactKind: 'surface',
      source: 'memory://surface/proof',
      ref: { url: SURFACE_URL, version: '1.0.0' },
      jsonPointer: '/routes/0/slots/0/binding',
    }]);
  });

  it('admits the same assignment on an intake-class route', () => {
    expect(codesFor('intake')).toEqual([]);
  });

  it('admits the same assignment on an operation-class route', () => {
    expect(codesFor('operation')).toEqual([]);
  });

  it('admits the same assignment on an unclassified route', () => {
    // Decision B: absent routeClass is `unclassified`, not `operation`. It carries
    // no substrate trust claim, so the rule cannot fire — every Surface authored
    // before this concept keeps its exact current behavior.
    expect(codesFor(undefined)).toEqual([]);
  });
});
