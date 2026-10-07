/** @filedesc Typed host revision hints and source-scoped failures. */
import { describe, expect, it } from 'vitest';
import type { DataSourceLoadRequest } from '@formspec-org/surface';
import { selectDataSourceRevisions } from '../src/data-source-revision.js';

const request = (sourceRef: string) => ({ descriptor: { catalogRef: 'urn:catalog', sourceRef },
  context: { slotId: 'slot' } }) as DataSourceLoadRequest;

describe('data-source revision scheduling', () => {
  it('distinguishes undefined, strings and finite numbers without admitting data', () => {
    const requests = [request('source')];
    const keys = [undefined, '1', 1, '', 0].map(value =>
      selectDataSourceRevisions(requests, () => value).key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(selectDataSourceRevisions(requests, undefined)).toEqual({ key: '', failures: [] });
  });
  it.each([NaN, Infinity, -Infinity, null, {}, true])('refuses invalid hint %s', value => {
    const input = request('invalid');
    expect(selectDataSourceRevisions([input], () => value as never).failures).toEqual([input]);
  });
  it('isolates exceptions to their qualified sources and still reads other hints', () => {
    const inputs = [request('throws'), request('valid')];
    const visited: string[] = [];
    const result = selectDataSourceRevisions(inputs, input => {
      visited.push(input.descriptor.sourceRef);
      if (input.descriptor.sourceRef === 'throws') throw new Error('private-host-detail');
      return 4;
    });
    expect(visited).toEqual(['throws', 'valid']);
    expect(result.failures).toEqual([inputs[0]]);
    expect(result.key).not.toContain('private-host-detail');
  });
});
