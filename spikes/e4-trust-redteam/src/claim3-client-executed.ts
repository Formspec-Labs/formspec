/**
 * @filedesc Claim 3 — client-executed actions. A verification action on the
 * verifier route that round-trips to the server, phones the receipt identifier
 * home, and writes a durable ledger event (spike v8 finding 30).
 *
 * The verifier's positioning is "verify without contacting Formspec". That
 * property is a statement about *where an action executes*, and the Response
 * Actions effect taxonomy has no execution-locality axis: every one of the five
 * closed effect types is a request the host fulfils. So this case is the one
 * where "authorable and undetected" understates the problem — the compliant
 * shape is the one that cannot be written.
 */
import type { RedTeamCase } from './harness.js';

const APP = 'https://cloud.formspec.org/apps/verifier';
const SURFACE_URL = `${APP}/surfaces/verifier`;
const RESPONSE_ACTIONS_URL = `${APP}/response-actions/verifier`;
const DEFINITION_URL = `${APP}/definitions/receipt-upload`;

/**
 * Verifier Surface. The `verify` route's transition trigger is the graph-level
 * binding between "the user pressed Verify" and the action that runs.
 */
const surface = {
  $formspecSurface: '0.1',
  id: 'verifier',
  entry: 'verify',
  title: 'Independent receipt verifier',
  routes: [
    {
      id: 'verify',
      path: '/verify',
      routeClass: 'verification',
      title: 'Verify a receipt',
      slots: [
        {
          id: 'receipt-input',
          slotType: 'definition-form',
          title: 'Paste or upload a receipt bundle',
          binding: { definitionRef: DEFINITION_URL },
        },
      ],
      transitions: [{ trigger: 'submit', to: 'result' }],
    },
    {
      id: 'result',
      path: '/verify/result',
      routeClass: 'verification',
      title: 'Verification result',
      slots: [
        {
          id: 'result-body',
          slotType: 'static-content',
          title: 'Result',
          binding: { kind: 'heading', content: 'Verification result', level: 1 },
        },
      ],
    },
  ],
};

/** Definition backing the receipt-input slot. */
const definition = {
  $formspec: '1.0',
  url: DEFINITION_URL,
  version: '1.0.0',
  status: 'active',
  title: 'Receipt upload',
  items: [{ key: 'bundle', type: 'field', dataType: 'string', label: 'Receipt bundle' }],
};

/**
 * The violating Response Actions document.
 *
 * `verify-receipt` fires on the verifier route and does three server-bound
 * things in order: raises a host event carrying the receipt bundle, requests
 * demand-timing evidence collection, and appends a durable ledger event. Each
 * effect is a shipped member of the closed taxonomy. Nothing in the document —
 * and nothing in the schema — can say that this action was supposed to run in
 * the browser and touch no network.
 *
 * Note the intent: the closed `ActionIntent` enum is
 * save-draft | autosave | review | submit | request-evidence. There is no
 * verification-shaped member, so a verifier's defining action has to borrow
 * `submit`, the form-completion verb. v8 finding 30's "action vocabulary is
 * completion-shaped" shows up here as a naming problem before it shows up as a
 * locality problem.
 */
const responseActions = {
  $formspecResponseActions: '1.0',
  version: '1.0.0',
  targetDefinition: { url: DEFINITION_URL },
  actions: [
    {
      id: 'verify-receipt',
      intent: 'submit',
      label: { literal: 'Verify' },
      effects: [
        {
          type: 'hostEvent',
          eventName: 'verifier.bundle-uploaded',
          detailRef: 'bundle',
        },
        {
          type: 'evidenceRequest',
          requestRef: 'server-side-signature-check',
          idempotencyKey: "concat('verify-', bundle)",
          onError: 'fail',
        },
        {
          type: 'ledgerAppend',
          eventKind: 'x-verification.attempted',
          payloadRef: 'bundle',
          idempotencyKey: "concat('verify-ledger-', bundle)",
          onError: 'fail',
        },
      ],
      onFailure: 'stop',
    },
  ],
};

const manifest = {
  $formspecBundle: '2.3',
  version: '1.0.0',
  id: APP,
  title: 'Formspec Cloud — independent verifier',
  definitions: [{ url: DEFINITION_URL, version: '1.0.0' }],
  surfaces: [{ url: SURFACE_URL, version: '1.0.0' }],
  responseActions: { url: RESPONSE_ACTIONS_URL, version: '1.0.0' },
};

export const clientExecutedCase: RedTeamCase = {
  id: 'claim3-client-executed',
  claim:
    'The verifier is independent — "verify without contacting Formspec" — which requires verification to execute client-side and touch no server.',
  v8Finding: 30,
  violation:
    'The verifier route\'s only transition triggers an action whose effect chain is hostEvent → evidenceRequest → ledgerAppend: the receipt bundle leaves the browser and a durable server-side ledger event records the verification attempt.',
  manifest,
  manifestSource: 'e4://claim3/app-manifest',
  documents: {
    [SURFACE_URL]: surface,
    [DEFINITION_URL]: definition,
    [RESPONSE_ACTIONS_URL]: responseActions,
  },
  /**
   * `APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER` is the only code that reads a
   * route→action edge, and it checks resolution (does the trigger name an
   * action?), not locality. Listed here so the run records that the check ran
   * and passed the violating graph rather than never firing.
   */
  wouldCatch: [],
};

export const CLAIM3_SURFACE_URL = SURFACE_URL;
