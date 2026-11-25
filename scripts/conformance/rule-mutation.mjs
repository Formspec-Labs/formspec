/** @filedesc Thin CLI & library wrapper forwarding to `@formspec-org/engine/conformance` rule-mutation coverage. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runMutationCli, runMutationCoverage } from '../../packages/formspec-engine/conformance/rule-mutation.mjs';

export { runMutationCli, runMutationCoverage };

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runMutationCli(process.argv.slice(2));
}
