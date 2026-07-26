/**
 * @filedesc Translates `surfaces/verifier.html` (route `/verify`) — the product's
 * single positioning bet: paste or drop a receipt, watch six checks run entirely
 * client-side, read the computation log. Anonymous, un-themed, and explicitly
 * independent of the vendor.
 */
import type { SurfaceScript } from '../harness.js';

const BUNDLE = 'https://formspec.cloud/apps/trust/verifier';
const SURFACE_URL = `${BUNDLE}/surfaces/verify`;

export const verifier: SurfaceScript = {
  id: 'verifier',
  mockup: 'surfaces/verifier.html',
  family: 'interactive-tool',
  route: '/verify',
  surfaceId: 'verify',
  bundleId: BUNDLE,
  surfaceUrl: SURFACE_URL,
  title: 'Verifier',
  brief:
    'Client-side receipt verifier. Chrome asserts the whole page runs in this tab and no data leaves the browser. Input region accepts a pasted receipt or an uploaded .receipt.json, showing size, type, and schema validity. A verify action runs six checks locally: response hash recompute, definition pin, signature chain, Trellis anchor presence, inclusion proof, schema conformance. Result region renders per-check pass/fail with the computed evidence. Computation log streams timestamped operations. No account, no tenant theme, no network call.',

  async author({ mcp, gap, bindRoute }) {
    // ── FINDING 30 — no local-computation action target
    gap({
      id: 30,
      verb: 'Response Actions',
      family: 'action-vocabulary',
      wanted:
        '"Verify locally" is an action whose executor is the user\'s browser, whose input is user-supplied bytes, and whose output is a typed six-check result the surface renders. Its defining property is that it does not call the host.',
      got:
        'The action model assumes a submission travelling to a host. There is no way to declare an action that must not reach the network — which is the one property this surface sells.',
      severity: 'reshape-needed',
      why:
        'The product\'s own positioning says the verifier is the moment a buyer believes the trust claim, precisely because the vendor is not involved. If the substrate cannot express "runs without the host", the substrate cannot carry the product\'s central claim.',
      v7Ref: 'F12',
      suggestion:
        'An action `executor` axis — `host` | `client` | `either` — with client-executed actions declaring their input schema and typed result binding. The renderer can then enforce the no-network property.',
    });

    // ── FINDING 31 — user-supplied input outside a Definition
    gap({
      id: 31,
      verb: 'bindSlot',
      family: 'slot-taxonomy',
      wanted:
        'An input region for an arbitrary artifact — paste JSON or drop a file, validate it against a published schema, report size and validity — with no Definition, no response, and nothing persisted.',
      got:
        '`definition-form` is the only input-bearing slot type, and it demands a Definition plus a response model. Modelling a throwaway paste box as a Definition would mint a spurious artifact and imply persistence that must not happen.',
      severity: 'missing-feature',
      why:
        'Ephemeral input appears on the verifier, the selective-proof tool, the import surface, and the API try-it console. The substrate models "collect answers from a respondent" and nothing else, so four surfaces have to lie about what they are.',
      v7Ref: null,
      suggestion:
        'An `artifact-input` slot type: accepted media types, a schema reference to validate against, an explicit non-persistence assertion, and a named output channel consumed by an action.',
    });

    for (const m of ['x-cloud-artifact-input', 'x-cloud-verification-result', 'x-cloud-computation-log']) {
      const declared = await mcp.declareModule({ id: m, version: '0.1.0' });
      if (!declared.ok) throw new Error(`declareModule refused: ${declared.error.code}`);
    }

    const routes = [
      {
        routeId: 'verify',
        path: '/verify',
        title: 'Verify a Receipt',
        slots: [
          {
            id: 'assurance',
            slotType: 'static-content' as const,
            binding: {
              kind: 'text',
              content:
                'Runs entirely in this tab — no data leaves your browser. The verifier recomputes the response hash, checks the signature chain, and confirms the Trellis anchor locally, without contacting Formspec Cloud.',
            },
            title: 'Verify a Receipt',
            position: 'top',
            mockupRegion: 'chrome assurance line + explainer',
          },
          {
            id: 'receiptInput',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-artifact-input',
              widgetName: 'ReceiptInput',
              config: {
                accepts: ['application/json', '.receipt.json'],
                schema: 'https://formspec.org/schemas/receipt/1.0',
                persist: false,
                publishes: 'x-spike-v8:channel:receipt-bytes',
              },
            },
            title: 'Receipt input',
            position: 'main',
            mockupRegion: 'paste/upload receipt box with size, type, schema-validity readout',
          },
          {
            id: 'verifyAction',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-verification-result',
              widgetName: 'VerifyButton',
              config: {
                consumes: 'x-spike-v8:channel:receipt-bytes',
                executor: 'x-spike-v8:client-only',
                emits: 'x-spike-v8:channel:verification-result',
              },
            },
            title: 'Verify locally',
            position: 'main',
            mockupRegion: '"Verify locally" action — client-executed, no host call',
          },
          {
            id: 'result',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-verification-result',
              widgetName: 'VerificationResult',
              config: {
                consumes: 'x-spike-v8:channel:verification-result',
                checks: [
                  'response-hash', 'definition-pin', 'signature-chain',
                  'anchor-present', 'inclusion-proof', 'schema-conformance',
                ],
              },
            },
            title: 'Verification result',
            position: 'main',
            mockupRegion: 'six-check result panel with per-check evidence and PASS badges',
          },
          {
            id: 'computationLog',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-computation-log',
              widgetName: 'ComputationLog',
              config: { consumes: 'x-spike-v8:channel:verification-result', streaming: true },
            },
            title: 'Computation log',
            position: 'bottom',
            mockupRegion: 'timestamped computation log streaming local operations',
          },
        ],
      },
    ];

    for (const route of routes) await bindRoute(route);

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      title: 'Verifier policy',
      description:
        'Anonymous route. Tenant theming must never reach it — the verifier\'s independence from any tenant is the claim it exists to make. Not assertable in the current policy shape (finding 6).',
      routePolicies: [{ routeId: 'verify', a11y: { landmark: 'main', keyboardNavigation: true } }],
    });
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.code}`);

    return { routes, policy: policy.value };
  },
};
