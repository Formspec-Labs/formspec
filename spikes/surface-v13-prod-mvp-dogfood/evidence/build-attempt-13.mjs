/**
 * Build v13 attempt 13 from accepted attempt 12.
 *
 * Browser review found that QueueTable's action column repeated the row header
 * label. Keep the artifact and flow unchanged while giving both queues the
 * accurate generic column heading "Action".
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(await readFile(join(here, 'builder-calls-fast-attempt-12.json'), 'utf8'));
const outputPath = join(here, 'builder-calls-fast-attempt-13.json');
const calls = structuredClone(source.calls);

const queueSlots = calls.filter(
  (call) => call.name === 'formspec_wireframes_bind_slot'
    && call.arguments.binding?.widgetName === 'QueueTable',
);
if (queueSlots.length !== 2) {
  throw new Error(`Expected two QueueTable slots; found ${queueSlots.length}.`);
}
for (const call of queueSlots) {
  const rowAction = call.arguments.binding.config?.rowAction;
  if (rowAction?.outputName !== 'open') {
    throw new Error(`QueueTable ${call.arguments.route_id}/${call.arguments.slot_id} has no generic open row action.`);
  }
  rowAction.columnLabel = 'Action';
}

const plan = {
  metadata: {
    ...source.metadata,
    session: {
      ...source.metadata.session,
      id: 'urn:formspec:session:surface-v13-prod-mvp-dogfood-fast-attempt-13',
    },
  },
  calls,
};

await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Wrote ${plan.calls.length} MCP calls to ${outputPath}`);
