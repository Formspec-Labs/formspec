/** @filedesc Verify the shared fixtures reject ambiguous draft storage behavior. */
import { expect, it } from 'vitest';
import { draftPortConformance } from '../src/draft-port-conformance.js';
import { canonicalDraftProgress, type DraftPort, type DraftRecord } from '../src/draft-port.js';

it('rejects a port that returns absent to a denied caller with no draft', async () => {
  const port: DraftPort = {
    load: async () => ({ status: 'absent' }),
    save: async () => ({ status: 'denied' }),
    readSummaries: async () => new Map([['summary', { draft: { status: 'unavailable' }, filing: { status: 'unavailable' } }]]),
  };
  await expect(draftPortConformance['denies all operations on a never-saved key']({ port, deny() {} }))
    .rejects.toThrow('denied load revealed absence');
});

it('rejects a port that admits two saves against an absent revision', async () => {
  const port: DraftPort = {
    load: async () => ({ status: 'absent' }),
    save: async () => ({ status: 'saved', revision: 'first' }),
    readSummaries: async () => new Map(),
  };
  await expect(draftPortConformance['admits one create when both callers saw absence']({ port, deny() {} }))
    .rejects.toThrow('create race admitted more than one writer');
});

it.each([
  ['snapshotJson', 'editable snapshot changed'],
  ['responseJson', 'filtered response changed'],
] as const)('rejects a port that rounds a saved number in %s', async (field, message) => {
  let draft: DraftRecord;
  const port: DraftPort = {
    async save(input) {
      draft = {
        revision: 'saved', pins: {}, snapshotJson: input.snapshotJson, responseJson: input.responseJson,
        [field]: JSON.stringify(JSON.parse(input[field])),
      };
      return { status: 'saved', revision: draft.revision };
    },
    load: async () => ({ status: 'loaded', draft }),
    readSummaries: async () => new Map(),
  };
  await expect(draftPortConformance['round-trips editable and filtered draft data separately']({ port, deny() {} }))
    .rejects.toThrow(message);
});

it('canonicalDraftProgress preserves own section keys including __proto__ and restricts keys when allowedSectionIds is supplied', () => {
  const input = {
    status: 'current',
    form: { total: 2, filled: 1, toFix: null, toCheck: null, ready: null },
    sections: Object.fromEntries([
      ['__proto__', { total: 1, filled: 0, toFix: null, toCheck: null }],
      ['normal', { total: 1, filled: 1, toFix: 0, toCheck: 0 }],
    ]),
  };
  const unrestricted = canonicalDraftProgress(input);
  expect(unrestricted?.form).toEqual({ total: 2, filled: 1, toFix: null, toCheck: null, ready: null });
  expect(Object.keys(unrestricted?.sections ?? {})).toEqual(['__proto__', 'normal']);

  const restricted = canonicalDraftProgress(
    {
      status: 'current',
      form: { total: 1, filled: 0, toFix: null, toCheck: null, ready: null },
      sections: {
        main: { total: 1, filled: 0, toFix: null, toCheck: null },
        'first.answer': { total: 1, filled: 0, toFix: null, toCheck: null },
      },
    },
    new Set(['main']),
  );
  expect(restricted).toEqual({
    status: 'current',
    form: { total: 1, filled: 0, toFix: null, toCheck: null, ready: null },
    sections: { main: { total: 1, filled: 0, toFix: null, toCheck: null } },
  });
});

it('rejects a port whose repinDraft admits a stale revision', async () => {
  const pin1 = {
    records: [{ responseId: 'urn:list:1', definitionVersion: '1.0.0' }],
    valueDigest: 'sha256:' + 'a'.repeat(64),
    none: false,
    pinned: true,
    value: { answer: '1' },
  };
  let stored: DraftRecord | null = null;
  const port: DraftPort = {
    async save(input) {
      stored = {
        revision: 'rev-1',
        pins: input.creationPins ?? {},
        snapshotJson: input.snapshotJson,
        responseJson: input.responseJson,
      };
      return { status: 'saved', revision: 'rev-1' };
    },
    load: async () => (stored ? { status: 'loaded', draft: stored } : { status: 'absent' }),
    repinDraft: async () => ({ status: 'repinned', draft: stored! }),
    readSummaries: async () => new Map(),
  };
  await expect(draftPortConformance['explicitly re-pins an at-open filing against its expected revision']({
    port,
    deny() {},
    pins: {
      instance: 'list',
      initialResponseId: 'urn:list:1',
      newerResponseId: 'urn:list:2',
      addInitial: async () => {},
      addNewer: async () => {},
      select: async () => ({ status: 'available', ...pin1 }),
    },
  })).rejects.toThrow('repinDraft admitted a stale draft revision');
});
