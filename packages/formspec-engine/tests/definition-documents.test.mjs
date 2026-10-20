/** @filedesc Actual native declaration validation and engine preservation, without claiming a signing act. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FormEngine, lintDocument } from '../dist/index.js';
const source = JSON.parse(readFileSync(new URL('../../../tests/fixtures/definition-documents/valid.definition.json', import.meta.url), 'utf8'));
const document = () => structuredClone(source);
const terms = doc => doc.documents['terms-v2'];
const errors = doc => lintDocument(doc).diagnostics.filter(d => d.severity === 'error');

test('declared URL/inline variants and many-to-many attestations pass actual native validation', () => {
  const result = lintDocument(document());
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
});

test('actual native owner refuses unknown document and missing/colliding default locale', () => {
  for (const change of [
    d => { d.items[0].attests = ['foreign']; },
    d => { terms(d).defaultLocale = 'fr'; },
    d => { terms(d).variants['EN-us'] = structuredClone(terms(d).variants['en-US']); },
  ]) {
    const doc = document(); change(doc);
    const diagnostics = errors(doc);
    assert.ok(diagnostics.some(d => d.code === 'E303' && d.path.startsWith('$.')), JSON.stringify(diagnostics));
  }
});

test('actual native owner checks inline bytes, digest and encoded/decoded limits', () => {
  for (const change of [
    v => { v.documentHash = '0'.repeat(64); },
    v => { v.source.data = 'SGVsbG9='; }, // Non-zero pad bits: lexical base64 is insufficient.
    v => { v.source.data = Buffer.alloc(1048577).toString('base64'); },
    v => { v.source.data = 'AAAA'.repeat(349527); },
  ]) {
    const doc = document(); change(terms(doc).variants['en-US']);
    const diagnostics = errors(doc);
    assert.ok(diagnostics.some(d => d.code === 'E303'), JSON.stringify(diagnostics));
  }
});

test('standalone and nested Screener attestations refuse without a document catalog', () => {
  const screener = JSON.parse(readFileSync(new URL('../../../tests/fixtures/lint/valid-screener-semantic.json', import.meta.url), 'utf8'));
  for (const nested of [false, true]) {
    const doc = structuredClone(screener);
    const field = { type: 'field', key: 'attestation', label: 'Attestation', dataType: 'boolean', attests: ['terms-v2'] };
    doc.items.push(nested ? { type: 'group', key: 'group', label: 'Group', children: [field] } : field);
    const diagnostics = errors(doc);
    assert.ok(diagnostics.some(d => d.code === 'E1508' && d.path.endsWith('.attests')), JSON.stringify(diagnostics));
  }
});

test('engine retains document declarations and field scope without synthesizing assent', () => {
  const doc = document(); const engine = new FormEngine(doc);
  assert.deepEqual(engine.definition.documents, doc.documents);
  assert.deepEqual(engine.definition.items[0].attests, doc.items[0].attests);
  const response = engine.getResponse({ id: 'response-1' });
  assert.equal(response.authoredSignatures, undefined);
});
