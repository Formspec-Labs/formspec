/** @filedesc Save and resume editable form state without applying Response filtering. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { canonicalizeResponseData, createFormEngine, jsonNumberText } from '../dist/engine-render-entry.js';

const fixture = parseJsonExact(readFileSync(new URL('../../../tests/fixtures/engine-draft-snapshot.json', import.meta.url), 'utf8'));
const { definition, snapshot } = fixture;
const { data } = snapshot;
const numberText = '0.3333333333333333333333333333';

test('a saved draft restores a hidden exact answer and hidden repeat rows', () => {
  const original = createFormEngine(definition);
  let resumed;
  try {
    original.setValue('show', true);
    original.setValue('amount', data.amount);
    original.addRepeatInstance('entries[0].details.rows');
    original.addRepeatInstance('entries[0].details.rows');
    original.setValue('show', false);

    assert.deepEqual(original.getResponse({ profile: 'on-submit' }).data, { show: false });
    const saved = original.getDraftSnapshot();
    assert.deepEqual(saved, snapshot);
    const json = JSON.stringify(saved);
    assert.ok(json.includes(`"amount":${numberText}`));
    assert.doesNotMatch(json, /validationResults|authoredSignatures|\$formspecResponse/);

    resumed = createFormEngine(definition, { draftSnapshot: parseJsonExact(json) });
    assert.equal(resumed.isPathRelevant('amount'), false);
    assert.equal(resumed.repeats.entries.value, 2);
    assert.equal(resumed.repeats['entries[0].details.rows'].value, 2);
    assert.equal(resumed.repeats['entries[1].details.rows'].value, 0);
    assert.deepEqual(resumed.getDraftSnapshot(), snapshot);
    assert.deepEqual(resumed.getResponse({ profile: 'on-submit' }).data, { show: false });
    resumed.setValue('show', true);
    assert.equal(jsonNumberText(resumed.signals.amount.value), numberText);
    assert.equal(jsonNumberText(resumed.getResponse({ profile: 'on-submit' }).data.amount), numberText);
  } finally {
    original.dispose();
    resumed?.dispose();
  }
});

// Response identity moved to the writer. The engine snapshot contains only the pin and editable data.
test('a resumed draft returns a detached snapshot with only the Definition pin and data', () => {
  const engine = createFormEngine(definition);
  try {
    const saved = parseJsonExact(JSON.stringify(snapshot));
    engine.loadDraftSnapshot(saved);
    saved.data.entries[0].details.rows.length = 0;
    assert.deepEqual(engine.getDraftSnapshot(), snapshot);

    engine.getDraftSnapshot().data.entries[0].details.rows.length = 0;
    assert.deepEqual(engine.getDraftSnapshot(), snapshot);
  } finally {
    engine.dispose();
  }
});

test('a mismatched draft Definition is refused before changing the loaded draft', () => {
  const engine = createFormEngine(definition, { draftSnapshot: snapshot });
  try {
    for (const pin of [{ definitionUrl: 'https://example.org/other' }, { definitionVersion: '2.0.0' }]) {
      assert.throws(() => engine.loadDraftSnapshot({ ...snapshot, ...pin, data: {} }), /Definition pin/);
      assert.throws(() => createFormEngine(definition, { draftSnapshot: { ...snapshot, ...pin } }), /Definition pin/);
      assert.deepEqual(engine.getDraftSnapshot(), snapshot);
    }
  } finally {
    engine.dispose();
  }
});

test('a full draft restores dependent answers and an explicitly cleared initial value', () => {
  const form = {
    ...definition,
    items: [{ key: 'parent', type: 'field', dataType: 'boolean', label: 'Parent', children: [
      { key: 'detail', type: 'field', dataType: 'string', label: 'Detail' },
    ] }, { key: 'name', type: 'field', dataType: 'string', label: 'Name', initialValue: 'Initial' }],
    binds: [],
  };
  const original = createFormEngine(form);
  const resumed = createFormEngine(form);
  try {
    original.setValue('parent', false);
    original.setValue('parent.detail', 'Dependent answer');
    original.setValue('name', undefined);
    const saved = original.getDraftSnapshot();
    assert.deepEqual(saved.data, { parent: false, detail: 'Dependent answer' });

    resumed.loadDraftSnapshot(parseJsonExact(JSON.stringify(saved)));
    assert.equal(resumed.signals['parent.detail'].value, 'Dependent answer');
    // Missing saved data has a null signal and stays absent from the draft.
    assert.equal(resumed.signals.name.value, null);
    assert.equal(Object.hasOwn(resumed.getDraftSnapshot().data, 'name'), false);
    assert.equal(resumed.signals.parent.value, false);
  } finally {
    original.dispose();
    resumed.dispose();
  }
});

test('resuming a draft does not apply a relevance default from the prior form state', () => {
  const form = {
    ...definition,
    items: [{ key: 'show', type: 'field', dataType: 'boolean', label: 'Show' },
      { key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
    binds: [{ path: 'name', relevant: '$show = true', default: 'Relevance default' }],
  };
  const original = createFormEngine(form, { responseData: { show: true } });
  const resumed = createFormEngine(form, { responseData: { show: false } });
  try {
    original.setValue('name', undefined);
    const saved = original.getDraftSnapshot();
    assert.deepEqual(saved.data, { show: true });
    assert.equal(resumed.isPathRelevant('name'), false);
    resumed.loadDraftSnapshot(saved);
    assert.equal(resumed.isPathRelevant('name'), true);
    // Missing saved data has a null signal and stays absent from the draft.
    assert.equal(resumed.signals.name.value, null);
    assert.equal(Object.hasOwn(resumed.getDraftSnapshot().data, 'name'), false);
  } finally {
    original.dispose();
    resumed.dispose();
  }
});

test('resuming with fewer repeat rows preserves the evaluated state of the remaining rows', () => {
  const form = {
    ...definition,
    items: [{ key: 'entries', type: 'group', label: 'Entries', repeatable: true, children: [
      { key: 'hidden', type: 'field', dataType: 'string', label: 'Hidden' },
      { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
      { key: 'reference', type: 'field', dataType: 'string', label: 'Reference' },
    ] }],
    binds: [
      { path: 'entries.hidden', relevant: 'false' },
      { path: 'entries.name', required: 'true' },
      { path: 'entries.reference', readonly: 'true' },
    ],
  };
  const saved = createFormEngine(form, { responseData: { entries: [{ hidden: 'answer', name: '' }] } });
  const resumed = createFormEngine(form, { responseData: { entries: [{ hidden: 'answer', name: '' }, {}] } });
  try {
    resumed.loadDraftSnapshot(saved.getDraftSnapshot());
    assert.equal(resumed.repeats.entries.value, 1);
    assert.equal(resumed.relevantSignals['entries[0].hidden'].value, false);
    assert.equal(resumed.requiredSignals['entries[0].name'].value, true);
    assert.equal(resumed.readonlySignals['entries[0].reference'].value, true);
    assert.equal(resumed.validationResults['entries[0].name'].value[0]?.code, 'REQUIRED');
    assert.equal(resumed.signals['entries[1].name'], undefined);
    assert.equal(resumed.relevantSignals['entries[1].hidden'], undefined);
  } finally {
    saved.dispose();
    resumed.dispose();
  }
});

test('resuming a draft preserves a stored initial value without coercing it again', () => {
  const form = {
    ...definition,
    items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name', initialValue: '  original  ' }],
    binds: [{ path: 'name', whitespace: 'trim' }],
  };
  const original = createFormEngine(form);
  let resumed;
  try {
    const saved = original.getDraftSnapshot();
    assert.equal(saved.data.name, '  original  ');
    resumed = createFormEngine(form, { draftSnapshot: parseJsonExact(JSON.stringify(saved)) });
    assert.equal(resumed.signals.name.value, '  original  ');
    assert.deepEqual(resumed.getDraftSnapshot(), saved);
  } finally {
    original.dispose();
    resumed?.dispose();
  }
});

test('loading a draft clears the prior answer’s write source', () => {
  const form = {
    ...definition,
    items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
    binds: [],
  };
  const engine = createFormEngine(form);
  try {
    engine.setValue('name', 'Saved answer');
    const saved = engine.getDraftSnapshot();
    const field = engine.getFieldVM('name');
    field.setValue('Assistant suggestion', { source: 'assist' });
    assert.equal(field.writeSource.value, 'assist');

    engine.loadDraftSnapshot(saved);

    assert.equal(field.value.value, 'Saved answer');
    assert.equal(field.writeSource.value, null);
  } finally {
    engine.dispose();
  }
});

test('a resumed draft keeps a cleared answer after its HTTP prefill arrives', async (t) => {
  const form = {
    ...definition,
    items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name',
      prePopulate: { instance: 'context', path: 'name' } }],
    binds: [],
    instances: { context: { source: 'https://example.org/draft-prefill', data: {} } },
  };
  const source = { name: 'From server' };
  const original = createFormEngine(form, {
    instanceSourceResolver: () => ({ status: 'loaded', value: source }),
  });
  const { promise, resolve } = Promise.withResolvers();
  t.mock.method(globalThis, 'fetch', () => promise);
  let resumed;
  try {
    await original.waitForInstanceSources();
    assert.equal(original.signals.name.value, 'From server');
    original.setValue('name', '');
    const draftSnapshot = parseJsonExact(JSON.stringify(original.getDraftSnapshot()));
    assert.equal(draftSnapshot.data.name, '');
    resumed = createFormEngine(form, { draftSnapshot });
    assert.equal(resumed.signals.name.value, '');

    resolve({ ok: true, text: async () => JSON.stringify(source) });
    await resumed.waitForInstanceSources();

    assert.equal(resumed.getInstanceData('context', 'name'), 'From server');
    assert.equal(resumed.signals.name.value, '');
  } finally {
    original.dispose();
    resumed?.dispose();
  }
});

for (const { index, expected } of [
  // Replacement rows have no relative source element, even if they reuse a row index.
  { index: 1, expected: ['One', undefined] },
  { index: 0, expected: ['', undefined] },
]) {
  test(`replacing draft row ${index + 1} gives the same answers before or after prefill loads`, async () => {
    const form = {
      ...definition,
      items: [{ key: 'people', type: 'group', label: 'People', repeatable: true,
        seedFrom: { instance: 'context', path: 'people' }, children: [
          { key: 'name', type: 'field', dataType: 'string', label: 'Name',
            prePopulate: { instance: 'context', path: 'name' }, children: [
              { key: 'nickname', type: 'field', dataType: 'string', label: 'Nickname',
                prePopulate: { instance: 'context', path: 'nickname' } },
            ] },
        ] }],
      binds: [],
      instances: { context: { source: 'urn:host:context', readonly: true, data: { people: [] } } },
    };
    const loaded = { status: 'loaded', value: {
      people: [{ name: 'One', nickname: 'First' }, { name: 'Two', nickname: 'Second' }, { name: 'Three' }],
    } };
    const draftSnapshot = {
      definitionUrl: form.url, definitionVersion: form.version,
      data: { people: [{ name: 'One', nickname: 'Edited' }, { name: '', nickname: '' }] },
    };
    const { promise, resolve } = Promise.withResolvers();
    const pending = createFormEngine(form, { draftSnapshot, instanceSourceResolver: () => promise });
    const loadedFirst = createFormEngine(form, { draftSnapshot, instanceSourceResolver: () => loaded });
    try {
      await loadedFirst.waitForInstanceSources();
      for (const engine of [loadedFirst, pending]) {
        engine.removeRepeatInstance('people', index);
        engine.addRepeatInstance('people');
      }
      resolve(loaded);
      await pending.waitForInstanceSources();

      for (const engine of [loadedFirst, pending]) {
        const rows = engine.getDraftSnapshot().data.people;
        assert.deepEqual(rows.map(row => row.name), expected);
        assert.deepEqual(rows.map(row => row.nickname), [index === 1 ? 'Edited' : '', undefined]);
      }
    } finally {
      pending.dispose();
      loadedFirst.dispose();
    }
  });
}

test('canonicalizeResponseData coerces declared fields using authored Binds only and keeps extras', () => {
  const form = {
    ...definition,
    items: [
      { key: 'banner', type: 'display', label: 'Banner' },
      { key: 'amount', type: 'field', dataType: 'decimal', label: 'Amount' },
      {
        key: 'g',
        type: 'group',
        label: 'Group',
        children: [{ key: 'code', type: 'field', dataType: 'string', label: 'Code' }],
      },
    ],
    binds: [
      { path: 'code', whitespace: 'remove' },
      { path: 'g.code', whitespace: 'trim', letterCase: 'upper' },
    ],
  };
  const input = {
    banner: '  keep-display-extra  ',
    amount: numberText,
    g: { code: ' ab 9 ', extra: '  keep-group-extra  ' },
    bogus: '  keep-root-extra  ',
  };
  const canonical = canonicalizeResponseData(form, input);
  assert.equal(canonical.banner, '  keep-display-extra  ');
  assert.equal(jsonNumberText(canonical.amount), numberText);
  assert.equal(canonical.g.code, 'AB 9');
  assert.equal(canonical.g.extra, '  keep-group-extra  ');
  assert.equal(canonical.bogus, '  keep-root-extra  ');
});

test('FormEngine preserves undeclared keys across display collisions, flat group members, edits, and row removal', () => {
  const form = {
    ...definition,
    items: [
      { key: 'banner', type: 'display', label: 'Banner' },
      { key: 'a', type: 'field', dataType: 'string', label: 'A' },
      {
        key: 'g',
        type: 'group',
        label: 'Group',
        children: [{ key: 'x', type: 'field', dataType: 'string', label: 'X' }],
      },
      {
        key: 'rows',
        type: 'group',
        label: 'Rows',
        repeatable: true,
        children: [{ key: 'v', type: 'field', dataType: 'string', label: 'V' }],
      },
    ],
    binds: [],
  };
  const engine = createFormEngine(form, {
    savedResponseData: {
      banner: 'saved-on-display',
      a: 'one',
      'g.x': 'gx',
      'g.extra': 'kept-flat-group-extra',
      rows: [
        { v: 'r0', legacy: 'drop-with-row-0' },
        { v: 'r1', legacy: 'shift-to-row-0' },
      ],
    },
  });
  try {
    engine.setValue('a', 'updated');
    engine.removeRepeatInstance('rows', 0);
    const expected = {
      banner: 'saved-on-display',
      a: 'updated',
      g: { x: 'gx', extra: 'kept-flat-group-extra' },
      rows: [{ v: 'r1', legacy: 'shift-to-row-0' }],
    };
    assert.deepEqual(engine.getDraftSnapshot().data, expected);
    assert.deepEqual(engine.getResponse({ profile: 'on-submit' }).data, expected);
  } finally {
    engine.dispose();
  }
});
