/** @filedesc DefaultValidationProfileResolver maps closed VM validation profiles to engine triggers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DefaultValidationProfileResolver } from '../dist/index.js';

test('DefaultValidationProfileResolver maps every validation profile to an engine trigger', () => {
  const resolver = new DefaultValidationProfileResolver();

  assert.equal(resolver.resolve('off'), 'disabled');
  assert.equal(resolver.resolve('on-submit'), 'submit');
  assert.equal(resolver.resolve('on-demand'), 'demand');
  assert.equal(resolver.resolve('live'), 'continuous');
});

test('DefaultValidationProfileResolver rejects unknown profiles', () => {
  const resolver = new DefaultValidationProfileResolver();

  assert.throws(
    () => resolver.resolve('bogus'),
    /unknown validation profile/i,
  );
});
