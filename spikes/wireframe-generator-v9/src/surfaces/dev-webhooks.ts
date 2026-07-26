/**
 * @filedesc Translates `surfaces/dev-webhooks.html` (route `/dev/webhooks`) —
 * the integrator CRUD-with-history pattern: endpoint registry, a signing secret
 * behind a reveal/rotate gate, delivery history with per-row replay and
 * dead-letter states.
 */
import type { SurfaceScript } from '../harness.js';

const BUNDLE = 'https://formspec.cloud/apps/console/dev-webhooks';
const SURFACE_URL = `${BUNDLE}/surfaces/webhooks`;

export const devWebhooks: SurfaceScript = {
  id: 'dev-webhooks',
  mockup: 'surfaces/dev-webhooks.html',
  family: 'developer-crud',
  route: '/dev/webhooks',
  surfaceId: 'webhooks',
  bundleId: BUNDLE,
  surfaceUrl: SURFACE_URL,
  title: 'Webhooks',
  brief:
    'Integrator webhooks. Dev section nav with per-section counts. Header explains the event taxonomy and the delivery guarantees, with test-event and add-endpoint actions. Workspace signing secret shown masked with reveal and rotate, plus the HMAC header contract and the 24-hour dual-secret rotation window. Endpoint table with state counts, subscribed events per row, 24-hour success rate, last delivery, and a row menu. Delivery history table with per-row HTTP status, latency, retry counter, dead-letter state, and a replay action; plus replay-all-failed.',

  async author({ mcp, gap, bindRoute }) {
    // ── FINDING 26 — CRUD lifecycle actions have no vocabulary
    gap({
      id: 26,
      verb: 'Response Actions',
      family: 'action-vocabulary',
      wanted:
        'Register, pause, rotate, test, replay, replay-all-failed — each with a subject (endpoint, delivery, secret), an idempotency posture, and a result the surface renders.',
      got:
        'The intake-completion action vocabulary (submit / save-draft / validate) does not reach any of them. Every action is a module button; the substrate cannot audit or gate one of them.',
      severity: 'reshape-needed',
      why:
        'This surface exists so an integrator can recover from failed deliveries. Recovery actions are precisely the actions that must be recorded, rate-limited, and permission-checked — and none of that is expressible.',
      v7Ref: 'F9',
      suggestion:
        'The reviewer-action family from v7 F9 generalizes: an `operational-action` kind with subjectRef, idempotency key, and a typed result binding.',
    });

    // ── FINDING 27 — no sensitivity-gated display
    gap({
      id: 27,
      verb: 'bindSlot / declareUiGraphPolicy',
      family: 'capability-gating',
      wanted:
        'Declare the signing secret as sensitive: masked by default, revealed only on an explicit action by an actor holding the right grant, never logged, never in the co-pilot context, re-masked on blur.',
      got:
        'A string in a module config. Nothing in the graph marks it sensitive, so nothing downstream — renderer, analytics, AI context projection, screenshot tooling — can know to withhold it.',
      severity: 'missing-feature',
      why:
        'The product sells to regulated buyers and ships an AI co-pilot. A secret whose sensitivity is invisible to the graph is a secret that leaks into whatever consumes the graph next.',
      v7Ref: null,
      suggestion:
        'A `sensitivity` annotation on slot bindings and data-source fields (`public` | `internal` | `secret` | `pii` | `phi`) that the renderer, the policy layer, and any AI projection must honor.',
    });

    for (const m of ['x-cloud-dev-nav', 'x-cloud-secret-panel', 'x-cloud-endpoint-table', 'x-cloud-delivery-history']) {
      const declared = await mcp.declareModule({ id: m, version: '0.1.0' });
      if (!declared.ok) throw new Error(`declareModule refused: ${declared.error.code}`);
    }

    const routes = [
      {
        routeId: 'webhooks',
        path: '/dev/webhooks',
        routeClass: 'operation' as const,
        title: 'Webhooks',
        slots: [
          {
            id: 'devNav',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-dev-nav',
              widgetName: 'DevSectionNav',
              config: {
                sections: ['keys', 'webhooks', 'sandbox', 'docs', 'embed', 'imports', 'connectors', 'workflow-links'],
                counts: { keys: 7, webhooks: 4 },
              },
            },
            title: 'Developer',
            position: 'top',
            mockupRegion: 'dev section nav with counts',
          },
          {
            id: 'header',
            slotType: 'static-content' as const,
            binding: {
              kind: 'text',
              content:
                'Subscribe to lifecycle events: response submitted, anchor ready, anchor stalled, envelope completed, signer declined. Every delivery is signed and idempotent; failures retry with exponential back-off.',
            },
            title: 'Webhooks',
            position: 'top',
            mockupRegion: 'header explainer + test-event / add-endpoint actions',
          },
          {
            id: 'signingSecret',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-secret-panel',
              widgetName: 'SigningSecret',
              config: {
                dataSource: 'x-spike-v9:workspace:webhook-secret',
                // x-spike-v9 — no substrate sensitivity annotation exists. FINDING 27.
                sensitivity: 'x-spike-v9:secret',
                actions: ['reveal', 'rotate'],
                rotationGrace: '24h',
              },
            },
            title: 'Workspace signing secret',
            position: 'main',
            mockupRegion: 'masked signing secret with reveal/rotate and the HMAC header contract',
          },
          {
            id: 'endpoints',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-endpoint-table',
              widgetName: 'EndpointTable',
              config: {
                dataSource: 'x-spike-v9:workspace:webhook-endpoints',
                columns: ['url', 'events', 'success24h', 'lastDelivery', 'status'],
                rowActions: ['pause', 'edit', 'delete', 'test'],
                stateCounts: ['active', 'paused', 'disabled'],
              },
            },
            title: 'Endpoints',
            position: 'main',
            mockupRegion: 'endpoint table with state counts and per-row menu',
          },
          {
            id: 'deliveries',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-delivery-history',
              widgetName: 'DeliveryHistory',
              config: {
                dataSource: 'x-spike-v9:workspace:webhook-deliveries',
                columns: ['time', 'event', 'receipt', 'http', 'latency', 'status'],
                rowActions: ['replay', 'view-raw-payload'],
                bulkActions: ['replay-all-failed'],
              },
            },
            title: 'Recent deliveries',
            position: 'main',
            mockupRegion: 'delivery history with retry counters, dead-letter rows, replay actions, pagination footer',
          },
        ],
      },
    ];

    for (const route of routes) await bindRoute(route);

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      title: 'Webhooks policy',
      routePolicies: [{ routeId: 'webhooks', a11y: { landmark: 'main', keyboardNavigation: true } }],
    });
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.code}`);

    return { routes, policy: policy.value };
  },
};
