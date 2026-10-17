#!/usr/bin/env node
/**
 * @filedesc Run spec contract pytest via venv python when present, else python3.
 *
 * Run Python cross-spec contract tests with the same interpreter that has the
 * built `formspec_rust` extension (prefer repo `.venv` when present).
 *
 * Without a `.venv` the ambient python3 runs the tests, which need only pytest itself, so its
 * third-party pytest plugins stay off: a broken one (an incompatible logfire/opentelemetry pair
 * on a developer's pyenv) otherwise fails the pre-commit hook before any test runs.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let ambient = false;

function findPython() {
  const win = process.platform === 'win32';
  const rel = win ? ['.venv', 'Scripts', 'python.exe'] : ['.venv', 'bin', 'python'];
  const venvPy = path.join(root, ...rel);
  if (fs.existsSync(venvPy)) return venvPy;
  ambient = true;
  return win ? 'python' : 'python3';
}

const py = findPython();
const args = ['-m', 'pytest', 'tests/conformance/spec/test_cross_spec_contracts.py', '-q'];
const r = spawnSync(py, args, { stdio: 'inherit', cwd: root, env: ambient ? { ...process.env, PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1' } : process.env });
process.exit(r.status === null ? 1 : r.status);
