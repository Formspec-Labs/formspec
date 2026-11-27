/** @filedesc RED->GREEN tests for exact numeric and percentage rendering in draft and filed ResponseReview. */
import React, { act } from 'react';
import canonicalize from 'canonicalize';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import {
  createResponseReviewWidget,
  responseReviewHandoffHash,
} from '../src/widgets/response-review.js';
import { qualifyDraftReview } from '../src/internal/draft-review-qualification.js';
import type { SurfaceWidgetProps } from '../src/widget-api.js';

const handoffBytes = (response: unknown) =>
  new TextEncoder().encode(`formspec.response.handoff.v1\0${canonicalize(response)}`);

const copy = {
  heading: 'Review your answers',
  pending: 'Preparing review…',
  beforeSign: 'Review before signing.',
  beforeSubmit: 'Review before submitting.',
  acceptedRecord: 'Accepted filing record.',
  responseId: 'Response',
  draftVersion: 'Draft version',
  locale: 'Language',
  signatures: 'Signatures recorded',
  additionalAnswers: 'Additional answers',
  emptyString: 'Empty text',
  nullValue: 'No value',
  trueValue: 'True',
  falseValue: 'False',
  emptyArray: 'Empty list',
  emptyObject: 'Empty object',
  attachmentPending: 'Loading preview…',
  attachmentUnavailable: 'Preview unavailable.',
  attachmentFailed: 'Preview failed.',
  attachmentPreview: 'Attachment preview',
  attachmentDetails: 'Attachment details',
  retry: 'Retry',
  unavailable: 'Unavailable.',
};

const EXACT_PCT = '33.33333333333333333333333333';
const HIGH_PREC_DEC = '1.000000000000000000009';
const SMALL_PCT = '0.00005';
const SIX_DEC = '12.345678';
const UNSAFE_INT = '9007199254740993';

const definition = {
  $formspec: '1.0',
  url: 'urn:test:exact-review-numbers',
  version: '1.0.0',
  items: [
    { key: 'exactPct', type: 'field', dataType: 'decimal', suffix: '%', label: 'Exact Share' },
    { key: 'smallPct', type: 'field', dataType: 'decimal', suffix: '%', label: 'Small Share' },
    { key: 'sixDec', type: 'field', dataType: 'decimal', label: 'Six Decimals' },
    { key: 'highPrec', type: 'field', dataType: 'decimal', label: 'High Precision Decimal' },
    { key: 'unsafeInt', type: 'field', dataType: 'integer', label: 'Large Sequence Count' },
    { key: 'zeroPct', type: 'field', dataType: 'decimal', suffix: '%', label: 'Zero Share' },
    { key: 'rawMoney', type: 'field', dataType: 'money', label: 'Exact Monetary Amount' },
    { key: 'currencyDecimal', type: 'field', dataType: 'decimal', prefix: '$', label: 'Exact Currency Decimal' },
  ],
};

function makeResponse() {
  return parseJsonExact(JSON.stringify({
    $formspecResponse: '1.0',
    id: 'resp-exact-1',
    definitionUrl: definition.url,
    definitionVersion: definition.version,
    status: 'completed',
    authored: '2026-10-06T12:00:00Z',
    displayedLocale: { locale: 'en' },
    authoredSignatures: [{ id: 'sig-1' }],
    data: {
      exactPct: JSON.rawJSON(EXACT_PCT),
      smallPct: 0.00005,
      sixDec: 12.345678,
      highPrec: JSON.rawJSON(HIGH_PREC_DEC),
      unsafeInt: JSON.rawJSON(UNSAFE_INT),
      zeroPct: 0,
      rawMoney: { amount: JSON.rawJSON(HIGH_PREC_DEC), currency: 'USD' },
      currencyDecimal: JSON.rawJSON(HIGH_PREC_DEC),
    },
  })) as Record<string, unknown>;
}

const fields = {
  exactPct: { label: 'Exact Share' },
  smallPct: { label: 'Small Share' },
  sixDec: { label: 'Six Decimals' },
  highPrec: { label: 'High Precision Decimal' },
  unsafeInt: { label: 'Large Sequence Count' },
  zeroPct: { label: 'Zero Share' },
  rawMoney: { label: 'Exact Monetary Amount' },
  currencyDecimal: { label: 'Exact Currency Decimal' },
};

async function mountReview(phase: 'draft-review' | 'before-sign' | 'before-submit' | 'accepted-record') {
  const response = makeResponse();
  const presentation =
    phase === 'draft-review'
      ? { phase, revision: 'rev-1', locale: 'en', fields }
      : phase === 'accepted-record'
        ? {
            phase,
            responseHash: await responseReviewHandoffHash(response, handoffBytes),
            definitionUrl: definition.url,
            definitionVersion: definition.version,
            locale: 'en',
            handoffId: 'handoff-1',
            fields,
          }
        : {
            phase,
            responseHash: await responseReviewHandoffHash(response, handoffBytes),
            definitionUrl: definition.url,
            definitionVersion: definition.version,
            locale: 'en',
            actorRef: 'actor-1',
            draft: { id: 'draft-1', version: 1 },
            fields,
          };

  const data: Record<string, unknown> = { definition, response, presentation };
  if (phase === 'draft-review') {
    qualifyDraftReview(data, new Set());
  }

  const props: SurfaceWidgetProps = {
    moduleId: 'x-starter',
    widgetName: phase === 'accepted-record' ? 'AcceptedResponseReview' : 'ResponseReview',
    slot: { id: 'review' },
    route: { surfaceId: 'surface', routeId: 'review', params: {} },
    headingLevel: 2,
    admitsTenantTheme: false,
    config: { copy: { en: copy } },
    data,
    emitAction: vi.fn(),
  };

  const Widget = createResponseReviewWidget({ canonicalResponseHandoffBytes: handoffBytes });
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(<Widget {...props} />);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await vi.waitFor(() => {
    expect(el.querySelector('.fs-response-review')).not.toBeNull();
  });
  return {
    el,
    unmount() {
      act(() => root.unmount());
      el.remove();
    },
  };
}

describe('ResponseReview exact numeric and percentage display across draft and filed phases', () => {
  it.each([
    'draft-review',
    'before-sign',
    'before-submit',
    'accepted-record',
  ] as const)('renders exact percentages, high-precision decimals, unsafe integers, and money without rounding or JSON <pre> in %s', async (phase) => {
    const view = await mountReview(phase);
    try {
      expect(view.el.querySelector('[data-response-path="exactPct"] dd')?.textContent).toBe(`${EXACT_PCT}%`);
      expect(view.el.querySelector('[data-response-path="smallPct"] dd')?.textContent).toBe(`${SMALL_PCT}%`);
      expect(view.el.querySelector('[data-response-path="sixDec"] dd')?.textContent).toBe(SIX_DEC);
      expect(view.el.querySelector('[data-response-path="highPrec"] dd')?.textContent).toBe(HIGH_PREC_DEC);
      expect(view.el.querySelector('[data-response-path="unsafeInt"] dd')?.textContent).toBe('9,007,199,254,740,993');
      expect(view.el.querySelector('[data-response-path="zeroPct"] dd')?.textContent).toBe('0%');
      expect(view.el.querySelector('[data-response-path="rawMoney"] dd')?.textContent).toBe(`$${HIGH_PREC_DEC}`);
      expect(view.el.querySelector('[data-response-path="currencyDecimal"] dd')?.textContent).toBe(`$${HIGH_PREC_DEC}`);

      // None of the scalar numeric/percentage fields should fall back to raw JSON <pre>.
      expect(view.el.querySelectorAll('pre.fs-response-review-json')).toHaveLength(0);
    } finally {
      view.unmount();
    }
  });
});
