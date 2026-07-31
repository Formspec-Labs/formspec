/** @filedesc Pure service-request planner and output-extraction contract tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
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
