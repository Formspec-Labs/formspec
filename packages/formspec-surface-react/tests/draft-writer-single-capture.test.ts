/** @filedesc DraftWriter single-capture Prepare/Sign assembly without overwriting editable draft responseJson (fs-6zl7). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import type { DraftPort, DraftRecord } from '@formspec-org/surface';
import type {
  FormDefinition,
  FormResponse,
  ResponseActionsDocument,
  ResponseSelectionOutcome,
} from '@formspec-org/types';
import type { DraftDefinitionResponsePort } from '../src/definition-response-reads.js';
import { createDraftSession } from '../src/draft-session.js';
import { createDraftWriter } from '../src/draft-writer.js';

const SHA_1 = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
const SHA_2 = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';
const SHA_3 = 'sha256:3333333333333333333333333333333333333333333333333333333333333333';

const definition: FormDefinition = {
  $formspec: '1.0',
  url: 'https://example.org/forms/single-capture-sign',
  version: '1.0.0',
  title: 'Single Capture Sign',
  subject: { type: 'filing-unit', keys: { unitId: { dataType: 'string' } } },
  instances: {
    sibling: {
      response: {
        definition: { url: 'https://example.org/forms/sibling', compatibleVersions: '>=1.0.0 <2.0.0' },
        subject: [{ key: 'unitId', op: 'eq', from: { subject: 'unitId' } }],
        status: 'completed',
        whenNone: 'unavailable',
        cardinality: 'latest',
        pin: 'none',
      },
      schema: { amount: { dataType: 'integer' } },
    },
  },
  items: [
    { key: 'note', type: 'field', dataType: 'string', label: 'Note' },
    { key: 'total', type: 'field', dataType: 'integer', label: 'Total' },
  ],
  binds: [
    { path: 'total', calculate: "@instance('sibling').amount + 10" },
  ],
};

const prepareAndSignDoc: ResponseActionsDocument = {
  $formspecResponseActions: '1.0',
  version: '1.0.0',
  scope: 'response',
  targetDefinition: { url: definition.url, compatibleVersions: '1.0.0' },
  actions: [
    {
      id: 'prepare',
      intent: 'review',
      validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
      effects: [{ type: 'serviceRequest', requestRef: 'prepare-req', idempotencyKey: '@invocation.id' }],
    },
    {
      id: 'sign',
      intent: 'x-sign',
      validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
      effects: [{ type: 'serviceRequest', requestRef: 'sign-req', idempotencyKey: '@invocation.id' }],
    },
  ],
  'x-formspec-runtime': {
    version: '1.0',
    requests: [
      { id: 'prepare-req', operation: 'prepare', adapter: 'http-json', request: { method: 'PATCH', pathTemplate: '/drafts/1' } },
      { id: 'sign-req', operation: 'sign', adapter: 'http-json', request: { method: 'POST', pathTemplate: '/drafts/1/sign' } },
    ],
  },
};

const disposers: Array<() => void> = [];
afterEach(() => { while (disposers.length) disposers.pop()!(); });

describe('DraftWriter single-capture assembly and fresh response deliveries (fs-6zl7)', () => {
  it('re-selects fresh deliveries on Prepare/Sign, assembles resolvedInstances once without mutating editable DraftRecord.responseJson, and refuses Sign when prerequisite becomes unavailable', async () => {
    await initFormspecEngine();
    let stored: DraftRecord | null = null;
    let rev = 0;
    let siblingOutcome: ResponseSelectionOutcome = {
      status: 'available',
      value: { amount: 40 },
      records: [{ responseId: 'sib-1', definitionVersion: '1.0.0', responseHash: SHA_1 }],
      valueDigest: SHA_2,
      none: false,
      pinned: false,
    };

    const port: DraftPort & DraftDefinitionResponsePort = {
      load: vi.fn(async () => (stored ? { status: 'loaded' as const, draft: stored } : { status: 'absent' as const })),
      save: vi.fn(async (input) => {
        rev += 1;
        stored = {
          revision: `rev-${rev}`,
          snapshotJson: input.snapshotJson,
          responseJson: input.responseJson,
          pins: {},
        };
        return { status: 'saved' as const, revision: stored.revision };
      }),
      readSummaries: vi.fn(async () => new Map()),
      selectDefinitionResponses: vi.fn(async () => {
        if (siblingOutcome.status !== 'available') {
          return {
            status: 'resolved' as const,
            outcomes: new Map([['sibling', siblingOutcome]]),
            missingPrerequisite: 'sibling',
          };
        }
        return {
          status: 'resolved' as const,
          outcomes: new Map([['sibling', siblingOutcome]]),
        };
      }),
    };

    const subject = { type: 'filing-unit', keys: { unitId: 'u-1' }, id: 'unit-id-1' };
    const engine = createFormEngine(definition, {
      responseSubject: { type: 'filing-unit', keys: { unitId: 'u-1' } },
      responseInstanceResolutions: {
        sibling: {
          value: { amount: 40 },
          records: [{ responseId: 'sib-1', definitionVersion: '1.0.0', responseHash: SHA_1 }],
          valueDigest: SHA_2,
          none: false,
          pinned: false,
        },
      },
    });
    disposers.push(() => engine.dispose());

    const writer = createDraftWriter({
      engine,
      port,
      key: { scope: 'scope-1', definitionUrl: definition.url, subject },
      definitionVersion: definition.version,
      responseId: 'resp-1',
      sections: [],
      actions: prepareAndSignDoc,
      debounceMs: 1000,
    });
    disposers.push(() => writer.dispose());

    engine.setValue('note', 'ready to prepare');

    // Sibling filing updates BEFORE Prepare, at the same consumer draft revision!
    siblingOutcome = {
      status: 'available',
      value: { amount: 75 },
      records: [{ responseId: 'sib-2', definitionVersion: '1.0.0', responseHash: SHA_3 }],
      valueDigest: SHA_3,
      none: false,
      pinned: false,
    };

    let preparedCandidate: FormResponse | undefined;
    const prepared = await writer.invoke({
      document: prepareAndSignDoc,
      actionRef: 'prepare',
      ports: {
        submit: (opts) => writer.captureActionResponse(opts),
        dispatchHostEvent: () => {},
        resolveIdempotencyKey: () => 'idem-prepare-1',
        dispatchEffect: (_effect, detail) => {
          preparedCandidate = detail.response;
          return { status: 'succeeded' as const };
        },
      },
    });

    expect(prepared.status).toBe('completed');
    // Prepare candidate must assemble resolvedInstances with the FRESH sibling delivery (75 -> total 85)!
    expect(preparedCandidate?.status).toBe('completed');
    expect(preparedCandidate?.data.total).toBe(85);
    expect(preparedCandidate?.resolvedInstances).toEqual([
      {
        instance: 'sibling',
        records: [{ responseId: 'sib-2', definitionVersion: '1.0.0', responseHash: SHA_3 }],
        valueDigest: SHA_3,
        none: false,
        pinned: false,
      },
    ]);
    // Editable DraftRecord.responseJson MUST remain in-progress, NEVER overwritten with the completed candidate!
    expect(stored).not.toBeNull();
    const persistedEditable = parseJsonExact(stored!.responseJson) as FormResponse;
    expect(persistedEditable.status).toBe('in-progress');

    // Now prerequisite becomes unavailable before Sign -> Sign MUST refuse!
    siblingOutcome = { status: 'unavailable', reason: 'missing prerequisite' };
    await expect(writer.invoke({
      document: prepareAndSignDoc,
      actionRef: 'sign',
      ports: {
        submit: (opts) => writer.captureActionResponse(opts),
        dispatchHostEvent: () => {},
        resolveIdempotencyKey: () => 'idem-sign-1',
        dispatchEffect: () => ({ status: 'succeeded' as const }),
      },
    })).rejects.toThrow(/sibling|unavailable/i);
  });

  it('delivers server-recorded at-open pins from DraftPort.load to createResponse without a local ResponseSelector', async () => {
    await initFormspecEngine();
    const pinnedDef: FormDefinition = {
      $formspec: '1.0',
      url: 'https://example.org/forms/pinned-create',
      version: '1.0.0',
      title: 'Pinned Create',
      subject: { type: 'filing-unit', keys: { unitId: { dataType: 'string' } } },
      instances: {
        prior: {
          response: {
            definition: { url: 'https://example.org/forms/prior', compatibleVersions: '>=1.0.0 <2.0.0' },
            subject: [{ key: 'unitId', op: 'eq', from: { subject: 'unitId' } }],
            status: 'completed',
            whenNone: 'unavailable',
            cardinality: 'latest',
            pin: 'at-open',
          },
          schema: { baseline: { dataType: 'integer' } },
        },
      },
      items: [
        {
          key: 'carriedBaseline',
          type: 'field',
          dataType: 'integer',
          label: 'Carried baseline',
          prePopulate: { instance: 'prior', path: 'baseline' },
        },
      ],
    };

    const serverPin = {
      value: { baseline: 321 },
      records: [{ responseId: 'prior-resp-1', definitionVersion: '1.0.0', responseHash: SHA_1 }],
      valueDigest: SHA_2,
      none: false,
      pinned: true,
    };

    const serverBackedPort: DraftPort = {
      load: vi.fn(async () => ({
        status: 'initialized' as const,
        revision: 'rev-init-1',
        pins: { prior: serverPin },
      })),
      save: vi.fn(async () => ({ status: 'saved' as const, revision: 'rev-saved-1' })),
      readSummaries: vi.fn(async () => new Map()),
    };

    const session = createDraftSession({
      port: serverBackedPort,
      scope: 'server-scope',
    });
    disposers.push(() => session.dispose());

    const acquired = session.acquire(
      { scope: 'server-scope', definitionUrl: pinnedDef.url, subject: { type: 'filing-unit', keys: { unitId: 'u-1' }, id: 'unit-id-1' } },
      {
        plan: { slotType: 'definition-form', status: 'ready', definition: pinnedDef } as never,
        grant: {} as never,
        route: { routeId: 'form', path: '/form', params: {} } as never,
        strings: ((k: string) => k) as never,
        responseActionsDocument: undefined,
        referencesDocuments: [],
        ontologyDocuments: [],
      },
      () => {},
    );
    disposers.push(() => acquired.release());

    const opened = await acquired.result;
    expect(opened.status).toBe('ready');
    if (opened.status !== 'ready') throw new Error(`Expected ready, got ${opened.status}`);
    // Server-recorded at-open pin reached createResponse (prePopulate) even with no local ResponseSelector!
    expect(opened.engine.signals.carriedBaseline.value).toBe(321);
    const completed = opened.engine.getResponse({ id: 'resp-pinned-1', profile: 'on-submit' });
    expect(completed.status).toBe('completed');
    expect(completed.resolvedInstances).toEqual([
      {
        instance: 'prior',
        records: [{ responseId: 'prior-resp-1', definitionVersion: '1.0.0', responseHash: SHA_1 }],
        valueDigest: SHA_2,
        none: false,
        pinned: true,
      },
    ]);
  });
});
