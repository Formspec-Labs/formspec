/** @filedesc Draft review & acknowledgement tests for hidden non-relevant answers (`fs-2cbq`). */
import { describe, expect, it } from 'vitest';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { HIDDEN_ANSWERS_OMITTED_CODE } from '@formspec-org/layout';
import type { DraftReviewPlan } from '@formspec-org/surface';
import type { FormDefinition } from '@formspec-org/types';
import { createMemoryFilingStore } from '../src/browser-draft-port.js';
import { createDraftSession } from '../src/draft-session.js';
import { loadDraftReviewInputs } from '../src/draft-review.js';

const definition: FormDefinition = {
  $formspec: '1.0',
  url: 'https://example.org/forms/hidden-review',
  version: '1.0.0',
  title: 'Hidden Answer Review',
  nonRelevantBehavior: 'remove',
  items: [
    { key: 'showExtra', type: 'field', dataType: 'boolean', label: 'Include extra details' },
    { key: 'extraNote', type: 'field', dataType: 'string', label: 'Extra note' },
    { key: 'extraCode', type: 'field', dataType: 'string', label: 'Extra code' },
    { key: 'summary', type: 'field', dataType: 'string', label: 'Summary' },
  ],
  binds: [
    { path: 'extraNote', relevant: '$showExtra = true' },
    { path: 'extraCode', relevant: '$showExtra = true' },
  ],
};

const reviewPlan: DraftReviewPlan = {
  status: 'resolved',
  definition,
  formRouteId: 'form',
  formSlotId: 'main',
  formHref: '/form',
  sections: [{ id: 'main', label: 'Details', fields: ['showExtra', 'extraNote', 'extraCode', 'summary'], href: '/form' }],
};

const site = { surfaceRef: 'urn:example:surface', routeId: 'review', slotId: 'review-slot' };

describe('draft review hidden-answer grouped acknowledgement (fs-2cbq)', () => {
  it('lists held non-relevant paths from editable snapshot, acknowledges once, invalidates on change, and omits from filed Response', async () => {
    await initFormspecEngine();
    const store = createMemoryFilingStore({
      scope: 'test-scope',
      definitions: new Map([[definition.url, definition]]),
    });
    const session = createDraftSession({
      port: store.drafts,
      responses: store.responses,
      definitions: new Map([[definition.url, definition]]),
      scope: 'test-scope',
      author: { id: 'filer-1', name: 'Alex Filer' },
    });

    try {
      // Simulate respondent answering extraNote + extraCode, then hiding them and saving draft.
      const engine = createFormEngine(definition);
      engine.setValue('summary', 'Main summary');
      engine.setValue('showExtra', true);
      engine.setValue('extraNote', 'hidden detail');
      engine.setValue('extraCode', 'CODE-42');
      engine.setValue('showExtra', false);

      const snapshot = engine.getDraftSnapshot();
      const filteredResponse = engine.getResponse({ id: 'draft-hidden-1', profile: 'off' });
      expect(filteredResponse.data).not.toHaveProperty('extraNote');
      expect(filteredResponse.data).not.toHaveProperty('extraCode');
      expect(snapshot.data).toMatchObject({ extraNote: 'hidden detail', extraCode: 'CODE-42' });

      const key = { scope: 'test-scope', definitionUrl: definition.url };
      const saved = await store.drafts.save({
        key,
        definitionVersion: definition.version,
        expectedRevision: null,
        snapshotJson: JSON.stringify(snapshot),
        responseJson: JSON.stringify(filteredResponse),
        summary: null,
      });
      expect(saved.status).toBe('saved');
      engine.dispose();

      // Review step reads committed draft + editable snapshot and surfaces HIDDEN_ANSWERS_OMITTED.
      const initialReview = await loadDraftReviewInputs(reviewPlan, {
        session,
        site,
        signal: new AbortController().signal,
        localeDocuments: [],
        activeLocale: 'en',
      });
      expect(initialReview.status).toBe('ready');
      if (initialReview.status !== 'ready') return;
      expect(initialReview.warningGroups).toHaveLength(1);
      const group = initialReview.warningGroups[0]!;
      expect(group.code).toBe(HIDDEN_ANSWERS_OMITTED_CODE);
      expect(group.current).toBe(false);
      expect(group.items.map(i => i.path)).toEqual(['extraCode', 'extraNote']);
      expect(group.buttonLabel).toContain('Acknowledge');
      expect(initialReview.validationSummary?.toCheck).toBe(1);

      // Filing before acknowledgement is refused by the preview store.
      const unackedEngine = createFormEngine(definition, { draftSnapshot: snapshot });
      const unackedSubmit = unackedEngine.getResponseSnapshot({ id: 'draft-hidden-1', profile: 'on-submit' });
      expect(unackedSubmit.validationReport?.valid).toBe(false);
      expect(unackedSubmit.response.status).toBe('in-progress');
      unackedEngine.dispose();

      // Acknowledge the group once through the draft session.
      const ackOutcome = await session.acknowledgeWarningGroup({
        definition,
        subject: undefined,
        expectedRevision: initialReview.revision,
        expectedBasis: group.basis!,
        code: HIDDEN_ANSWERS_OMITTED_CODE,
      });
      expect(ackOutcome).toBe('saved');

      // Reload review: group is now current and toCheck is 0.
      const ackedReview = await loadDraftReviewInputs(reviewPlan, {
        session,
        site,
        signal: new AbortController().signal,
        localeDocuments: [],
        activeLocale: 'en',
      });
      expect(ackedReview.status).toBe('ready');
      if (ackedReview.status !== 'ready') return;
      expect(ackedReview.warningGroups).toHaveLength(1);
      expect(ackedReview.warningGroups[0]!.current).toBe(true);
      expect(ackedReview.validationSummary?.toCheck ?? 0).toBe(0);

      // Resuming the saved draft preserves hidden answers on unhide AND emits clean filed Response omitting them.
      const committed = await session.readCommitted(definition, undefined);
      expect(committed.status).toBe('loaded');
      if (committed.status !== 'loaded') return;
      expect(committed.draftSnapshot?.data).toMatchObject({ extraNote: 'hidden detail', extraCode: 'CODE-42' });

      const filingEngine = createFormEngine(definition, {
        draftSnapshot: committed.draftSnapshot,
        savedExplanations: committed.response.explanations,
      });
      const candidate = filingEngine.getResponseSnapshot({ id: 'draft-hidden-1', profile: 'on-submit' });
      expect(candidate.validationReport?.valid).toBe(true);
      expect(candidate.response.status).toBe('completed');
      expect(candidate.response.data).not.toHaveProperty('extraNote');
      expect(candidate.response.data).not.toHaveProperty('extraCode');
      expect(candidate.response.explanations?.some(e => 'group' in e && e.code === HIDDEN_ANSWERS_OMITTED_CODE)).toBe(true);

      // Unhiding restores the retained answers verbatim.
      filingEngine.setValue('showExtra', true);
      expect(filingEngine.signals.extraNote.value).toBe('hidden detail');
      expect(filingEngine.signals.extraCode.value).toBe('CODE-42');
      filingEngine.dispose();
    } finally {
      session.dispose();
    }
  });
});
