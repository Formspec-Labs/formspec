/** @filedesc Verify the shared fixtures reject ambiguous draft storage behavior. */
import { expect, it } from 'vitest';
import { draftPortConformance } from '../src/draft-port-conformance.js';
import type { DraftPort, DraftRecord } from '../src/draft-port.js';

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
