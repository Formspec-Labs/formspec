/** Build v13 attempt 9 from attempt 8 by making response-detail navigation real. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(await readFile(join(here, 'builder-calls-fast-attempt-8.json'), 'utf8'));
const outputPath = join(here, 'builder-calls-fast-attempt-9.json');
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

const calls = source.calls.filter((call) => !FINAL_READS.has(call.name));
const appDocument = calls.find(
  (call) => call.name === 'formspec_wireframes_materialize_response_actions' && call.arguments.url === APP_ACTIONS,
)?.arguments.document;
if (!appDocument) throw new Error('Attempt-8 app Response Actions document was not found.');
appDocument.actions.push({
  id: 'openResponse',
  intent: 'review',
  label: { literal: 'Open response' },
  ...generation('reviewResponses'),
  effects: [{ type: 'hostEvent', eventName: 'formspec.navigate.response' }],
});

const responseUnit = calls.find(
  (call) => call.name === 'formspec_wireframes_add_experience_unit' && call.arguments.unit_id === 'responseQueue',
);
responseUnit.arguments.action_refs.unshift({ id: 'openResponse', role: 'primary' });

const responsePanel = calls.find(
  (call) => call.name === 'formspec_wireframes_bind_slot'
    && call.arguments.route_id === 'responses'
    && call.arguments.slot_id === 'responseActions',
);
const binding = responsePanel.arguments.binding;
binding.dataBindings.rows = {
  catalogRef: DATA,
  sourceRef: 'query:responses',
  ...generation('reviewResponses'),
};
binding.config.blocks = [{
  id: 'responseNavigation',
  type: 'table',
  path: 'rows',
  caption: 'Accepted responses',
  responsiveMode: 'stack',
  columns: [
    { id: 'response', label: 'Response', path: 'response_id', ...generation('reviewResponses') },
    { id: 'status', label: 'Status', path: 'status', ...generation('reviewResponses') },
    { id: 'proof', label: 'Proof state', path: 'proof_state', ...generation('submissionProof') },
  ],
  rowAction: {
    outputName: 'open',
    columnLabel: 'Details',
    payload: { responseId: { path: 'response_id' } },
    ...generation('reviewResponses'),
  },
  ...generation('reviewResponses'),
}];
binding.actionBindings.open = { actionRef: 'openResponse', ...generation('reviewResponses') };

const transitionInsertion = calls.findIndex(
  (call) => call.name === 'formspec_wireframes_add_transition' && call.arguments.route_id === 'responseDetail',
);
calls.splice(transitionInsertion, 0, {
  name: 'formspec_wireframes_add_transition',
  arguments: {
    route_id: 'responses',
    trigger: 'openResponse',
    to: 'responseDetail',
    params: { responseId: 'responseId' },
    ...generation('reviewResponses'),
  },
});

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
      id: 'urn:formspec:session:surface-v13-prod-mvp-dogfood-fast-attempt-9',
    },
  },
  calls,
};

await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Wrote ${plan.calls.length} MCP calls to ${outputPath}`);
