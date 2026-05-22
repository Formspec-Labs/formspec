#!/usr/bin/env node
/**
 * @filedesc Run contract-surface pytest checks via repo venv when present.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function findPython() {
  const win = process.platform === 'win32';
  const rel = win ? ['.venv', 'Scripts', 'python.exe'] : ['.venv', 'bin', 'python'];
  const venvPy = path.join(root, ...rel);
  if (fs.existsSync(venvPy)) return venvPy;
  return win ? 'python' : 'python3';
}

const args = [
  '-m',
  'pytest',
  'tests/unit/test_contract_surface_coverage.py',
  'tests/unit/test_lint_rule_registry.py',
  'tests/conformance/test_issuer_fixtures.py',
  'tests/conformance/test_definition_issuer_binding.py',
  'tests/conformance/test_response_displayed_issuer.py',
  '-q',
];

const result = spawnSync(findPython(), args, {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
