/**
 * @filedesc Claim 1 — theme authority. A tenant Theme + UI Graph Policy that
 * restyles the certificate and verifier surfaces, which the product's trust
 * story says MUST NOT be tenant-themed (spike v8 finding 6).
 *
 * The attack uses no workaround and no extension field. Every artifact below is
 * the shipped shape: `theme` on the App Manifest, `theme.assignments[]` on the
 * UI Graph Policy, a Registry that admits the tenant's own widget module. The
 * only thing that makes it a violation is *which routes* the widgets sit on —
 * and route class is exactly what no artifact in the graph records.
 */
import type { UiGraphPolicyDocument } from '@formspec-org/types';
import type { RedTeamCase } from './harness.js';

const APP = 'https://cloud.formspec.org/apps/proof';
const SURFACE_URL = `${APP}/surfaces/proof`;
const REGISTRY_URL = `${APP}/registries/tenant-brand`;
const THEME_URL = `${APP}/themes/northwind-tenant`;

/** Tenant module contributing the two widgets that render proof surfaces. */
const TENANT_MODULE = { id: 'x-northwind-brand', version: '1.0.0' };

/**
 * Proof Surface. Both routes are trust-claim surfaces in the product's own
 * vocabulary: `/verify` is the independent verifier, `/c/{receiptId}` is the
 * issued certificate. Neither route carries any marker distinguishing it from
 * a tenant-themeable form route — the Surface schema has no such field.
 */
const surface = {
  $formspecSurface: '0.1',
  id: 'proof',
  entry: 'verify',
  modules: [TENANT_MODULE],
  title: 'Proof surfaces',
  routes: [
    {
      id: 'verify',
      path: '/verify',
      title: 'Verify a receipt',
      slots: [
        {
          id: 'verifier-panel',
          slotType: 'module-widget',
          title: 'Independent verifier',
          binding: { moduleId: TENANT_MODULE.id, widgetName: 'x-verification-panel' },
        },
      ],
    },
    {
      id: 'certificate',
      path: '/c/{receiptId}',
      title: 'Signing certificate',
      params: [{ name: 'receiptId', type: 'string' }],
      slots: [
        {
          id: 'certificate-body',
          slotType: 'module-widget',
          title: 'Certificate of completion',
          binding: { moduleId: TENANT_MODULE.id, widgetName: 'x-certificate-sheet' },
        },
      ],
    },
  ],
};

/** Registry admitting the tenant's brand module and its two proof widgets. */
const registry = {
  $formspecRegistry: '1.0',
  publisher: { name: 'Northwind Mutual (tenant)' },
  published: '2026-07-26T00:00:00Z',
  entries: [
    {
      name: TENANT_MODULE.id,
      category: 'module',
      version: '1.0.0',
      status: 'stable',
      description: 'Tenant brand module contributing proof-surface widgets.',
      compatibility: { formspecVersion: '>=1.0.0' },
      contributes: ['x-verification-panel', 'x-certificate-sheet'],
    },
    {
      name: 'x-verification-panel',
      category: 'widget',
      version: '1.0.0',
      status: 'stable',
      description: 'Renders the receipt verification result.',
      compatibility: { formspecVersion: '>=1.0.0' },
      widgetShape: {
        tokenSlots: [
          { name: 'accent', acceptedTokenCategories: ['color'] },
          { name: 'surface', acceptedTokenCategories: ['color'] },
        ],
      },
    },
    {
      name: 'x-certificate-sheet',
      category: 'widget',
      version: '1.0.0',
      status: 'stable',
      description: 'Renders the issued certificate of completion.',
      compatibility: { formspecVersion: '>=1.0.0' },
      widgetShape: {
        tokenSlots: [
          { name: 'accent', acceptedTokenCategories: ['color'] },
          { name: 'surface', acceptedTokenCategories: ['color'] },
        ],
      },
    },
  ],
};

/**
 * Tenant-owned Theme. Platform token categories, tenant brand values.
 *
 * `targetDefinition` is REQUIRED by `theme.schema.json` even though this Theme
 * paints two routes that render no Definition — the Theme artifact is
 * form-realization-shaped, so the only way to bind a Theme to proof surfaces is
 * to point it at an unrelated Definition and let the UI Graph Policy do the
 * actual assignment. Recorded as a side observation, not the violation.
 */
const theme = {
  $formspecTheme: '1.0',
  version: '1.0.0',
  name: 'northwind-tenant',
  targetDefinition: { url: `${APP}/definitions/unused` },
  tokens: {
    'color.accent': '#6D28D9',
    'color.surface': '#F5F3FF',
  },
};

const manifest = {
  $formspecBundle: '2.3',
  version: '1.0.0',
  id: APP,
  title: 'Formspec Cloud — proof surfaces (tenant-themed)',
  definitions: [],
  modules: [TENANT_MODULE],
  registries: [{ url: REGISTRY_URL, version: '1.0.0' }],
  surfaces: [{ url: SURFACE_URL, version: '1.0.0' }],
  theme: { url: THEME_URL, version: '1.0.0' },
};

/**
 * The violating policy. Both assignments repaint a proof surface in tenant
 * brand colours. Authored through the shipped `declareUiGraphPolicy` verb in
 * the test — this object is the document that verb returns.
 */
export const violatingPolicy: UiGraphPolicyDocument = {
  $formspecUiGraphPolicy: '0.1',
  version: '1.0.0',
  title: 'Northwind tenant branding for proof surfaces',
  targetSurface: { url: SURFACE_URL, version: '1.0.0' },
  routePolicies: [
    { routeId: 'verify', a11y: { landmark: 'main', keyboardNavigation: true } },
    { routeId: 'certificate', a11y: { landmark: 'main', keyboardNavigation: true } },
  ],
  theme: {
    assignments: [
      {
        widgetRef: { moduleId: TENANT_MODULE.id, widgetName: 'x-certificate-sheet' },
        slot: 'accent',
        token: 'color.accent',
      },
      {
        widgetRef: { moduleId: TENANT_MODULE.id, widgetName: 'x-certificate-sheet' },
        slot: 'surface',
        token: 'color.surface',
      },
      {
        widgetRef: { moduleId: TENANT_MODULE.id, widgetName: 'x-verification-panel' },
        slot: 'accent',
        token: 'color.accent',
      },
    ],
  },
} as UiGraphPolicyDocument;

export const themeAuthorityCase = (policy: UiGraphPolicyDocument): RedTeamCase => ({
  id: 'claim1-theme-authority',
  claim:
    'Tenants may theme form chrome and MUST NOT theme receipt, certificate, verifier, or ceremony surfaces — those surfaces\' visual immutability is part of the proof claim.',
  v8Finding: 6,
  violation:
    'A tenant-owned Theme is bound as the app\'s only Theme, and a tenant-authored UI Graph Policy assigns tenant brand tokens to the accent and surface token slots of the certificate widget and the verifier widget.',
  manifest,
  manifestSource: 'e4://claim1/app-manifest',
  documents: {
    [SURFACE_URL]: surface,
    [REGISTRY_URL]: registry,
    [THEME_URL]: theme,
  },
  uiGraphPolicies: [
    {
      schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
      source: 'e4://claim1/ui-graph-policy',
      document: policy,
    },
  ],
  /**
   * Nothing to list. There is no diagnostic code anywhere in
   * `packages/formspec-app-graph/src/` that names a themed proof surface —
   * the five THEME-* codes all check token/slot/widget *resolution*, never
   * theming authority. An empty list is the pre-registered prediction.
   */
  wouldCatch: [],
});

export const CLAIM1_SURFACE_URL = SURFACE_URL;
