/** @filedesc Pure service-request planner and output-extraction contract tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalResponseHandoffBytes, parseJsonExact } from '@formspec-org/integrity-canonical';
import {
  extractServiceRequestOutputs,
  planServiceRequest,
  resolveRuntimeValueSelector,
  resolveServiceRequest,
} from '../dist/index.js';

const request = {
  id: 'create-draft',
  adapter: 'http-json',
  request: {
    method: 'POST',
    pathTemplate: '/programs/{programId}/drafts',
    pathBindings: {
      programId: { from: 'route', path: 'programId' },
    },
    queryBindings: {
      revision: { from: 'result', path: 'revision' },
    },
    headerBindings: {
      'if-match': { from: 'input', path: 'etag' },
    },
    bodyDefaults: { state: 'draft' },
    bodyBindings: {
      '/answers/name': { from: 'input', path: 'answers.name' },
      '/draftToken': { from: 'session', path: 'draftToken' },
      '/source': { from: 'literal', value: 'wireframe' },
    },
  },
  successStatuses: [200, 201],
  outputs: {
    revision: { path: '/meta/revision' },
    draftId: { path: '/draft/id', exposure: 'transition' },
    draftToken: { path: '/session/token', exposure: 'session' },
  },
};

test('catalog lookup requires exactly one request id', () => {
  const catalog = { version: '1.0', requests: [request] };
  assert.equal(resolveServiceRequest(catalog, 'create-draft'), request);
  assert.throws(() => resolveServiceRequest(catalog, 'missing'), /unresolved/);
  assert.throws(
    () => resolveServiceRequest({ version: '1.0', requests: [request, { ...request }] }, 'create-draft'),
    /ambiguous/,
  );
});

test('planner resolves closed sources into a transport-neutral same-origin request', () => {
  const planned = planServiceRequest(request, {
    input: { etag: 'draft-3', answers: { name: 'Ava' } },
    route: { programId: 'housing/2026' },
    session: { draftToken: 'host-private-token' },
    result: { revision: 4 },
  });

  assert.equal(planned.method, 'POST');
  assert.equal(planned.path, '/programs/housing%2F2026/drafts?revision=4');
  assert.deepEqual({ ...planned.headers }, { 'if-match': 'draft-3' });
  assert.deepEqual(JSON.parse(JSON.stringify(planned.body)), {
    state: 'draft',
    answers: { name: 'Ava' },
    draftToken: 'host-private-token',
    source: 'wireframe',
  });
  assert.deepEqual(planned.successStatuses, [200, 201]);
  assert.equal('origin' in planned, false);
  assert.equal('credentials' in planned, false);
});

test('planner rejects unsafe paths, host-owned headers, inherited data, and accessors', () => {
  assert.throws(
    () => planServiceRequest({ ...request, request: { ...request.request, pathTemplate: '//evil.test/x' } }, {
      input: {}, route: { programId: 'x' }, session: {}, result: { revision: 1 },
    }),
    /pathTemplate is unsafe/,
  );
  assert.throws(
    () => planServiceRequest({
      ...request,
      request: {
        ...request.request,
        headerBindings: { Authorization: { from: 'literal', value: 'secret' } },
      },
    }, { input: {}, route: { programId: 'x' }, session: {}, result: { revision: 1 } }),
    /host-owned/,
  );

  const inherited = Object.create({ secret: 'inherited' });
  assert.throws(
    () => resolveRuntimeValueSelector({ from: 'input', path: 'secret' }, { input: inherited }),
    /own data property/,
  );
  const accessor = {};
  Object.defineProperty(accessor, 'secret', { get: () => 'getter-result', enumerable: true });
  assert.throws(
    () => resolveRuntimeValueSelector({ from: 'input', path: 'secret' }, { input: accessor }),
    /own data property/,
  );
});

test('extractor partitions outputs and a later action can consume host-private session state', () => {
  const raw = {
    meta: { revision: 5 },
    draft: { id: 'draft-42' },
    session: { token: 'sensitive-session-token' },
    undeclared: { bearer: 'must-not-leak' },
  };
  const extracted = extractServiceRequestOutputs(request, raw);

  assert.deepEqual({ ...extracted.internal }, { revision: 5 });
  assert.deepEqual({ ...extracted.transitionBindings }, { draftId: 'draft-42' });
  assert.deepEqual({ ...extracted.sessionBindings }, { draftToken: 'sensitive-session-token' });
  assert.equal(JSON.stringify(extracted.internal).includes('sensitive-session-token'), false);
  assert.equal(JSON.stringify(extracted.transitionBindings).includes('sensitive-session-token'), false);
  assert.equal(JSON.stringify(extracted).includes('must-not-leak'), false);

  const later = planServiceRequest(request, {
    input: { etag: 'draft-4', answers: { name: 'Ava' } },
    route: { programId: 'housing' },
    session: extracted.sessionBindings,
    result: extracted.internal,
  });
  assert.equal(later.body.draftToken, 'sensitive-session-token');
  assert.equal(later.path, '/programs/housing/drafts?revision=5');
});

test('transition and session outputs must be non-empty strings', () => {
  assert.throws(
    () => extractServiceRequestOutputs(request, {
      meta: { revision: 1 },
      draft: { id: 42 },
      session: { token: 'token' },
    }),
    /transition output draftId must resolve to a non-empty string/,
  );
  assert.throws(
    () => extractServiceRequestOutputs(request, {
      meta: { revision: 1 },
      draft: { id: 'draft' },
      session: { token: '' },
    }),
    /session output draftToken must resolve to a non-empty string/,
  );
});


const exactResponseText = '{"$formspecResponse":"1.0","data":{"amount":1234567890.123456789,"count":9007199254740993,"safe":1.25,"nested":[{"negative":-1234567890.123456789},9007199254740993]}}';
const exactRequest = {
  id: 'sign-draft', adapter: 'http-json', request: {
    method: 'POST', pathTemplate: '/drafts/sign',
    bodyBindings: { '/canonical_response': { from: 'input', path: 'response' } },
  }, outputs: { response: { path: '/canonical_response' } },
};

test('planner preserves exact numeric leaves and detaches ordinary Response containers', () => {
  const response = parseJsonExact(exactResponseText);
  const planned = planServiceRequest(exactRequest, { input: { response } });
  assert.equal(JSON.stringify(planned.body), `{"canonical_response":${exactResponseText}}`);
  assert.deepEqual(canonicalResponseHandoffBytes(planned.body.canonical_response), canonicalResponseHandoffBytes(response));
  assert.equal(JSON.isRawJSON(planned.body.canonical_response.data.amount), true);
  assert.equal(planned.body.canonical_response.data.amount, response.data.amount);
  assert.equal(Object.isFrozen(response.data.amount), true);
  const defaults = planServiceRequest({ ...exactRequest, request: {
    method: 'POST', pathTemplate: '/drafts/sign', bodyDefaults: { canonical_response: response },
  } }, { input: {} });
  assert.equal(JSON.stringify(defaults.body), JSON.stringify(planned.body));
  response.data.nested.push('later change'); response.data.safe = 2;
  assert.equal(JSON.stringify(planned.body), `{"canonical_response":${exactResponseText}}`);
  assert.equal(JSON.stringify(defaults.body), JSON.stringify(planned.body));
});

test('extracted exact Response output retains its bytes through the next planned request', () => {
  const response = parseJsonExact(exactResponseText);
  const extracted = extractServiceRequestOutputs(exactRequest, { canonical_response: response });
  assert.deepEqual(canonicalResponseHandoffBytes(extracted.internal.response), canonicalResponseHandoffBytes(response));
  const next = planServiceRequest({ ...exactRequest, request: { ...exactRequest.request,
    bodyBindings: { '/canonical_response': { from: 'result', path: 'response' } },
  } }, { input: {}, result: extracted.internal });
  assert.equal(JSON.stringify(next.body), `{"canonical_response":${exactResponseText}}`);
  assert.deepEqual(canonicalResponseHandoffBytes(next.body.canonical_response), canonicalResponseHandoffBytes(response));
  response.data.nested.push('later change');
  assert.equal(JSON.stringify(extracted.internal.response), exactResponseText);
  assert.equal(JSON.stringify(next.body), `{"canonical_response":${exactResponseText}}`);
});

test('a genuine raw numeric leaf is not root bodyDefaults structured data', () => {
  const numericLeaf = parseJsonExact('1234567890.123456789');
  assert.throws(() => planServiceRequest({ ...exactRequest,
    request: { method: 'POST', pathTemplate: '/drafts/sign', bodyDefaults: numericLeaf },
  }, { input: {} }), /bodyDefaults must be a JSON object/);
});

test('selectors and pointers cannot traverse or mutate a raw numeric leaf as an object', () => {
  const response = parseJsonExact(exactResponseText);
  assert.throws(() => resolveRuntimeValueSelector(
    { from: 'input', path: 'response.data.amount.rawJSON' }, { input: { response } }), /structured data/);
  assert.throws(() => extractServiceRequestOutputs({ ...exactRequest,
    outputs: { raw: { path: '/canonical_response/data/count/rawJSON' } },
  }, { canonical_response: response }), /structured data/);
  assert.throws(() => planServiceRequest({ ...exactRequest, request: {
    method: 'POST', pathTemplate: '/drafts/sign', bodyDefaults: { amount: response.data.amount },
    bodyBindings: { '/amount/rawJSON': { from: 'literal', value: 'changed' } },
  } }, { input: {} }), /not structured data|scalar value/);
  assert.equal(JSON.stringify(response.data.amount), '1234567890.123456789');
});

test('plain rawJSON lookalikes remain ordinary objects without numeric authority', () => {
  for (const amount of [{ rawJSON: '1234567890.123456789' }, Object.assign(Object.create(null), { rawJSON: '1234567890.123456789' })]) {
    const planned = planServiceRequest(exactRequest, { input: { response: { data: { amount } } } });
    assert.equal(JSON.isRawJSON(planned.body.canonical_response.data.amount), false);
    assert.equal(JSON.stringify(planned.body), '{"canonical_response":{"data":{"amount":{"rawJSON":"1234567890.123456789"}}}}');
    assert.notDeepEqual(canonicalResponseHandoffBytes(planned.body.canonical_response),
      canonicalResponseHandoffBytes(parseJsonExact('{"data":{"amount":1234567890.123456789}}')));
  }
});

test('exact copying retains scalar exposure and ordinary JSON refusal checks', () => {
  const cycle = {}; cycle.next = cycle;
  const accessor = {}; Object.defineProperty(accessor, 'answer', { enumerable: true, get() { throw new Error('must not invoke'); } });
  for (const [value, expected] of [[NaN, /non-finite/], [Infinity, /non-finite/], [cycle, /cycle/], [accessor, /own data property/], [[, 1], /sparse/]]) {
    assert.throws(() => planServiceRequest(exactRequest, { input: { response: value } }), expected);
  }
  const numericLeaf = parseJsonExact('1234567890.123456789');
  for (const exposure of ['transition', 'session']) {
    assert.throws(() => extractServiceRequestOutputs({ ...exactRequest,
      outputs: { amount: { path: '/amount', exposure } },
    }, { amount: numericLeaf }), /non-empty string/);
  }
  const planned = planServiceRequest(exactRequest, { input: { response: { data: { amount: 1.25, count: 7 } } } });
  assert.equal(JSON.stringify(planned.body), '{"canonical_response":{"data":{"amount":1.25,"count":7}}}');
});
