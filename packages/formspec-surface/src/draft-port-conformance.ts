/** @filedesc Reusable behavioral checks for authorized Surface draft storage. */
import type { DraftKey, DraftPort, DraftSaveInput } from './draft-port.js';

const definitionUrl = 'https://example.test/definition';
const query = {
  key: 'summary',
  definitionUrl,
  definitionVersion: '1.0.0',
  sections: [{ id: 'main', fields: ['answer'] }],
};
const subject = { id: 'unit-a', type: 'urn:test:unit', keys: { year: 2025 } };
const key: DraftKey = { definitionUrl, scope: 'scope-a', subject };
const counts = { total: 1, filled: 1, toFix: 0, toCheck: 0 };

function saveInput(revision: string | null, answer = 'first', address = key): DraftSaveInput {
  const progress = { ...counts, filled: answer ? 1 : 0 };
  return {
    key: address,
    definitionVersion: '1.0.0',
    expectedRevision: revision,
    snapshotJson: JSON.stringify({ definitionUrl: address.definitionUrl, definitionVersion: '1.0.0', data: { answer } }),
    responseJson: JSON.stringify({
      $formspecResponse: '1.0', id: 'urn:uuid:55146a6e-46fc-43db-956c-b03de240f971', definitionUrl: address.definitionUrl,
      definitionVersion: '1.0.0', status: 'in-progress', authored: '2026-01-01T00:00:00Z',
      subject: address.subject, data: { answer },
    }),
    summary: {
      sections: query.sections,
      progress: { status: 'current', form: { ...progress, ready: !!answer }, sections: { main: progress } },
    },
  };
}

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

/** Supply a fresh port and real authorized/denied caller settings per fixture. */
export interface DraftPortFixture {
  port: DraftPort;
  deny: () => void | Promise<void>;
  key?: DraftKey;
  otherKeys?: readonly DraftKey[];
}

export const draftPortConformance = {
  async 'isolates scopes, Definitions and subjects'({ port, key: address = key, otherKeys }: DraftPortFixture) {
    const alternatives = otherKeys ?? [
      { ...address, scope: address.scope + '-other' },
      { ...address, definitionUrl: address.definitionUrl + '/other' },
      { ...address, subject: address.subject
        ? { ...address.subject, id: address.subject.id + '-other', type: address.subject.type + ':other' }
        : subject },
    ];
    check((await port.save(saveInput(null, 'first', address))).status === 'saved', 'initial save failed');
    for (const other of alternatives) {
      check((await port.load(other, '1.0.0')).status === 'absent', 'read crossed a key boundary');
      check((await port.save(saveInput(null, 'other', other))).status === 'saved', 'save crossed a key boundary');
    }
    const loaded = await port.load(address, '1.0.0');
    check(loaded.status === 'loaded' && JSON.parse(loaded.draft.snapshotJson).data.answer === 'first', 'original draft changed');
  },

  async 'checks authorization before revealing a version mismatch'({ port, deny, key: address = key }: DraftPortFixture) {
    check((await port.save(saveInput(null, 'first', address))).status === 'saved', 'initial save failed');
    const mismatch = await port.load(address, '2.0.0');
    check(mismatch.status === 'version-mismatch' && mismatch.storedVersion === '1.0.0', 'missing typed pin mismatch');
    check((await port.load(address, '1.0.0')).status === 'loaded', 'mismatch changed the draft');
    await deny();
    const denied = await port.load(address, '2.0.0');
    check(denied.status === 'denied' && Object.keys(denied).length === 1, 'denial exposed draft metadata');
    check((await port.save(saveInput(null, '', address))).status === 'denied', 'denial allowed a write');
    const results = await port.readSummaries([{ ...query, definitionUrl: address.definitionUrl, ...(address.subject && { subject: address.subject }) }], {
      previewScope: address.scope, signal: new AbortController().signal,
    });
    check(results.get(query.key)?.status === 'denied', 'denial exposed summary metadata');
  },

  async 'denies all operations on a never-saved key'({ port, deny, key: address = key }: DraftPortFixture) {
    check((await port.load(address, '1.0.0')).status === 'absent', 'fixture must begin with no draft');
    await deny();
    check((await port.load(address, '1.0.0')).status === 'denied', 'denied load revealed absence');
    check((await port.save(saveInput(null, '', address))).status === 'denied', 'denial allowed a create');
    const results = await port.readSummaries([{ ...query, definitionUrl: address.definitionUrl, ...(address.subject && { subject: address.subject }) }], {
      previewScope: address.scope, signal: new AbortController().signal,
    });
    check(results.get(query.key)?.status === 'denied', 'denied summary read revealed absence');
  },

  async 'admits one create when both callers saw absence'({ port, key: address = key }: DraftPortFixture) {
    const prior = await Promise.all([port.load(address, '1.0.0'), port.load(address, '1.0.0')]);
    check(prior.every(result => result.status === 'absent'), 'both callers must observe absence');
    const [left, right] = await Promise.all([
      port.save(saveInput(null, 'left', address)),
      port.save(saveInput(null, 'right', address)),
    ]);
    check([left.status, right.status].sort().join() === 'conflict,saved', 'create race admitted more than one writer');
    const winner = left.status === 'saved' ? left : right;
    const loaded = await port.load(address, '1.0.0');
    check(winner.status === 'saved' && loaded.status === 'loaded' &&
      loaded.draft.revision === winner.revision &&
      JSON.parse(loaded.draft.snapshotJson).data.answer === (left.status === 'saved' ? 'left' : 'right'),
    'create race did not preserve the winning revision');
  },

  async 'commits answers and summary at the winning revision'({ port, key: address = key }: DraftPortFixture) {
    const first = await port.save(saveInput(null, 'first', address));
    check(first.status === 'saved', 'initial save failed');
    const [left, right] = await Promise.all([
      port.save(saveInput(first.revision, '', address)),
      port.save(saveInput(first.revision, 'other', address)),
    ]);
    check([left.status, right.status].sort().join() === 'conflict,saved', 'compare-and-save admitted more than one writer');
    const winner = left.status === 'saved' ? left : right;
    check(winner.status === 'saved' && winner.revision !== first.revision, 'save reused its old revision');
    const loaded = await port.load(address, '1.0.0');
    const summaries = await port.readSummaries([{ ...query, definitionUrl: address.definitionUrl, ...(address.subject && { subject: address.subject }) }], {
      previewScope: address.scope, signal: new AbortController().signal,
    });
    const progress = summaries.get(query.key);
    check(loaded.status === 'loaded' && loaded.draft.revision === winner.revision, 'load returned the wrong revision');
    check(JSON.parse(loaded.draft.responseJson).data.answer === (left.status === 'saved' ? '' : 'other'), 'wrong filtered response');
    check(progress?.status === 'current' && progress.form.filled === (left.status === 'saved' ? 0 : 1) &&
      progress.sections.main?.filled === progress.form.filled, 'summary came from a different revision');
  },

  async 'reports missing and invalidated summaries without returning answers or creating a draft'({ port, key: address = key }: DraftPortFixture) {
    const read = (queries: Parameters<DraftPort['readSummaries']>[0]) =>
      port.readSummaries(queries, { previewScope: address.scope, signal: new AbortController().signal });
    const requested = { ...query, definitionUrl: address.definitionUrl, ...(address.subject && { subject: address.subject }) };
    check((await read([requested])).get(query.key)?.status === 'absent', 'summary read did not report absence');
    check((await port.load(address, '1.0.0')).status === 'absent', 'summary read created a draft');
    const first = await port.save(saveInput(null, 'private answer', address));
    check(first.status === 'saved', 'initial save failed');
    const current = (await read([requested])).get(query.key);
    check(current?.status === 'current' && Object.keys(current).sort().join() === 'form,sections,status', 'summary exposed draft data');
    const stale = await read([
      { ...requested, key: 'pin', definitionVersion: '2.0.0' },
      { ...requested, key: 'placement', sections: [{ id: 'main', fields: ['other'] }] },
    ]);
    check(stale.get('pin')?.status === 'stale' && stale.get('placement')?.status === 'stale', 'stale counts were served');
    check((await port.save({ ...saveInput(first.revision, 'second', address), summary: null })).status === 'saved', 'summary-free save failed');
    check((await read([requested])).get(query.key)?.status === 'unavailable', 'a summary survived its invalidating revision');
  },
};
