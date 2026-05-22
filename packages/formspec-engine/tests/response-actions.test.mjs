/** @filedesc Response Actions runtime helper contract. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  invokeResponseAction,
  resolveResponseAction,
  resolveResponseActionValidationTuple,
  ResponseActionsPreconditionCatalog,
  RESPONSE_ACTIONS_PRECONDITION_BINDINGS,
  RESPONSE_ACTIONS_EFFECT_TIME_BINDINGS,
} from '../dist/index.js';
import { defaultActionRefForIntent } from '../dist/internal/default-action-ref.js';
import { VALIDATION_MAPPING_MASTER_TABLE } from '@formspec-org/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

const responseActions = {
  $formspecResponseActions: '1.0',
  version: '1.0.0',
  targetDefinition: { url: 'https://example.gov/forms/intake' },
  actions: [
    {
      id: 'send-application',
      intent: 'submit',
      effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
    },
    {
      id: 'save-work',
      intent: 'x-custom-save',
      validation: { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' },
      effects: [{ type: 'hostEvent', eventName: 'formspec-save' }],
    },
  ],
};

test('resolves ActionButton actionRef against a Response Actions document', () => {
  const resolution = resolveResponseAction(responseActions, 'send-application', 'node-1');

  assert.equal(resolution.resolved, true);
  assert.equal(resolution.action.id, 'send-application');
  assert.equal(resolution.finding, undefined);
});

test('reports inert action finding when actionRef cannot resolve', () => {
  const resolution = resolveResponseAction(responseActions, 'missing', 'node-1');

  assert.equal(resolution.resolved, false);
  assert.deepEqual(resolution.finding, {
    code: 'COMP-REFERENTIAL-INTEGRITY',
    severity: 'error',
    kind: 'actionRef',
    nodeId: 'node-1',
    target: 'missing',
  });
});

test('uses VM master table tuple for standard intents', () => {
  const tuple = resolveResponseActionValidationTuple(responseActions.actions[0]);

  assert.deepEqual(tuple, {
    profile: 'on-submit',
    blocking: 'block-on-error',
    persistence: 'complete-response',
  });
});

test('requires explicit validation tuple for x-prefixed intents', () => {
  const tuple = resolveResponseActionValidationTuple(responseActions.actions[1]);

  assert.deepEqual(tuple, {
    profile: 'off',
    blocking: 'non-blocking',
    persistence: 'draft-checkpoint',
  });
  assert.throws(
    () => resolveResponseActionValidationTuple({
      id: 'custom',
      intent: 'x-custom',
      effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
    }),
    /requires an explicit validation tuple/,
  );
});

test('derives injected submit actionRef from submit intent (internal helper still callable)', () => {
  // §13.6: there is no implicit default Action and no free-string fallback.
  // The helper exists only as a private utility for renderers that need to
  // bridge legacy SubmitButton flows; it MUST NOT be on the public surface.
  assert.equal(defaultActionRefForIntent(responseActions, 'submit'), 'send-application');
  assert.equal(defaultActionRefForIntent(null, 'submit'), '');
});

test('defaultActionRefForIntent is NOT exposed on the engine public surface', async () => {
  // §10 + §13.6: implicit-default helpers MUST NOT advertise themselves on
  // the contract surface so renderers cannot silently fall back to picking
  // an arbitrary first matching Action.
  const publicSurface = await import('../dist/index.js');
  assert.equal(
    'defaultActionRefForIntent' in publicSurface,
    false,
    'defaultActionRefForIntent must be removed from public engine exports',
  );
});

test('invokes through engine-owned tuple resolution and host effect ports', () => {
  const hostEvents = [];
  const result = invokeResponseAction(responseActions, 'send-application', {
    submit: (options) => ({ options, response: {}, validationReport: { valid: true } }),
    dispatchHostEvent: (eventName, detail) => hostEvents.push({ eventName, detail }),
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.detail.options, {
    profile: 'on-submit',
    validationTuple: {
      profile: 'on-submit',
      blocking: 'block-on-error',
      persistence: 'complete-response',
    },
    emitEvent: false,
  });
  assert.deepEqual(hostEvents.map(event => event.eventName), ['formspec-submit']);
  assert.deepEqual(result.effectTrace.map(effect => effect.status), ['succeeded']);
});

test('blocks host effects when block-on-error validation fails', () => {
  const hostEvents = [];
  const result = invokeResponseAction(responseActions, 'send-application', {
    submit: (options) => ({ options, response: {}, validationReport: { valid: false } }),
    dispatchHostEvent: (eventName, detail) => hostEvents.push({ eventName, detail }),
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.blockedCause, 'validation');
  assert.deepEqual(hostEvents, []);
});

test('passes profile=off through without synthesizing a validation report', () => {
  const result = invokeResponseAction(responseActions, 'save-work', {
    submit: (options) => ({
      options,
      response: { status: 'in-progress' },
      validationReport: options.profile === 'off' ? null : {},
    }),
    dispatchHostEvent: () => {},
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.detail.validationReport, null);
  assert.deepEqual(result.detail.options.validationTuple, {
    profile: 'off',
    blocking: 'non-blocking',
    persistence: 'draft-checkpoint',
  });
});

test('precondition gates block or defer before validation and effects', () => {
  const document = {
    ...responseActions,
    actions: [
      {
        id: 'guarded',
        intent: 'submit',
        preconditions: [{ id: 'ready', expression: '@response.id != null', severity: 'block' }],
        effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
      },
      {
        id: 'deferred',
        intent: 'request-evidence',
        preconditions: [{ id: 'evidenceReady', expression: '@response.evidenceReady', severity: 'defer' }],
        effects: [{ type: 'hostEvent', eventName: 'formspec-evidence' }],
      },
    ],
  };
  const calls = { submit: 0, hostEvent: 0 };
  const ports = {
    submit: () => {
      calls.submit += 1;
      return { response: {}, validationReport: { valid: true } };
    },
    dispatchHostEvent: () => {
      calls.hostEvent += 1;
    },
    evaluatePrecondition: () => false,
  };

  const blocked = invokeResponseAction(document, 'guarded', ports);
  const deferred = invokeResponseAction(document, 'deferred', ports);

  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.blockedCause, 'precondition');
  assert.equal(blocked.blockedPreconditionId, 'ready');
  assert.equal(deferred.status, 'deferred');
  assert.equal(deferred.deferredPreconditionId, 'evidenceReady');
  assert.deepEqual(calls, { submit: 0, hostEvent: 0 });
});

test('durable effect failures halt in order without rolling back prior effects', () => {
  const document = {
    ...responseActions,
    actions: [{
      id: 'durable-chain',
      intent: 'submit',
      effects: [
        { type: 'ledgerAppend', eventKind: 'draft.saved', idempotencyKey: '@invocation.id + \"/draft\"' },
        { type: 'handoffAssembly', handoffProfileRef: 'handoff:intake', recipientRef: 'agency', idempotencyKey: '@invocation.id + \"/handoff\"' },
        { type: 'hostEvent', eventName: 'formspec-submit' },
      ],
    }],
  };
  const hostEvents = [];

  const result = invokeResponseAction(document, 'durable-chain', {
    submit: () => ({ response: {}, validationReport: { valid: true } }),
    dispatchHostEvent: (eventName) => hostEvents.push(eventName),
    resolveIdempotencyKey: (effect) => `response-1/${effect.type}`,
    dispatchEffect: (effect) => effect.type === 'handoffAssembly'
      ? { type: effect.type, status: 'failed', reason: 'handoff target unavailable' }
      : { type: effect.type, status: 'succeeded', outcomeRef: 'sha256:' + '0'.repeat(64) },
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.failedEffectIndex, 1);
  assert.deepEqual(result.effectTrace.map(effect => effect.status), ['succeeded', 'failed']);
  assert.deepEqual(hostEvents, []);
});

test('deferred effect returns deferred terminal and replay token', () => {
  const document = {
    ...responseActions,
    actions: [{
      id: 'evidence',
      intent: 'request-evidence',
      effects: [
        { type: 'evidenceRequest', requestRef: 'evidence:income', idempotencyKey: '@invocation.id + \"/evidence\"' },
      ],
    }],
  };

  const result = invokeResponseAction(document, 'evidence', {
    submit: (options) => ({ options, response: {}, validationReport: { valid: true } }),
    dispatchHostEvent: () => {},
    resolveIdempotencyKey: (effect) => `response-1/${effect.type}`,
    dispatchEffect: (effect) => ({
      type: effect.type,
      status: 'deferred',
      replayToken: 'replay-1',
      reason: 'waiting for respondent upload',
    }),
  });

  assert.equal(result.status, 'deferred');
  assert.equal(result.deferredEffectIndex, 0);
  assert.equal(result.replayToken, 'replay-1');
  assert.equal(result.detail.options.profile, 'on-demand');
});

test('retry-once reuses frozen idempotency keys and retries only the failed effect', () => {
  const document = {
    ...responseActions,
    actions: [{
      id: 'retry-chain',
      intent: 'submit',
      onFailure: 'retry-once',
      effects: [
        { type: 'ledgerAppend', eventKind: 'response.submit-attempted', idempotencyKey: '@invocation.id + \"/attempt\"' },
        { type: 'handoffAssembly', handoffProfileRef: 'handoff:intake', recipientRef: 'agency', idempotencyKey: '@invocation.id + \"/handoff\"' },
      ],
    }],
  };
  const resolvedKeys = [];
  const dispatches = [];

  const result = invokeResponseAction(document, 'retry-chain', {
    submit: () => ({ response: {}, validationReport: { valid: true } }),
    dispatchHostEvent: () => {},
    resolveIdempotencyKey: (effect, action, context) => {
      const key = `inv-1/effect-${context.effectIndex}`;
      resolvedKeys.push({ type: effect.type, key });
      return key;
    },
    dispatchEffect: (effect, detail, action, context) => {
      dispatches.push({ type: effect.type, key: effect.idempotencyKey, attempt: context.attempt });
      if (effect.type === 'handoffAssembly' && context.attempt === 0) {
        return { type: effect.type, status: 'failed', reason: 'transient handoff failure' };
      }
      return { type: effect.type, status: 'succeeded', outcomeRef: 'sha256:' + '2'.repeat(64) };
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(resolvedKeys, [
    { type: 'ledgerAppend', key: 'inv-1/effect-0' },
    { type: 'handoffAssembly', key: 'inv-1/effect-1' },
  ]);
  assert.deepEqual(dispatches, [
    { type: 'ledgerAppend', key: 'inv-1/effect-0', attempt: 0 },
    { type: 'handoffAssembly', key: 'inv-1/effect-1', attempt: 0 },
    { type: 'handoffAssembly', key: 'inv-1/effect-1', attempt: 1 },
  ]);
  assert.deepEqual(result.effectTrace.map(effect => effect.status), ['succeeded', 'failed', 'succeeded']);
});

test('recordActionLifecycle emits action.invoked once on happy-path invocation', () => {
  // Ledger §8.5 + RA §11.3 publish four action.* lifecycle kinds. The
  // engine MUST emit action.invoked at the moment an invocation begins
  // and (for happy path) no other action.* kind.
  const events = [];
  const document = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.gov/forms/intake' },
    actions: [{
      id: 'happy',
      intent: 'submit',
      effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
    }],
  };
  const result = invokeResponseAction(document, 'happy', {
    submit: () => ({ response: {}, validationReport: { valid: true } }),
    dispatchHostEvent: () => {},
    recordActionLifecycle: (kind, payload) => events.push({ kind, payload }),
  }, 'node-1', { invocationId: 'inv-happy-1' });
  assert.equal(result.status, 'completed');
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'action.invoked');
  assert.equal(events[0].payload.actionId, 'happy');
  assert.equal(events[0].payload.invocationId, 'inv-happy-1');
});

test('recordActionLifecycle emits action.invoked then action.failed when an effect fails', () => {
  const events = [];
  const document = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.gov/forms/intake' },
    actions: [{
      id: 'fails',
      intent: 'submit',
      effects: [
        { type: 'ledgerAppend', eventKind: 'draft.saved', idempotencyKey: '@invocation.id & "/k"' },
      ],
    }],
  };
  const result = invokeResponseAction(document, 'fails', {
    submit: () => ({ response: {}, validationReport: { valid: true } }),
    dispatchHostEvent: () => {},
    resolveIdempotencyKey: () => 'inv-fails-1/k',
    dispatchEffect: () => ({ type: 'ledgerAppend', status: 'failed', reason: 'transport down' }),
    recordActionLifecycle: (kind, payload) => events.push({ kind, payload }),
  }, 'node-1', { invocationId: 'inv-fails-1' });
  assert.equal(result.status, 'failed');
  assert.deepEqual(events.map(e => e.kind), ['action.invoked', 'action.failed']);
  assert.equal(events[1].payload.terminal, 'failed');
  assert.equal(events[1].payload.effectIndex, 0);
});

test('recordActionLifecycle emits action.invoked then action.deferred for a deferred effect', () => {
  const events = [];
  const document = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.gov/forms/intake' },
    actions: [{
      id: 'defers',
      intent: 'request-evidence',
      effects: [
        { type: 'evidenceRequest', requestRef: 'evidence:income', idempotencyKey: '@invocation.id & "/k"' },
      ],
    }],
  };
  const result = invokeResponseAction(document, 'defers', {
    submit: () => ({ response: {}, validationReport: { valid: true } }),
    dispatchHostEvent: () => {},
    resolveIdempotencyKey: () => 'inv-defer-1/k',
    dispatchEffect: () => ({ type: 'evidenceRequest', status: 'deferred', replayToken: 'rep-1' }),
    recordActionLifecycle: (kind, payload) => events.push({ kind, payload }),
  }, 'node-1', { invocationId: 'inv-defer-1' });
  assert.equal(result.status, 'deferred');
  assert.deepEqual(events.map(e => e.kind), ['action.invoked', 'action.deferred']);
  assert.equal(events[1].payload.terminal, 'deferred');
  assert.equal(events[1].payload.replayTokenRef, 'rep-1');
});

test('recordActionLifecycle emits action.replayed when invocation supplies priorInvocationRef', () => {
  // §11.3 action.replayed is the continuation lifecycle moment — the host
  // signals "this invocation continues prior-invocation-X" via the
  // priorInvocationRef context.
  const events = [];
  const document = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.gov/forms/intake' },
    actions: [{
      id: 'replay',
      intent: 'submit',
      effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
    }],
  };
  const result = invokeResponseAction(document, 'replay', {
    submit: () => ({ response: {}, validationReport: { valid: true } }),
    dispatchHostEvent: () => {},
    recordActionLifecycle: (kind, payload) => events.push({ kind, payload }),
  }, 'node-1', { invocationId: 'inv-replay-2', priorInvocationRef: 'inv-replay-1' });
  assert.equal(result.status, 'completed');
  assert.deepEqual(events.map(e => e.kind), ['action.replayed']);
  assert.equal(events[0].payload.priorInvocationRef, 'inv-replay-1');
});

test('invokeResponseAction rejects precondition with unregistered @name (catalog gate before host evaluator)', () => {
  // Spec §4.1: FEL evaluators MUST reject unregistered @name bindings. The
  // engine consults the catalog BEFORE delegating to ports.evaluatePrecondition,
  // so a permissive host evaluator cannot wave through @bogus.
  const document = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.gov/forms/intake' },
    actions: [{
      id: 'guarded',
      intent: 'submit',
      preconditions: [{ id: 'bogusGuard', expression: '@bogus.x > 0', severity: 'block' }],
      effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
    }],
  };

  const permissiveHost = {
    submit: () => ({ response: {}, validationReport: { valid: true } }),
    dispatchHostEvent: () => {},
    evaluatePrecondition: () => true, // would wave through if catalog gate were absent
  };

  const result = invokeResponseAction(document, 'guarded', permissiveHost);
  assert.equal(result.status, 'failed');
  assert.equal(result.failedPreconditionId, 'bogusGuard');
  assert.match(result.failureReason, /unbound context reference.*@bogus/);
});

test('engine MASTER_TABLE matches generated VM schema const row-for-row', () => {
  // VALIDATION_MAPPING_MASTER_TABLE is generated from
  // schemas/validation-mapping.schema.json#/$defs/MasterTable/const.
  // The engine's intent->tuple lookup must reflect that const exactly.
  for (const row of VALIDATION_MAPPING_MASTER_TABLE) {
    const tuple = resolveResponseActionValidationTuple({
      id: `probe-${row.intent}`,
      intent: row.intent,
      effects: [{ type: 'hostEvent', eventName: 'noop' }],
    });
    assert.deepEqual(tuple, {
      profile: row.profile,
      blocking: row.blocking,
      persistence: row.persistence,
    }, `intent ${row.intent} should resolve to VM schema row`);
  }
});

test('ResponseActionsPreconditionCatalog publishes §4.1 six bindings', () => {
  // Spec §4.1 defines a closed catalog of six bindings. Names are
  // load-bearing — runtime evaluators MUST reject unregistered @names.
  const expected = ['response', 'definition', 'action', 'now', 'validation', 'invocation'];
  assert.deepEqual(
    RESPONSE_ACTIONS_PRECONDITION_BINDINGS.map(b => b.name).sort(),
    expected.slice().sort(),
  );
  // Every entry MUST carry the FEL §6.3.1 six fields.
  for (const entry of RESPONSE_ACTIONS_PRECONDITION_BINDINGS) {
    assert.ok(entry.name, `binding has name`);
    assert.ok(entry.kind, `binding ${entry.name} has kind`);
    assert.ok(entry.type, `binding ${entry.name} has type`);
    assert.ok(entry.purity, `binding ${entry.name} has purity`);
    assert.ok(entry.evaluationTiming, `binding ${entry.name} has evaluationTiming`);
    assert.ok(entry.scope, `binding ${entry.name} has scope`);
  }
});

test('ResponseActionsPreconditionCatalog isBindingPublished accepts §4.1 names and rejects @bogus', () => {
  const catalog = new ResponseActionsPreconditionCatalog();
  for (const name of ['response', 'definition', 'action', 'now', 'validation', 'invocation']) {
    assert.equal(catalog.isBindingPublished(name), true, `@${name} should be published`);
  }
  assert.equal(catalog.isBindingPublished('bogus'), false, '@bogus should not be published');
  assert.equal(catalog.isBindingPublished('effects'), false, '@effects is effect-time only');
});

test('ResponseActionsPreconditionCatalog validates expressions against the catalog', () => {
  const catalog = new ResponseActionsPreconditionCatalog();
  // Empty expression — no bindings referenced — passes trivially.
  assert.deepEqual(catalog.validateExpression('true'), { ok: true, unbound: [] });
  // Single registered binding — passes.
  assert.deepEqual(catalog.validateExpression('@response.id != null'), { ok: true, unbound: [] });
  // Unregistered binding — rejected with the offending name.
  assert.deepEqual(catalog.validateExpression('@bogus.x > 0'), { ok: false, unbound: ['bogus'] });
  // Mixed — collects every unbound name.
  const result = catalog.validateExpression('@response.x and @bogus and @also_bogus');
  assert.equal(result.ok, false);
  assert.deepEqual(result.unbound.sort(), ['also_bogus', 'bogus']);
});

test('RESPONSE_ACTIONS_EFFECT_TIME_BINDINGS adds @effects and keeps §4.1 set', () => {
  // Effect-time catalog (§6.4) extends the precondition catalog with @effects.
  const effectNames = RESPONSE_ACTIONS_EFFECT_TIME_BINDINGS.map(b => b.name).sort();
  assert.ok(effectNames.includes('effects'), '@effects must be in effect-time catalog');
  // Every precondition binding remains present.
  for (const pre of ['response', 'definition', 'action', 'now', 'validation', 'invocation']) {
    assert.ok(effectNames.includes(pre), `@${pre} from §4.1 must remain in §6.4`);
  }
});

test('engine MASTER_TABLE matches raw VM schema const (defense-in-depth)', () => {
  const schemaPath = resolve(
    __dirname,
    '../../../schemas/validation-mapping.schema.json',
  );
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  const schemaRows = schema.$defs.MasterTable.const;
  // Re-derive the engine's tuple map by probing every schema row.
  for (const row of schemaRows) {
    const tuple = resolveResponseActionValidationTuple({
      id: `probe-${row.intent}`,
      intent: row.intent,
      effects: [{ type: 'hostEvent', eventName: 'noop' }],
    });
    assert.deepEqual(tuple, {
      profile: row.profile,
      blocking: row.blocking,
      persistence: row.persistence,
    }, `intent ${row.intent} (raw schema) should resolve to VM schema row`);
  }
});
