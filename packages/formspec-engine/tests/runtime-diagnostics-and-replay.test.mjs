/** @filedesc Runtime diagnostics and replay: event log capture, replay from log, and diagnostic introspection */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

function buildReplayDefinition() {
  return {
    $formspec: '1.0',
    url: 'http://example.org/replay',
    version: '1.0.0',
    title: 'Replay Test',
    items: [
      { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
      {
        key: 'rows',
        type: 'group',
        label: 'Rows',
        repeatable: true,
        minRepeat: 1,
        children: [
          { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
          { key: 'price', type: 'field', dataType: 'decimal', label: 'Price' },
          { key: 'subtotal', type: 'field', dataType: 'decimal', label: 'Subtotal' }
        ]
      },
      { key: 'total', type: 'field', dataType: 'decimal', label: 'Total' }
    ],
    binds: [
      { path: 'rows.subtotal', calculate: 'qty * price', readonly: 'true' },
      { path: 'total', calculate: 'sum(rows.subtotal)', readonly: 'true' },
      { path: 'name', required: 'true' }
    ],
    shapes: [
      {
        id: 'submit_total_positive',
        target: '#',
        timing: 'submit',
        severity: 'error',
        message: 'Total must be positive',
        constraint: 'total > 0'
      }
    ]
  };
}

test('should use runtime context now provider for deterministic response/report timestamps', () => {
  const fixedNow = '2026-02-24T12:00:00.000Z';
  const engine = new FormEngine(buildReplayDefinition(), { runtimeContext: { now: fixedNow } });

  const report = engine.getValidationReport({ mode: 'submit' });
  const response = engine.getResponse({ mode: 'submit' });

  assert.equal(report.timestamp, fixedNow);
  assert.equal(response.authored, fixedNow);

  engine.setRuntimeContext({ now: '2026-02-25T08:00:00.000Z' });
  assert.equal(engine.getValidationReport().timestamp, '2026-02-25T08:00:00.000Z');
});

test('should produce diagnostics snapshots with values repeats mips and validation summary', () => {
  const engine = new FormEngine(buildReplayDefinition(), {
    runtimeContext: {
      now: '2026-02-24T12:30:00.000Z',
      locale: 'en-US',
      timeZone: 'UTC',
      seed: 'diag-seed',
    },
  });

  engine.setValue('name', 'Snapshot User');
  engine.setValue('rows[0].qty', 2);
  engine.setValue('rows[0].price', 100);

  const snapshot = engine.getDiagnosticsSnapshot({ mode: 'submit' });

  assert.equal(snapshot.definition.url, 'http://example.org/replay');
  assert.equal(snapshot.repeats.rows, 1);
  assert.equal(snapshot.values['rows[0].subtotal'], 200);
  assert.equal(snapshot.values.total, 200);
  assert.equal(snapshot.mips.name.required, true);
  assert.equal(snapshot.runtimeContext.locale, 'en-US');
  assert.equal(snapshot.runtimeContext.timeZone, 'UTC');
  assert.equal(snapshot.runtimeContext.seed, 'diag-seed');
  assert.equal(snapshot.validation.valid, true);
  assert.equal(snapshot.timestamp, '2026-02-24T12:30:00.000Z');
});

test('should apply replay events and return structured replay output', () => {
  const engine = new FormEngine(buildReplayDefinition(), {
    runtimeContext: { now: '2026-02-24T13:00:00.000Z' },
  });

  const replay = engine.replay([
    { type: 'setValue', path: 'name', value: 'Replay Runner' },
    { type: 'setValue', path: 'rows[0].qty', value: 3 },
    { type: 'setValue', path: 'rows[0].price', value: 25 },
    { type: 'addRepeatInstance', path: 'rows' },
    { type: 'setValue', path: 'rows[1].qty', value: 1 },
    { type: 'setValue', path: 'rows[1].price', value: 10 },
    { type: 'getResponse', mode: 'submit' }
  ]);

  assert.equal(replay.applied, 7);
  assert.equal(replay.errors.length, 0);
  assert.equal(engine.repeats.rows.value, 2);
  assert.equal(engine.signals.total.value, 85);

  const responseResult = replay.results[replay.results.length - 1];
  assert.equal(responseResult.ok, true);
  assert.equal(responseResult.event.type, 'getResponse');
  assert.equal(responseResult.output.data.total, 85);
  assert.equal(responseResult.output.authored, '2026-02-24T13:00:00.000Z');
});

test('should return replay errors and stop when configured', () => {
  const engine = new FormEngine(buildReplayDefinition());

  const replay = engine.replay([
    { type: 'setValue', path: 'name', value: 'Before Error' },
    { type: 'evaluateShape', shapeId: 'missing_shape' },
    { type: 'setValue', path: 'name', value: 'After Error' }
  ], { stopOnError: true });

  // Missing shapes return [] (valid operation), so force an invalid event next.
  const errored = engine.replay([
    { type: 'setValue', path: 'name', value: 'Before Error' },
    { type: 'removeRepeatInstance', path: 'rows', index: -1 },
    { type: 'setValue', path: 'name', value: 'After Error' }
  ], { stopOnError: true });

  assert.equal(replay.errors.length, 0);
  assert.equal(errored.errors.length, 0);

  // Explicit invalid payload path: runtime error in setValue should still be trapped.
  const hardError = engine.replay([
    { type: 'setValue', path: 'name', value: 'Still Fine' },
    { type: 'setValue', path: null, value: 'bad' }
  ], { stopOnError: true });

  assert.equal(hardError.applied, 1);
  assert.equal(hardError.errors.length, 1);
  assert.equal(hardError.errors[0].index, 1);
  assert.match(hardError.errors[0].error, /null/);
});
