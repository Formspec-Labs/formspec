/** @filedesc Verifies zero exact JSON payload parses during cold overview readSummaries on direct and prepared fixture paths. */
import { expect, it, vi } from 'vitest';

vi.mock('@formspec-org/integrity-canonical', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@formspec-org/integrity-canonical')>();
  return {
    ...actual,
    parseJsonExact: vi.fn(actual.parseJsonExact),
  };
});

import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { dereferenceBundleExport, validateSurfacePreviewScenario } from '@formspec-org/surface';
import type { FormDefinition } from '@formspec-org/types';
import { createMemoryFilingStore, previewResponseRecordTools } from '../src/browser-draft-port.js';

const scope = 'edition-cold';
const version = '1.0.0';
const plan = 'urn:test:cold-plan';
const period = { start_year: 2024, end_year: 2026 };
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

it.each(['direct', 'prepared'] as const)(
  'performs zero exact payload parses during immediate cold readSummaries (%s fixtures)',
  async (mode) => {
    const tools = await previewResponseRecordTools();
    const response = JSON.stringify({
      $formspecResponse: '1.0',
      definitionUrl: plan,
      definitionVersion: version,
      id: `urn:cold:${mode}`,
      status: 'completed',
      authored: '2026-01-01T00:00:00Z',
      subject: { id: tools.subjectId(plan, period), type: plan, keys: period },
      data: { answer: 'cold-fixture-secret' },
    }, null, 2) + '\n';

    let store: ReturnType<typeof createMemoryFilingStore>;
    if (mode === 'direct') {
      store = createMemoryFilingStore({
        scope,
        definitions,
        fixtures: { filings: [{ responseJson: response }] },
      });
    } else {
      const bundle = dereferenceBundleExport({
        manifest: { $formspecBundle: '2.4', id: 'urn:cold-app', surfaces: [{ url: 'urn:surface' }], definitions: [{ url: plan, version }] },
        documents: {
          'urn:surface': { $formspecSurface: '0.4', id: 'app', entry: 'home', routes: [{ id: 'home', path: '/', slots: [] }] },
          [plan]: planDef,
        },
      });
      const admitted = await validateSurfacePreviewScenario({
        bundle,
        scope,
        responseTools: tools,
        scenario: {
          $formspecSurfaceScenario: '0.1',
          version: '1.0.0',
          initialPath: '/',
          defaultProfile: 'local',
          profiles: { local: { authorization: { default: 'authorized' }, sources: [], filings: [{ responseJson: response }] } },
          actions: { default: { status: 'complete' } },
        },
      });
      expect(admitted.valid).toBe(true);
      if (!admitted.valid) throw new Error('expected valid scenario');
      store = createMemoryFilingStore({
        scope,
        definitions,
        preparedFixtures: admitted.preparedFixtures?.get('local'),
      });
    }

    vi.mocked(parseJsonExact).mockClear();
    const summary = await store.drafts.readSummaries([query], {
      previewScope: scope,
      signal: new AbortController().signal,
    });
    expect(summary.get('plan:2025')).toMatchObject({
      subjectMatch: 'matched',
      filing: { status: 'filed', receiptRef: `urn:cold:${mode}` },
    });
    const rawParses = vi.mocked(parseJsonExact).mock.calls.filter(
      ([text]) => typeof text === 'string' && text.includes('cold-fixture-secret'),
    );
    expect(rawParses).toHaveLength(0);
  },
);
