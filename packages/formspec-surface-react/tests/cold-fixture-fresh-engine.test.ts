/** @filedesc Verifies zero raw response parses (exact or JSON.parse) during cold overview readSummaries and cache cleanup on init failure. */
import { expect, it, vi } from 'vitest';

vi.mock('@formspec-org/integrity-canonical', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@formspec-org/integrity-canonical')>();
  return {
    ...actual,
    parseJsonExact: vi.fn(actual.parseJsonExact),
  };
});

vi.mock('@formspec-org/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@formspec-org/engine')>();
  return {
    ...actual,
    initFormspecEngineTools: vi.fn(actual.initFormspecEngineTools),
  };
});

import { initFormspecEngineTools, responseSubjectId } from '@formspec-org/engine';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import type { FormDefinition } from '@formspec-org/types';
import { createMemoryFilingStore } from '../src/browser-draft-port.js';

const scope = 'edition-fresh-cold';
const version = '1.0.0';
const plan = 'urn:test:cold-plan';
const period = { start_year: 2024, end_year: 2026 };
const precomputedSubjectId = 'a39ce4358f5efbd713b748be196fb4978d0763a8f638a5df846c2d5295c15876';
const planDef: FormDefinition = {
  $formspec: '1.0',
  url: plan,
  version,
  title: 'Cold Plan',
  subject: {
    type: plan,
    keys: { start_year: { dataType: 'integer' }, end_year: { dataType: 'integer' } },
  },
  items: [{ key: 'answer', type: 'field', dataType: 'string' }],
};
const definitions = new Map<string, FormDefinition>([[plan, planDef]]);
const query = {
  key: 'plan:2025',
  definitionUrl: plan,
  definitionVersion: version,
  sections: [],
  subjectMatch: {
    type: plan,
    predicates: [
      { key: 'start_year', op: 'le' as const, value: 2025 },
      { key: 'end_year', op: 'ge' as const, value: 2025 },
    ],
  },
};

it('direct adapter performs 1 raw parse on construction and 0 raw parses (parseJsonExact or JSON.parse) during immediate readSummaries on a fresh uninitialized engine', async () => {
  // Confirm WASM tools have not been initialized yet in this fresh isolate.
  expect(() => responseSubjectId(plan, period)).toThrow();

  const sentinel = 'fresh-engine-secret';
  const responseJson = JSON.stringify({
    $formspecResponse: '1.0',
    definitionUrl: plan,
    definitionVersion: version,
    id: 'urn:cold:fresh-direct',
    status: 'completed',
    authored: '2026-01-01T00:00:00Z',
    subject: { id: precomputedSubjectId, type: plan, keys: period },
    data: { answer: sentinel },
  }, null, 2) + '\n';

  const rawExactCalls = () => vi.mocked(parseJsonExact).mock.calls.filter(
    ([text]) => typeof text === 'string' && text.includes(sentinel),
  ).length;
  const jsonParseSpy = vi.spyOn(JSON, 'parse');
  const rawJsonParseCalls = () => jsonParseSpy.mock.calls.filter(
    ([text]) => typeof text === 'string' && text.includes(sentinel),
  ).length;

  try {
    const store = createMemoryFilingStore({
      scope,
      definitions,
      fixtures: { filings: [{ responseJson }] },
    });
    expect(rawExactCalls()).toBe(1);

    vi.mocked(parseJsonExact).mockClear();
    jsonParseSpy.mockClear();
    const observations = await store.drafts.readSummaries([query], {
      previewScope: scope,
      signal: new AbortController().signal,
    });

    expect(observations.get(query.key)).toMatchObject({
      subjectMatch: 'matched',
      subject: { type: plan, keys: period },
      filing: { status: 'filed', receiptRef: 'urn:cold:fresh-direct' },
    });
    expect(rawExactCalls()).toBe(0);
    expect(rawJsonParseCalls()).toBe(0);
    expect(responseSubjectId(plan, period)).toBe(precomputedSubjectId);
  } finally {
    jsonParseSpy.mockRestore();
  }
});

it('releases cached decoded fixtures when the WebAssembly tools initializer rejects', async () => {
  const sentinel = 'rejected-init-secret';
  const responseJson = JSON.stringify({
    $formspecResponse: '1.0',
    definitionUrl: plan,
    definitionVersion: version,
    id: 'urn:cold:rejected-init',
    status: 'completed',
    authored: '2026-01-01T00:00:00Z',
    subject: { id: precomputedSubjectId, type: plan, keys: period },
    data: { answer: sentinel },
  }, null, 2) + '\n';

  let capturedCache: Map<unknown, unknown> | undefined;
  const originalMapSet = Map.prototype.set;
  const mapSetSpy = vi.spyOn(Map.prototype, 'set').mockImplementation(function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
    if (key === responseJson && value && typeof value === 'object' && '$formspecResponse' in value) {
      capturedCache = this;
    }
    return originalMapSet.call(this, key, value);
  });
  vi.mocked(initFormspecEngineTools).mockRejectedValueOnce(new Error('WASM tools failed'));

  try {
    // Use a fixture with a failing initializer; pass a fresh definition map without pre-warmed sync admission
    // by having responseSubjectId fail on the sync attempt via a rejected tools init during async loadFixtures.
    const invalidSyncDef: FormDefinition = {
      ...planDef,
      url: 'urn:test:cold-plan-reject',
      subject: { type: 'urn:test:cold-plan-reject', keys: { start_year: { dataType: 'integer' }, end_year: { dataType: 'integer' } } },
    };
    const rejectResponseJson = JSON.stringify({
      $formspecResponse: '1.0',
      definitionUrl: invalidSyncDef.url,
      definitionVersion: version,
      id: 'urn:cold:rejected-init',
      status: 'completed',
      authored: '2026-01-01T00:00:00Z',
      subject: { id: 'wrong-until-init', type: invalidSyncDef.url, keys: period },
      data: { answer: sentinel },
    }, null, 2) + '\n';
    mapSetSpy.mockImplementation(function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
      if (key === rejectResponseJson && value && typeof value === 'object' && '$formspecResponse' in value) {
        capturedCache = this;
      }
      return originalMapSet.call(this, key, value);
    });

    const store = createMemoryFilingStore({
      scope,
      definitions: new Map([[invalidSyncDef.url, invalidSyncDef]]),
      fixtures: { filings: [{ responseJson: rejectResponseJson }] },
    });
    const result = await store.drafts.readSummaries([
      { key: 'q', definitionUrl: invalidSyncDef.url, definitionVersion: version, sections: [] },
    ], { previewScope: scope, signal: new AbortController().signal });
    expect(result.get('q')).toEqual({ draft: { status: 'unavailable' }, filing: { status: 'unavailable' } });
    expect(capturedCache).toBeDefined();
    expect(capturedCache?.size).toBe(0);
  } finally {
    mapSetSpy.mockRestore();
  }
});
