/**
 * @filedesc Translates `index.html` (route `/o/:org/w/:ws`, the surface
 * `surfaces/owner-dashboard.html` redirects to) — the Form Owner's overview:
 * greeting + tenancy strip, degraded-anchor incident banner, four KPI tiles,
 * proof-health distribution chart, forms table, activity feed, posture panel,
 * recent receipts, route-map card.
 */
import type { SurfaceScript } from '../harness.js';

const BUNDLE = 'https://formspec.cloud/apps/console/dashboard';
const SURFACE_URL = `${BUNDLE}/surfaces/overview`;

export const ownerDashboard: SurfaceScript = {
  id: 'owner-dashboard',
  mockup: 'index.html (surfaces/owner-dashboard.html redirects here)',
  family: 'dashboard',
  route: '/o/:org/w/:ws',
  surfaceId: 'overview',
  bundleId: BUNDLE,
  surfaceUrl: SURFACE_URL,
  title: 'Overview',
  brief:
    'Owner overview. Greeting plus tenancy strip (workspace · region · deployment tier · 30-day response count). Runtime incident banner when anchoring is degraded. Four KPI tiles with deltas and thresholds (responses 30d, proof ready, awaiting signature, anchor stalled). Proof-health distribution over seven days. Forms table with proof distribution per row. Activity feed of receipts, envelopes, versions, signer declines, webhook deliveries. Posture panel (deployment, region, definition pinning, AI policy, retention, tier roadmap). Recent receipts list. Route-map card.',

  async author({ mcp, gap, bindRoute }) {
    // ── FINDING 12 — no stat-tile primitive with delta + threshold
    gap({
      id: 12,
      verb: 'bindSlot(static-content)',
      family: 'slot-taxonomy',
      wanted:
        'A `stat-tile` kind: label, data-source-bound value, comparison delta ("↑ 18.2% vs prior 30d"), and a threshold state that drives color ("4 anchor stalled" is a warning, "12 376 proof ready" is not).',
      got:
        'A heading with an authored string. The tile\'s value, delta, and threshold — the three things that make it a tile rather than a sentence — have nowhere to live in the graph.',
      severity: 'missing-feature',
      why:
        'The dashboard is the first authenticated screen the paying persona sees. Its entire information payload is four numbers with deltas. Losing the delta and the threshold loses the screen.',
      v7Ref: 'F13',
      suggestion:
        'Extend static-content kinds with `stat-tile` (value path, delta path, threshold predicate → severity) and let a `stat-strip` group them.',
    });

    // ── FINDING 13 — no timeseries / distribution visualization slot
    gap({
      id: 13,
      verb: 'bindSlot',
      family: 'slot-taxonomy',
      wanted:
        'A chart slot: proof-state distribution over seven days, bound to a data source, with the category taxonomy (`proof_ready` | `proof_pending` | `anchor_stalled` | `accepted`) declared rather than hard-coded in a widget.',
      got:
        'A `module-widget` against an unadmitted module. The substrate cannot tell that this chart renders the same four proof states the receipt, the responses table, and the status page render.',
      severity: 'missing-feature',
      why:
        'Proof state is the product\'s core vocabulary — it appears on six of the eleven translated surfaces. When the visualization of it is opaque, the substrate cannot enforce that the four states are rendered consistently, which is exactly the consistency the trust story sells.',
      v7Ref: null,
      suggestion:
        'A `visualization` slot type bound to a data source plus a declared category/measure pair. Chart choice stays presentational; the category taxonomy becomes substrate-visible.',
    });

    // ── FINDING 14 — no activity-feed / event-timeline slot
    gap({
      id: 14,
      verb: 'bindSlot',
      family: 'slot-taxonomy',
      wanted:
        'An `activity-feed` slot: heterogeneous typed events (receipt issued, envelope completed, anchor retry scheduled, version published, signer declined, webhook delivered), each with a subject link and a relative timestamp.',
      got:
        'Another opaque module. The event taxonomy — which is the same taxonomy the webhook surface subscribes to and the audit log records — is invisible.',
      severity: 'missing-feature',
      why:
        'Three surfaces (dashboard, envelope detail, response detail) render the same event stream in three shapes. Without a substrate-level event kind, the product has three private definitions of what an event is.',
      v7Ref: null,
      suggestion:
        'An `event-feed` slot type bound to a data source whose item schema carries `kind`, `subjectRef`, `occurredAt`, and an optional proof-state field.',
    });

    // ── FINDING 15 — runtime system-status has no authored home
    gap({
      id: 15,
      verb: 'bindSlot',
      family: 'state-and-status',
      wanted:
        'A route-level status region that appears only when the host reports degraded service ("Trellis batch #41 204 stalled at 11:18 UTC. Submissions remain accepted; proof will materialise on the next anchor pass."), with severity and a dismissal posture.',
      got:
        'Either an always-present authored `static-content` block (wrong — it lies when the system is healthy) or a module. Conditional-on-runtime-state regions are not expressible.',
      severity: 'missing-feature',
      why:
        'This banner is the product keeping its proof promise honest when the proof pipeline is late. It is load-bearing trust copy, and it renders conditionally on host state the graph cannot reference.',
      v7Ref: null,
      suggestion:
        'A `hostStatus` data-source family plus slot `visibleWhen` predicates over it — same predicate hook the capability-gating gap needs, different evaluator.',
    });

    for (const m of ['x-cloud-stat-tiles', 'x-cloud-proof-distribution', 'x-cloud-activity-feed', 'x-cloud-forms-collection', 'x-cloud-status-banner']) {
      const declared = await mcp.declareModule({ id: m, version: '0.1.0' });
      if (!declared.ok) throw new Error(`declareModule refused: ${declared.error.code}`);
    }

    const routes = [
      {
        routeId: 'overview',
        path: '/o/:org/w/:ws',
        routeClass: 'operation' as const,
        title: 'Overview',
        slots: [
          {
            id: 'greeting',
            slotType: 'static-content' as const,
            binding: { kind: 'heading', content: 'Good afternoon, Maria.', level: 1 },
            title: 'Overview',
            position: 'top',
            mockupRegion: 'greeting + tenancy strip (grants-program · us-west-2 · Regulated · 12 408 responses/30d)',
          },
          {
            id: 'anchorBanner',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-status-banner',
              widgetName: 'HostStatusBanner',
              config: { dataSource: 'x-spike-v9:host-status:anchoring', visibleWhen: 'x-spike-v9:TODO:degraded' },
            },
            title: 'Anchoring status',
            position: 'top',
            mockupRegion: 'degraded-anchor banner — "4 anchor retries are still scheduled"',
          },
          {
            id: 'kpiTiles',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-stat-tiles',
              widgetName: 'KpiTiles',
              config: {
                dataSource: 'x-spike-v9:workspace:metrics',
                tiles: ['responses-30d', 'proof-ready', 'awaiting-signature', 'anchor-stalled'],
              },
            },
            title: 'Key metrics',
            position: 'main',
            mockupRegion: 'four KPI tiles with deltas and sub-labels',
          },
          {
            id: 'proofHealth',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-proof-distribution',
              widgetName: 'ProofHealth',
              config: {
                dataSource: 'x-spike-v9:workspace:proof-distribution',
                categories: ['proof_ready', 'proof_pending', 'anchor_stalled', 'accepted'],
                window: '7d',
              },
            },
            title: 'Proof health',
            position: 'main',
            mockupRegion: 'proof-health distribution, last 7 days',
          },
          {
            id: 'formsTable',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-forms-collection',
              widgetName: 'FormsCollection',
              config: {
                dataSource: 'x-spike-v9:workspace:forms',
                columns: ['form', 'responses7d', 'proofDistribution', 'lastResponse', 'deployment', 'state'],
              },
            },
            title: 'Forms',
            position: 'main',
            mockupRegion: 'forms table with proof distribution per row',
          },
          {
            id: 'activity',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-activity-feed',
              widgetName: 'ActivityFeed',
              config: {
                dataSource: 'x-spike-v9:workspace:activity',
                kinds: ['receipt', 'envelope', 'anchor-retry', 'version', 'signer', 'webhook'],
              },
            },
            title: 'Activity',
            position: 'right',
            mockupRegion: 'activity feed (receipts, envelopes, anchor retries, versions, signers, webhooks)',
          },
          {
            id: 'posture',
            slotType: 'static-content' as const,
            binding: { kind: 'heading', content: 'Posture', level: 2 },
            title: 'Posture',
            position: 'right',
            mockupRegion: 'posture panel — deployment, region, definition pinning, AI policy, retention, tier roadmap',
          },
          {
            id: 'recentReceipts',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-activity-feed',
              widgetName: 'ReceiptList',
              config: { dataSource: 'x-spike-v9:workspace:receipts', limit: 5 },
            },
            title: 'Recent receipts',
            position: 'right',
            mockupRegion: 'recent receipts list with deep links',
          },
        ],
      },
    ];

    for (const route of routes) await bindRoute(route);

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      title: 'Owner dashboard policy',
      routePolicies: [{ routeId: 'overview', a11y: { landmark: 'main', keyboardNavigation: true } }],
    });
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.code}`);

    return { routes, policy: policy.value };
  },
};
