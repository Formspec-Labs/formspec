import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeResponseAction, invokeResponseActionAsync } from '../dist/response-actions.js';
import { evaluateResponseActionEffectExpression } from '../dist/response-action-effect-expression.js';
import { initFormspecEngine, initFormspecEngineTools } from '../dist/init-formspec-engine.js';

await initFormspecEngine();
await initFormspecEngineTools();
const document = effects => ({ $formspecResponseActions: '1.0', version: '1.0.0',
  targetDefinition: { url: 'urn:neutral:form' }, actions: [{ id: 'notify', intent: 'review',
    validation: { profile: 'off', blocking: 'non-blocking', persistence: 'none' }, effects }] });
function evaluate(expression, detail, action, context) {
  return evaluateResponseActionEffectExpression(expression, { fields: detail.response.data,
    bindings: { response: detail.response, action, invocation: context.invocation, effects: context.effects } });
}
for (const invoke of [invokeResponseAction, invokeResponseActionAsync]) {
  test(`${invoke.name}: evaluates neutral detailRef and preserves original invocation detail`, async () => {
    const detail = { response: { data: { payload: { uri: 'urn:neutral:attachment', size: 123 } } } };
    const events = [];
    const result = await invoke(document([{ type: 'hostEvent', eventName: 'first' },
      { type: 'hostEvent', eventName: 'selected', detailRef: '$payload' },
      { type: 'hostEvent', eventName: 'prior', detailRef: '@effects[1].status' }]), 'notify', {
      submit: () => detail,
      evaluateEffectExpression: (expression, snapshot, action, context) => {
        assert(Object.isFrozen(snapshot.response.data.payload));
        assert(Object.isFrozen(context.effects));
        assert.equal(context.invocation.id, 'neutral-invocation');
        assert.equal(context.invocation.attempt, 1);
        return evaluate(expression, snapshot, action, context);
      },
      dispatchHostEvent: (name, value) => {
        events.push({ name, value });
        if (name === 'first') detail.response.data.payload.size = 999;
      },
    }, undefined, { invocationId: 'neutral-invocation' });
    assert.equal(result.status, 'completed');
    assert.equal(result.detail, detail);
    assert.equal(events[0].value, detail);
    assert.deepEqual(events[1].value, { uri: 'urn:neutral:attachment', size: 123 });
    assert.equal(events[2].value, 'succeeded');
    assert.equal(result.effectTrace.length, 3);
  });
  test(`${invoke.name}: missing evaluator and native evaluation errors fail before dispatch`, async () => {
    for (const ports of [{}, { evaluateEffectExpression: evaluate }]) {
      let dispatched = false;
      const result = await invoke(document([{ type: 'hostEvent', eventName: 'invalid', detailRef: '1 / 0' }]), 'notify', {
        submit: () => ({ response: { data: {} } }), dispatchHostEvent: () => { dispatched = true; }, ...ports,
      });
      assert.equal(result.status, 'failed');
      assert.equal(result.effectTrace[0].status, 'failed');
      assert.equal(dispatched, false);
    }
  });
}

for (const invoke of [invokeResponseAction, invokeResponseActionAsync]) {
  test(`${invoke.name}: drains rejected asynchronous expression results`, async () => {
    let dispatched = false;
    const result = await invoke(document([{ type: 'hostEvent', eventName: 'invalid', detailRef: '$payload' }]), 'notify', {
      submit: () => ({ response: { data: {} } }),
      evaluateEffectExpression: () => Promise.reject(new Error('unsupported async evaluator')),
      dispatchHostEvent: () => { dispatched = true; },
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(result.status, 'failed');
    assert.equal(result.effectTrace[0].status, 'failed');
    assert.equal(dispatched, false);
  });
}
test('native adapter admits quoted text and null; refuses unsupported bindings and calls', () => {
  const context = { fields: {}, bindings: { response: null } };
  assert.equal(evaluateResponseActionEffectExpression("'contact@example.com'", context), 'contact@example.com');
  assert.equal(evaluateResponseActionEffectExpression('@response', context), null);
  for (const expression of ['@now()', '@now', '@response()', '@response ()', '@unknown', '@current', '@definition']) {
    assert.throws(() => evaluateResponseActionEffectExpression(expression, context));
  }
});

for (const invoke of [invokeResponseAction, invokeResponseActionAsync]) {
  test(`${invoke.name}: retry exposes attempt two and only earlier effects`, async () => {
    const attempts = [];
    let dispatches = 0;
    const retryDocument = document([{ type: 'hostEvent', eventName: 'retry', detailRef: '@invocation.attempt' }]);
    retryDocument.actions[0].onFailure = 'retry-once';
    const result = await invoke(retryDocument, 'notify', {
      submit: () => ({ response: { data: {} } }),
      evaluateEffectExpression: (expression, snapshot, action, context) => {
        attempts.push(context.invocation.attempt);
        assert.deepEqual(context.effects, []);
        return evaluate(expression, snapshot, action, context);
      },
      dispatchHostEvent: () => { if (++dispatches === 1) throw new Error('retry event'); },
    });
    assert.equal(result.status, 'completed');
    assert.deepEqual(attempts, [1, 2]);
    assert.equal(result.effectTrace.length, 1);
    assert.equal(result.effectTrace[0].status, 'succeeded');
  });
}
