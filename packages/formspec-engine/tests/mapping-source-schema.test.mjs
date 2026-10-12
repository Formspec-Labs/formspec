import test from 'node:test';
import assert from 'node:assert/strict';
import { createMappingEngine } from '../dist/mapping/RuntimeMappingEngine.js';
import { lintDocument } from '../dist/fel/fel-api-tools.js';
import { initFormspecEngine, initFormspecEngineTools } from '../dist/init-formspec-engine.js';
await initFormspecEngine();
await initFormspecEngineTools();
const mapping = schema => ({ $formspecMapping: '1.0', version: '1.0.0', sourceSchema: { url: 'urn:example:source', version: '1.0.0', schema }, targetSchema: { format: 'json' }, rules: [{ sourcePath: 'value', targetPath: 'value', transform: 'preserve' }] });
test('external schema validates exact null input through the public wrapper', () => {
  const doc = mapping({ type: 'null' });
  doc.rules = [{ targetPath: 'seen', transform: 'expression', expression: 'isNull(@source)' }];
  const result = createMappingEngine(doc).forward(null);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.output, { seen: true });
});
test('external reverse returns validated source JSON before target adapters', () => {
  const doc = mapping({ type: 'object', required: ['value'], properties: { value: { type: 'null' } }, additionalProperties: false });
  doc.adapters = { json: { nullHandling: 'omit' } };
  assert.deepEqual(createMappingEngine(doc).reverse({ value: null }).output, { value: null });
  doc.targetSchema = { format: 'csv' };
  assert.deepEqual(createMappingEngine(doc).reverse({ value: null }).output, { value: null });
  doc.targetSchema = { format: 'xml' };
  assert.deepEqual(createMappingEngine(doc).reverse({ value: null }).output, { value: null });
});
test('invalid external input refuses delivery before rules', () => {
  const doc = mapping({ type: 'object', required: ['value'], properties: { value: { type: 'string' } }, additionalProperties: false });
  const result = createMappingEngine(doc).forward({ value: 42 });
  assert.deepEqual(result.output, {});
  assert.equal(result.appliedRules, 0);
  assert.equal(result.diagnostics[0].errorCode, 'INVALID_DOCUMENT');
  assert.equal(lintDocument(doc).valid, true);
});
test('external source identity is validated by lint and document execution', () => {
  const doc = mapping({ type: 'object' });
  doc.sourceSchema.url = 'not a URI';
  assert.equal(lintDocument(doc).valid, false);
  assert.equal(createMappingEngine(doc).forward({ value: 'ok' }).diagnostics[0].errorCode, 'INVALID_DOCUMENT');
});
