/** @filedesc Verify the shared fixtures reject ambiguous draft storage behavior. */
import { expect, it } from 'vitest';
import { draftPortConformance } from '../src/draft-port-conformance.js';
import type { DraftPort } from '../src/draft-port.js';

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
