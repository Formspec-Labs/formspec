/** @filedesc FEL repeat navigation semantics: aggregate functions and sibling-index traversal inside repeat groups */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

function makeRepeatEngine() {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/fel-repeat-nav',
    version: '1.0.0',
    title: 'FEL Repeat Navigation',
    items: [{
      key: 'rows',
      type: 'group',
      label: 'Rows',
      repeatable: true,
      minRepeat: 3,
      children: [
        { key: 'amount', type: 'field', dataType: 'integer', label: 'Amount' }
      ]
    }]
  });

  engine.setValue('rows[0].amount', 10);
  engine.setValue('rows[1].amount', 20);
  engine.setValue('rows[2].amount', 30);
  return engine;
}

function makeNestedRepeatEngine() {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/fel-repeat-parent',
    version: '1.0.0',
    title: 'FEL Repeat Parent',
    items: [{
      key: 'invoice',
      type: 'group',
      label: 'Invoice',
      children: [
        { key: 'total', type: 'field', dataType: 'integer', label: 'Total' },
        {
          key: 'rows',
          type: 'group',
          label: 'Rows',
          repeatable: true,
          minRepeat: 2,
          children: [
            { key: 'amount', type: 'field', dataType: 'integer', label: 'Amount' }
          ]
        }
      ]
    }]
  });

  engine.setValue('invoice.total', 999);
  engine.setValue('invoice.rows[0].amount', 10);
  engine.setValue('invoice.rows[1].amount', 20);
  return engine;
}

test('@index is one-based inside repeat context', () => {
  const engine = makeRepeatEngine();
  assert.equal(engine.compileExpression('@index', 'rows[0].amount')(), 1);
  assert.equal(engine.compileExpression('@index', 'rows[2].amount')(), 3);
});

test('@count returns repeat size inside repeat context', () => {
  const engine = makeRepeatEngine();
  assert.equal(engine.compileExpression('@count', 'rows[1].amount')(), 3);
});

test('@current returns current repeat row object', () => {
  const engine = makeRepeatEngine();
  assert.equal(engine.compileExpression('@current.amount', 'rows[1].shadow')(), 20);
});

test('prev() and next() navigate sibling repeat rows', () => {
  const engine = makeRepeatEngine();
  assert.equal(engine.compileExpression('prev().amount', 'rows[1].amount')(), 10);
  assert.equal(engine.compileExpression('next().amount', 'rows[1].amount')(), 30);
});

test('repeat navigation returns null at boundaries', () => {
  const engine = makeRepeatEngine();
  assert.equal(engine.compileExpression('prev()', 'rows[0].amount')(), null);
  assert.equal(engine.compileExpression('next()', 'rows[2].amount')(), null);
});

test('repeat context references are null outside repeat scope', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/fel-repeat-nav-outside',
    version: '1.0.0',
    title: 'FEL Repeat Navigation Outside',
    items: [{ key: 'summary', type: 'field', dataType: 'string', label: 'Summary' }]
  });

  assert.equal(engine.compileExpression('@current', 'summary')(), null);
  assert.equal(engine.compileExpression('@index', 'summary')(), null);
  assert.equal(engine.compileExpression('@count', 'summary')(), null);
  assert.equal(engine.compileExpression('prev()', 'summary')(), null);
  assert.equal(engine.compileExpression('next()', 'summary')(), null);
});

test('parent() returns parent row/group object for postfix access', () => {
  const engine = makeNestedRepeatEngine();
  assert.equal(engine.compileExpression('parent().total', 'invoice.rows[0].amount')(), 999);
});

test('countWhere predicate rebinds bare $ instead of leaking current repeat row', () => {
  const engine = makeRepeatEngine();
  assert.equal(engine.compileExpression('countWhere([10, 20, 30], $ > 15)', 'rows[0].amount')(), 2);
});

test('every / some rebind bare $ like countWhere inside repeat context', () => {
  const engine = makeRepeatEngine();
  assert.equal(engine.compileExpression('every([10, 20, 30], $ > 5)', 'rows[0].amount')(), true);
  assert.equal(engine.compileExpression('every([10, 20, 3], $ > 5)', 'rows[0].amount')(), false);
  assert.equal(engine.compileExpression('some([1, 2, 3], $ > 2)', 'rows[0].amount')(), true);
  assert.equal(engine.compileExpression('some([1, 2, 3], $ > 10)', 'rows[0].amount')(), false);
});

test('duration() parses ISO 8601 duration to milliseconds via WASM', () => {
  const engine = makeRepeatEngine();
  assert.equal(engine.compileExpression("duration('PT1H')", 'rows[0].amount')(), 3600000);
  assert.equal(engine.compileExpression("duration('PT0.5S')", 'rows[0].amount')(), 500);
  assert.equal(engine.compileExpression("duration('-PT1M')", 'rows[0].amount')(), -60000);
});

test('quantifier predicates support $.field when elements are objects (§3.5.1)', () => {
  const engine = makeRepeatEngine();
  assert.equal(
    engine.compileExpression('every([{amount: 10}, {amount: 20}], $.amount > 5)', 'rows[0].amount')(),
    true,
  );
  assert.equal(
    engine.compileExpression('countWhere([{v: 1}, {v: 9}], $.v > 5)', 'rows[0].amount')(),
    1,
  );
});

test('a repeat row or group path is its own lexical scope for $sibling refs (Core §3.2.1)', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/fel-row-scope',
    version: '1.0.0',
    title: 'FEL Row Scope',
    items: [
      { key: 'employer', type: 'field', dataType: 'string', label: 'Top-level employer' },
      {
        key: 'jobs',
        type: 'group',
        label: 'Jobs',
        repeatable: true,
        minRepeat: 2,
        children: [
          { key: 'employer', type: 'field', dataType: 'string', label: 'Employer' },
          { key: 'current', type: 'field', dataType: 'boolean', label: 'Current' },
          { key: 'note', type: 'display', label: 'Note' },
          {
            key: 'address',
            type: 'group',
            label: 'Address',
            children: [{ key: 'city', type: 'field', dataType: 'string', label: 'City' }]
          }
        ]
      }
    ]
  });
  engine.setValue('employer', 'Self');
  engine.setValue('jobs[0].employer', 'Acme');
  engine.setValue('jobs[1].employer', 'Beta');
  engine.setValue('jobs[1].current', true);
  engine.setValue('jobs[1].address.city', 'Oslo');

  assert.equal(engine.compileExpression('$employer', 'jobs[0]')(), 'Acme');
  assert.equal(engine.compileExpression('$employer', 'jobs[1]')(), 'Beta');
  assert.equal(engine.compileExpression("$current and $employer = 'Beta'", 'jobs[1]')(), true);
  assert.equal(engine.compileExpression('$jobs.employer', 'jobs[1]')(), 'Beta');
  assert.equal(engine.compileExpression('@index', 'jobs[1]')(), 2);
  assert.equal(engine.compileExpression('$city', 'jobs[1].address')(), 'Oslo');
  assert.equal(engine.compileExpression('$employer', 'jobs[1].address')(), 'Beta', 'row scope still encloses a nested group');

  assert.equal(engine.compileExpression('$employer', 'jobs[0].note')(), 'Acme', 'display items resolve in their parent row');
  assert.equal(engine.compileExpression('$employer', 'jobs[1].current')(), 'Beta', 'fields resolve in their parent row');
  assert.equal(engine.compileExpression('$employer', '')(), 'Self');
  assert.equal(engine.compileExpression('$employer', 'jobs')(), 'Self', 'the repeat collection path is not a row scope');
});

test('ad-hoc FEL reads see every evaluation: values, added rows, removed rows', () => {
  const engine = makeRepeatEngine();
  const total = engine.compileExpression('sum($rows.amount)', '');
  const rowAmount = engine.compileExpression('$amount * @count', 'rows[1]');
  assert.equal(total(), 60);
  assert.equal(rowAmount(), 60);

  engine.setValue('rows[1].amount', 5);
  assert.equal(total(), 45);
  assert.equal(rowAmount(), 15);

  engine.addRepeatInstance('rows');
  engine.setValue('rows[3].amount', 1);
  assert.equal(total(), 46);
  assert.equal(rowAmount(), 20);

  engine.removeRepeatInstance('rows', 0);
  assert.equal(total(), 36);
  assert.equal(rowAmount(), 90, 'rows[1] is the former rows[2] after re-keying');
});
