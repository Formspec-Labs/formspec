/**
 * Build v13 attempt 14 from accepted attempt 13.
 *
 * App-scoped actions never operate on a Definition response, so the runtime
 * requires an explicit validation policy that performs no response validation
 * or persistence. The existing plural Response Actions materialization call
 * remains the sole MCP authoring operation; this generator changes its app
 * document data only.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(await readFile(join(here, 'builder-calls-fast-attempt-13.json'), 'utf8'));
const outputPath = join(here, 'builder-calls-fast-attempt-14.json');
const calls = structuredClone(source.calls);
const APP_ACTIONS = 'https://demo.formspec.org/response-actions/managed-single-cell-app';
const APP_VALIDATION = {
  profile: 'off',
  blocking: 'non-blocking',
  persistence: 'none',
};

const materialization = calls.find(
  (call) => call.name === 'formspec_wireframes_materialize_response_actions'
    && call.arguments.url === APP_ACTIONS,
);
if (!materialization || materialization.arguments.document?.scope !== 'app') {
  throw new Error('Attempt-13 app-scoped Response Actions materialization was not found.');
}

const actions = materialization.arguments.document.actions;
if (actions.length !== 22) {
  throw new Error(`Expected 22 app-scoped actions; found ${actions.length}.`);
}
for (const action of actions) {
  action.validation = { ...APP_VALIDATION };
}

const plan = {
  metadata: {
    ...source.metadata,
    session: {
      ...source.metadata.session,
      id: 'urn:formspec:session:surface-v13-prod-mvp-dogfood-fast-attempt-14',
    },
  },
  calls,
};

await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Wrote ${plan.calls.length} MCP calls to ${outputPath}`);
console.log(`Updated ${actions.length} app action validation tuples: ${actions.map((action) => action.id).join(', ')}`);
