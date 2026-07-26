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
const EMBEDDED_SURFACE_URL = `${APP}/surfaces/proof-embedded`;
const UNCLASSIFIED_SURFACE_URL = `${APP}/surfaces/proof-unclassified`;
const REGISTRY_URL = `${APP}/registries/tenant-brand`;
const THEME_URL = `${APP}/themes/northwind-tenant`;

/** Tenant module contributing the two widgets that render proof surfaces. */
const TENANT_MODULE = { id: 'x-northwind-brand', version: '1.0.0' };

/**
 * Proof Surface. Both routes are trust-claim surfaces in the product's own
 * vocabulary: `/verify` is the independent verifier, `/c/{receiptId}` is the
 * issued certificate.
 *
 * At E4 time neither route carried any marker distinguishing it from a
 * tenant-themeable form route, and that absence WAS the finding. The route-class
 * slice added `routeClass` to `surface.schema.json` `$defs/Route`, so the two
 * routes now say what they are and the violation below is refused. The attack
 * is otherwise byte-identical to the one E4 ran.
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
      routeClass: 'verification',
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
      routeClass: 'proof',
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

const CLAIM =
  'Tenants may theme form chrome and MUST NOT theme receipt, certificate, verifier, or ceremony surfaces — those surfaces\' visual immutability is part of the proof claim.';
const VIOLATION =
  'A tenant-owned Theme is bound as the app\'s only Theme, and a tenant-authored UI Graph Policy assigns tenant brand tokens to the accent and surface token slots of the certificate widget and the verifier widget.';

export const themeAuthorityCase = (policy: UiGraphPolicyDocument): RedTeamCase => ({
  id: 'claim1-theme-authority',
  claim: CLAIM,
  v8Finding: 6,
  violation: VIOLATION,
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
   * At E4 time this list was empty: no diagnostic code anywhere in
   * `packages/formspec-app-graph/src/` named a themed proof surface, because
   * the five THEME-TOKEN-* codes all check token/slot/widget *resolution*,
   * never theming authority. The empty list was the pre-registered prediction
   * and it held.
   *
   * `THEME-ROUTE-CLASS` is the code that closes it: a Theme token assignment
   * whose widget is rendered by a `proof`, `ceremony`, or `verification` route
   * is refused. See `ui-graph-policy-spec.md` §5.7.
   */
  wouldCatch: ['THEME-ROUTE-CLASS'],
});

/** A variant Surface reachable at its own URL, so each case gets its own report. */
function variantSurface(id: string, routes: unknown[]): unknown {
  return { $formspecSurface: '0.1', id, entry: 'verify', modules: [TENANT_MODULE], routes };
}

function variantManifest(title: string, surfaceUrl: string): unknown {
  return { ...manifest, title, surfaces: [{ url: surfaceUrl, version: '1.0.0' }] };
}

function variantPolicy(surfaceUrl: string): UiGraphPolicyDocument {
  return {
    ...violatingPolicy,
    targetSurface: { url: surfaceUrl, version: '1.0.0' },
  } as UiGraphPolicyDocument;
}

/**
 * The same attack, hidden behind one `embed-route` hop. Both trust routes still
 * state what they are; neither binds a widget directly. Each renders an
 * unclassified body route that does — which is what a Surface author gets for
 * free by splitting a route into a shell and a body, no adversarial intent
 * required.
 *
 * A `slots[]`-only reading of route class validates this graph clean, which is
 * why §5.7 defines the rule over what a route RENDERS. The `verify-body` route
 * also embeds its host back: `routeRef` is constrained to a route id, not to an
 * acyclic graph, so cycles are part of the shape being defended against.
 */
export const embeddedThemeAuthorityCase: RedTeamCase = {
  id: 'claim1-theme-authority-embedded',
  claim: CLAIM,
  v8Finding: 6,
  violation: `${VIOLATION} Neither trust route binds a widget directly: each renders an unclassified body route through an embed-route slot, and one body route embeds its host back.`,
  manifest: variantManifest('Formspec Cloud — proof surfaces (embedded bodies)', EMBEDDED_SURFACE_URL),
  manifestSource: 'e4://claim1-embedded/app-manifest',
  documents: {
    [EMBEDDED_SURFACE_URL]: variantSurface('proof-embedded', [
      {
        id: 'verify',
        path: '/verify',
        routeClass: 'verification',
        title: 'Verify a receipt',
        slots: [{ id: 'verify-shell', slotType: 'embed-route', binding: { routeRef: 'verify-body' } }],
      },
      {
        id: 'verify-body',
        path: '/verify/body',
        slots: [
          {
            id: 'verifier-panel',
            slotType: 'module-widget',
            binding: { moduleId: TENANT_MODULE.id, widgetName: 'x-verification-panel' },
          },
          { id: 'verify-back', slotType: 'embed-route', binding: { routeRef: 'verify' } },
        ],
      },
      {
        id: 'certificate',
        path: '/c/{receiptId}',
        routeClass: 'proof',
        title: 'Signing certificate',
        params: [{ name: 'receiptId', type: 'string' }],
        slots: [{ id: 'cert-shell', slotType: 'embed-route', binding: { routeRef: 'certificate-body' } }],
      },
      {
        id: 'certificate-body',
        path: '/c/body',
        slots: [
          {
            id: 'certificate-sheet',
            slotType: 'module-widget',
            binding: { moduleId: TENANT_MODULE.id, widgetName: 'x-certificate-sheet' },
          },
        ],
      },
    ]),
    [REGISTRY_URL]: registry,
    [THEME_URL]: theme,
  },
  uiGraphPolicies: [
    {
      schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
      source: 'e4://claim1-embedded/ui-graph-policy',
      document: {
        ...variantPolicy(EMBEDDED_SURFACE_URL),
        routePolicies: [
          { routeId: 'verify' },
          { routeId: 'verify-body' },
          { routeId: 'certificate' },
          { routeId: 'certificate-body' },
        ],
      } as UiGraphPolicyDocument,
    },
  ],
  wouldCatch: ['THEME-ROUTE-CLASS'],
};

/**
 * The residual hole, executed rather than asserted in prose. `routeClass` is
 * OPTIONAL with no default, so a tenant Surface that simply never classifies its
 * certificate and verifier routes gets no refusal — the guard is opt-in, and
 * nothing in the graph requires the opt-in.
 *
 * This is why the rollup records claim 1 as NARROWED, not closed. Making it
 * `required` was rejected in the route-class slice on the grounds that coercing
 * a claim does not produce a correct one; the price of that (correct) call is
 * this case, and it is filed here so the price stays visible and is re-measured
 * on every run.
 */
export const unclassifiedThemeAuthorityCase: RedTeamCase = {
  id: 'claim1-theme-authority-unclassified',
  claim: CLAIM,
  v8Finding: 6,
  violation: `${VIOLATION} Neither route states a routeClass, so no class-keyed rule fires and the original E4 result stands unchanged.`,
  manifest: variantManifest('Formspec Cloud — proof surfaces (unclassified)', UNCLASSIFIED_SURFACE_URL),
  manifestSource: 'e4://claim1-unclassified/app-manifest',
  documents: {
    [UNCLASSIFIED_SURFACE_URL]: variantSurface(
      'proof-unclassified',
      surface.routes.map(({ routeClass: _dropped, ...route }) => route),
    ),
    [REGISTRY_URL]: registry,
    [THEME_URL]: theme,
  },
  uiGraphPolicies: [
    {
      schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
      source: 'e4://claim1-unclassified/ui-graph-policy',
      document: variantPolicy(UNCLASSIFIED_SURFACE_URL),
    },
  ],
  wouldCatch: ['THEME-ROUTE-CLASS'],
};

export const CLAIM1_SURFACE_URL = SURFACE_URL;
