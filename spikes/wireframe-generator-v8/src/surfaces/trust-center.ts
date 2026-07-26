/**
 * @filedesc Translates `surfaces/trust-center.html` (route `/trust`) — the
 * procurement-facing content surface: public nav, positioning hero, five
 * deployment-profile cards drawn from a closed taxonomy, a 14-row capability
 * matrix across five tiers, and a dated freshness claim.
 */
import type { SurfaceScript } from '../harness.js';

const BUNDLE = 'https://formspec.cloud/apps/trust/center';
const SURFACE_URL = `${BUNDLE}/surfaces/trust`;

export const trustCenter: SurfaceScript = {
  id: 'trust-center',
  mockup: 'surfaces/trust-center.html',
  family: 'content-compliance',
  route: '/trust',
  surfaceId: 'trust',
  bundleId: BUNDLE,
  surfaceUrl: SURFACE_URL,
  title: 'Trust Center',
  brief:
    'Procurement trust center. Public nav across deployments, data handling, audits, contact. Hero states the positioning claim: five deployment profiles, identical proof surfaces. Five profile cards from a closed taxonomy (Shared, Regulated, Dedicated, Self-Hosted, Air-Gapped), each with an isolation and anchoring summary. Capability matrix: 14 capability rows by 5 tier columns, cells carrying yes / no / qualified answers. Footer carries the last-updated date, the changelog policy, and links to security policy, DPA, status, and security contact.',

  async author({ mcp, gap, bindRoute }) {
    // ── FINDING 28 — no table / matrix primitive in static content
    gap({
      id: 28,
      verb: 'bindSlot(static-content)',
      family: 'slot-taxonomy',
      wanted:
        'A capability matrix: 14 rows by 5 columns, cells typed as yes / no / qualified with a qualifier string, so the same matrix can render as a table on the web and as rows in an evidence export.',
      got:
        '`static-content` offers heading and text. The matrix becomes a module, so the single most-requested procurement artifact in the product is opaque to the substrate that is supposed to make claims auditable.',
      severity: 'missing-feature',
      why:
        'This surface is the strategic differentiator per the product\'s own route map. A procurement claim rendered from an opaque widget cannot be exported, diffed across releases, or attested — which is the entire value proposition.',
      v7Ref: 'F13',
      suggestion:
        'A `matrix` (or `comparison-table`) static-content kind: row/column axes bound to data sources with a closed cell-value taxonomy.',
    });

    // ── FINDING 29 — compliance facts are data, and there is no data source verb
    gap({
      id: 29,
      verb: 'bindSlot',
      family: 'data-source',
      wanted:
        'Bind SOC 2 audit dates, the subprocessor list, VPAT currency, and "last updated 2026-05-15" to a data source, so the freshness claim on a procurement page cannot silently rot into a lie.',
      got:
        'Authored strings. A date typed into a heading is a date nobody re-checks. There is no data-source declaration verb on the MCP surface to bind it to.',
      severity: 'reshape-needed',
      why:
        'Stale compliance dates are a procurement disqualifier and a legal exposure. This is the case where "the substrate cannot see the data plane" has consequences outside the UI.',
      v7Ref: 'F3',
      suggestion:
        'The data-source declaration verb (finding 2) plus a `freshness` contract on the binding: max age, source of truth, and the behavior when stale.',
    });

    for (const m of ['x-cloud-public-nav', 'x-cloud-profile-cards', 'x-cloud-capability-matrix']) {
      const declared = await mcp.declareModule({ id: m, version: '0.1.0' });
      if (!declared.ok) throw new Error(`declareModule refused: ${declared.error.code}`);
    }

    const routes = [
      {
        routeId: 'trust',
        path: '/trust',
        title: 'Trust',
        slots: [
          {
            id: 'publicNav',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-public-nav',
              widgetName: 'PublicNav',
              config: { links: ['deployments', 'data-handling', 'audits', 'contact'] },
            },
            title: 'Trust',
            position: 'top',
            mockupRegion: 'public nav (unauthenticated)',
          },
          {
            id: 'hero',
            slotType: 'static-content' as const,
            binding: {
              kind: 'heading',
              content: 'Five deployment profiles. The proof surfaces are the same on every one.',
              level: 1,
            },
            title: 'Trust at Formspec Cloud',
            position: 'main',
            mockupRegion: 'positioning hero + explanatory paragraph',
          },
          {
            id: 'profileCards',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-profile-cards',
              widgetName: 'DeploymentProfiles',
              config: {
                dataSource: 'x-spike-v8:catalog:deployment-profiles',
                taxonomy: ['shared', 'regulated', 'dedicated', 'self-hosted', 'air-gapped'],
                closed: true,
              },
            },
            title: 'Deployment profiles',
            position: 'main',
            mockupRegion: 'five profile cards, closed taxonomy ("there is no Custom or Enterprise Plus")',
          },
          {
            id: 'capabilityMatrix',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-capability-matrix',
              widgetName: 'CapabilityMatrix',
              config: {
                dataSource: 'x-spike-v8:catalog:capability-claims',
                rows: 14,
                columns: ['shared', 'regulated', 'dedicated', 'self-hosted', 'air-gapped'],
                cellTaxonomy: ['yes', 'no', 'qualified', 'not-applicable'],
              },
            },
            title: 'Capability matrix',
            position: 'main',
            mockupRegion: '14x5 capability matrix — anchoring, BAA, FedRAMP, SOC 2, SSO, support-access mode',
          },
          {
            id: 'freshness',
            slotType: 'static-content' as const,
            binding: { kind: 'text', content: 'Last updated 2026-05-15 · Updates follow our changelog policy.' },
            title: 'Freshness',
            position: 'bottom',
            mockupRegion: 'last-updated line + security policy / DPA / status / contact links',
          },
        ],
      },
    ];

    for (const route of routes) await bindRoute(route);

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      title: 'Trust center policy',
      routePolicies: [{ routeId: 'trust', a11y: { landmark: 'main', keyboardNavigation: true } }],
    });
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.code}`);

    return { routes, policy: policy.value };
  },
};
