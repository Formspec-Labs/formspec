#!/usr/bin/env node
/**
 * @filedesc Run spec contract pytest via venv python when present, else python3.
 *
 * Run Python cross-spec contract tests with the same interpreter that has the
 * built `formspec_rust` extension (prefer repo `.venv` when present).
 *
 * Without a `.venv` (docs-check.yml has none) the ambient python3 runs the tests. They need only
 * pytest itself, so third-party pytest plugin autoload is always off: a broken plugin (an
 * incompatible logfire/opentelemetry pair on a developer's pyenv) otherwise fails the hook before
 * any test runs.
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

const py = findPython();
const args = ['-m', 'pytest', 'tests/conformance/spec/test_cross_spec_contracts.py', '-q'];
const r = spawnSync(py, args, { stdio: 'inherit', cwd: root, env: { ...process.env, PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1' } });
process.exit(r.status === null ? 1 : r.status);
