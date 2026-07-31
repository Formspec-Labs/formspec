/**
 * Build v13 attempt 8 from the preserved attempt-7 MCP call plan.
 *
 * Attempt 7 proved plural Response Actions resolve, then stopped at route
 * parameter validation. This plan keeps all artifact authoring inside MCP and
 * repairs the complete public-review, signature-secret, and route flow before
 * replay.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, 'builder-calls-fast-attempt-7.json');
const outputPath = join(here, 'builder-calls-fast-attempt-8.json');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));

const PUBLIC_ACTIONS = 'https://demo.formspec.org/response-actions/community-intake';
const APP_ACTIONS = 'https://demo.formspec.org/response-actions/managed-single-cell-app';
const DATA = 'https://demo.formspec.org/data-sources/managed-single-cell';
const FINAL_READS = new Set([
  'formspec_wireframes_read_summary',
  'formspec_wireframes_validate',
  'formspec_wireframes_read_reasoning_review',
  'formspec_wireframes_preview',
  'formspec_wireframes_export',
]);

const generation = (...ids) => ({
  'x-generation': { anchors: ids.map((id) => `need:${id}@1`) },
});
const selector = (from, path) => ({ from, path });
const serviceEffect = (requestRef, suffix) => ({
  type: 'serviceRequest',
  requestRef,
  idempotencyKey: `@invocation.id & '/${suffix}'`,
  onError: 'fail',
});

function replaceStableExamples(value) {
  if (typeof value === 'string') {
    return value
      .replaceAll('form_v13_community_intake', 'v13-community-intake')
      .replaceAll('demo-intake', 'v13-community-intake');
  }
  if (Array.isArray(value)) return value.map(replaceStableExamples);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceStableExamples(entry)]));
  }
  return value;
}

function requestById(document, id) {
  return document['x-formspec-runtime'].requests.find((request) => request.id === id);
}

function makePrivateEnvelopeOutputs(request) {
  request.outputs = {
    ...request.outputs,
    envelopeId: { path: '/envelope_id', exposure: 'transition' },
    activeEnvelopeId: { path: '/envelope_id', exposure: 'session' },
    activeSignerToken: { path: '/signers/0/signer_token', exposure: 'session' },
    activeSignerId: { path: '/signers/0/signer_id', exposure: 'session' },
    activeSignedPayloadDigest: { path: '/signed_payload_digest', exposure: 'session' },
  };
}

function moveReviewSubmissions(publicDocument, appDocument) {
  const movedActionIds = new Set(['submitPublicResponse', 'submitPublicResponseForSignature']);
  const movedRequestIds = new Set([
    'submitPublicDraft',
    'submitPublicDraftForSignature',
    'createPublicSignatureEnvelope',
  ]);
  const movedActions = publicDocument.actions.filter((action) => movedActionIds.has(action.id));
  const movedRequests = publicDocument['x-formspec-runtime'].requests.filter((request) => movedRequestIds.has(request.id));

  publicDocument.actions = publicDocument.actions.filter((action) => !movedActionIds.has(action.id));
  publicDocument['x-formspec-runtime'].requests = publicDocument['x-formspec-runtime'].requests.filter(
    (request) => !movedRequestIds.has(request.id),
  );

  for (const request of movedRequests) {
    if (request.id === 'submitPublicDraft' || request.id === 'submitPublicDraftForSignature') {
      request.request.bodyBindings['/response_data'] = selector('input', 'responseData');
    }
    if (request.id === 'createPublicSignatureEnvelope') {
      request.request.bodyBindings['/signers/0/email'] = selector('input', 'responseData.email');
      makePrivateEnvelopeOutputs(request);
    }
  }

  appDocument.actions.push(...movedActions);
  appDocument['x-formspec-runtime'].requests.push(...movedRequests);
}

function secureAppActions(document) {
  const removedActionIds = new Set(['openForm', 'openResponse', 'openSigner', 'sendReminder']);
  const removedRequestIds = new Set(['queueSignatureReminder']);
  document.actions = document.actions.filter((action) => !removedActionIds.has(action.id));
  document['x-formspec-runtime'].requests = document['x-formspec-runtime'].requests.filter(
    (request) => !removedRequestIds.has(request.id),
  );

  const createEnvelope = requestById(document, 'createSignatureEnvelope');
  makePrivateEnvelopeOutputs(createEnvelope);

  const completeSigner = requestById(document, 'completeEnvelopeSigner');
  completeSigner.request.pathBindings = {
    envelopeId: selector('session', 'activeEnvelopeId'),
    signerId: selector('session', 'activeSignerId'),
  };
  completeSigner.request.bodyBindings = {
    '/signer_token': selector('session', 'activeSignerToken'),
    '/signed_payload_digest': selector('session', 'activeSignedPayloadDigest'),
  };
}

function updateResponseActionDocuments(calls) {
  const materializations = calls.filter((call) => call.name === 'formspec_wireframes_materialize_response_actions');
  const publicCall = materializations.find((call) => call.arguments.url === PUBLIC_ACTIONS);
  const appCall = materializations.find((call) => call.arguments.url === APP_ACTIONS);
  if (!publicCall || !appCall) throw new Error('Attempt-7 Response Actions documents were not found.');

  moveReviewSubmissions(publicCall.arguments.document, appCall.arguments.document);
  secureAppActions(appCall.arguments.document);
}

function updateRoute(call) {
  const route = call.arguments;
  if (route.route_id !== 'publicSign') return;
  route.path = '/signatures/{envelopeId}/sign';
  route.params = [{
    name: 'envelopeId',
    type: 'string',
    description: 'Signature envelope identifier.',
    example: 'envelope-v13-community-intake',
  }];
}

function updateExperienceUnit(call) {
  const unit = call.arguments;
  const removedByUnit = {
    ownerForms: new Set(['openForm', 'openPublicForm']),
    responseQueue: new Set(['openResponse']),
    responseInspection: new Set(['renderResponsePdf']),
    signatureOperations: new Set(['openSigner', 'sendReminder']),
  };
  const removed = removedByUnit[unit.unit_id];
  if (removed) unit.action_refs = unit.action_refs.filter((ref) => !removed.has(ref.id));
}

function updateDataSources(call) {
  const sourceDocument = call.arguments.sources.find((entry) => entry.id === 'resource:signature-envelope');
  const signerItems = sourceDocument?.schema?.properties?.signers?.items;
  if (!signerItems) throw new Error('Attempt-7 signature envelope schema was not found.');
  delete signerItems.properties.signer_token;
  signerItems.required = signerItems.required.filter((name) => name !== 'signer_token');
  signerItems.additionalProperties = false;
}

function updateReviewPanel(call) {
  const binding = call.arguments.binding;
  const block = binding.config.blocks.find((entry) => entry.id === 'answers');
  for (const item of block.items) item.path = item.path.replace('primary.', 'primary.data.');
  binding.config.actions = [
    { outputName: 'primary', ...generation('reviewResponse') },
    {
      outputName: 'secondary',
      payload: { responseData: { path: 'primary.data' } },
      ...generation('submissionProof', 'postSubmit'),
    },
    {
      outputName: 'tertiary',
      payload: { responseData: { path: 'primary.data' } },
      ...generation('signatureRequirement', 'signatureEnvelope'),
    },
  ];
  binding.actionBindings = {
    primary: { actionRef: 'editPublicResponse', ...generation('reviewResponse') },
    secondary: { actionRef: 'submitPublicResponse', ...generation('submissionProof', 'postSubmit') },
    tertiary: { actionRef: 'submitPublicResponseForSignature', ...generation('signatureRequirement', 'signatureEnvelope') },
  };
}

function updatePublicSignAction(call) {
  const binding = call.arguments.binding;
  binding.config.actions = [{ outputName: 'primary', ...generation('signatureEnvelope', 'signatureCertificate') }];
}

const requiredTransitionParams = new Map([
  ['formWorkspace:openVersions', { formId: 'formId' }],
  ['formWorkspace:openPublicForm', { formId: 'formId' }],
  ['formVersions:returnToForm', { formId: 'formId' }],
  ['responseDetail:openReceipt', { responseId: 'responseId' }],
  ['publicRespond:reviewPublicResponse', { formId: 'formId' }],
  ['publicReview:editPublicResponse', { formId: 'formId' }],
  ['publicReview:submitPublicResponse', { responseId: 'responseId' }],
  ['publicReview:submitPublicResponseForSignature', { envelopeId: 'envelopeId' }],
  ['publicSign:completeSignature', { responseId: 'responseId', envelopeId: 'envelopeId' }],
  ['publicReceipt:verifyReceipt', { responseId: 'responseId' }],
  ['publicVerify:returnToReceipt', { responseId: 'responseId' }],
  ['signatureCertificate:returnToReceipt', { responseId: 'responseId' }],
]);

function updateTransition(call) {
  const transition = call.arguments;
  const id = `${transition.route_id}:${transition.trigger}`;

  if (id === 'forms:openForm') {
    transition.trigger = 'createForm';
    transition.params = { formId: 'formId' };
    return call;
  }
  if (id === 'signatures:openSigner') {
    transition.trigger = 'createEnvelope';
    transition.params = { envelopeId: 'envelopeId' };
    return call;
  }
  if (id === 'forms:openPublicForm' || id === 'responses:openResponse') return null;

  const params = requiredTransitionParams.get(id);
  if (params) transition.params = params;
  return call;
}

let calls = replaceStableExamples(source.calls)
  .filter((call) => !FINAL_READS.has(call.name));

updateResponseActionDocuments(calls);

const transformed = [];
for (const call of calls) {
  if (call.name === 'formspec_wireframes_add_route') updateRoute(call);
  if (call.name === 'formspec_wireframes_add_experience_unit') updateExperienceUnit(call);
  if (call.name === 'formspec_wireframes_materialize_data_sources') updateDataSources(call);
  if (call.name === 'formspec_wireframes_bind_slot') {
    if (
      (call.arguments.route_id === 'publicRespond' && call.arguments.slot_id === 'publicRespondAction')
      || (call.arguments.route_id === 'publicReview' && call.arguments.slot_id === 'reviewForm')
    ) continue;
    if (call.arguments.route_id === 'publicReview' && call.arguments.slot_id === 'reviewPanel') updateReviewPanel(call);
    if (call.arguments.route_id === 'publicSign' && call.arguments.slot_id === 'signatureAction') updatePublicSignAction(call);
  }
  if (call.name === 'formspec_wireframes_add_transition') {
    const updated = updateTransition(call);
    if (!updated) continue;
  }
  transformed.push(call);
}

transformed.push(
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
      id: 'urn:formspec:session:surface-v13-prod-mvp-dogfood-fast-attempt-8',
    },
  },
  calls: transformed,
};

await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Wrote ${plan.calls.length} MCP calls to ${outputPath}`);
