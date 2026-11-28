/** @filedesc Check Core subject identity vectors against integrity-stack canonical JSON. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalJsonBytes } from '@formspec-org/integrity-canonical';
import { expect, test } from 'vitest';

const fixture = JSON.parse(readFileSync(new URL(
  '../../../tests/conformance/fixtures/subject-id/vectors.json', import.meta.url,
), 'utf8'));

test.each(fixture.vectors)('$name uses the pinned domain-separated subject id', ({ type, keys, id }) => {
  expect(fixture.domain).toBe('formspec.subject.id.v1');
  const digest = createHash('sha256')
    .update(fixture.domain + '\0', 'utf8')
    .update(canonicalJsonBytes({ type, keys }))
    .digest('hex');
  expect(digest).toBe(id);
  expect(id).toMatch(/^[0-9a-f]{64}$/);
});

test('Response schema example and retained-read fixture use the matching subject id', () => {
  const expected = fixture.vectors.find((vector) => vector.name === 'org-period');
  const response = JSON.parse(readFileSync(new URL(
    '../../../tests/fixtures/response-selection/valid-resolved-instances.response.json', import.meta.url,
  ), 'utf8'));
  const schema = JSON.parse(readFileSync(new URL('../../../schemas/response.schema.json', import.meta.url), 'utf8'));
  for (const subject of [response.subject, schema.properties.subject.examples.find((example) => example.keys)]) {
    expect(subject).toEqual({ id: expected.id, type: expected.type, keys: expected.keys });
  }
});
