/** @filedesc Submit warning answers, draft save stamps and grouped changes through the engine. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createFormEngine, preactReactiveRuntime } from '../dist/engine-render-entry.js';

const fixture = name => JSON.parse(readFileSync(new URL(
  `../../../tests/conformance/fixtures/explanations/first-slice.${name}.json`, import.meta.url,
), 'utf8'));
const definition = fixture('definition');
const { entries } = fixture('entries');
const code = 'WORKSHOP_NOT_ANSWERED';

test('one group action and one value explanation survive save, reload and a change of blank paths', () => {
  const engine = createFormEngine(definition, { savedResponseData: { attendance: 125, partner: 'Library' } });
  try {
    const state = () => engine.getExplanationState();
    assert.deepEqual(state().groups[0].paths, entries.originalGroup.paths);
    assert.equal(state().groups[0].basis, entries.originalGroup.basis);
    assert.equal(engine.acknowledge(code, { expectedBasis: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' }), false);
    assert.deepEqual(engine.getExplanationEntries(), []);
    assert.equal(engine.acknowledge(code, { expectedBasis: entries.originalGroup.basis }), true);
    assert.equal(state().pendingStamps, true);
    engine.setExplanation('largeEvent', 'attendance', { text: entries.valueExplanation.text });
    const draft = engine.getDraftSnapshot();
    assert.deepEqual(Object.keys(draft).sort(), ['data', 'definitionUrl', 'definitionVersion']);
    assert.deepEqual(engine.getExplanationEntries().map(entry => entry.basis),
      [entries.originalGroup.basis, entries.valueExplanation.basis]);
    assert.ok(engine.getExplanationEntries().every(entry => !('author' in entry) && !('recorded' in entry)));
    assert.throws(() => engine.getResponse({ profile: 'on-submit' }), /server stamps/);
    // Changed from assert.throws: in-progress draft serialization (profile 'off' / 'live')
    // must succeed while edits are unstamped so DraftWriter can save them to receive stamps.
    const unstampedDraftResponse = engine.getResponse({ profile: 'off' });
    assert.equal(unstampedDraftResponse.status, 'in-progress');
    assert.equal(unstampedDraftResponse.explanations, undefined);
    assert.equal(engine.getResponse({ profile: 'live' }).status, 'in-progress');
    engine.loadDraftSnapshot(draft, [entries.originalGroup, entries.valueExplanation]);
    const response = engine.getResponse({ profile: 'on-submit' });
    assert.equal(response.status, 'completed');
    assert.deepEqual(response.explanations, [entries.originalGroup, entries.valueExplanation]);
    engine.setValue('venue', 'Hall');
    engine.setValue('partner', null);
    assert.deepEqual(state().groups[0].removed, ['venue']);
    assert.deepEqual(state().groups[0].added, ['partner']);
    assert.equal(state().groups[0].current, false);
    engine.acknowledge(code);
    assert.equal(state().groups[0].current, true);
    assert.equal(engine.getExplanationEntries()[0].basis, entries.changedGroup.basis);
    assert.deepEqual(engine.getExplanationEntries()[1], entries.valueExplanation);
    engine.acceptSavedExplanations([entries.originalGroup, entries.valueExplanation]);
    assert.equal(engine.getExplanationEntries()[0].author, undefined);
    engine.acceptSavedExplanations([entries.changedGroup, entries.valueExplanation]);
    assert.deepEqual(engine.getResponse({ profile: 'on-submit' }).explanations,
      [entries.changedGroup, entries.valueExplanation]);
    engine.removeExplanation({ shapeId: 'largeEvent', path: 'attendance' });
    assert.deepEqual(engine.getExplanationEntries().map(e => e.code), [code]);
    engine.loadResponseData({ attendance: 1 });
    assert.deepEqual(engine.getExplanationEntries(), []);
  } finally {
    engine.dispose();
  }
});

test('completed candidate assembly prunes unused explanations and dynamic blank instance warnings stay answerable', () => {
  const unused = { ...entries.valueExplanation, shapeId: 'resolvedWarning' };
  const reversedGroup = { ...entries.originalGroup, paths: [...entries.originalGroup.paths].reverse() };
  const engine = createFormEngine(definition, {
    savedResponseData: { attendance: 125, partner: 'Library' },
    savedExplanations: [unused, reversedGroup, entries.valueExplanation],
  });
  try {
    const response = engine.getResponse({ profile: 'on-submit' });
    assert.equal(response.status, 'completed');
    assert.deepEqual(response.explanations, [entries.originalGroup, entries.valueExplanation]);
  } finally {
    engine.dispose();
  }

  const dynamicDef = {
    $formspec: '1.0',
    url: 'https://example.org/forms/dynamic/1.0.0',
    version: '1.0.0',
    title: 'Dynamic',
    warningExplanation: 'explain',
    items: [{ key: 'source', type: 'field', dataType: 'string', label: 'Source' }],
    shapes: [{
      id: 'checkDynamic',
      target: 'source',
      severity: 'warning',
      timing: 'submit',
      code: 'MISSING_SOURCE',
      constraint: 'present(instance($source))',
      message: 'Pick a valid source.',
    }],
  };
  const dynamicEngine = createFormEngine(dynamicDef);
  try {
    const report = dynamicEngine.getValidationReport({ profile: 'on-submit' });
    const codes = report.results.map(r => r.code);
    assert.ok(!codes.includes('CONSTRAINT_PARSE_ERROR'), `unexpected parse error in ${codes}`);
    assert.ok(codes.includes('EXPLANATION_REQUIRED'));
    assert.equal(dynamicEngine.getExplanationState().instances.length, 1);
  } finally {
    dynamicEngine.dispose();
  }
});

test('strips untrusted snapshot stamps without matching saved entries and guards explanation-only signatures', () => {
  const signedFixture = JSON.parse(readFileSync(new URL(
    '../../../tests/fixtures/signature-responses/valid-single.response.json', import.meta.url,
  ), 'utf8'));
  const engine = createFormEngine(definition, {
    savedResponseData: { partner: 'Library', attendance: 125 },
  });
  try {
    const forgedSnapshot = {
      ...engine.getDraftSnapshot(),
      explanations: [entries.originalGroup, entries.valueExplanation],
    };
    engine.loadDraftSnapshot(forgedSnapshot, []);
    assert.ok(engine.getExplanationEntries().every(entry => !('author' in entry) && !('recorded' in entry)));
    assert.throws(() => engine.getResponse({ profile: 'on-submit' }), /server stamps/);
  } finally {
    engine.dispose();
  }

  const signedEngine = createFormEngine(
    { ...definition, url: signedFixture.definitionUrl, version: signedFixture.definitionVersion },
    {
      savedResponseData: { partner: 'Library', attendance: 125 },
      savedExplanations: [
        entries.originalGroup,
        entries.valueExplanation,
        { ...entries.valueExplanation, shapeId: 'retired' },
      ],
    },
  );
  try {
    const authoredSignatures = signedFixture.authoredSignatures.map(sig => ({
      ...sig,
      signedAt: sig.signedPayload.signedAt,
    }));
    assert.throws(
      () => signedEngine.getResponse({ profile: 'on-submit', authoredSignatures }),
      /unsigned/,
    );
  } finally {
    signedEngine.dispose();
  }
});

test('FormEngine reproduces every published basis-vectors evaluatedCase exact inputs and digest', () => {
  const vectors = JSON.parse(readFileSync(new URL(
    '../../../tests/conformance/fixtures/explanations/basis-vectors.json', import.meta.url,
  ), 'utf8'));
  for (const vectorCase of vectors.evaluatedCases) {
    const engine = createFormEngine(vectorCase.definition, { savedResponseData: vectorCase.data });
    try {
      const state = engine.getExplanationState();
      assert.equal(state.instances.length, 1, vectorCase.name);
      const [finding] = state.instances;
      const expected = vectorCase.expectedInstance;
      assert.equal(finding.shapeId, expected.input.shapeId, vectorCase.name);
      assert.equal(finding.path, expected.input.path, vectorCase.name);
      assert.equal(finding.basis, expected.digest, vectorCase.name);
      assert.deepEqual(Object.entries(finding.inputs).sort(), expected.input.inputs, vectorCase.name);
    } finally {
      engine.dispose();
    }
  }
});

test('acknowledge mismatch refreshes reactive state without dropping subscriptions and captureSubmitSnapshot handles clock changes', () => {
  let now = new Date('2026-11-18T12:00:00Z');
  const clock = () => now;
  const deadlineDef = {
    $formspec: '1.0',
    url: 'urn:example:engine-deadline',
    version: '1.0.0',
    status: 'active',
    title: 'Deadline',
    items: ['first', 'second', 'deadline'].map(key => ({ key, type: 'field', dataType: 'string', label: key })),
    shapes: ['first', 'second', 'deadline'].map(key => ({
      id: `${key}Blank`,
      target: key,
      severity: 'warning',
      timing: 'submit',
      code: 'BLANK',
      explanation: 'acknowledge',
      constraint: key === 'deadline' ? 'day(today()) < 19 or present($)' : 'present($)',
      message: 'Blank',
    })),
  };

  const engine = createFormEngine(deadlineDef, { runtimeContext: { now: clock } });
  const observed = [];
  const disposeEffect = preactReactiveRuntime.effect(() => {
    const group = engine.getExplanationState().groups[0];
    observed.push(group ? { paths: [...group.paths], current: group.current } : null);
  });
  try {
    assert.deepEqual(observed.at(-1), { paths: ['first', 'second'], current: false });
    const staleBasis = engine.getExplanationState().groups[0].basis;

    now = new Date('2026-11-19T12:00:00Z');
    assert.equal(engine.acknowledge('BLANK', { expectedBasis: staleBasis }), false);
    assert.deepEqual(engine.getExplanationEntries(), []);
    assert.deepEqual(observed.at(-1), { paths: ['deadline', 'first', 'second'], current: false });

    const freshBasis = engine.getExplanationState().groups[0].basis;
    assert.equal(engine.acknowledge('BLANK', { expectedBasis: freshBasis }), true);
    assert.equal(engine.getExplanationEntries().length, 1);
    assert.deepEqual(observed.at(-1), { paths: ['deadline', 'first', 'second'], current: true });
  } finally {
    disposeEffect();
    engine.dispose();
  }

  // Group disappearing at deadline preserves existing entry while refreshing visible groups to []
  now = new Date('2026-11-18T12:00:00Z');
  const vanishDef = {
    ...deadlineDef,
    url: 'urn:example:engine-vanish',
    shapes: ['first', 'second'].map(key => ({
      id: `${key}Blank`,
      target: key,
      severity: 'warning',
      timing: 'submit',
      code: 'BLANK',
      explanation: 'acknowledge',
      constraint: 'day(today()) = 19 or present($)',
      message: 'Blank',
    })),
  };
  const vanishEngine = createFormEngine(vanishDef, { runtimeContext: { now: clock } });
  try {
    const day18Basis = vanishEngine.getExplanationState().groups[0].basis;
    assert.equal(vanishEngine.acknowledge('BLANK', { expectedBasis: day18Basis }), true);
    const savedBefore = vanishEngine.getExplanationEntries();

    // Expiry on day 19: mismatch preserves existing entries AND captureSubmitSnapshot emits completed with 0 explanations
    now = new Date('2026-11-19T12:00:00Z');
    assert.equal(vanishEngine.acknowledge('BLANK', { expectedBasis: day18Basis }), false);
    assert.deepEqual(vanishEngine.getExplanationEntries(), savedBefore);
    assert.deepEqual(vanishEngine.getExplanationState().groups, []);
    const expired = vanishEngine.captureSubmitSnapshot();
    assert.equal(expired.pendingExplanationStamps, false);
    assert.equal(expired.snapshot.response.status, 'completed');
    assert.equal(expired.snapshot.response.explanations, undefined);

    // Revival on day 20: getResponseSnapshot stays strict while captureSubmitSnapshot returns pending-save in-progress
    now = new Date('2026-11-20T12:00:00Z');
    assert.throws(() => vanishEngine.getResponseSnapshot({ profile: 'on-submit' }), /server stamps/);
    const revived = vanishEngine.captureSubmitSnapshot();
    assert.equal(revived.pendingExplanationStamps, true);
    assert.equal(revived.snapshot.response.status, 'in-progress');
    assert.equal(vanishEngine.getExplanationState().pendingStamps, true);
  } finally {
    vanishEngine.dispose();
  }

  // Deadline expansion on Submit refreshes cached accepted group state for both stamped and unstamped entries
  for (const stamped of [false, true]) {
    now = new Date('2026-11-18T12:00:00Z');
    const expandEngine = createFormEngine(deadlineDef, { runtimeContext: { now: clock } });
    try {
      const basis18 = expandEngine.getExplanationState().groups[0].basis;
      assert.equal(expandEngine.acknowledge('BLANK', { expectedBasis: basis18 }), true);
      if (stamped) {
        expandEngine.acceptSavedExplanations(expandEngine.getExplanationEntries().map(entry => ({
          ...entry, author: { id: 'reviewer' }, recorded: '2026-11-18T12:00:00Z',
        })));
      }
      assert.equal(expandEngine.getExplanationState().groups[0].current, true);
      assert.deepEqual(expandEngine.getExplanationState().groups[0].paths, ['first', 'second']);

      now = new Date('2026-11-19T12:00:00Z');
      const snap = stamped
        ? expandEngine.getResponseSnapshot({ profile: 'on-submit' })
        : expandEngine.captureSubmitSnapshot().snapshot;
      assert.equal(snap.response.status, 'in-progress');
      assert.ok(snap.validationReport.results.some(r => r.code === 'EXPLANATION_STALE'));
      assert.deepEqual(expandEngine.getExplanationState().groups[0].paths, ['deadline', 'first', 'second']);
      assert.equal(expandEngine.getExplanationState().groups[0].current, false);
    } finally {
      expandEngine.dispose();
    }
  }

  // acceptSavedExplanations(..., { base }) performs 3-way merge: preserves local removals/edits, replaces unchanged base entries, adds new committed entries
  const mergeEngine = createFormEngine(definition, {
    savedResponseData: { attendance: 150, topic: 'Local history' },
    savedExplanations: [entries.originalGroup, entries.valueExplanation],
  });
  try {
    const base = mergeEngine.getExplanationEntries();
    // Locally remove valueExplanation while leaving originalGroup untouched
    mergeEngine.removeExplanation({ shapeId: 'largeEvent', path: 'attendance' });
    // Committed review replaced originalGroup (4 paths) -> changedGroup (3 paths) and left valueExplanation unchanged
    mergeEngine.acceptSavedExplanations([entries.changedGroup, entries.valueExplanation], { base });
    assert.deepEqual(mergeEngine.getExplanationEntries(), [entries.changedGroup]);
  } finally {
    mergeEngine.dispose();
  }
});
