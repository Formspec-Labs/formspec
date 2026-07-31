/**
 * Build v13 attempt 7 from the retained attempt-6 MCP call plan.
 *
 * The generated bundle remains MCP-owned: this script only authors the next
 * call plan. replay-tool-calls writes the exact server export and provenance.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, 'builder-calls-fast-attempt-6.json');
const outputPath = join(here, 'builder-calls-fast-attempt-7.json');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));

const APP = 'https://demo.formspec.org/apps/managed-single-cell';
const NEEDS = 'https://demo.formspec.org/needs/managed-single-cell-v13';
const DATA = 'https://demo.formspec.org/data-sources/managed-single-cell';
const CREATE_DEFINITION = 'https://demo.formspec.org/definitions/managed-form-create';
const SETTINGS_DEFINITION = 'https://demo.formspec.org/definitions/managed-form-settings';
const PUBLIC_DEFINITION = 'https://demo.formspec.org/definitions/community-intake';
const ACTIONS = {
  create: 'https://demo.formspec.org/response-actions/managed-form-create',
  settings: 'https://demo.formspec.org/response-actions/managed-form-settings',
  public: 'https://demo.formspec.org/response-actions/community-intake',
  app: 'https://demo.formspec.org/response-actions/managed-single-cell-app',
};

const generation = (...ids) => ({
  'x-generation': { anchors: ids.map((id) => `need:${id}@1`) },
});
const selector = (from, path) => ({ from, path });
const literal = (value) => ({ from: 'literal', value });
const serviceEffect = (requestRef, suffix) => ({
  type: 'serviceRequest',
  requestRef,
  idempotencyKey: `@invocation.id & '/${suffix}'`,
  onError: 'fail',
});
const hostEvent = (eventName) => ({ type: 'hostEvent', eventName });
const action = (id, intent, label, needIds, effects) => ({
  id,
  intent,
  label: { literal: label },
  ...generation(...needIds),
  effects,
});
const request = (id, method, pathTemplate, needIds, options = {}) => ({
  id,
  adapter: 'http-json',
  request: {
    method,
    pathTemplate,
    ...(options.pathBindings ? { pathBindings: options.pathBindings } : {}),
    ...(options.queryBindings ? { queryBindings: options.queryBindings } : {}),
    ...(options.bodyDefaults ? { bodyDefaults: options.bodyDefaults } : {}),
    ...(options.bodyBindings ? { bodyBindings: options.bodyBindings } : {}),
  },
  ...(options.successStatuses ? { successStatuses: options.successStatuses } : {}),
  ...(options.outputs ? { outputs: options.outputs } : {}),
  ...generation(...needIds),
});

const publicDefinition = JSON.parse(await readFile(
  join(here, 'exported-bundle-fast-attempt-6.json'),
  'utf8',
)).documents[PUBLIC_DEFINITION];

const createActionsDocument = {
  $formspecResponseActions: '1.0',
  version: '1.0.0',
  scope: 'response',
  targetDefinition: { url: CREATE_DEFINITION, compatibleVersions: '1.0.0' },
  actions: [
    action('createForm', 'submit', 'Create form', ['manageForm'], [
      serviceEffect('createManagedForm', 'create-form'),
    ]),
  ],
  'x-formspec-runtime': {
    version: '1.0',
    requests: [
      request('createManagedForm', 'POST', '/forms', ['manageForm'], {
        bodyDefaults: { created_by: 'principal_v13_owner' },
        bodyBindings: {
          '/display_name': selector('input', 'response.data.displayName'),
          '/slug': selector('input', 'response.data.slug'),
        },
        outputs: {
          formId: { path: '/form_id', exposure: 'transition' },
        },
      }),
    ],
  },
};

const settingsActionsDocument = {
  $formspecResponseActions: '1.0',
  version: '1.0.0',
  scope: 'response',
  targetDefinition: { url: SETTINGS_DEFINITION, compatibleVersions: '1.0.0' },
  actions: [
    action('saveFormDraft', 'save-draft', 'Save draft', ['manageForm'], [
      serviceEffect('saveManagedFormDraft', 'save-form-draft'),
    ]),
    action('publishForm', 'submit', 'Publish version', ['publishForm', 'embedPublishedForm'], [
      serviceEffect('publishManagedForm', 'publish-form'),
    ]),
  ],
  'x-formspec-runtime': {
    version: '1.0',
    requests: [
      request('saveManagedFormDraft', 'PATCH', '/forms/{formId}/draft', ['manageForm'], {
        pathBindings: { formId: selector('route', 'formId') },
        bodyBindings: {
          '/display_name': selector('input', 'response.data.displayName'),
        },
        outputs: { savedFormId: { path: '/form_id' } },
      }),
      request('publishManagedForm', 'POST', '/forms/{formId}/versions/publish', ['publishForm', 'embedPublishedForm'], {
        pathBindings: { formId: selector('route', 'formId') },
        bodyDefaults: {
          definition_url: PUBLIC_DEFINITION,
          definition_version: '1.0.0',
          definition: publicDefinition,
          definition_hash: 'sha256:v13-community-intake-v1',
          theme_ref: null,
          locale_refs: ['en-US'],
          references: [],
          ontology: { fallback: 'not_configured' },
          component_document: { fallback: 'not_configured' },
          runtime_config: {
            mode: 'published',
            access_mode: 'public',
            signature_mode: 'none',
            notifications: { owner: true, respondent: false },
            post_submit: {
              thank_you: 'Your response was received.',
              locale: 'en-US',
              handoff: { kind: 'receipt' },
            },
          },
          created_by: 'principal_v13_owner',
        },
        bodyBindings: {
          '/runtime_config/access_mode': selector('input', 'response.data.accessMode'),
          '/runtime_config/signature_mode': selector('input', 'response.data.signatureMode'),
          '/runtime_config/notifications/respondent': selector('input', 'response.data.sendReceiptEmail'),
          '/runtime_config/post_submit/thank_you': selector('input', 'response.data.confirmationMessage'),
        },
        outputs: {
          publishedFormId: { path: '/form_id', exposure: 'session' },
          formVersionId: { path: '/form_version_id', exposure: 'session' },
          shareUrl: { path: '/share_url' },
        },
      }),
    ],
  },
};

const publicActionsDocument = {
  $formspecResponseActions: '1.0',
  version: '1.0.0',
  scope: 'response',
  targetDefinition: { url: PUBLIC_DEFINITION, compatibleVersions: '1.0.0' },
  actions: [
    action('reviewPublicResponse', 'review', 'Review response', ['reviewResponse'], [
      serviceEffect('createAnonymousSession', 'anonymous-session'),
      serviceEffect('createPublicDraft', 'public-draft'),
    ]),
    action('submitPublicResponse', 'submit', 'Submit response', ['submissionProof', 'postSubmit'], [
      serviceEffect('submitPublicDraft', 'submit-public-draft'),
    ]),
    action('submitPublicResponseForSignature', 'submit', 'Submit and request signature', ['signatureRequirement', 'signatureEnvelope'], [
      serviceEffect('submitPublicDraftForSignature', 'submit-public-draft-for-signature'),
      serviceEffect('createPublicSignatureEnvelope', 'create-public-signature-envelope'),
    ]),
  ],
  'x-formspec-runtime': {
    version: '1.0',
    requests: [
      request('createAnonymousSession', 'POST', '/runtime/forms/{formId}/sessions/anonymous', ['accessibleResponse', 'reviewResponse'], {
        pathBindings: { formId: selector('route', 'formId') },
        bodyDefaults: {},
        outputs: {
          anonymousSessionToken: { path: '/session_token' },
          publicSessionToken: { path: '/session_token', exposure: 'session' },
          anonymousSubjectRef: { path: '/subject_ref' },
          publicSubjectRef: { path: '/subject_ref', exposure: 'session' },
        },
      }),
      request('createPublicDraft', 'POST', '/runtime/forms/{formId}/drafts', ['reviewResponse'], {
        pathBindings: { formId: selector('route', 'formId') },
        bodyDefaults: {},
        bodyBindings: {
          '/anonymous_session_token': selector('result', 'anonymousSessionToken'),
          '/anonymous_subject_ref': selector('result', 'anonymousSubjectRef'),
          '/draft_state': selector('input', 'response.data'),
        },
        outputs: {
          draftId: { path: '/draft_id', exposure: 'session' },
          draftVersion: { path: '/form_version_id', exposure: 'session' },
        },
      }),
      request('submitPublicDraft', 'POST', '/drafts/{draftId}/submit', ['submissionProof', 'postSubmit'], {
        pathBindings: { draftId: selector('session', 'draftId') },
        bodyDefaults: { subject_ref: null, signing_requested: false },
        bodyBindings: {
          '/response_data': selector('input', 'response.data'),
          '/anonymous_session_token': selector('session', 'publicSessionToken'),
        },
        outputs: {
          responseId: { path: '/response_id', exposure: 'transition' },
          acceptedResponseId: { path: '/response_id', exposure: 'session' },
        },
      }),
      request('submitPublicDraftForSignature', 'POST', '/drafts/{draftId}/submit', ['signatureRequirement', 'signatureEnvelope'], {
        pathBindings: { draftId: selector('session', 'draftId') },
        bodyDefaults: { subject_ref: null, signing_requested: true },
        bodyBindings: {
          '/response_data': selector('input', 'response.data'),
          '/anonymous_session_token': selector('session', 'publicSessionToken'),
        },
        outputs: {
          signatureResponseId: { path: '/response_id' },
          signedPayloadDigest: { path: '/signed_payload_digest' },
        },
      }),
      request('createPublicSignatureEnvelope', 'POST', '/signature-envelopes', ['signatureEnvelope'], {
        bodyDefaults: {
          signers: [{ signer_id: 'v13Signer', email: null, role: 'respondent' }],
        },
        bodyBindings: {
          '/response_id': selector('result', 'signatureResponseId'),
          '/signers/0/email': selector('input', 'response.data.email'),
        },
        outputs: {
          envelopeId: { path: '/envelope_id', exposure: 'transition' },
          activeEnvelopeId: { path: '/envelope_id', exposure: 'session' },
          signedResponseId: { path: '/response_id', exposure: 'session' },
        },
      }),
    ],
  },
};

const appActions = [
  action('openForm', 'review', 'Open form', ['manageForm'], [hostEvent('formspec.navigate.form')]),
  action('openVersions', 'review', 'View versions', ['protectVersions'], [hostEvent('formspec.navigate.versions')]),
  action('returnToForm', 'review', 'Return to form', ['protectVersions'], [hostEvent('formspec.navigate.form-return')]),
  action('openResponses', 'review', 'View responses', ['reviewResponses'], [hostEvent('formspec.navigate.responses')]),
  action('openResponse', 'review', 'Open response', ['reviewResponses'], [hostEvent('formspec.navigate.response')]),
  action('openReceipt', 'review', 'Open receipt', ['submissionProof'], [hostEvent('formspec.navigate.receipt')]),
  action('openSignatures', 'review', 'View signatures', ['signatureEnvelope'], [hostEvent('formspec.navigate.signatures')]),
  action('openSigner', 'review', 'Open signer view', ['signatureEnvelope'], [hostEvent('formspec.navigate.signer')]),
  action('openPublicForm', 'review', 'Open public form', ['publishForm', 'embedPublishedForm'], [hostEvent('formspec.navigate.public-form')]),
  action('editPublicResponse', 'review', 'Edit response', ['reviewResponse'], [hostEvent('formspec.navigate.response-edit')]),
  action('returnToReceipt', 'review', 'Return to receipt', ['submissionProof'], [hostEvent('formspec.navigate.receipt-return')]),
  action('viewReadiness', 'request-evidence', 'View cell readiness', ['operateCell'], [hostEvent('formspec.navigate.readiness')]),
  action('returnToForms', 'review', 'Return to forms', ['manageForm'], [hostEvent('formspec.navigate.forms')]),
  action('retireVersion', 'submit', 'Retire selected version', ['protectVersions'], [serviceEffect('retirePublishedVersion', 'retire-version')]),
  action('emailReceipt', 'request-evidence', 'Email receipt link', ['notifyReceipt'], [serviceEffect('queueReceiptEmail', 'email-receipt')]),
  action('materializeProof', 'request-evidence', 'Materialize receipt proof', ['submissionProof', 'verifyIntegrity'], [serviceEffect('materializeReceiptProof', 'materialize-proof')]),
  action('verifyReceipt', 'request-evidence', 'Verify proof', ['verifyIntegrity'], [serviceEffect('verifyReceiptProof', 'verify-proof')]),
  action('remediateProof', 'request-evidence', 'Retry failed proof', ['submissionProof', 'verifyIntegrity'], [serviceEffect('remediateReceiptProof', 'remediate-proof')]),
  action('createEnvelope', 'submit', 'Create signature envelope', ['signatureEnvelope'], [serviceEffect('createSignatureEnvelope', 'create-envelope')]),
  action('sendReminder', 'request-evidence', 'Send reminder', ['signatureStatus'], [serviceEffect('queueSignatureReminder', 'signature-reminder')]),
  action('completeSignature', 'submit', 'Complete signature', ['signatureEnvelope', 'signatureCertificate'], [serviceEffect('completeEnvelopeSigner', 'complete-signature')]),
  action('exportCsv', 'request-evidence', 'Export CSV', ['reviewResponses'], [{ type: 'browserResource', operation: 'open', resourceRef: 'resource', target: 'new' }]),
  action('exportJson', 'request-evidence', 'Export JSON', ['reviewResponses'], [{ type: 'browserResource', operation: 'open', resourceRef: 'resource', target: 'new' }]),
];

const appActionsDocument = {
  $formspecResponseActions: '1.0',
  version: '1.0.0',
  scope: 'app',
  actions: appActions,
  'x-formspec-runtime': {
    version: '1.0',
    requests: [
      request('retirePublishedVersion', 'POST', '/forms/{formId}/versions/{formVersionId}/retire', ['protectVersions'], {
        pathBindings: {
          formId: selector('route', 'formId'),
          formVersionId: selector('session', 'formVersionId'),
        },
        bodyDefaults: {},
      }),
      request('queueReceiptEmail', 'POST', '/responses/{responseId}/receipt/email', ['notifyReceipt'], {
        pathBindings: { responseId: selector('route', 'responseId') },
        bodyDefaults: { include_sensitive_content: false },
        bodyBindings: { '/recipient': selector('input', 'recipient') },
        outputs: { deliveryIntentId: { path: '/delivery_intent_id' } },
      }),
      request('materializeReceiptProof', 'POST', '/responses/{responseId}/receipt/materialize', ['submissionProof', 'verifyIntegrity'], {
        pathBindings: { responseId: selector('route', 'responseId') },
        bodyDefaults: { force_verifier_failure: false },
        outputs: { proofState: { path: '/proof_state' } },
      }),
      request('verifyReceiptProof', 'POST', '/responses/{responseId}/receipt/verify', ['verifyIntegrity'], {
        pathBindings: { responseId: selector('route', 'responseId') },
        bodyDefaults: {},
        outputs: { proofArtifactRef: { path: '/artifact_ref' } },
      }),
      request('remediateReceiptProof', 'POST', '/responses/{responseId}/receipt/remediate', ['submissionProof', 'verifyIntegrity'], {
        pathBindings: { responseId: selector('route', 'responseId') },
        bodyDefaults: { reason: 'Operator requested retry after proof failure.' },
        outputs: { remediationJobId: { path: '/outbox_job_id' } },
      }),
      request('createSignatureEnvelope', 'POST', '/signature-envelopes', ['signatureEnvelope'], {
        bodyDefaults: { signers: [{ signer_id: 'v13Signer', email: null, role: 'respondent' }] },
        bodyBindings: {
          '/response_id': selector('input', 'responseId'),
          '/signers/0/email': selector('input', 'signerEmail'),
        },
        outputs: {
          envelopeId: { path: '/envelope_id', exposure: 'transition' },
          activeEnvelopeId: { path: '/envelope_id', exposure: 'session' },
          signedResponseId: { path: '/response_id', exposure: 'session' },
        },
      }),
      request('queueSignatureReminder', 'POST', '/signature-envelopes/{envelopeId}/reminders', ['signatureStatus'], {
        pathBindings: { envelopeId: selector('input', 'envelopeId') },
        bodyDefaults: {},
      }),
      request('completeEnvelopeSigner', 'POST', '/signature-envelopes/{envelopeId}/signers/{signerId}/complete', ['signatureEnvelope', 'signatureCertificate'], {
        pathBindings: {
          envelopeId: selector('input', 'envelopeId'),
          signerId: selector('input', 'signerId'),
        },
        bodyDefaults: { disclosure_accepted: true, signature_method: 'electronic-signature' },
        bodyBindings: {
          '/signer_token': selector('input', 'signerToken'),
          '/signed_payload_digest': selector('input', 'signedPayloadDigest'),
        },
        outputs: {
          responseId: { path: '/response_id', exposure: 'transition' },
          envelopeId: { path: '/envelope_id', exposure: 'transition' },
        },
      }),
    ],
  },
};

const responseActionCalls = [
  [ACTIONS.create, createActionsDocument],
  [ACTIONS.settings, settingsActionsDocument],
  [ACTIONS.public, publicActionsDocument],
  [ACTIONS.app, appActionsDocument],
].map(([url, document]) => ({
  name: 'formspec_wireframes_materialize_response_actions',
  arguments: { url, document },
}));

const objectSchema = (properties, required = []) => ({
  type: 'object',
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: true,
});
const string = { type: 'string' };
const nullableString = { type: ['string', 'null'] };
const integer = { type: 'integer' };
const boolean = { type: 'boolean' };
const jsonObject = { type: 'object', additionalProperties: true };
const formSchema = objectSchema({
  form_id: string,
  slug: string,
  display_name: string,
  created_by: string,
  archived_at: nullableString,
  draft_version: integer,
  version_lineage: { type: 'array', items: string },
}, ['form_id', 'slug', 'display_name', 'draft_version', 'version_lineage']);
const responseSchema = objectSchema({
  response_id: string,
  form_version_id: string,
  draft_id: string,
  accepted_at: string,
  response_data: objectSchema({ email: string }),
  status: { type: 'string', enum: ['accepted', 'completed', 'signed'] },
  proof_state: { type: 'string', enum: ['accepted', 'proof_pending', 'proof_ready', 'proof_failed'] },
  response_hash: string,
  signed_payload_digest: { type: ['object', 'null'], additionalProperties: true },
}, ['response_id', 'form_version_id', 'accepted_at', 'response_data', 'status', 'proof_state', 'response_hash']);
const receiptSchema = objectSchema({
  receipt_id: string,
  aggregate_id: string,
  accepted_at: string,
  proof_state: { type: 'string', enum: ['accepted', 'proof_pending', 'proof_ready', 'proof_failed'] },
  verified: boolean,
  response_hash: { type: ['string', 'null'] },
  checkpoint_reference: { type: ['string', 'null'] },
  proof_report_ref: { type: ['string', 'null'] },
  rendered_object_refs: { type: 'array', items: jsonObject },
  remediation: { type: ['object', 'null'], additionalProperties: true },
}, ['receipt_id', 'aggregate_id', 'accepted_at', 'proof_state', 'verified', 'rendered_object_refs']);
const envelopeSchema = objectSchema({
  envelope_id: string,
  response_id: string,
  form_version_id: string,
  envelope_status: string,
  signed_payload_digest: { type: ['object', 'null'], additionalProperties: true },
  signers: {
    type: 'array',
    items: objectSchema({
      signer_id: string,
      email: nullableString,
      role: string,
      status: string,
      signer_token: string,
    }, ['signer_id', 'role', 'status', 'signer_token']),
  },
}, ['envelope_id', 'response_id', 'form_version_id', 'envelope_status', 'signers']);
const certificateSchema = objectSchema({
  envelope_id: string,
  artifact_kind: { type: 'string', const: 'signature_certificate' },
  proof_state: { type: 'string', enum: ['proof_pending', 'proof_ready', 'proof_failed'] },
  independently_verifiable: boolean,
  signer_events: { type: 'array', items: jsonObject },
  offline_verification: jsonObject,
}, ['envelope_id', 'artifact_kind', 'proof_state', 'independently_verifiable', 'signer_events']);
const formResponseSchema = objectSchema({
  $formspecResponse: { type: 'string', const: '1.0' },
  definitionUrl: { type: 'string', const: PUBLIC_DEFINITION },
  definitionVersion: { type: 'string', const: '1.0.0' },
  status: { type: 'string', enum: ['in-progress', 'completed', 'amended', 'stopped'] },
  data: objectSchema({
    fullName: string,
    email: string,
    program: string,
    request: string,
    attestAccuracy: boolean,
  }, ['fullName', 'email', 'program', 'request', 'attestAccuracy']),
  authored: string,
}, ['$formspecResponse', 'definitionUrl', 'definitionVersion', 'status', 'data', 'authored']);

function httpSource(id, kind, pathTemplate, schema, description, needs, options = {}) {
  return {
    id,
    kind,
    ...(options.definitionRef ? { definitionRef: options.definitionRef } : {}),
    owner: options.owner ?? 'host',
    scope: options.scope ?? 'resource',
    availability: {
      level: 'app',
      ...(options.definitionRef ? { definitionRef: options.definitionRef } : {}),
    },
    runtime: {
      delivery: options.delivery ?? 'live',
      cache: options.cache ?? { mode: 'subscribe', staleAfter: 'PT15S' },
      authorizationBoundary: options.authorizationBoundary ?? 'host',
      failureMode: options.failureMode ?? 'empty-state',
      provenance: { kind, source: options.provenance ?? `GET ${pathTemplate}` },
    },
    schema,
    description,
    ...generation(...needs),
    ...(pathTemplate ? {
      'x-formspec-runtime': {
        adapter: 'http-json',
        request: { method: 'GET', pathTemplate },
      },
    } : {}),
  };
}

const strongSources = [
  httpSource('query:forms', 'query-result', '/forms', { type: 'array', items: formSchema }, 'Managed forms returned by the active cell.', ['manageForm']),
  httpSource('resource:form', 'document-resource', '/forms/{formId}', formSchema, 'One managed form.', ['manageForm']),
  httpSource('resource:runtime-form', 'document-resource', '/runtime/forms/{formId}', objectSchema({
    form_version_id: string,
    form_id: string,
    definition_url: string,
    definition_version: string,
    definition_hash: string,
    definition: jsonObject,
    runtime_config: jsonObject,
    brand: jsonObject,
  }, ['form_version_id', 'form_id', 'definition_url', 'definition_version', 'definition_hash', 'definition', 'runtime_config', 'brand']), 'Published runtime configuration used by hosted and embedded forms.', ['publishForm', 'embedPublishedForm']),
  httpSource('resource:form-sessions', 'document-resource', '/forms/{formId}/sessions', objectSchema({
    form_id: string,
    by_version: { type: 'array', items: objectSchema({ form_version_id: string, status: string, active_sessions: integer }, ['form_version_id', 'status', 'active_sessions']) },
  }, ['form_id', 'by_version']), 'Immutable versions and active-session counts.', ['protectVersions']),
  httpSource('query:responses', 'query-result', '/responses', { type: 'array', items: responseSchema }, 'Accepted responses.', ['reviewResponses']),
  httpSource('resource:response', 'document-resource', '/responses/{responseId}', responseSchema, 'One accepted response.', ['reviewResponses', 'submissionProof']),
  httpSource('resource:proof-states', 'document-resource', '/responses/{responseId}/proof-states', objectSchema({ states: { type: 'array', items: string } }, ['states']), 'Allowed response proof states.', ['submissionProof']),
  httpSource('resource:receipt', 'document-resource', '/responses/{responseId}/receipt', receiptSchema, 'Verifier-backed receipt state.', ['submissionProof', 'verifyIntegrity']),
  httpSource('resource:signature-envelope', 'document-resource', '/signature-envelopes/{envelopeId}', envelopeSchema, 'Signature envelope and signer state.', ['signatureEnvelope', 'signatureStatus']),
  httpSource('resource:signature-certificate', 'document-resource', '/signature-envelopes/{envelopeId}/certificate', certificateSchema, 'Signature certificate when proof is ready.', ['signatureCertificate']),
  httpSource('resource:readiness', 'document-resource', '/ready', objectSchema({
    status: string,
    components: { type: 'array', items: objectSchema({ id: string, status: string, detail: string }, ['id', 'status']) },
  }, ['status', 'components']), 'Active ManagedSingleCell readiness response.', ['operateCell'], { failureMode: 'block-render', cache: { mode: 'subscribe' } }),
  httpSource('response:public-intake', 'definition-response', null, formResponseSchema, 'Current public response draft for review.', ['reviewResponse'], {
    definitionRef: PUBLIC_DEFINITION,
    owner: 'formspec',
    scope: 'definition',
    delivery: 'draft',
    cache: { mode: 'draft' },
    authorizationBoundary: 'formspec-session',
    provenance: 'active public response draft',
  }),
  {
    id: 'resource:response-export-links',
    kind: 'document-resource',
    owner: 'formspec',
    scope: 'resource',
    availability: { level: 'app' },
    runtime: {
      delivery: 'snapshot',
      cache: { mode: 'snapshot' },
      authorizationBoundary: 'host',
      failureMode: 'empty-state',
      provenance: { kind: 'document-resource', source: 'authored response export resources' },
    },
    schema: objectSchema({
      csv: objectSchema({ href: { type: 'string', const: '/responses/export?format=csv' } }, ['href']),
      json: objectSchema({ href: { type: 'string', const: '/responses/export?format=json' } }, ['href']),
    }, ['csv', 'json']),
    description: 'Safe same-origin response export resources.',
    ...generation('reviewResponses'),
    'x-formspec-runtime': {
      adapter: 'embedded-json',
      value: {
        csv: { href: '/responses/export?format=csv' },
        json: { href: '/responses/export?format=json' },
      },
    },
  },
];

const actors = [
  ['formOwner', 'Form owner', 'Creates, publishes, and reviews managed forms and responses.'],
  ['respondent', 'Respondent', 'Completes, reviews, and submits a public response.'],
  ['signerCoordinator', 'Signature coordinator', 'Creates envelopes and follows signer progress.'],
  ['signer', 'Signer', 'Reads the attestation and completes the signature ceremony.'],
  ['auditor', 'Verifier', 'Checks receipt and certificate proof independently.'],
  ['operator', 'Cell operator', 'Checks the active cell and remediates failed proof work.'],
  ['integrator', 'Integrator', 'Uses the published runtime endpoint and embed snippet.'],
].map(([actor_id, title, description]) => ({
  name: 'formspec_wireframes_add_experience_actor',
  arguments: { actor_id, title, description },
}));

const tasks = [
  ['createManagedForm', 'Create a managed form', ['formOwner']],
  ['publishRuntime', 'Publish and distribute an immutable runtime', ['formOwner', 'integrator']],
  ['protectPublishedVersions', 'Inspect and retire published versions safely', ['formOwner']],
  ['reviewAcceptedResponses', 'Find and inspect accepted responses', ['formOwner']],
  ['coordinateSignatures', 'Create and track signature envelopes', ['signerCoordinator']],
  ['completePublicResponse', 'Complete and review the public form', ['respondent']],
  ['signSubmittedResponse', 'Complete the disclosed signing act', ['signer']],
  ['retainSubmissionReceipt', 'Keep the accepted response receipt', ['respondent']],
  ['verifyProof', 'Check materialized proof and exact gaps', ['auditor', 'operator']],
  ['inspectReadiness', 'Inspect active cell readiness', ['operator']],
].map(([task_id, title, actor_refs]) => ({
  name: 'formspec_wireframes_add_experience_task',
  arguments: { task_id, title, actor_refs },
}));

const unitContext = {
  ownerForms: ['formOwner', ['createManagedForm']],
  ownerWorkspace: ['formOwner', ['publishRuntime']],
  versionControl: ['formOwner', ['protectPublishedVersions']],
  responseQueue: ['formOwner', ['reviewAcceptedResponses']],
  responseInspection: ['formOwner', ['reviewAcceptedResponses', 'verifyProof']],
  signatureOperations: ['signerCoordinator', ['coordinateSignatures']],
  readinessReview: ['operator', ['inspectReadiness']],
  respondentEntry: ['respondent', ['completePublicResponse']],
  respondentReview: ['respondent', ['completePublicResponse']],
  signerCeremony: ['signer', ['signSubmittedResponse']],
  receiptConfirmation: ['respondent', ['retainSubmissionReceipt', 'verifyProof']],
  proofVerification: ['auditor', ['verifyProof']],
};

function updateRegistry(call) {
  if (call.arguments?.operation !== 'add_entry' || call.arguments?.widget_name !== 'QueueTable') return call;
  const nodes = call.arguments.entry.widgetShape.renderedConfigNodes;
  for (const node of [
    { pointerPattern: '/rowKey', kind: 'queue-table-row-key' },
    { pointerPattern: '/rowHeaderKey', kind: 'queue-table-row-header-key' },
  ]) {
    if (!nodes.some((entry) => entry.pointerPattern === node.pointerPattern)) nodes.push(node);
  }
  return call;
}

function updateSlot(call) {
  const slot = call.arguments;
  const binding = slot.binding;
  if (slot.route_id === 'forms' && slot.slot_id === 'formCreation') {
    binding.definitionRef = CREATE_DEFINITION;
  }
  if (binding?.widgetName === 'QueueTable') {
    binding.config.rowKey = slot.route_id === 'forms' ? 'form_id' : 'response_id';
    binding.config.rowHeaderKey = slot.route_id === 'forms' ? 'display_name' : 'response_id';
  }
  if (slot.route_id === 'formWorkspace' && slot.slot_id === 'formFacts') {
    binding.dataBindings.secondary.sourceRef = 'resource:runtime-form';
    binding.config.actions = binding.config.actions.slice(2);
    binding.actionBindings = {
      primary: binding.actionBindings.tertiary,
      secondary: binding.actionBindings.danger,
    };
  }
  if (slot.route_id === 'formVersions' && slot.slot_id === 'versionPanel') {
    binding.dataBindings.primary.sourceRef = 'resource:form-sessions';
    binding.config.blocks[0].type = 'table';
    binding.config.blocks[0].path = 'primary.by_version';
    binding.config.blocks[0].caption = 'Published versions';
    binding.config.blocks[0].responsiveMode = 'stack';
    binding.config.blocks[0].columns = [
      { id: 'version', label: 'Version', path: 'form_version_id', ...generation('protectVersions') },
      { id: 'status', label: 'Status', path: 'status', ...generation('protectVersions') },
      { id: 'sessions', label: 'Active sessions', path: 'active_sessions', ...generation('protectVersions') },
    ];
    delete binding.config.blocks[0].items;
  }
  if (slot.route_id === 'forms' && slot.slot_id === 'formsActions') {
    binding.config.actions = binding.config.actions.slice(2);
    binding.actionBindings = {
      primary: binding.actionBindings.tertiary,
      secondary: binding.actionBindings.danger,
    };
  }
  if (slot.route_id === 'responses' && slot.slot_id === 'responseActions') {
    binding.dataBindings = {
      primary: { catalogRef: DATA, sourceRef: 'resource:response-export-links', ...generation('reviewResponses') },
    };
    binding.config.actions = [
      { outputName: 'primary', payload: { resource: { path: 'primary.csv' } }, ...generation('reviewResponses') },
      { outputName: 'secondary', payload: { resource: { path: 'primary.json' } }, ...generation('reviewResponses') },
    ];
    binding.actionBindings = {
      primary: { actionRef: 'exportCsv', ...generation('reviewResponses') },
      secondary: { actionRef: 'exportJson', ...generation('reviewResponses') },
    };
  }
  if (slot.route_id === 'responseDetail' && slot.slot_id === 'responsePanel') {
    binding.config.actions = [
      binding.config.actions[0],
      { outputName: 'secondary', payload: { recipient: { path: 'primary.response_data.email' } }, ...generation('notifyReceipt') },
      { outputName: 'tertiary', ...generation('verifyIntegrity') },
    ];
    binding.actionBindings = {
      primary: binding.actionBindings.primary,
      secondary: { actionRef: 'emailReceipt', ...generation('notifyReceipt') },
      tertiary: { actionRef: 'remediateProof', ...generation('verifyIntegrity') },
    };
  }
  if (slot.route_id === 'signatures' && slot.slot_id === 'signaturePanel') {
    binding.dataBindings = {
      primary: { catalogRef: DATA, sourceRef: 'query:responses', ...generation('signatureEnvelope') },
    };
    binding.config.title = 'Responses available for signature';
    binding.config.body = 'Create an envelope only for a response that exposes a signed payload digest.';
    binding.config.blocks = [{
      id: 'signatureCandidates',
      type: 'table',
      path: 'primary',
      caption: 'Accepted responses',
      responsiveMode: 'stack',
      columns: [
        { id: 'response', label: 'Response', path: 'response_id', ...generation('signatureEnvelope') },
        { id: 'status', label: 'Status', path: 'status', ...generation('signatureStatus') },
      ],
      rowAction: {
        outputName: 'primary',
        label: 'Create envelope',
        payload: {
          responseId: { path: 'response_id' },
          signerEmail: { path: 'response_data.email' },
        },
        ...generation('signatureEnvelope'),
      },
      ...generation('signatureEnvelope'),
    }];
    binding.config.actions = [];
    binding.actionBindings = {
      primary: { actionRef: 'createEnvelope', ...generation('signatureEnvelope') },
    };
  }
  if (slot.route_id === 'publicReview' && slot.slot_id === 'reviewPanel') {
    binding.config.actions = [
      { outputName: 'primary', ...generation('reviewResponse') },
    ];
    binding.actionBindings = {
      primary: { actionRef: 'editPublicResponse', ...generation('reviewResponse') },
    };
  }
  if (slot.route_id === 'publicSign' && slot.slot_id === 'signatureAction') {
    binding.dataBindings = {
      primary: { catalogRef: DATA, sourceRef: 'resource:signature-envelope', ...generation('signatureEnvelope', 'signatureCertificate') },
    };
    binding.config.actions[0].payload = {
      envelopeId: { path: 'primary.envelope_id' },
      signerId: { path: 'primary.signers.0.signer_id' },
      signerToken: { path: 'primary.signers.0.signer_token' },
      signedPayloadDigest: { path: 'primary.signed_payload_digest' },
    };
  }
  if (slot.route_id === 'publicReceipt' && slot.slot_id === 'receiptActions') {
    binding.config.actions = [
      { outputName: 'primary', ...generation('verifyIntegrity') },
      { outputName: 'secondary', ...generation('submissionProof', 'verifyIntegrity') },
    ];
    binding.actionBindings = {
      primary: { actionRef: 'verifyReceipt', ...generation('verifyIntegrity') },
      secondary: { actionRef: 'materializeProof', ...generation('submissionProof', 'verifyIntegrity') },
    };
  }
  if (slot.route_id === 'publicVerify' && slot.slot_id === 'verificationPanel') {
    binding.config.blocks[0].items = binding.config.blocks[0].items.filter((item) => item.id !== 'certificate');
    delete binding.dataBindings.secondary;
    binding.config.actions = [binding.config.actions[1]];
    binding.actionBindings = { primary: binding.actionBindings.secondary };
  }
  return call;
}

function updateTransition(call) {
  const t = call.arguments;
  const sameParamTransitions = new Set([
    'formWorkspace:openVersions',
    'formWorkspace:openPublicForm',
    'formVersions:returnToForm',
    'responseDetail:openReceipt',
    'publicRespond:reviewPublicResponse',
    'publicReview:editPublicResponse',
    'publicReceipt:verifyReceipt',
    'publicVerify:returnToReceipt',
  ]);
  if (sameParamTransitions.has(`${t.route_id}:${t.trigger}`)) delete t.params;
  if (t.trigger === 'beginSignature') {
    t.trigger = 'submitPublicResponseForSignature';
    t.params = { envelopeId: 'envelopeId' };
  }
  if (t.route_id === 'publicSign' && t.trigger === 'completeSignature') {
    t.to = 'signatureCertificate';
    t.params = { responseId: 'responseId', envelopeId: 'envelopeId' };
  }
  return call;
}

const createDefinitionCalls = [
  {
    name: 'formspec_wireframes_edit_definition',
    arguments: { operation: 'declare', definition_url: CREATE_DEFINITION, version: '1.0.0', ...generation('manageForm') },
  },
  {
    name: 'formspec_wireframes_edit_definition',
    arguments: {
      operation: 'add_field', definition_url: CREATE_DEFINITION, path: 'displayName', label: 'Form name', data_type: 'string', required: true,
      presentation: { widgetHint: 'TextInput', layout: { flow: 'stack' } }, ...generation('manageForm'),
    },
  },
  {
    name: 'formspec_wireframes_edit_definition',
    arguments: {
      operation: 'add_field', definition_url: CREATE_DEFINITION, path: 'slug', label: 'Public link name', data_type: 'string', required: true,
      presentation: { widgetHint: 'TextInput', layout: { flow: 'stack' } }, ...generation('publishForm', 'embedPublishedForm'),
    },
  },
];

const extraRouteCall = {
  name: 'formspec_wireframes_add_route',
  arguments: {
    route_id: 'signatureCertificate',
    path: '/signatures/{envelopeId}/certificate/{responseId}',
    params: [
      { name: 'envelopeId', type: 'string', description: 'Signature envelope identifier.' },
      { name: 'responseId', type: 'string', description: 'Signed response identifier.' },
    ],
    title: 'Signature certificate',
    route_class: 'proof',
    navigation: { visible: false, ...generation('signatureCertificate') },
    ...generation('signatureCertificate'),
  },
};

const extraUnitCalls = [
  {
    name: 'formspec_wireframes_add_experience_unit',
    arguments: {
      unit_id: 'signatureCertificateReview', kind: 'review', title: 'Inspect the signature certificate',
      actor_ref: 'auditor', task_refs: ['verifyProof'],
      action_refs: [{ id: 'returnToReceipt', role: 'primary' }],
    },
  },
  { name: 'formspec_wireframes_cite_need', arguments: { unit_id: 'signatureCertificateReview', need_id: 'signatureCertificate' } },
  { name: 'formspec_wireframes_cite_need', arguments: { unit_id: 'signatureCertificateReview', need_id: 'submissionProof' } },
];

const extraSlotCalls = [
  {
    name: 'formspec_wireframes_bind_slot',
    arguments: {
      route_id: 'publicReview', slot_id: 'reviewForm', position: 'main', title: 'Reviewed response', slot_type: 'definition-form',
      binding: { definitionRef: PUBLIC_DEFINITION, presentation: 'review' },
      ...generation('reviewResponse', 'submissionProof', 'signatureRequirement'),
    },
  },
  {
    name: 'formspec_wireframes_bind_slot',
    arguments: {
      route_id: 'signatureCertificate', slot_id: 'certificateExperience', position: 'aside', title: 'Certificate outcome', slot_type: 'experience-unit',
      binding: { unitRef: 'signatureCertificateReview' }, ...generation('signatureCertificate'),
    },
  },
  {
    name: 'formspec_wireframes_bind_slot',
    arguments: {
      route_id: 'signatureCertificate', slot_id: 'certificatePanel', position: 'main', title: 'Verifier-backed certificate', slot_type: 'module-widget',
      binding: {
        moduleId: 'x-formspec-starter', widgetName: 'StructuredPanel',
        config: {
          id: 'signatureCertificatePanel', title: 'Signature certificate',
          body: 'Availability and verification claims come from the certificate service.',
          blocks: [{
            id: 'certificateFacts', type: 'key-value',
            items: [
              { id: 'state', label: 'Proof state', path: 'primary.proof_state', ...generation('signatureCertificate') },
              { id: 'verified', label: 'Independently verifiable', path: 'primary.independently_verifiable', ...generation('signatureCertificate') },
              { id: 'kind', label: 'Artifact', path: 'primary.artifact_kind', ...generation('signatureCertificate') },
            ],
            ...generation('signatureCertificate'),
          }],
          actions: [{ outputName: 'primary', ...generation('submissionProof') }],
          ...generation('signatureCertificate'),
        },
        dataBindings: {
          primary: { catalogRef: DATA, sourceRef: 'resource:signature-certificate', ...generation('signatureCertificate') },
        },
        actionBindings: {
          primary: { actionRef: 'returnToReceipt', ...generation('submissionProof') },
        },
      },
      ...generation('signatureCertificate'),
    },
  },
];

const extraTransitionCall = {
  name: 'formspec_wireframes_add_transition',
  arguments: {
    route_id: 'signatureCertificate', trigger: 'returnToReceipt', to: 'publicReceipt',
    ...generation('submissionProof'),
  },
};

const finalReadNames = new Set([
  'formspec_wireframes_read_summary',
  'formspec_wireframes_read_reasoning_review',
  'formspec_wireframes_preview',
  'formspec_wireframes_validate',
  'formspec_wireframes_export',
]);
const calls = [];
let insertedDefinitions = false;
let insertedActions = false;
let insertedActors = false;
let insertedExtraUnit = false;
let insertedReviewSlot = false;
let insertedExtraTransition = false;

for (const original of source.calls) {
  const call = structuredClone(original);
  if (finalReadNames.has(call.name)) continue;
  if (call.name === 'formspec_wireframes_pair_needs') {
    const document = call.arguments.document;
    document.needs.push({
      id: 'embedPublishedForm',
      journey: 'integrator',
      title: 'Embed the published runtime',
      statement: {
        who: 'a developer or website owner',
        want: 'to load a version-pinned hosted form through the runtime endpoint or embed snippet',
        why: 'published forms need a predictable distribution path outside the owner dashboard',
        done: 'the published runtime returns the Definition, theme, locale, runtime settings, cache behavior, and stable embed reference',
      },
      grounding: [{
        kind: 'assertion',
        ref: 'https://github.com/Formspec-Labs/formspec-server/blob/main/JOURNEYS.md#int-001--i-want-to-embed-a-form-on-our-website',
        role: 'motivates',
        description: 'JOURNEYS.md INT-001',
      }],
      origin: 'human-asserted', status: 'adopted',
      adoptedBy: { id: 'urn:formspec:actor:human:v13-product-owner', kind: 'human', actChannel: 'human' },
      revision: 1,
    });
    document.journeys.push({ id: 'integrator', title: 'Integrator' });
    calls.push(call, ...createDefinitionCalls);
    insertedDefinitions = true;
    continue;
  }
  if (call.name === 'formspec_wireframes_add_route' && call.arguments.route_id === 'publicReceipt') {
    calls.push(extraRouteCall);
  }
  if (call.name === 'formspec_wireframes_add_action') {
    if (!insertedActions) {
      calls.push(...responseActionCalls);
      insertedActions = true;
    }
    continue;
  }
  if (call.name === 'formspec_wireframes_edit_registry') updateRegistry(call);
  if (call.name === 'formspec_wireframes_materialize_data_sources') {
    call.arguments.description = 'Strongly typed live ManagedSingleCell data plus authored safe export resources; no product fixtures or scope ids.';
    call.arguments.sources = strongSources;
  }
  if (call.name === 'formspec_wireframes_add_experience_unit') {
    if (!insertedActors) {
      calls.push(...actors, ...tasks);
      insertedActors = true;
    }
    const context = unitContext[call.arguments.unit_id];
    if (context) {
      call.arguments.actor_ref = context[0];
      call.arguments.task_refs = context[1];
    }
    if (call.arguments.unit_id === 'respondentReview') {
      call.arguments.action_refs = call.arguments.action_refs.map((ref) =>
        ref.id === 'beginSignature' ? { ...ref, id: 'submitPublicResponseForSignature' } : ref
      );
    }
    if (call.arguments.unit_id === 'receiptConfirmation') {
      call.arguments.action_refs = [
        { id: 'verifyReceipt', role: 'primary' },
        { id: 'materializeProof', role: 'secondary' },
      ];
    }
    if (call.arguments.unit_id === 'proofVerification') {
      call.arguments.action_refs = [{ id: 'returnToReceipt', role: 'escape' }];
    }
  }
  if (call.name === 'formspec_wireframes_cite_need' && call.arguments.unit_id === 'receiptConfirmation' && call.arguments.need_id === 'submissionProof') {
    calls.push(call, {
      name: 'formspec_wireframes_cite_need',
      arguments: { unit_id: 'receiptConfirmation', need_id: 'verifyIntegrity' },
    });
    continue;
  }
  if (call.name === 'formspec_wireframes_bind_slot') {
    updateSlot(call);
    if (call.arguments.route_id === 'publicReview' && call.arguments.slot_id === 'reviewPanel') {
      calls.push(call, extraSlotCalls[0]);
      insertedReviewSlot = true;
      continue;
    }
    if (call.arguments.route_id === 'publicSign' && call.arguments.slot_id === 'signatureAction') {
      calls.push(call, ...extraSlotCalls.slice(1));
      continue;
    }
  }
  if (call.name === 'formspec_wireframes_add_transition') {
    updateTransition(call);
    if (!insertedExtraUnit) {
      calls.push(...extraUnitCalls);
      insertedExtraUnit = true;
    }
    if (call.arguments.route_id === 'publicVerify' && call.arguments.trigger === 'returnToReceipt') {
      calls.push(call, extraTransitionCall);
      insertedExtraTransition = true;
      continue;
    }
  }
  calls.push(call);
}

if (!insertedDefinitions || !insertedActions || !insertedActors || !insertedReviewSlot || !insertedExtraUnit || !insertedExtraTransition) {
  throw new Error('Attempt-6 call-plan shape changed; attempt-7 transformation was incomplete.');
}

calls.push(
  { name: 'formspec_wireframes_read_summary', arguments: {} },
  { name: 'formspec_wireframes_validate', arguments: {} },
  { name: 'formspec_wireframes_read_reasoning_review', arguments: {} },
  { name: 'formspec_wireframes_preview', arguments: {} },
  { name: 'formspec_wireframes_validate', arguments: {} },
  { name: 'formspec_wireframes_export', arguments: {} },
);

const plan = {
  metadata: {
    ...source.metadata,
    session: {
      ...source.metadata.session,
      id: 'urn:formspec:session:surface-v13-prod-mvp-dogfood-fast-attempt-7',
    },
    client: {
      ...source.metadata.client,
      name: 'formspec-surface-v13-fast-call-plan-attempt-7',
    },
  },
  calls,
};

await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Wrote ${calls.length} MCP calls to ${outputPath}`);
