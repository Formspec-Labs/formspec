/** @filedesc Fee line FEL behavior: answer-driven fee expressions update through engine context. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FormEngine } from '../dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('FEL fee line items respond to answer changes', () => {
  const definition = JSON.parse(readFileSync(
    resolve(__dirname, '../../../tests/fixtures/definition/preparation-fees/fel-fees.definition.json'),
    'utf-8',
  ));
  const engine = new FormEngine(definition);
  const [baseFee, expediteSurcharge] = definition.fees.lineItems;

  const calculateBaseFee = engine.compileExpression(baseFee.calculate);
  const calculateExpediteSurcharge = engine.compileExpression(expediteSurcharge.calculate);

  assert.equal(calculateBaseFee(), 25);
  assert.equal(calculateExpediteSurcharge(), 0);

  engine.setValue('expedite', true);
  assert.equal(calculateExpediteSurcharge(), 15);

  engine.setValue('expedite', false);
  assert.equal(calculateExpediteSurcharge(), 0);
});
