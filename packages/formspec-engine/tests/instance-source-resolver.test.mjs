/** Host source loading through the public engine; controlled fixtures are not provider evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormEngine, evaluateDefinition } from '../dist/index.js';
import { initFormspecEngine } from '../dist/init-formspec-engine.js';

await initFormspecEngine();

const definition = (instance = {}) => ({
  $formspec: '1.0', url: 'https://example.org/resolver', version: '1.0.0',
  items: [
    { key: 'mode', type: 'field', dataType: 'string', label: 'Mode' },
    { key: 'name', type: 'field', dataType: 'string', label: 'Name',
      prePopulate: { instance: 'context', path: 'name' } },
    { key: 'people', type: 'group', repeatable: true, minRepeat: 0,
      seedFrom: { instance: 'context', path: 'people' }, children: [
        { key: 'name', type: 'field', dataType: 'string', label: 'Name',
          prePopulate: { instance: 'context', path: 'name' } },
      ] },
  ],
  binds: [{ path: 'mode', calculate: "instance('context', 'mode')" }],
  instances: { context: { source: 'urn:host:context', readonly: true,
    data: { mode: 'initial', name: 'Fallback', people: [{ name: 'Fallback row' }] },
    ...instance } },
});
const loaded = { mode: 'correction', name: 'Qualified fixture',
  people: [{ name: 'One' }, { name: 'Two' }] };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('public resolver loads a readonly host source and drives binds and deferred seeds', async () => {
  const pending = deferred(); let request; let signal;
  const engine = createFormEngine(definition({ schema: { mode: 'string' } }), {
    instanceSourceResolver: (r, options) => { request = r; signal = options.signal; return pending.promise; },
  });
  assert.equal(engine.signals.mode.value, 'initial');
  // A pending field stays unset until its source has settled.
  assert.equal(engine.signals.name.value, null);
  assert.equal(engine.repeats.people.value, 0);
  pending.resolve({ status: 'loaded', value: loaded });
  const outcomes = await engine.waitForInstanceSources();
  assert.deepEqual(outcomes.context, { status: 'loaded' });
  assert.ok(Object.isFrozen(outcomes)); assert.ok(Object.isFrozen(outcomes.context));
  assert.equal(request.instanceName, 'context');
  assert.equal(request.source, 'urn:host:context');
  assert.deepEqual(request.definition, { url: 'https://example.org/resolver', version: '1.0.0' });
  assert.equal(request.readonly, true); assert.equal(request.static, false);
  assert.ok(Object.isFrozen(request)); assert.ok(Object.isFrozen(request.schema));
  assert.ok(Object.isFrozen(request.definition)); assert.ok(signal instanceof AbortSignal);
  assert.equal(engine.signals.mode.value, 'correction');
  assert.equal(engine.signals.name.value, loaded.name);
  assert.equal(engine.repeats.people.value, 2);
  assert.equal(engine.signals['people[0].name'].value, 'One');
  assert.throws(() => engine.setInstanceValue('context', 'mode', 'initial'), /readonly/i);
  engine.dispose();
});

test('filtered seeds agree across eager and delayed delivery while a person edits', async () => {
  const def = definition();
  def.subject = { type: 'urn:test:group', keys: { name: { dataType: 'string' } } };
  def.instances.policy = { source: 'urn:host:policy', data: { minimum: 30 } };
  def.items[2].maxRepeat = 1;
  def.items[2].seedFrom.where = "$.name = subject('name') and $.age >= instance('policy', 'minimum')";
  const values = {
    context: { people: [{ name: 'Closed', age: 20 }, { name: 'One', age: 12 }] },
    policy: { minimum: 11 },
  };
  const options = {
    responseData: { name: 'Host prefill' },
    responseSubject: { id: 'unit', type: 'urn:test:group', keys: { name: 'One' } },
  };
  const inline = structuredClone(def);
  inline.instances = Object.fromEntries(Object.entries(values).map(([name, data]) => [name, { data }]));
  const eager = createFormEngine(inline, options);
  const expected = eager.getResponse().data.people;
  assert.deepEqual(expected, [{ name: 'One' }]);
  for (const order of [['context', 'policy'], ['policy', 'context']]) {
    const sources = { context: deferred(), policy: deferred() };
    const late = createFormEngine(def, {
      ...options,
      instanceSourceResolver: ({ instanceName }) => sources[instanceName].promise,
    });
    sources[order[0]].resolve({ status: 'loaded', value: values[order[0]] });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(Object.hasOwn(late.getResponse({ profile: 'off' }).data, 'people'), false);
    late.setValue('name', 'Person edit');
    sources[order[1]].resolve({ status: 'loaded', value: values[order[1]] });
    await late.waitForInstanceSources();
    assert.deepEqual(late.getResponse().data.people, expected);
    assert.equal(late.getResponse().data.name, 'Person edit');
    late.dispose();
  }
  eager.dispose();
});

test('a failed seed predicate remains visible after re-evaluation', () => {
  const def = definition();
  def.items[2].seedFrom.where = "'not a Boolean'";
  const engine = createFormEngine(def, { loadExternalSources: false });
  engine.setValue('name', 'Person edit');
  assert.equal(engine.repeats.people.value, 0);
  assert.equal(Object.hasOwn(engine.getResponse().data, 'people'), false);
  assert.equal(Object.hasOwn(engine.getDraftSnapshot().data, 'people'), false);
  assert.deepEqual(engine.getDiagnosticsSnapshot().evaluationDiagnostics.map(({ code, path }) => ({ code, path })), [
    { code: 'SEED_PREDICATE_TYPE', path: 'people' },
  ]);
  engine.loadResponseData({ people: [] });
  assert.deepEqual(engine.getDiagnosticsSnapshot().evaluationDiagnostics, []);
  engine.dispose();
});

test('person edits and supplied Response data win over late source seeding', async () => {
  const pending = deferred();
  const engine = createFormEngine(definition(), {
    responseData: { people: [] }, instanceSourceResolver: () => pending.promise,
  });
  engine.setValue('name', 'Person edit');
  pending.resolve({ status: 'loaded', value: loaded });
  await engine.waitForInstanceSources();
  assert.equal(engine.signals.name.value, 'Person edit');
  assert.equal(engine.repeats.people.value, 0);
  engine.dispose();
});

test('saving during source loading omits pending repeats and leaves active creation intact', async () => {
  const source = deferred();
  const def = definition();
  def.items[2].minRepeat = 1;
  def.items.push({
    key: 'section', type: 'group', children: [
      { ...def.items[2], key: 'nestedPeople' },
      { ...def.items[2], key: 'empty' },
    ],
  });
  const engine = createFormEngine(def, {
    instanceSourceResolver: () => source.promise,
    responseData: { section: { empty: [] } },
  });
  const saved = engine.getResponse({ profile: 'off' }).data;
  assert.equal(Object.hasOwn(saved, 'people'), false);
  assert.deepEqual(saved.section, { empty: [] });
  assert.equal(engine.getValidationReport().results.some(result => result.code === 'MIN_REPEAT'), true);

  const resumed = createFormEngine(def, {
    savedResponseData: saved, instanceSourceResolver: () => source.promise,
  });
  source.resolve({ status: 'loaded', value: loaded });
  await Promise.all([engine.waitForInstanceSources(), resumed.waitForInstanceSources()]);
  assert.deepEqual(engine.getResponse().data.people, loaded.people);
  assert.deepEqual(engine.getResponse().data.section, { nestedPeople: loaded.people, empty: [] });
  assert.deepEqual(resumed.getResponse().data.people, []);
  engine.dispose();
  resumed.dispose();
});

test('submit files the evaluated empty repeat while draft save can still omit it', async () => {
  const source = deferred();
  const def = definition();
  const engine = createFormEngine(def, { instanceSourceResolver: () => source.promise });

  assert.equal(Object.hasOwn(engine.getResponse({ profile: 'off' }).data, 'people'), false);
  const draftWithSubmitReport = engine.getResponseSnapshot({ profile: 'off' }, 'on-submit');
  assert.equal(Object.hasOwn(draftWithSubmitReport.response.data, 'people'), false);
  assert.ok(draftWithSubmitReport.validationReport);
  const response = engine.getResponse({ profile: 'on-submit' });
  assert.deepEqual(response.data.people, []);
  assert.deepEqual(response.data, evaluateDefinition(def, response.data, { trigger: 'submit' }).data);

  source.resolve({ status: 'loaded', value: loaded });
  await engine.waitForInstanceSources();
  assert.deepEqual(engine.getResponse({ profile: 'on-submit' }).data.people, loaded.people);
  engine.dispose();
});

test('removing a row reindexes pending creation in later rows', async () => {
  const source = deferred();
  const def = definition();
  def.items = [{
    key: 'rows', type: 'group', repeatable: true, children: [{
      key: 'name', type: 'field', dataType: 'string',
      prePopulate: { instance: 'context', path: '.name' },
    }],
  }];
  def.binds = [];
  const engine = createFormEngine(def, {
    responseData: { rows: [{}, { name: 'Keep' }, {}, { name: null }] },
    instanceSourceResolver: () => source.promise,
  });
  engine.removeRepeatInstance('rows', 0);
  source.resolve({ status: 'loaded', value: loaded });
  await engine.waitForInstanceSources();
  assert.deepEqual(engine.getResponse().data.rows, [{ name: 'Keep' }, { name: loaded.name }, { name: null }]);
  engine.dispose();
});

test('unavailable and invalid results retain and seed fallback without HTTP fallback', async () => {
  const cycle = {}; cycle.self = cycle;
  for (const result of [
    { status: 'unavailable', reason: 'pending' }, null, {}, { status: 'loaded' },
    { status: 'loaded', value: { nested: undefined } },
    { status: 'loaded', value: new Date() }, { status: 'loaded', value: cycle },
    { status: 'loaded', value: { nested: Infinity } },
    { status: 'loaded', value: new Map() }, { status: 'loaded', value: [ , 'sparse'] },
    { status: 'loaded', value: { mode: 12 } }, { status: 'loaded', value: 'scalar' },
  ]) {
    let calls = 0;
    const engine = createFormEngine(definition({ schema: { mode: 'string' } }), {
      instanceSourceResolver: () => { calls++; return result; },
    });
    const outcomes = await engine.waitForInstanceSources();
    assert.equal(outcomes.context.status, 'unavailable');
    assert.equal(calls, 1);
    assert.equal(engine.getInstanceData('context', 'mode'), 'initial');
    assert.equal(engine.signals.name.value, 'Fallback');
    assert.equal(engine.repeats.people.value, 1);
    engine.dispose();
  }
});

test('loaded values are cloned and static callback sources never share the URL cache', async () => {
  const value = structuredClone(loaded);
  const one = createFormEngine(definition({ static: true }), { instanceSourceResolver: () => ({ status: 'loaded', value }) });
  await one.waitForInstanceSources(); value.mode = 'mutated';
  const two = createFormEngine(definition({ static: true }), { instanceSourceResolver: () => ({ status: 'loaded', value: { mode: 'second' } }) });
  await two.waitForInstanceSources();
  assert.equal(one.getInstanceData('context', 'mode'), 'correction');
  assert.equal(two.getInstanceData('context', 'mode'), 'second');
  one.dispose(); two.dispose();
});

test('dispose aborts, settles waiting, and rejects an ignored-signal late result', async () => {
  const pending = deferred(); let signal;
  const engine = createFormEngine(definition(), { instanceSourceResolver: (_r, o) => { signal = o.signal; return pending.promise; } });
  await Promise.resolve(); engine.dispose();
  assert.equal(signal.aborted, true);
  await Promise.race([engine.waitForInstanceSources(), new Promise((_, reject) => setTimeout(() => reject(Error('dispose left wait pending')), 100))]);
  pending.resolve({ status: 'loaded', value: loaded });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(engine.getInstanceData('context', 'mode'), 'initial');
  assert.equal(engine.signals.mode.value, 'initial');
});

test('empty person edits, empty supplied fields, and removed rows stay empty', async () => {
  for (const useResponse of [false, true]) {
    const pending = deferred();
    const engine = createFormEngine(definition(), {
      ...(useResponse ? { responseData: { name: '' } } : {}),
      instanceSourceResolver: () => pending.promise,
    });
    if (!useResponse) engine.setValue('name', '');
    engine.addRepeatInstance('people'); engine.removeRepeatInstance('people', 0);
    pending.resolve({ status: 'loaded', value: loaded });
    await engine.waitForInstanceSources();
    assert.equal(engine.signals.name.value, '');
    assert.equal(engine.repeats.people.value, 0);
    engine.dispose();
  }
});

test('runtime JSON rejection applies without a schema and does not execute accessors', async () => {
  let accessed = false;
  const accessor = Object.defineProperty({}, 'nested', { enumerable: true, get() { accessed = true; return 'bad'; } });
  for (const value of [undefined, NaN, { nested: undefined }, accessor]) {
    const engine = createFormEngine(definition(), { instanceSourceResolver: () => ({ status: 'loaded', value }) });
    const outcome = await engine.waitForInstanceSources();
    assert.equal(outcome.context.status, 'unavailable');
    assert.equal(engine.getInstanceData('context', 'mode'), 'initial');
    engine.dispose();
  }
  assert.equal(accessed, false);
});

test('rejected callback settles unavailable and inline instances never invoke it', async () => {
  const engine = createFormEngine(definition(), { instanceSourceResolver: () => { throw Error('offline fixture'); } });
  assert.equal((await engine.waitForInstanceSources()).context.status, 'unavailable');
  engine.dispose();
  let calls = 0;
  const inline = createFormEngine(definition({ source: undefined }), { instanceSourceResolver: () => { calls++; return { status: 'unavailable' }; } });
  assert.deepEqual(await inline.waitForInstanceSources(), {}); assert.equal(calls, 0);
  assert.equal(inline.signals.name.value, 'Fallback'); inline.dispose();
});

test('configured resolver refuses HTTP exclusively; default HTTP cache revalidates current schema', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: true, json: async () => ({ mode: 'http fixture' }), text: async () => JSON.stringify(({ mode: 'http fixture' })) }; });
  const source = 'https://example.org/resolver-unique-cache-test';
  const custom = createFormEngine(definition({ source }), { instanceSourceResolver: () => ({ status: 'unavailable' }) });
  assert.equal((await custom.waitForInstanceSources()).context.status, 'unavailable');
  assert.equal(calls, 0); custom.dispose();
  const first = createFormEngine(definition({ source, static: true, schema: { mode: 'string' } }));
  assert.equal((await first.waitForInstanceSources()).context.status, 'loaded');
  assert.equal(calls, 1); first.dispose();
  const second = createFormEngine(definition({ source, static: true, data: { mode: 12 }, schema: { mode: 'integer' } }));
  assert.equal((await second.waitForInstanceSources()).context.status, 'unavailable');
  assert.equal(second.getInstanceData('context', 'mode'), 12); assert.equal(calls, 1); second.dispose();
});

test('application failure settles distinctly and disposes the engine', async t => {
  const engine = createFormEngine(definition(), { instanceSourceResolver: () => ({ status: 'loaded', value: loaded }) });
  t.mock.method(engine, 'createResponseData', () => { throw Error('seed application fixture failure'); });
  const outcomes = await Promise.race([
    engine.waitForInstanceSources(),
    new Promise((_, reject) => setTimeout(() => reject(Error('application failure left wait pending')), 100)),
  ]);
  assert.equal(outcomes.context.status, 'failed');
  assert.equal(engine.getInstanceData('context', 'mode'), 'initial');
  assert.equal(engine._disposed, true); // Fault injection checks terminal lifecycle, not provider authority.
});

test('a valid __proto__ source name is an own outcome key', async () => {
  const d = { $formspec: '1.0', version: '1.0.0', items: [],
    instances: Object.fromEntries([['__proto__', { source: 'urn:host:prototype' }]]) };
  const engine = createFormEngine(d, { instanceSourceResolver: () => ({ status: 'loaded', value: { name: 'fixture' } }) });
  const outcomes = await engine.waitForInstanceSources();
  assert.equal(Object.hasOwn(outcomes, '__proto__'), true);
  assert.equal(outcomes.__proto__.status, 'loaded'); engine.dispose();
});

test('multiple sources settle separately, including unavailable with no fallback', async () => {
  const pending = deferred();
  const d = { $formspec: '1.0', version: '1.0.0', items: [], instances: {
    first: { source: 'urn:host:first' }, second: { source: 'urn:host:second' },
  } };
  const engine = createFormEngine(d, { instanceSourceResolver: r => r.instanceName === 'first'
    ? { status: 'unavailable' } : pending.promise });
  pending.resolve({ status: 'loaded', value: { fixture: true } });
  const outcomes = await engine.waitForInstanceSources();
  assert.equal(outcomes.first.status, 'unavailable'); assert.equal(engine.getInstanceData('first'), undefined);
  assert.equal(outcomes.second.status, 'loaded'); assert.equal(engine.getInstanceData('second', 'fixture'), true);
  engine.dispose();
});

test('unprintable callback errors cannot prevent source settlement', async () => {
  const engine = createFormEngine(definition(), { instanceSourceResolver: () => {
    throw { toString() { throw Error('unprintable fixture'); } };
  } });
  assert.equal((await engine.waitForInstanceSources()).context.status, 'unavailable');
  engine.dispose();
});

test('prototype-named unavailable sources preserve actual fallback or missing data', async () => {
  for (const name of ['__proto__', 'constructor', 'toString']) {
    for (const withFallback of [false, true]) {
      const d = { $formspec: '1.0', version: '1.0.0', items: [],
        instances: Object.fromEntries([[name, { source: 'urn:host:prototype',
          ...(withFallback ? { data: { fixture: true } } : {}) }]]) };
      const engine = createFormEngine(d, { instanceSourceResolver: () => ({ status: 'unavailable' }) });
      assert.equal((await engine.waitForInstanceSources())[name].status, 'unavailable');
      assert.deepEqual(engine.getInstanceData(name), withFallback ? { fixture: true } : undefined);
      assert.equal(Object.hasOwn(engine.instanceData, name), withFallback);
      engine.dispose();
    }
  }
});

test('subject-scoped initial values wait for a referenced source and preserve an edit', async () => {
  const type = 'urn:test:filing-year';
  const form = {
    $formspec: '1.0', url: 'urn:test:creation-source', version: '1.0.0',
    subject: { type, keys: { year: { dataType: 'integer' } } },
    instances: { p: { source: 'urn:test:source', data: {} } },
    variables: [{ name: 'sameYear', expression: "string(subject('year')) = @instance('p').year" }],
    items: ['amount', 'edited'].map(key => ({
      key, type: 'field', dataType: 'integer', label: key,
      initialValue: "=if(@sameYear, @instance('p').amount, 0)",
    })),
  };
  const source = deferred();
  const engine = createFormEngine(form, {
    responseSubject: { id: 'year', type, keys: { year: 2025 } },
    instanceSourceResolver: () => source.promise,
  });
  try {
    assert.equal(Object.hasOwn(engine.getDraftSnapshot().data, 'amount'), false);
    engine.setValue('edited', 0);
    source.resolve({ status: 'loaded', value: { year: '2025', amount: 22 } });
    await engine.waitForInstanceSources();
    assert.deepEqual(engine.getDraftSnapshot().data, { amount: 22, edited: 0 });
  } finally { engine.dispose(); }
});
