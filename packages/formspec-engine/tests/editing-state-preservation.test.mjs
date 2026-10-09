/** @filedesc Public editing values and nested repeat shape survive loading and reindexing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormEngine } from '../dist/engine-render-entry.js';
const field = (key, dataType = 'string') => ({ type: 'field', key, label: key, dataType });
const definition = extra => ({ $formspec: '1.0', url: 'urn:test:editing-state', version: '1.0.0', title: 'Editing state', ...extra });
for (const nonRelevantBehavior of ['remove', 'empty', 'keep']) {
  for (const constructorLoad of [false, true]) {
    test(`hidden primary values survive ${constructorLoad ? 'constructor' : 'public load'} with ${nonRelevantBehavior} serialization`, () => {
      const form = definition({ nonRelevantBehavior, items: [field('show', 'boolean'), field('hidden')], binds: [{ path: 'hidden', relevant: '$show = true' }] });
      const engine = createFormEngine(form, constructorLoad ? { responseData: { hidden: 'keep while hidden' } } : {});
      try {
        if (!constructorLoad) engine.loadResponseData({ hidden: 'keep while hidden' });
        assert.equal(engine.signals.hidden.value, 'keep while hidden');
        const data = engine.getResponse({ profile: 'off' }).data;
        if (nonRelevantBehavior === 'remove') assert.equal(Object.hasOwn(data, 'hidden'), false);
        else assert.equal(data.hidden, nonRelevantBehavior === 'empty' ? null : 'keep while hidden');
        engine.setValue('hidden', 'changed', { source: 'assist' });
        assert.equal(engine.signals.hidden.value, 'changed');
        assert.equal(engine.getFieldVM('hidden').writeSource.value, 'assist');
        engine.setValue('show', true);
        assert.equal(engine.signals.hidden.value, 'changed');
        engine.setValue('show', false);
        engine.setValue('hidden', undefined);
        assert.equal(engine.signals.hidden.value, undefined);
        engine.setValue('show', true);
        assert.equal(engine.signals.hidden.value, undefined);
      } finally { engine.dispose(); }
    });
  }
}
function repeatDefinition() {
  return definition({ items: [{ type: 'group', key: 'rows', repeatable: true, minRepeat: 1, maxRepeat: 1, children: [
    field('name'), { type: 'group', key: 'children', repeatable: true, minRepeat: 1, maxRepeat: 1, children: [
      field('flag', 'boolean'), { type: 'group', key: 'details', children: [
        { type: 'group', key: 'leaves', repeatable: true, minRepeat: 1, children: [field('value', 'decimal')] },
      ] },
    ] },
  ] }] });
}
const rows = [
  { name: 'first', children: [{ flag: false, details: { leaves: [{ value: 0 }, { value: null }] } }, { flag: true, details: { leaves: [] } }] },
  { name: 'remove me', children: [] }, { name: 'third', children: [] },
];
test('outer removal preserves nested zero/above-max shape, values and write attribution', () => {
  const engine = createFormEngine(repeatDefinition());
  try {
    engine.loadResponseData({ rows });
    engine.setValue('rows[2].name', 'third edited', { source: 'assist' });
    engine.setValue('rows[0].children[0].flag', false, { source: 'user' });
    assert.equal(engine.repeats['rows[0].children'].value, 2);
    engine.removeRepeatInstance('rows', 1);
    assert.equal(engine.repeats.rows.value, 2);
    assert.equal(engine.repeats['rows[0].children'].value, 2);
    assert.equal(engine.repeats['rows[0].children[0].details.leaves'].value, 2);
    assert.equal(engine.repeats['rows[0].children[1].details.leaves'].value, 0);
    assert.equal(engine.repeats['rows[1].children'].value, 0);
    assert.equal(engine.signals['rows[0].children[0].flag'].value, false);
    assert.equal(engine.signals['rows[0].children[0].details.leaves[0].value'].value, 0);
    assert.equal(engine.signals['rows[0].children[0].details.leaves[1].value'].value, null);
    assert.equal(engine.getFieldVM('rows[0].children[0].flag').writeSource.value, 'user');
    assert.equal(engine.signals['rows[1].name'].value, 'third edited');
    assert.equal(engine.getFieldVM('rows[1].name').writeSource.value, 'assist');
    assert.equal(engine.getFieldPaths().includes('rows[2].name'), false);
    assert.equal(engine.getFieldPaths().includes('rows[1].children[0].flag'), false);
    engine.removeRepeatInstance('rows[0].children', 0);
    assert.equal(engine.repeats['rows[0].children'].value, 1);
    assert.equal(engine.signals['rows[0].children[0].flag'].value, true);
    assert.equal(engine.repeats['rows[0].children[0].details.leaves'].value, 0);
    assert.equal(engine.getFieldPaths().includes('rows[0].children[1].flag'), false);
  } finally { engine.dispose(); }
});
test('load truncation preserves omitted nested groups on retained rows', () => {
  const engine = createFormEngine(repeatDefinition());
  try {
    engine.loadResponseData({ rows });
    engine.loadResponseData({ rows: [{ name: 'first updated' }] });
    assert.equal(engine.repeats.rows.value, 1);
    assert.equal(engine.repeats['rows[0].children'].value, 2);
    assert.equal(engine.repeats['rows[0].children[0].details.leaves'].value, 2);
    assert.equal(engine.signals['rows[0].children[0].flag'].value, false);
    assert.equal(engine.getFieldPaths().includes('rows[1].name'), false);
  } finally { engine.dispose(); }
});
