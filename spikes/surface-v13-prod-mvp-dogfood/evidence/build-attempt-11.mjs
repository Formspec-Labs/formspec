/** Build v13 attempt 11 by aligning visible StructuredPanel outputs and bindings. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(await readFile(join(here, 'builder-calls-fast-attempt-10.json'), 'utf8'));
const outputPath = join(here, 'builder-calls-fast-attempt-11.json');
const FINAL_READS = new Set([
  'formspec_wireframes_read_summary',
  'formspec_wireframes_validate',
  'formspec_wireframes_read_reasoning_review',
  'formspec_wireframes_preview',
  'formspec_wireframes_export',
]);

const calls = source.calls.filter((call) => !FINAL_READS.has(call.name));
for (const call of calls) {
  if (call.name !== 'formspec_wireframes_bind_slot') continue;
  const { route_id: routeId, slot_id: slotId, binding } = call.arguments;
  if (
    (routeId === 'forms' && slotId === 'formsActions')
    || (routeId === 'formWorkspace' && slotId === 'formFacts')
  ) {
    binding.actionBindings = {
      tertiary: binding.actionBindings.primary,
      danger: binding.actionBindings.secondary,
    };
  }
  if (routeId === 'publicVerify' && slotId === 'verificationPanel') {
    binding.actionBindings = { secondary: binding.actionBindings.primary };
  }
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
      id: 'urn:formspec:session:surface-v13-prod-mvp-dogfood-fast-attempt-11',
    },
  },
  calls,
};

await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Wrote ${plan.calls.length} MCP calls to ${outputPath}`);
