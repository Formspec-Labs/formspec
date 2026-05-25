#!/usr/bin/env node
/**
 * @filedesc Run contract-surface checks via repo-native test runners.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const metadataOnly = process.argv.includes('--metadata-only');

function findPython() {
  const win = process.platform === 'win32';
  const rel = win ? ['.venv', 'Scripts', 'python.exe'] : ['.venv', 'bin', 'python'];
  const venvPy = path.join(root, ...rel);
  if (fs.existsSync(venvPy)) return venvPy;
  return win ? 'python' : 'python3';
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

function runPython(args) {
  run(findPython(), ['-m', 'pytest', ...args, '-q']);
}

runPython([
  'tests/unit/test_contract_surface_coverage.py',
  'tests/unit/test_lint_rule_registry.py',
  'tests/conformance/test_issuer_fixtures.py',
  'tests/conformance/test_definition_issuer_binding.py',
  'tests/conformance/test_response_displayed_issuer.py',
  'tests/conformance/schemas/test_deletion_receipt_schema.py',
  'tests/conformance/schemas/test_wysiwys_ceremony_schema.py',
  'tests/conformance/schemas/test_review_thread_schema.py',
  'tests/conformance/schemas/test_identity_binding_profile_schema.py',
  'tests/conformance/schemas/test_validation_mapping_schema.py',
  'tests/conformance/spec/test_validation_mapping_table.py',
  'tests/conformance/spec/test_actionbutton_binding.py',
  'tests/conformance/spec/test_trace_index_schema.py',
  'tests/conformance/spec/test_trace_predicates.py',
  'tests/conformance/spec/test_trace_stale_rejection.py',
  'tests/conformance/spec/test_trace_studio_review_composition.py',
  'tests/conformance/schemas/test_bundle_manifest_schema.py',
  'tests/conformance/spec/test_bundle_manifest_semantics.py',
  'tests/conformance/schemas/test_data_sources_schema.py',
  'tests/conformance/spec/test_data_sources_contract.py',
  'tests/conformance/spec/test_surface_contract.py',
  'tests/conformance/schemas/test_ui_graph_policy_schema.py',
]);

if (metadataOnly) {
  process.exit(0);
}

run('npm', [
  '--prefix',
  '../formspec-studio',
  'run',
  'test',
  '--workspace=@formspec-org/studio-core',
  '--',
  'tests/kernel/proposal-manager-facade.test.ts',
]);
run('npm', ['run', '--workspace', '@formspec-org/types', 'test', '--', 'tests/schema-sync.test.ts', 'tests/schema-fuzz.test.ts']);
run('npm', ['run', '--workspace', '@formspec-org/react', 'test', '--', 'tests/locale-parity.test.tsx', 'tests/validation-report-parity.test.tsx']);
run('npm', ['run', '--workspace', '@formspec-org/webcomponent', 'test', '--', 'tests/components/interactive-plugins.test.ts']);
run('npm', ['run', '--workspace', '@formspec-org/engine', 'build']);
run('node', [
  '--experimental-specifier-resolution=node',
  '--import',
  './packages/formspec-engine/tests/setup.mjs',
  '--test',
  'packages/formspec-engine/tests/changelog-parity.test.mjs',
  'packages/formspec-engine/tests/experience-parity.test.mjs',
]);
