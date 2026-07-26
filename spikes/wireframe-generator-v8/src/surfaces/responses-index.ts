/**
 * @filedesc Translates `surfaces/responses-index.html` (route
 * `/forms/:id/responses`) — the densest surface in the corpus: proof-state stat
 * strip, filter chips, configurable columns, saved views, export, a 4 218-row
 * table with per-row proof and signature state, and pagination.
 */
import type { SurfaceScript } from '../harness.js';

const BUNDLE = 'https://formspec.cloud/apps/console/responses';
const SURFACE_URL = `${BUNDLE}/surfaces/responses`;

export const responsesIndex: SurfaceScript = {
  id: 'responses-index',
  mockup: 'surfaces/responses-index.html',
  family: 'collection-index',
  route: '/forms/:id/responses',
  surfaceId: 'responses',
  bundleId: BUNDLE,
  surfaceUrl: SURFACE_URL,
  title: 'Responses',
  brief:
    'Response table for one form. Stat strip splits 4 218 responses across proof ready, awaiting signature, proof pending, anchor stalled. Filter chips for version, submitted window, proof state, signature state, with an add-filter affordance. Column configuration across eleven available columns, saved views, and export. Table rows carry respondent, receipt id, submitted timestamp, proof state, signature progress, a computed total, version, and a truncated hash. Pagination over 352 pages.',

  async author({ mcp, gap, bindRoute }) {
    // ── FINDING 32 — user-scoped surface state has no substrate home
    gap({
      id: 32,
      verb: 'bindSlot',
      family: 'state-and-status',
      wanted:
        'Saved views, chosen columns, sort order, and pinned filters are per-user state that outlives a session and is shareable with a teammate. The surface should declare that this state exists, what it is keyed by, and who owns it.',
      got:
        'Nothing in the graph acknowledges user-scoped view state. It becomes localStorage or a private table, so a "saved view" cannot be exported, reviewed, or reasoned about by the same tooling that reasons about the surface.',
      severity: 'missing-feature',
      why:
        'Column sets on a response table are how a grants officer works. They also decide what a CSV export contains, which makes them an evidence-scope decision wearing a UI-preference costume.',
      v7Ref: null,
      suggestion:
        'A `viewState` declaration on the slot: keyed by (actor, surface, route, slot), with a declared shape and a persistence scope the host implements.',
    });

    for (const m of ['x-cloud-stat-tiles', 'x-cloud-filter-bar', 'x-cloud-response-table']) {
      const declared = await mcp.declareModule({ id: m, version: '0.1.0' });
      if (!declared.ok) throw new Error(`declareModule refused: ${declared.error.code}`);
    }

    const routes = [
      {
        routeId: 'responses',
        path: '/forms/:id/responses',
        title: 'Responses',
        slots: [
          {
            id: 'proofStats',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-stat-tiles',
              widgetName: 'ProofStatStrip',
              config: {
                dataSource: 'x-spike-v8:workspace:forms/:id/response-metrics',
                categories: ['proof_ready', 'awaiting_signature', 'proof_pending', 'anchor_stalled'],
              },
            },
            title: 'Responses',
            position: 'top',
            mockupRegion: 'proof-state stat strip — 4 218 total split four ways with a refreshed-at stamp',
          },
          {
            id: 'filters',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-filter-bar',
              widgetName: 'ResponseFilters',
              config: {
                dataSource: 'x-spike-v8:workspace:forms/:id/responses',
                facets: ['version', 'submitted', 'proof', 'signature'],
                publishes: 'x-spike-v8:channel:response-query',
              },
            },
            title: 'Filters',
            position: 'top',
            mockupRegion: 'filter chips with removal + add-filter',
          },
          {
            id: 'viewControls',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-response-table',
              widgetName: 'ViewControls',
              config: {
                columns: [
                  'respondent', 'submitted', 'proof', 'signature', 'totalBudget', 'version',
                  'hash', 'ein', 'source', 'reviewer', 'timeOnForm',
                ],
                // x-spike-v8 — user-scoped state the substrate does not model. FINDING 32.
                viewState: 'x-spike-v8:user-scoped:saved-views',
                actions: ['export'],
              },
            },
            title: 'Columns & views',
            position: 'top',
            mockupRegion: 'column configuration, saved views, export',
          },
          {
            id: 'table',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-response-table',
              widgetName: 'ResponseTable',
              config: {
                consumes: 'x-spike-v8:channel:response-query',
                dataSource: 'x-spike-v8:workspace:forms/:id/responses',
                pagination: { pageSize: 12, total: 4218 },
                rowActions: ['open-response', 'open-receipt'],
              },
            },
            title: 'Responses',
            position: 'main',
            mockupRegion: '4 218-row table with proof state, signature progress, computed total, version, hash',
          },
        ],
      },
    ];

    for (const route of routes) await bindRoute(route);

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      title: 'Responses index policy',
      routePolicies: [{ routeId: 'responses', a11y: { landmark: 'main', keyboardNavigation: true } }],
    });
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.code}`);

    return { routes, policy: policy.value };
  },
};
