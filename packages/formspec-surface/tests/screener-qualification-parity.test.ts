/** @filedesc The same bounded qualification cases run against Rust and JavaScript. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveScreenerDetermination } from '../src/screener-slot.js';
const fixtures = JSON.parse(readFileSync(new URL('../../../tests/fixtures/screener-qualification.json', import.meta.url), 'utf8'));
describe('shared native/JavaScript Screener qualification', () => {
  for (const test of fixtures.cases) it(test.id, () => {
    const input = structuredClone(fixtures.base);
    for (const patch of test.patches) {
      const keys = patch.path.slice(1).split('/');
      const key = keys.pop()!;
      const parent = keys.reduce((value: any, key: string) => value[key], input);
      parent[key] = structuredClone(patch.value);
    }
    expect(resolveScreenerDetermination(input)).toEqual(test.expected);
  });
});
