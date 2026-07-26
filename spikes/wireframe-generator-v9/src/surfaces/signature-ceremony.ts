/**
 * @filedesc Translates `surfaces/signature-ceremony.html` (route
 * `/sign/:envelopeId`) — the DocuSign-grade moment: immutable ceremony chrome,
 * an attestation sentence naming signer and party, the pinned definition hash,
 * signature capture (draw / type / upload), identity-assurance and time/IP
 * evidence, envelope routing panel, co-signer timeline, decline/delegate exit.
 */
import type { SurfaceScript } from '../harness.js';

const BUNDLE = 'https://formspec.cloud/apps/ceremony/signature';
const SURFACE_URL = `${BUNDLE}/surfaces/sign`;

export const signatureCeremony: SurfaceScript = {
  id: 'signature-ceremony',
  mockup: 'surfaces/signature-ceremony.html',
  family: 'stateful-ceremony',
  route: '/sign/:envelopeId',
  surfaceId: 'sign',
  bundleId: BUNDLE,
  surfaceUrl: SURFACE_URL,
  title: 'Sign — env_8Bm7n3',
  /**
   * Tenant-brand token assignments aimed at this surface. The product's own
   * trust story says this surface is not tenant-themeable; the persona pushes
   * the assignments anyway and lets the validator answer.
   */
  tenantThemeProbe: [
    { widgetRef: { moduleId: 'x-cloud-signature-capture', widgetName: 'SignatureCapture' }, slot: 'accent', token: 'color.accent' },
    { widgetRef: { moduleId: 'x-cloud-evidence-strip', widgetName: 'CeremonyEvidence' }, slot: 'surface', token: 'color.surface' },
  ],
  brief:
    'Signature ceremony. Chrome is structurally immutable and explicitly not tenant-themable. Attestation sentence interpolates signer name and party. Provenance line pins definition version and hash and states co-signer position. Signature capture offers draw, type, or upload, hashed client-side with ed25519. Evidence strip shows time, IP, and identity assurance level from the IdP. Side panel carries the document summary, the envelope routing, and the other signers with their completion timestamps. Secondary exits: decline, delegate, request in-person.',

  async author({ mcp, gap, bindRoute }) {
    // ── FINDING 22 — no signature/consent capture affordance
    gap({
      id: 22,
      verb: 'bindSlot',
      family: 'slot-taxonomy',
      wanted:
        'A signature-capture slot: three input modes (draw / type / upload), a client-side hash commitment, the algorithm on the record, and an attestation sentence bound to the signer and the party they act for.',
      got:
        'No slot type accepts it. `definition-form` would model the signature as a form field, which loses the ceremony — the commitment, the hash, the algorithm, and the attestation are the artifact, not the input. Falls back to a module.',
      severity: 'missing-feature',
      why:
        'Signature is a first-class product noun: it has its own envelope model, its own certificate surface, its own webhook events, and its own persona. It is the one interaction the substrate must be able to describe if the proof chain is to be authored rather than hand-built.',
      v7Ref: null,
      suggestion:
        'A `signature-ceremony` slot type: attestation template + signer binding + capture modes + commitment algorithm, emitting the evidence fields the certificate surface later renders.',
    });

    // ── FINDING 23 — no identity-assurance precondition on a route
    gap({
      id: 23,
      verb: 'declareUiGraphPolicy',
      family: 'capability-gating',
      wanted:
        'Declare that this route requires IAL2 identity assurance from the IdP before the sign action is reachable, and that the achieved level is recorded on the evidence strip.',
      got:
        'UI Graph Policy carries a11y, locale, and theme. Identity assurance, step-up, and re-auth are enforced in application code and merely displayed here as text.',
      severity: 'missing-feature',
      why:
        'Step-up gating appears on the ceremony, on destructive admin actions, on secret reveal, and on org lifecycle. Four surfaces, one missing predicate. Without it, "the substrate did not expose this action to an unverified actor" is a claim no artifact can support.',
      v7Ref: 'F10',
      suggestion:
        'A `preconditions` block on RoutePolicy taking an opaque predicate (`identityAssurance >= IAL2`, `actorHasGrant(...)`) that any evaluator can satisfy — hook now, semantics with ADR 0152.',
    });

    for (const m of ['x-cloud-signature-capture', 'x-cloud-signer-timeline', 'x-cloud-evidence-strip']) {
      const declared = await mcp.declareModule({ id: m, version: '0.1.0' });
      if (!declared.ok) throw new Error(`declareModule refused: ${declared.error.code}`);
    }

    const routes = [
      {
        routeId: 'ceremony',
        path: '/sign/:envelopeId',
        routeClass: 'ceremony' as const,
        title: 'Sign',
        slots: [
          {
            id: 'ceremonyChrome',
            slotType: 'static-content' as const,
            binding: { kind: 'heading', content: 'Sign as Diane Park · co-signatory', level: 1 },
            title: 'Ceremony',
            position: 'top',
            mockupRegion: 'immutable ceremony chrome — "Receipt · Signature", env id, cancel',
          },
          {
            id: 'attestation',
            slotType: 'static-content' as const,
            binding: {
              kind: 'text',
              content:
                'I, Diane Park, sign this Vendor Onboarding Agreement on behalf of Acme Industrial Supplies and certify that the information herein is accurate and complete to the best of my knowledge.',
            },
            title: 'Attestation',
            position: 'main',
            mockupRegion: 'attestation sentence with interpolated signer + party (authored as a frozen string — no interpolation contract)',
          },
          {
            id: 'signatureCapture',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-signature-capture',
              widgetName: 'SignatureCapture',
              config: {
                modes: ['draw', 'type', 'upload'],
                commitment: 'ed25519-client-side-hash',
                definitionPin: 'sha256:6d4a…ef91',
              },
            },
            title: 'Sign with your name',
            position: 'main',
            mockupRegion: 'draw/type/upload capture with ed25519 client-side hashing and Apply signature action',
          },
          {
            id: 'evidenceStrip',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-evidence-strip',
              widgetName: 'CeremonyEvidence',
              config: {
                fields: ['time', 'ip', 'identityAssurance'],
                dataSource: 'x-spike-v9:host:ceremony-evidence',
              },
            },
            title: 'Evidence',
            position: 'main',
            mockupRegion: 'time / IP / ID.me IAL2 evidence strip',
          },
          {
            id: 'documentSummary',
            slotType: 'static-content' as const,
            binding: { kind: 'heading', content: "What you're signing", level: 2 },
            title: "What you're signing",
            position: 'right',
            mockupRegion: 'document summary — parties, scope, compliance, open-full-document link',
          },
          {
            id: 'signerTimeline',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-signer-timeline',
              widgetName: 'SignerTimeline',
              config: {
                dataSource: 'x-spike-v9:workspace:envelopes/:envelopeId/signers',
                routing: 'sequential',
              },
            },
            title: 'Other signers',
            position: 'right',
            mockupRegion: 'envelope panel + other-signers timeline with completion timestamps',
          },
        ],
      },
    ];

    for (const route of routes) await bindRoute(route);

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      title: 'Signature ceremony policy',
      description:
        'Ceremony chrome is structurally immutable: tenant theming must not reach this route. The substrate has no way to assert that — see finding 6.',
      routePolicies: [{ routeId: 'ceremony', a11y: { landmark: 'main', keyboardNavigation: true } }],
    });
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.code}`);

    return { routes, policy: policy.value };
  },
};
