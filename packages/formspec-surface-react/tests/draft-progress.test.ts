/** @filedesc Real-engine progress counts each owed warning follow-up once, in both validation profiles. */
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { resolvePageSequence, summarizeFormProgress } from '@formspec-org/layout';
import type { FormDefinition } from '@formspec-org/types';
import { beforeAll, expect, it, vi } from 'vitest';
import { readSubmitEvaluation, summarizeDraftProgress } from '../src/draft-progress.js';

beforeAll(async () => { await initFormspecEngine(); });

const definition = {
  $formspec: '1.0', url: 'https://example.test/follow-ups', version: '1.0.0', title: 'Follow-ups',
  warningExplanation: 'acknowledge',
  items: [
    { key: 'one', type: 'group', label: 'One', children: [
      { key: 'first', type: 'field', dataType: 'string', label: 'First' },
      { key: 'second', type: 'field', dataType: 'string', label: 'Second' },
    ] },
    { key: 'two', type: 'group', label: 'Two', children: [
      { key: 'amount', type: 'field', dataType: 'integer', label: 'Amount' },
    ] },
  ],
  shapes: [
    { id: 'blankFirst', target: 'one.first', severity: 'warning', timing: 'submit', code: 'UNANSWERED', constraint: 'present($)', message: 'First is unanswered.' },
    { id: 'blankSecond', target: 'one.second', severity: 'warning', timing: 'submit', code: 'UNANSWERED', constraint: 'present($)', message: 'Second is unanswered.' },
    { id: 'largeAmount', target: 'two.amount', severity: 'warning', explanation: 'explain', code: 'LARGE_AMOUNT', constraint: 'empty($) or $ < 100', message: 'Amount is unusually large.' },
  ],
} as unknown as FormDefinition;
const sections = resolvePageSequence(definition);

type Engine = ReturnType<typeof createFormEngine>;

/**
 * The tracker summarizes the Submit profile; the workspace summarizes the live profile, which omits
 * Submit-timing Shapes. With the explanation state both must count the same owed answers.
 */
function progress(engine: Engine) {
  const counts = (profile: 'on-submit' | 'live') => {
    const { form, sections: bySection } = summarizeFormProgress(
      sections, engine.getEvaluatedFormState({ profile }), engine.getExplanationState(),
    );
    return {
      toFix: form.toFix, toCheck: form.toCheck, ready: form.ready,
      sections: Object.fromEntries(bySection.map(({ id, counts }) => [id, counts.toCheck])),
    };
  };
  const submit = counts('on-submit');
  expect(counts('live')).toEqual(submit);
  return submit;
}

function withEngine(form: FormDefinition, run: (engine: Engine) => void) {
  const engine = createFormEngine(form);
  try { run(engine); } finally { engine.dispose(); }
}

it('counts one owed group acknowledgement, none once accepted, and one again when it goes stale', () => withEngine(definition, engine => {
  // Two blank answers share one code: the respondent owes one acknowledgement, answered for the whole form.
  expect(progress(engine)).toEqual({ toFix: 0, toCheck: 1, ready: false, sections: { one: 0, two: 0 } });

  engine.acknowledge('UNANSWERED');
  expect(progress(engine)).toEqual({ toFix: 0, toCheck: 0, ready: true, sections: { one: 0, two: 0 } });

  // Answering one question changes what the acknowledgement covered, so it is owed again.
  engine.setValue('one.first', 'Now answered');
  expect(progress(engine)).toEqual({ toFix: 0, toCheck: 1, ready: false, sections: { one: 0, two: 0 } });

  engine.acknowledge('UNANSWERED');
  expect(progress(engine)).toEqual({ toFix: 0, toCheck: 0, ready: true, sections: { one: 0, two: 0 } });
}));

it('counts one owed instance explanation in its section, none once explained, and one again when its value changes', () => withEngine(definition, engine => {
  engine.setValue('one.first', 'Answered');
  engine.setValue('one.second', 'Answered');
  engine.setValue('two.amount', 500);
  expect(progress(engine)).toEqual({ toFix: 0, toCheck: 1, ready: false, sections: { one: 0, two: 1 } });

  engine.setExplanation('largeAmount', 'two.amount', { text: 'A one-time equipment purchase.' });
  expect(progress(engine)).toEqual({ toFix: 0, toCheck: 0, ready: true, sections: { one: 0, two: 0 } });

  // The explanation answered 500. A different amount needs a new one.
  engine.setValue('two.amount', 600);
  expect(progress(engine)).toEqual({ toFix: 0, toCheck: 1, ready: false, sections: { one: 0, two: 1 } });
}));

// Core §5.2.1 says Shapes sharing an acknowledge code are all acknowledge-mode, but nothing enforces it,
// and every Shape without a code reports SHAPE_FAILED. An acknowledgement covers only its own firings.
it('keeps counting a none-mode warning that shares the code of an accepted group', () => withEngine({
  $formspec: '1.0', url: 'https://example.test/mixed-modes', version: '1.0.0', title: 'Mixed modes',
  warningExplanation: 'acknowledge',
  items: [
    { key: 'first', type: 'field', dataType: 'string', label: 'First' },
    { key: 'second', type: 'field', dataType: 'string', label: 'Second' },
  ],
  shapes: [
    { id: 'blankFirst', target: 'first', severity: 'warning', constraint: 'present($)', message: 'First is unanswered.' },
    { id: 'blankSecond', target: 'second', severity: 'warning', explanation: 'none', constraint: 'present($)', message: 'Second is unanswered.' },
  ],
} as unknown as FormDefinition, engine => {
  const group = engine.getExplanationState().groups;
  expect(group.map(({ code, shapeIds, paths }) => ({ code, shapeIds, paths })))
    .toEqual([{ code: 'SHAPE_FAILED', shapeIds: ['blankFirst'], paths: ['first'] }]);
  // One acknowledgement is owed, and the none-mode warning is a separate thing to check.
  expect(progress(engine)).toMatchObject({ toCheck: 2, ready: false });

  engine.acknowledge('SHAPE_FAILED');
  expect(progress(engine)).toMatchObject({ toCheck: 1, ready: true });
}));

it('readSubmitEvaluation uses a single Submit evaluation via engine.getSubmitEvaluation()', () => withEngine(definition, engine => {
  const submitSpy = vi.spyOn(engine, 'getSubmitEvaluation');
  const evaluatedSpy = vi.spyOn(engine, 'getEvaluatedFormState');
  const explanationSpy = vi.spyOn(engine, 'getExplanationState');

  const combined = readSubmitEvaluation(engine);
  expect(submitSpy).toHaveBeenCalledTimes(1);
  expect(evaluatedSpy).not.toHaveBeenCalled();
  expect(explanationSpy).not.toHaveBeenCalled();

  const summary = summarizeDraftProgress(sections, combined);
  expect({ toFix: summary.form.toFix, toCheck: summary.form.toCheck, ready: summary.form.ready })
    .toEqual({ toFix: 0, toCheck: 1, ready: false });
}));
