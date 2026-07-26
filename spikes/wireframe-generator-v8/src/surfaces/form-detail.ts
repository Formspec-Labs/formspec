/**
 * @filedesc Translates `surfaces/form-detail.html` (route `/forms/:id`) — the
 * per-form hub: identity header with state chips, meta strip, six-tab sub-nav,
 * KPI row, version lifecycle list, share & embed panel, live respondent-form
 * preview, posture panel, quick actions.
 */
import type { SurfaceScript } from '../harness.js';

const BUNDLE = 'https://formspec.cloud/apps/console/form-detail';
const SURFACE_URL = `${BUNDLE}/surfaces/form`;

export const formDetail: SurfaceScript = {
  id: 'form-detail',
  mockup: 'surfaces/form-detail.html',
  family: 'entity-detail',
  route: '/forms/:id',
  surfaceId: 'form',
  bundleId: BUNDLE,
  surfaceUrl: SURFACE_URL,
  title: '2026 Community Grant Application',
  brief:
    'Form hub. Identity header (title, definition id, created date, response count, awarded total) with state and deployment chips and primary actions. Meta strip (award ceiling, intake window, active version, save/resume, locales). Sub-navigation across Overview / Responses / Versions / Analytics / Settings / Share & embed. KPI row (responses 7d, completion rate, average time, proof p95 against SLO). Version lifecycle list (active / retired / draft with change summaries). Share & embed panel with public link, workflow-bound link for workspec-server, and embed snippet. Live preview of the hosted respondent form. Posture panel and quick actions.',

  async author({ mcp, gap, bindRoute }) {
    // ── FINDING 16 — no sub-route / tab IA within one surface
    gap({
      id: 16,
      verb: 'addRoute / bindSlot',
      family: 'app-composition',
      wanted:
        'Six tabs under one entity route — `/forms/:id` with Overview, Responses, Versions, Analytics, Settings, Share — sharing the identity header, the entity binding, and the breadcrumb, differing only in the main region.',
      got:
        'Routes are flat siblings. Either six routes each re-declaring the header slots, or one route whose tabs are module-private state. Both lose the fact that the six views share one subject.',
      severity: 'reshape-needed',
      why:
        'Entity-detail-with-tabs is the second most common shape in the corpus after the index. Re-declaring shared chrome six times is where UI drift is born, and drift is what the substrate exists to prevent.',
      v7Ref: 'F1',
      suggestion:
        'Nested routes (`parentRouteId` + inherited slots) or a `views[]` axis on a route where each view names only its differing slots.',
    });

    // ── FINDING 17 — `embed-route` cannot target a sibling app's live surface
    gap({
      id: 17,
      verb: 'bindSlot(embed-route)',
      family: 'slot-taxonomy',
      wanted:
        'The preview pane embeds the *live hosted respondent form* for this definition — a different bundle, a different audience, rendered in a constrained viewport with interaction disabled.',
      got:
        '`embed-route` takes a route reference. Whether it can name a route in another Surface bundle, whether the embedded route inherits the host theme or keeps its own, and whether interaction can be suppressed are all unstated on the verb surface. Authored as a same-shape guess with an out-of-bundle target.',
      severity: 'reshape-needed',
      why:
        'The product\'s core loop is "author a form, see exactly what the respondent sees". If the substrate\'s own embed primitive cannot cross the authoring/respondent boundary, the primitive does not serve the product\'s primary journey.',
      v7Ref: null,
      suggestion:
        'Define `embed-route` binding explicitly: `{ surfaceUrl?, routeId, mode: "live" | "preview" | "inert", themeInheritance: "host" | "embedded" }`.',
    });

    const modules = ['x-cloud-tab-nav', 'x-cloud-stat-tiles', 'x-cloud-version-lifecycle', 'x-cloud-share-panel'];
    for (const m of modules) {
      const declared = await mcp.declareModule({ id: m, version: '0.1.0' });
      if (!declared.ok) throw new Error(`declareModule refused: ${declared.error.code}`);
    }

    const routes = [
      {
        routeId: 'overview',
        path: '/forms/:id',
        title: 'Overview',
        slots: [
          {
            id: 'identityHeader',
            slotType: 'static-content' as const,
            binding: { kind: 'heading', content: '2026 Community Grant Application', level: 1 },
            title: 'Form',
            position: 'top',
            mockupRegion: 'identity header — title, def_grant_2026, created, 4 218 responses, $2.1M awarded, Live/Regulated chips',
          },
          {
            id: 'tabNav',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-tab-nav',
              widgetName: 'EntityTabs',
              config: {
                tabs: ['overview', 'responses', 'versions', 'analytics', 'settings', 'share'],
                counts: { responses: 4218, versions: 3 },
              },
            },
            title: 'Sections',
            position: 'top',
            mockupRegion: 'six-tab sub-navigation with counts',
          },
          {
            id: 'kpiRow',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-stat-tiles',
              widgetName: 'KpiTiles',
              config: {
                dataSource: 'x-spike-v8:workspace:forms/:id/metrics',
                tiles: ['responses-7d', 'completion-rate', 'avg-time', 'proof-p95'],
              },
            },
            title: 'Metrics',
            position: 'main',
            mockupRegion: 'KPI row with SLO comparison on proof p95',
          },
          {
            id: 'versions',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-version-lifecycle',
              widgetName: 'VersionList',
              config: {
                dataSource: 'x-spike-v8:workspace:forms/:id/versions',
                lifecycle: ['draft', 'active', 'retired'],
                rowActions: ['diff', 'continue-editing'],
              },
            },
            title: 'Versions',
            position: 'main',
            mockupRegion: 'version lifecycle list — v1.0.3 active, v1.0.2/v1.0.1 retired, v1.0.4 draft',
          },
          {
            id: 'sharePanel',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-share-panel',
              widgetName: 'ShareAndEmbed',
              config: {
                surfaces: ['public-link', 'workflow-bound-link', 'embed-snippet'],
                workflowLinkTemplate: 'https://forms.acme-coop.org/f/grants-2026?case={WOS_CASE_ID}',
              },
            },
            title: 'Share & embed',
            position: 'main',
            mockupRegion: 'share & embed panel — public link, INT-009 workflow-bound link, embed snippet',
          },
          {
            id: 'livePreview',
            slotType: 'embed-route' as const,
            // Guessing the binding shape: the respondent form lives in a different
            // bundle. FINDING 17 — the verb surface does not say whether this is legal.
            binding: {
              surfaceUrl: 'https://formspec.cloud/apps/respondent/grants-2026/surfaces/intake',
              routeId: 'fill',
              mode: 'preview',
            },
            title: 'Preview',
            position: 'right',
            mockupRegion: 'live respondent-form preview with "Open hosted form" link',
          },
          {
            id: 'posture',
            slotType: 'static-content' as const,
            binding: { kind: 'heading', content: 'Posture', level: 2 },
            title: 'Posture',
            position: 'right',
            mockupRegion: 'posture panel — state, deployment, region, AI policy, retention, anti-abuse',
          },
        ],
      },
    ];

    for (const route of routes) await bindRoute(route);

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      title: 'Form detail policy',
      routePolicies: [{ routeId: 'overview', a11y: { landmark: 'main', keyboardNavigation: true } }],
    });
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.code}`);

    return { routes, policy: policy.value };
  },
};
