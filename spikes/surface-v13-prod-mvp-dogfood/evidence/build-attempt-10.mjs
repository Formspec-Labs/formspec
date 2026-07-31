/** Build v13 attempt 10 from attempt 8 using QueueTable's generic row action. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(await readFile(join(here, 'builder-calls-fast-attempt-8.json'), 'utf8'));
const outputPath = join(here, 'builder-calls-fast-attempt-10.json');
const APP_ACTIONS = 'https://demo.formspec.org/response-actions/managed-single-cell-app';
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

const queueRegistry = calls.find(
  (call) => call.name === 'formspec_wireframes_edit_registry'
    && call.arguments.operation === 'add_entry'
    && call.arguments.widget_name === 'QueueTable',
);
if (!queueRegistry) throw new Error('Attempt-8 QueueTable Registry entry was not found.');
queueRegistry.arguments.entry.description = 'Generic accessible queue table with stable row identity and one Need-traced row action.';
queueRegistry.arguments.entry.widgetShape.actionOutputs = [{ name: 'openResponse' }];
queueRegistry.arguments.entry.widgetShape.renderedConfigNodes = [
  { pointerPattern: '', kind: 'queue-table' },
  { pointerPattern: '/columns/*', kind: 'queue-table-column' },
  { pointerPattern: '/rowAction', kind: 'queue-table-row-action' },
];

const responseQueue = calls.find(
  (call) => call.name === 'formspec_wireframes_bind_slot'
    && call.arguments.route_id === 'responses'
    && call.arguments.slot_id === 'responseQueueTable',
);
if (!responseQueue) throw new Error('Attempt-8 response QueueTable slot was not found.');
responseQueue.arguments.binding.config.rowAction = {
  outputName: 'openResponse',
  columnLabel: 'Response',
  payload: { responseId: { path: 'response_id' } },
  emphasis: 'secondary',
  pendingLabel: 'Opening…',
  successMessage: 'Opened',
  failureMessage: 'Try again',
  ...generation('reviewResponses'),
};
responseQueue.arguments.binding.actionBindings = {
  openResponse: { actionRef: 'openResponse', ...generation('reviewResponses') },
};

const transitionInsertion = calls.findIndex(
  (call) => call.name === 'formspec_wireframes_add_transition' && call.arguments.route_id === 'responseDetail',
);
if (transitionInsertion < 0) throw new Error('Attempt-8 transition insertion point was not found.');
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
      id: 'urn:formspec:session:surface-v13-prod-mvp-dogfood-fast-attempt-10',
    },
  },
  calls,
};

await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Wrote ${plan.calls.length} MCP calls to ${outputPath}`);
