/** @filedesc Core §2.1.3: date/dateTime fields reach ad-hoc FEL (compileExpression) as FEL dates. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { FormEngine, initFormspecEngine } from '../dist/index.js';

const definition = {
  $formspec: '1.0',
  url: 'https://example.org/forms/date-context-typing',
  version: '1.0.0',
  status: 'active',
  title: 'Date context typing',
  items: [
    { key: 'd', type: 'field', dataType: 'date', label: 'D' },
    { key: 'stamp', type: 'field', dataType: 'dateTime', label: 'Stamp' },
    { key: 'g', type: 'group', label: 'G', children: [
      { key: 'gd', type: 'field', dataType: 'date', label: 'GD' },
    ] },
    { key: 'r', type: 'group', label: 'R', repeatable: true, minRepeat: 1, children: [
      { key: 'rd', type: 'field', dataType: 'date', label: 'RD' },
    ] },
    { key: 'note', type: 'field', dataType: 'string', label: 'Note' },
  ],
};

async function engineWithDates() {
  await initFormspecEngine();
  const engine = new FormEngine(definition);
  engine.setValue('d', '2025-03-01');
  engine.setValue('stamp', '2025-03-01T10:30:00');
  engine.setValue('g.gd', '2025-03-01');
  engine.setValue('r[0].rd', '2025-03-01');
  engine.setValue('note', '2025-03-01');
  return engine;
}

test('top-level, nested, and repeat date fields are FEL dates in compileExpression', async () => {
  const engine = await engineWithDates();
  const typeOf = (expression, context = '') => engine.compileExpression(expression, context)();

  assert.equal(typeOf('typeOf($d)'), 'date');
  assert.equal(typeOf('typeOf($stamp)'), 'date');
  assert.equal(typeOf('typeOf($g.gd)'), 'date');
  assert.equal(typeOf('typeOf($r[1].rd)'), 'date');
  assert.equal(typeOf('typeOf($rd)', 'r[0].rd'), 'date');
  assert.equal(typeOf('typeOf(@current.rd)', 'r[0].rd'), 'date');
  assert.equal(typeOf("$d <= date('2025-03-29')"), true);
});

test('string fields holding ISO text stay FEL strings', async () => {
  const engine = await engineWithDates();
  assert.equal(engine.compileExpression('typeOf($note)')(), 'string');
});

test('batch evaluation types repeat dates and passes type-error constraints (§3.8.1)', async () => {
  await initFormspecEngine();
  const engine = new FormEngine({
    ...definition,
    items: [
      ...definition.items.filter((item) => item.key !== 'r'),
      { key: 'r', type: 'group', label: 'R', repeatable: true, minRepeat: 1, children: [
        { key: 'rd', type: 'field', dataType: 'date', label: 'RD' },
        { key: 'rflag', type: 'field', dataType: 'boolean', label: 'RF' },
        { key: 'rcalc', type: 'field', dataType: 'string', label: 'RC' },
      ] },
    ],
    binds: [
      { path: 'r[*].rflag', relevant: "$rd > date('2025-03-29')" },
      { path: 'r[*].rcalc', calculate: 'typeOf($rd)' },
      { path: 'note', constraint: "$note <= date('2025-03-29')", constraintMessage: 'type-error' },
    ],
  });
  engine.setValue('r[0].rd', '2025-03-01');
  engine.setValue('note', '2025-03-01');

  assert.equal(engine.relevantSignals['r[0].rflag'].value, false);
  assert.equal(engine.signals['r[0].rcalc'].value, 'date');
  const report = engine.getValidationReport({ profile: 'on-submit' });
  assert.deepEqual(report.results.filter((result) => result.message === 'type-error'), []);
});
