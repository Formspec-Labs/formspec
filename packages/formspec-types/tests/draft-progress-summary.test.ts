import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { expect, it } from 'vitest';
import { counts, summary } from './typecheck/draft-progress-summary.js';

it('admits only advisory counts and readiness, including unknown readiness', () => {
  const schema = JSON.parse(readFileSync(new URL('../../../schemas/draft-progress-summary.schema.json', import.meta.url), 'utf8'));
  const validate = new Ajv2020().compile(schema);
  expect(validate(summary)).toBe(true);
  expect(validate({ ...summary, form: { ...counts, ready: false }, sections: {} })).toBe(true);
  for (const invalid of [
    { ...summary, answers: {} },
    { ...summary, form: counts },
    { ...summary, form: { ...summary.form, filled: -1 } },
    { ...summary, form: { ...summary.form, findings: ['field details'] } },
    { ...summary, sections: { contact: { ...counts, total: 1.5 } } },
    { ...summary, sections: { contact: { ...counts, ready: true } } },
    { ...summary, sections: { contact: { ...counts, answer: 'private' } } },
  ]) expect(validate(invalid)).toBe(false);
});
