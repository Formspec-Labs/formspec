/** Direct engine proof that attempt-14 openForm reaches its host effect. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeResponseAction } from '../../../packages/formspec-engine/dist/core-exports.js';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(here, 'exported-bundle-fast-attempt-14.json');
const outputPath = join(here, 'engine-open-form-proof-attempt-14.json');
const APP_ACTIONS = 'https://demo.formspec.org/response-actions/managed-single-cell-app';
const EXPECTED_VALIDATION = {
  profile: 'off',
  blocking: 'non-blocking',
  persistence: 'none',
};

const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const document = bundle.documents[APP_ACTIONS];
if (document?.scope !== 'app') throw new Error('Attempt-14 app Response Actions document is missing.');

const action = document.actions.find((candidate) => candidate.id === 'openForm');
if (!action) throw new Error('Attempt-14 openForm action is missing.');
if (JSON.stringify(action.validation) !== JSON.stringify(EXPECTED_VALIDATION)) {
  throw new Error(`openForm validation tuple is ${JSON.stringify(action.validation)}.`);
}

const input = Object.freeze({ formId: 'form_engine_attempt_14' });
const hostEvents = [];
const result = invokeResponseAction(
  document,
  'openForm',
  {
    prepareAppAction: () => input,
    dispatchHostEvent: (eventName, detail) => hostEvents.push({ eventName, detail }),
  },
  undefined,
  { invocationId: 'attempt14-open-form-proof' },
);

if (result.status !== 'completed') {
  throw new Error(`openForm engine invocation ${result.status}: ${result.failureReason ?? 'no reason'}`);
}
if (JSON.stringify(result.validationTuple) !== JSON.stringify(EXPECTED_VALIDATION)) {
  throw new Error(`Engine resolved ${JSON.stringify(result.validationTuple)}.`);
}
if (JSON.stringify(result.detail) !== JSON.stringify(input)) {
  throw new Error(`Engine detail did not retain widget input: ${JSON.stringify(result.detail)}.`);
}
if (
  hostEvents.length !== 1
  || hostEvents[0].eventName !== 'formspec.navigate.form'
  || JSON.stringify(hostEvents[0].detail) !== JSON.stringify(input)
) {
  throw new Error(`openForm host event mismatch: ${JSON.stringify(hostEvents)}.`);
}
if (result.effectTrace.length !== 1 || result.effectTrace[0].status !== 'succeeded') {
  throw new Error(`openForm effect trace mismatch: ${JSON.stringify(result.effectTrace)}.`);
}

const proof = {
  proof: 'direct-engine-open-form',
  bundle: 'exported-bundle-fast-attempt-14.json',
  document: APP_ACTIONS,
  actionId: action.id,
  actionValidation: action.validation,
  input,
  invocationId: result.invocationId,
  result: {
    status: result.status,
    validationTuple: result.validationTuple,
    effectTrace: result.effectTrace,
  },
  hostEvents,
};

await writeFile(outputPath, `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
