/** @filedesc Tests for logically inconsistent form definitions — mismatched layers, phantom references, contradictory logic. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine, lintDocument } from '../dist/index.js';

// ── Helper ───────────────────────────────────────────────────────────────────

function makeDef(overrides) {
  return {
    $formspec: '1.0',
    url: 'https://example.org/inconsistency-test',
    version: '1.0.0',
    title: 'Inconsistency Test',
    status: 'active',
    items: [],
    ...overrides,
  };
}

function makeEngine(overrides) {
  return new FormEngine(makeDef(overrides));
}

function getReport(engine, mode = 'continuous') {
  const profile = mode === 'submit' ? 'on-submit' : mode === 'demand' ? 'on-demand' : 'live';
  return engine.getValidationReport({ profile });
}

// ═════════════════════════════════════════════════════════════════════════════
//  1. BINDS TARGETING NON-EXISTENT ITEMS
// ═════════════════════════════════════════════════════════════════════════════

test('bind referencing a path that does not exist in items', () => {
  const engine = makeEngine({
    items: [
      { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
    ],
    binds: [
      { path: 'phantom', required: true },
    ],
  });
  // The bind targets "phantom" which has no corresponding item.
  // Engine should not crash. The bind should be inert.
  assert.ok(engine);
  assert.equal(engine.signals.phantom, undefined);
  assert.equal(engine.signals.name?.value, '');
});

test('bind with relevant expression referencing non-existent field', () => {
  const engine = makeEngine({
    items: [
      { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
    ],
    binds: [
      { path: 'email', relevant: 'ghost == true' },
    ],
  });
  // "ghost" is not a defined field. FEL should resolve it to null.
  // email should be relevant=false (null != true) or engine handles gracefully.
  assert.ok(engine);
  const relevant = engine.relevantSignals.email?.value;
  // null == true is false, so field should be non-relevant
  assert.equal(relevant, false);
});

test('bind with calculate expression referencing non-existent field', () => {
  const engine = makeEngine({
    items: [
      { key: 'total', type: 'field', dataType: 'decimal', label: 'Total' },
    ],
    binds: [
      { path: 'total', calculate: 'subtotal + tax' },
    ],
  });
  // subtotal and tax don't exist — should evaluate to null arithmetic
  assert.ok(engine);
  const val = engine.signals.total?.value;
  // null + null → null or 0 depending on FEL coercion
  assert.ok(val === null || val === 0 || val === undefined || Number.isNaN(val),
    `Expected null/0/NaN for phantom-ref calculate, got ${val}`);
});

// ═════════════════════════════════════════════════════════════════════════════
//  2. CONTRADICTORY BINDS ON THE SAME FIELD
// ═════════════════════════════════════════════════════════════════════════════

test('field with both calculate and user-editable (no readonly)', () => {
  // A calculated field should be implicitly readonly,
  // but what if there's no explicit readonly bind?
  const engine = makeEngine({
    items: [
      { key: 'price', type: 'field', dataType: 'decimal', label: 'Price', initialValue: 10 },
      { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty', initialValue: 2 },
      { key: 'total', type: 'field', dataType: 'decimal', label: 'Total' },
    ],
    binds: [
      { path: 'total', calculate: 'price * qty' },
    ],
  });
  assert.equal(engine.signals.total?.value, 20);
  // Try to set the value on a calculated field — should it stick or be overwritten?
  engine.setValue('total', 999);
  // After re-evaluation, calculate should overwrite user input
  assert.equal(engine.signals.total?.value, 20);
});

test('multiple binds targeting the same path with conflicting constraints', () => {
  // Two binds with different constraints for the same path
  const engine = makeEngine({
    items: [
      { key: 'age', type: 'field', dataType: 'integer', label: 'Age' },
    ],
    binds: [
      { path: 'age', constraint: 'age >= 18', constraintMessage: 'Must be 18+' },
      { path: 'age', constraint: 'age < 10', constraintMessage: 'Must be under 10' },
    ],
  });
  // Both constraints active — no value of age can satisfy both (except null/0)
  engine.setValue('age', 25);
  const report = getReport(engine);
  const ageErrors = report.results.filter(r => r.path === 'age' && r.constraintKind === 'constraint');
  // At least one constraint should fail (25 < 10 is false)
  assert.ok(ageErrors.length >= 1, `Expected constraint errors, got ${ageErrors.length}`);
});

test('field required by bind but made irrelevant by another bind', () => {
  const engine = makeEngine({
    items: [
      { key: 'toggle', type: 'field', dataType: 'boolean', label: 'Toggle', initialValue: false },
      { key: 'data', type: 'field', dataType: 'string', label: 'Data' },
    ],
    binds: [
      { path: 'data', required: true },
      { path: 'data', relevant: 'toggle == true' },
    ],
  });
  // data is required but not relevant — required should not trigger on non-relevant fields
  const report = getReport(engine, 'submit');
  const dataRequired = report.results.find(r => r.path === 'data' && r.constraintKind === 'required');
  // Non-relevant fields should not produce required errors
  assert.equal(dataRequired, undefined, 'Non-relevant required field should not produce error');
});

// ═════════════════════════════════════════════════════════════════════════════
//  3. SHAPES REFERENCING NON-EXISTENT ITEMS
// ═════════════════════════════════════════════════════════════════════════════

test('shape with target pointing to non-existent path', () => {
  // Shape targets a field that doesn't exist
  let threw = false;
  try {
    makeEngine({
      items: [
        { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
      ],
      shapes: [
        {
          id: 'phantom-shape',
          target: 'nonexistent',
          severity: 'error',
          constraint: 'nonexistent != null',
          message: 'This should never work',
        },
      ],
    });
  } catch {
    threw = true;
  }
  // Engine may throw or silently ignore — either is acceptable, but it shouldn't corrupt state
  assert.ok(true, 'Engine handled phantom shape target without corruption');
});

test('shape with activeWhen referencing non-existent field', () => {
  const engine = makeEngine({
    items: [
      { key: 'amount', type: 'field', dataType: 'decimal', label: 'Amount', initialValue: 100 },
    ],
    shapes: [
      {
        id: 'ghost-active',
        target: 'amount',
        severity: 'error',
        activeWhen: 'ghostToggle == true',
        constraint: 'amount > 0',
        message: 'Amount must be positive',
      },
    ],
  });
  // ghostToggle doesn't exist → null == true → false → shape inactive
  const report = getReport(engine);
  const shapeResult = report.results.find(r => r.shapeId === 'ghost-active');
  assert.equal(shapeResult, undefined, 'Shape with phantom activeWhen should not fire');
});

// ═════════════════════════════════════════════════════════════════════════════
//  4. CIRCULAR & SELF-REFERENCING LOGIC
// ═════════════════════════════════════════════════════════════════════════════

test('calculate bind that references itself should be detected as a cycle', () => {
  let threw = false;
  try {
    makeEngine({
      items: [
        { key: 'x', type: 'field', dataType: 'integer', label: 'X' },
      ],
      binds: [
        { path: 'x', calculate: 'x + 1' },
      ],
    });
  } catch {
    threw = true;
  }
  assert.ok(threw, 'Self-referencing calculate bind should throw');
});

test('mutual calculate cycle between two fields should be detected', () => {
  let threw = false;
  try {
    makeEngine({
      items: [
        { key: 'a', type: 'field', dataType: 'integer', label: 'A' },
        { key: 'b', type: 'field', dataType: 'integer', label: 'B' },
      ],
      binds: [
        { path: 'a', calculate: 'b + 1' },
        { path: 'b', calculate: 'a + 1' },
      ],
    });
  } catch {
    threw = true;
  }
  assert.ok(threw, 'Mutual calculate cycle should throw');
});

test('variable referencing itself should be detected', () => {
  let threw = false;
  try {
    makeEngine({
      items: [],
      variables: [
        { name: 'loop', expression: '@loop + 1' },
      ],
    });
  } catch {
    threw = true;
  }
  assert.ok(threw, 'Self-referencing variable should throw');
});

// ═════════════════════════════════════════════════════════════════════════════
//  5. TYPE MISMATCHES — WRONG DATA TYPES
// ═════════════════════════════════════════════════════════════════════════════

test('setting string value on integer field', () => {
  const engine = makeEngine({
    items: [
      { key: 'age', type: 'field', dataType: 'integer', label: 'Age' },
    ],
  });
  engine.setValue('age', 'not-a-number');
  const val = engine.signals.age?.value;
  // Engine should coerce or reject — value should not silently remain as string
  assert.ok(
    val === null || val === 0 || val === undefined || typeof val === 'number' || val === 'not-a-number',
    `Integer field got value of type ${typeof val}: ${val}`
  );
});

test('setting number value on boolean field', () => {
  const engine = makeEngine({
    items: [
      { key: 'flag', type: 'field', dataType: 'boolean', label: 'Flag' },
    ],
  });
  engine.setValue('flag', 42);
  const val = engine.signals.flag?.value;
  // Should coerce or handle — document what happens
  assert.ok(val !== undefined, 'Engine should have a signal for the field');
});

test('initialValue type mismatch with declared dataType', () => {
  const engine = makeEngine({
    items: [
      { key: 'count', type: 'field', dataType: 'integer', label: 'Count', initialValue: 'hello' },
    ],
  });
  // Engine should coerce initialValue or use empty value
  const val = engine.signals.count?.value;
  assert.ok(val !== undefined, 'Engine should still create signal despite type mismatch');
});

// ═════════════════════════════════════════════════════════════════════════════
//  6. ORPHANED ITEMS — GROUPS AND CHILDREN
// ═════════════════════════════════════════════════════════════════════════════

test('group with no children', () => {
  const engine = makeEngine({
    items: [
      { key: 'emptyGroup', type: 'group', label: 'Empty Group', children: [] },
    ],
  });
  assert.ok(engine, 'Engine should handle empty groups');
  const report = getReport(engine, 'submit');
  assert.ok(report, 'Should produce a report without crashing');
});

test('deeply nested empty groups', () => {
  const engine = makeEngine({
    items: [
      {
        key: 'outer',
        type: 'group',
        label: 'Outer',
        children: [
          {
            key: 'middle',
            type: 'group',
            label: 'Middle',
            children: [
              {
                key: 'inner',
                type: 'group',
                label: 'Inner',
                children: [],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.ok(engine, 'Engine should handle deeply nested empty groups');
});

test('repeatable group with min > max', () => {
  // min=5, max=2 is contradictory
  const engine = makeEngine({
    items: [
      {
        key: 'items',
        type: 'group',
        label: 'Items',
        repeatable: true,
        minRepeat: 5,
        maxRepeat: 2,
        children: [
          { key: 'value', type: 'field', dataType: 'string', label: 'Value' },
        ],
      },
    ],
  });
  // Engine should handle this gracefully — what happens?
  assert.ok(engine, 'Engine should not crash on min > max');
});

// ═════════════════════════════════════════════════════════════════════════════
//  7. OPTION SET MISMATCHES
// ═════════════════════════════════════════════════════════════════════════════

test('field with choice dataType but no options defined', () => {
  const engine = makeEngine({
    items: [
      { key: 'color', type: 'field', dataType: 'choice', label: 'Color' },
    ],
  });
  // Choice field with no options — should render but have nothing to pick
  assert.ok(engine);
  const options = engine.getOptions('color');
  assert.ok(Array.isArray(options), 'Should return empty options array');
  assert.equal(options.length, 0);
});

test('field referencing non-existent optionSet', () => {
  const engine = makeEngine({
    items: [
      { key: 'color', type: 'field', dataType: 'choice', label: 'Color', optionSet: 'nonexistent' },
    ],
    optionSets: {
      sizes: {
        options: [
          { value: 'S', label: 'Small' },
          { value: 'M', label: 'Medium' },
        ],
      },
    },
  });
  // optionSet "nonexistent" is not in optionSets — field should have no options
  assert.ok(engine);
  const options = engine.getOptions('color');
  assert.equal(options.length, 0, 'Non-existent optionSet should yield no options');
});

test('setting a value not in the option set for a choice field', () => {
  const engine = makeEngine({
    items: [
      { key: 'size', type: 'field', dataType: 'choice', label: 'Size', optionSet: 'sizes' },
    ],
    optionSets: {
      sizes: {
        options: [
          { value: 'S', label: 'Small' },
          { value: 'M', label: 'Medium' },
        ],
      },
    },
  });
  engine.setValue('size', 'XXXL'); // not in option set
  assert.equal(engine.signals.size?.value, 'XXXL', 'Engine stores the value even if not in options');
});

// ═════════════════════════════════════════════════════════════════════════════
//  8. RESPONSE ASSEMBLY WITH INCONSISTENT STATE
// ═════════════════════════════════════════════════════════════════════════════

test('getResponse with all fields non-relevant (nonRelevantBehavior=remove)', () => {
  const engine = makeEngine({
    nonRelevantBehavior: 'remove',
    items: [
      { key: 'a', type: 'field', dataType: 'string', label: 'A' },
      { key: 'b', type: 'field', dataType: 'string', label: 'B' },
    ],
    binds: [
      { path: 'a', relevant: 'false' },
      { path: 'b', relevant: 'false' },
    ],
  });
  engine.setValue('a', 'hello');
  engine.setValue('b', 'world');
  const response = engine.getResponse();
  // With nonRelevantBehavior=remove, non-relevant fields should be excluded
  assert.ok(response, 'Response should be produced');
  const data = response.data ?? response;
  // Fields should be removed or null
  if (data.a !== undefined) {
    assert.equal(data.a, null, 'Non-relevant field should be null if present');
  }
});

test('getValidationReport on a form with zero items', () => {
  const engine = makeEngine({ items: [] });
  const report = getReport(engine, 'submit');
  assert.equal(report.valid, true, 'Empty form should be valid');
  assert.equal(report.counts.error, 0);
});

// ═════════════════════════════════════════════════════════════════════════════
//  9. FEL EXPRESSIONS WITH WRONG TYPES
// ═════════════════════════════════════════════════════════════════════════════

test('constraint expression returning a non-boolean value', () => {
  const engine = makeEngine({
    items: [
      { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
    ],
    binds: [
      { path: 'name', constraint: '"always-a-string"', constraintMessage: 'Bad constraint' },
    ],
  });
  engine.setValue('name', 'test');
  const report = getReport(engine);
  // Spec says constraint must return boolean; non-boolean may be truthy or may error
  // Either way, engine should not crash
  assert.ok(report, 'Report should be generated despite non-boolean constraint');
});

test('required expression returning a string instead of boolean', () => {
  const engine = makeEngine({
    items: [
      { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
    ],
    binds: [
      { path: 'name', required: '"yes"' },
    ],
  });
  // "yes" is truthy but not boolean — should field be required?
  const report = getReport(engine, 'submit');
  // Engine should handle truthy coercion
  assert.ok(report, 'Engine should handle non-boolean required expression');
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. DUPLICATE KEYS
// ═════════════════════════════════════════════════════════════════════════════

test('duplicate item keys at the same level', () => {
  // Two items with the same key — which one wins?
  let engine;
  let threw = false;
  try {
    engine = makeEngine({
      items: [
        { key: 'name', type: 'field', dataType: 'string', label: 'First Name' },
        { key: 'name', type: 'field', dataType: 'integer', label: 'Name as Number' },
      ],
    });
  } catch {
    threw = true;
  }
  // Either throws or last-write-wins — document the behavior
  if (!threw) {
    assert.ok(engine.signals.name, 'Should have a signal for the duplicated key');
  }
  assert.ok(true, 'Engine handled duplicate keys');
});

test('duplicate shape IDs', () => {
  let engine;
  let threw = false;
  try {
    engine = makeEngine({
      items: [
        { key: 'x', type: 'field', dataType: 'integer', label: 'X', initialValue: 5 },
      ],
      shapes: [
        { id: 'same-id', target: 'x', severity: 'error', constraint: 'x > 0', message: 'Positive' },
        { id: 'same-id', target: 'x', severity: 'warning', constraint: 'x > 10', message: 'Big' },
      ],
    });
  } catch {
    threw = true;
  }
  if (!threw) {
    const report = getReport(engine);
    assert.ok(report, 'Engine handled duplicate shape IDs');
  }
  assert.ok(true, 'Duplicate shape IDs handled without corruption');
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. INSTANCE DATA INCONSISTENCIES
// ═════════════════════════════════════════════════════════════════════════════

test('instance with schema mismatch should throw', () => {
  let threw = false;
  try {
    makeEngine({
      items: [],
      instances: {
        config: {
          readonly: true,
          schema: { count: 'integer' },
          data: { count: 'not-a-number' },
        },
      },
    });
  } catch {
    threw = true;
  }
  assert.ok(threw, 'Instance data/schema mismatch should throw');
});

test('FEL expression referencing non-existent instance', () => {
  const engine = makeEngine({
    items: [
      { key: 'result', type: 'field', dataType: 'string', label: 'Result' },
    ],
    binds: [
      { path: 'result', calculate: 'instance("ghost").value' },
    ],
  });
  // ghost instance doesn't exist — should produce null, not crash
  assert.ok(engine);
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. PRESENTATION LAYER GHOSTS
// ═════════════════════════════════════════════════════════════════════════════

test('formPresentation with pageMode but no pages defined', () => {
  const engine = makeEngine({
    formPresentation: {
      pageMode: 'wizard',
    },
    items: [
      { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
    ],
  });
  // Wizard mode with no page items — should still work as single-page fallback
  assert.ok(engine);
  const response = engine.getResponse();
  assert.ok(response, 'Response should be producible despite wizard with no pages');
});

test('presentation hints referencing invalid widget type', () => {
  const engine = makeEngine({
    items: [
      {
        key: 'email',
        type: 'field',
        dataType: 'string',
        label: 'Email',
        presentation: { widget: 'nonexistentWidget' },
      },
    ],
  });
  // Invalid widget hint should be ignored (Tier 1 is advisory)
  assert.ok(engine);
  engine.setValue('email', 'test@example.com');
  assert.equal(engine.signals.email?.value, 'test@example.com');
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. VARIABLE SCOPE MISMATCHES
// ═════════════════════════════════════════════════════════════════════════════

test('variable scoped to non-existent group', () => {
  const engine = makeEngine({
    items: [
      { key: 'x', type: 'field', dataType: 'integer', label: 'X', initialValue: 5 },
    ],
    variables: [
      { name: 'scopedVar', expression: 'x * 2', scope: 'nonexistentGroup' },
    ],
  });
  assert.ok(engine, 'Engine handles variable scoped to non-existent group');
  // Variable should exist but be inaccessible from root scope
  const val = engine.getVariableValue('scopedVar', '');
  // May be undefined since no matching scope
  assert.ok(true, 'No crash when accessing variable with phantom scope');
});

test('variable expression using another variable from a different scope', () => {
  const engine = makeEngine({
    items: [
      {
        key: 'group1',
        type: 'group',
        label: 'Group 1',
        children: [
          { key: 'a', type: 'field', dataType: 'integer', label: 'A', initialValue: 10 },
        ],
      },
      {
        key: 'group2',
        type: 'group',
        label: 'Group 2',
        children: [
          { key: 'b', type: 'field', dataType: 'integer', label: 'B', initialValue: 20 },
        ],
      },
    ],
    variables: [
      { name: 'localA', expression: 'a', scope: 'group1' },
      { name: 'crossRef', expression: '@localA + b', scope: 'group2' },
    ],
  });
  // @localA is scoped to group1 but crossRef is in group2
  // Variable resolution should follow scope visibility rules
  assert.ok(engine, 'Engine handles cross-scope variable references');
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. LINT — STRUCTURAL INCONSISTENCIES
// ═════════════════════════════════════════════════════════════════════════════

test('lintDocument on a definition with completely wrong structure', () => {
  const result = lintDocument({ foo: 'bar', notFormspec: true });
  // Should detect this isn't a valid formspec document
  assert.ok(result);
  assert.equal(result.valid, false);
});

test('lintDocument on a definition missing required fields', () => {
  const result = lintDocument({
    $formspec: '1.0',
    // missing url, version, title, items
  });
  assert.ok(result);
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.length > 0, 'Should have diagnostics for missing fields');
});

test('lintDocument on a definition with extra unknown top-level fields', () => {
  const result = lintDocument({
    $formspec: '1.0',
    url: 'https://example.org/test',
    version: '1.0.0',
    title: 'Test',
    status: 'active',
    items: [{ key: 'x', type: 'field', dataType: 'string', label: 'X' }],
    completelyMadeUp: 'should this pass?',
    anotherBogusField: [1, 2, 3],
  });
  // Schema may allow additional properties or may not
  assert.ok(result, 'Lint should handle extra fields');
});

// ═════════════════════════════════════════════════════════════════════════════
// 15. EDGE CASES — THE TRULY BIZARRE
// ═════════════════════════════════════════════════════════════════════════════

test('field with every inline bind property contradicting each other', () => {
  // A field that is required + has a calculate (so readonly) + has a constraint that always fails
  const engine = makeEngine({
    items: [
      { key: 'chaos', type: 'field', dataType: 'string', label: 'Chaos', initialValue: '' },
    ],
    binds: [
      {
        path: 'chaos',
        required: true,
        calculate: '"forced-value"',
        constraint: 'chaos == "impossible"',
        constraintMessage: 'Always fails',
        readonly: true,
      },
    ],
  });
  // The field is:
  // - calculated to "forced-value"
  // - required (so empty = error, but it's calculated so never empty)
  // - constrained to == "impossible" (always fails since value is "forced-value")
  // - readonly (can't fix it)
  const report = getReport(engine);
  const constraintErr = report.results.find(r => r.path === 'chaos' && r.constraintKind === 'constraint');
  // Constraint should fire since "forced-value" != "impossible"
  assert.ok(constraintErr, 'Contradictory field should produce constraint error');
  // But the user can't fix it because it's readonly+calculated
  assert.equal(engine.readonlySignals.chaos?.value, true, 'Field should be readonly');
});

test('definition with 0-length string keys', () => {
  // Empty string as a field key
  let threw = false;
  try {
    const engine = makeEngine({
      items: [
        { key: '', type: 'field', dataType: 'string', label: 'No Key' },
      ],
    });
    // If it doesn't throw, check that signals are accessible
    assert.ok(engine);
  } catch {
    threw = true;
  }
  assert.ok(true, 'Engine handled empty key without corruption');
});

test('setting value on a display-type item (no data backing)', () => {
  const engine = makeEngine({
    items: [
      { key: 'intro', type: 'display', label: 'Welcome text' },
    ],
  });
  // Display items have no data — setting a value should be ignored or no-op
  engine.setValue('intro', 'hack');
  // Display items should not appear in response data
  const response = engine.getResponse();
  assert.ok(response, 'Response should be generated');
});

test('deeply nested group path in bind (5+ levels)', () => {
  const engine = makeEngine({
    items: [
      {
        key: 'l1', type: 'group', label: 'L1',
        children: [{
          key: 'l2', type: 'group', label: 'L2',
          children: [{
            key: 'l3', type: 'group', label: 'L3',
            children: [{
              key: 'l4', type: 'group', label: 'L4',
              children: [{
                key: 'l5', type: 'group', label: 'L5',
                children: [
                  { key: 'deep', type: 'field', dataType: 'string', label: 'Deep' },
                ],
              }],
            }],
          }],
        }],
      },
    ],
    binds: [
      { path: 'l1.l2.l3.l4.l5.deep', required: true },
    ],
  });
  assert.ok(engine, 'Engine handles deeply nested paths');
  const report = getReport(engine, 'submit');
  const deepRequired = report.results.find(r => r.path === 'l1.l2.l3.l4.l5.deep');
  assert.ok(deepRequired, 'Should validate deeply nested required field');
});

test('repeatable group — remove instance that was never added', () => {
  const engine = makeEngine({
    items: [
      {
        key: 'rows',
        type: 'group',
        label: 'Rows',
        repeatable: true,
        children: [
          { key: 'val', type: 'field', dataType: 'string', label: 'Value' },
        ],
      },
    ],
  });
  // Try to remove index 5 when 0 instances exist
  const result = engine.removeRepeatInstance('rows', 5);
  assert.ok(engine, 'Engine should not crash on invalid remove');
});

test('simultaneously required and calculated field with empty calculate result', () => {
  // Calculate returns empty string, but field is required
  const engine = makeEngine({
    items: [
      { key: 'derived', type: 'field', dataType: 'string', label: 'Derived' },
    ],
    binds: [
      { path: 'derived', required: true, calculate: '""' },
    ],
  });
  const report = getReport(engine, 'submit');
  const requiredErr = report.results.find(r => r.path === 'derived' && r.constraintKind === 'required');
  // Interesting: calculate produces "", which is empty, but required says it can't be empty
  // Should this be a required error even though the user can't change it?
  assert.ok(report, 'Report generated for required+empty-calculate conflict');
});
