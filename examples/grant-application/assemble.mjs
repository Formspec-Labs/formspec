/** @filedesc Assemble the authored grant example and refresh its runtime copies. */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  assembleDefinitionSync,
  initFormspecEngine,
  initFormspecEngineTools,
} from '../../packages/formspec-engine/dist/index.js';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const authored = read('./source/definition.json');
const shared = read('./contact-fragment.json');

await initFormspecEngine();
await initFormspecEngineTools();
const { definition } = assembleDefinitionSync(authored, { [shared.url]: shared });
const output = JSON.stringify(definition, null, 2) + '\n';

for (const file of [
  './definition.json',
  '../../benchmarks/tasks/grant-application/reference/definition.json',
  '../../packages/formspec-engine/tests/fixtures/grant-app-definition.json',
]) {
  writeFileSync(new URL(file, import.meta.url), output);
}
