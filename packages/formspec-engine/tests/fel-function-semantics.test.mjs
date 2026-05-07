import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initFormspecEngine } from '../dist/index.js';
import { wasmEvalFELWithTrace } from '../dist/wasm-bridge-runtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const fixturePath = path.join(repoRoot, 'tests', 'conformance', 'fel-function-semantics.json');

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = normalize(value[key]);
    return out;
  }
  return value;
}

test('fel function semantics fixture', async () => {
  await initFormspecEngine();
  const cases = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  for (const c of cases) {
    const fields = c.data && typeof c.data === 'object' ? c.data : {};
    const out = wasmEvalFELWithTrace(c.expr, fields);
    assert.deepEqual(normalize(out.value), normalize(c.expected_value), c.id);
    const codes = (out.diagnostics ?? [])
      .map((d) => d.code)
      .filter((code) => typeof code === 'string');
    assert.deepEqual(codes, c.expected_diagnostic_codes ?? [], c.id);
  }
});
