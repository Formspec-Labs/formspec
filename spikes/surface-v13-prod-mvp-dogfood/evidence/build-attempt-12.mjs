/**
 * Re-run the validated attempt-11 artifact after Studio recognizes mounted
 * targetDefinition Response Actions in the reasoning collector, while closing
 * the browser-review gap for opening an existing form from the forms queue.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(await readFile(join(here, 'builder-calls-fast-attempt-11.json'), 'utf8'));
const outputPath = join(here, 'builder-calls-fast-attempt-12.json');
const APP_ACTIONS = 'https://demo.formspec.org/response-actions/managed-single-cell-app';
const generation = (...ids) => ({
  'x-generation': { anchors: ids.map((id) => `need:${id}@1`) },
});

const calls = structuredClone(source.calls);

const appDocument = calls.find(
  (call) => call.name === 'formspec_wireframes_materialize_response_actions'
    && call.arguments.url === APP_ACTIONS,
)?.arguments.document;
if (!appDocument) throw new Error('Attempt-11 app Response Actions document was not found.');
appDocument.actions = appDocument.actions.filter((action) => action.id !== 'openPublicForm');
appDocument.actions.push({
  id: 'openForm',
  intent: 'review',
  label: { literal: 'Open form' },
  ...generation('manageForm'),
  effects: [{ type: 'hostEvent', eventName: 'formspec.navigate.form' }],
});

const ownerForms = calls.find(
  (call) => call.name === 'formspec_wireframes_add_experience_unit'
    && call.arguments.unit_id === 'ownerForms',
);
ownerForms.arguments.action_refs.splice(1, 0, { id: 'openForm', role: 'secondary' });

const ownerWorkspace = calls.find(
  (call) => call.name === 'formspec_wireframes_add_experience_unit'
    && call.arguments.unit_id === 'ownerWorkspace',
);
ownerWorkspace.arguments.action_refs = ownerWorkspace.arguments.action_refs.filter(
  (ref) => ref.id !== 'openPublicForm',
);

const settingsDocument = calls.find(
  (call) => call.name === 'formspec_wireframes_materialize_response_actions'
    && call.arguments.url === 'https://demo.formspec.org/response-actions/managed-form-settings',
)?.arguments.document;
const publishRequest = settingsDocument?.['x-formspec-runtime']?.requests.find(
  (request) => request.id === 'publishManagedForm',
);
if (!publishRequest) throw new Error('Attempt-11 publishManagedForm request was not found.');
publishRequest.outputs.formId = { path: '/form_id', exposure: 'transition' };

const queueRegistry = calls.find(
  (call) => call.name === 'formspec_wireframes_edit_registry'
    && call.arguments.operation === 'add_entry'
    && call.arguments.widget_name === 'QueueTable',
);
queueRegistry.arguments.entry.widgetShape.actionOutputs = [{ name: 'open' }];

const formsQueue = calls.find(
  (call) => call.name === 'formspec_wireframes_bind_slot'
    && call.arguments.route_id === 'forms'
    && call.arguments.slot_id === 'formsQueue',
);
formsQueue.arguments.binding.config.rowAction = {
  outputName: 'open',
  columnLabel: 'Form',
  payload: { formId: { path: 'form_id' } },
  emphasis: 'secondary',
  pendingLabel: 'Opening…',
  successMessage: 'Opened',
  failureMessage: 'Try again',
  ...generation('manageForm'),
};
formsQueue.arguments.binding.actionBindings = {
  open: { actionRef: 'openForm', ...generation('manageForm') },
};

const responseQueue = calls.find(
  (call) => call.name === 'formspec_wireframes_bind_slot'
    && call.arguments.route_id === 'responses'
    && call.arguments.slot_id === 'responseQueueTable',
);
responseQueue.arguments.binding.config.rowAction.outputName = 'open';
responseQueue.arguments.binding.actionBindings = {
  open: responseQueue.arguments.binding.actionBindings.openResponse,
};

const formFacts = calls.find(
  (call) => call.name === 'formspec_wireframes_bind_slot'
    && call.arguments.route_id === 'formWorkspace'
    && call.arguments.slot_id === 'formFacts',
);
if (!formFacts) throw new Error('Attempt-11 formFacts slot was not found.');
const formFactsBinding = formFacts.arguments.binding;
formFactsBinding.config.title = 'Form draft';
formFactsBinding.config.body = 'These facts come from the stored draft. Publishing creates the immutable public runtime.';
formFactsBinding.config.blocks[0].items = [
  { id: 'name', label: 'Form', path: 'primary.display_name', ...generation('manageForm') },
  { id: 'slug', label: 'Public link name', path: 'primary.slug', ...generation('publishForm') },
  { id: 'draftVersion', label: 'Draft version', path: 'primary.draft_version', ...generation('protectVersions') },
];
delete formFactsBinding.dataBindings.secondary;
formFactsBinding.config.actions = [{ outputName: 'primary', ...generation('protectVersions') }];
formFactsBinding.actionBindings = {
  primary: { actionRef: 'openVersions', ...generation('protectVersions') },
};

const transitionInsertion = calls.findIndex(
  (call) => call.name === 'formspec_wireframes_add_transition'
    && call.arguments.route_id === 'forms'
    && call.arguments.trigger === 'openResponses',
);
if (transitionInsertion < 0) throw new Error('Attempt-11 forms transition insertion point was not found.');
calls.splice(transitionInsertion, 0, {
  name: 'formspec_wireframes_add_transition',
  arguments: {
    route_id: 'forms', trigger: 'openForm', to: 'formWorkspace', params: { formId: 'formId' },
    ...generation('manageForm'),
  },
});

const publicTransitionIndex = calls.findIndex(
  (call) => call.name === 'formspec_wireframes_add_transition'
    && call.arguments.route_id === 'formWorkspace'
    && call.arguments.trigger === 'openPublicForm',
);
if (publicTransitionIndex < 0) throw new Error('Attempt-11 public form transition was not found.');
calls.splice(publicTransitionIndex, 1, {
  name: 'formspec_wireframes_add_transition',
  arguments: {
    route_id: 'formWorkspace', trigger: 'publishForm', to: 'publicRespond', params: { formId: 'formId' },
    ...generation('publishForm', 'embedPublishedForm'),
  },
});

const plan = {
  metadata: {
    ...source.metadata,
    session: {
      ...source.metadata.session,
      id: 'urn:formspec:session:surface-v13-prod-mvp-dogfood-fast-attempt-12',
    },
  },
  calls,
};

await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Wrote ${plan.calls.length} MCP calls to ${outputPath}`);
