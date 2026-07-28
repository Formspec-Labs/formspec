/** @filedesc Verification verdict mapping and the host render-permission matrix. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalVerificationVerdict,
  hostMayRenderBundle,
} from '../src/verification-gate.ts';

test('maps the adapter unsupported result to the canonical unverified verdict', () => {
  assert.equal(canonicalVerificationVerdict('verified'), 'verified');
  assert.equal(canonicalVerificationVerdict('failed'), 'failed');
  assert.equal(canonicalVerificationVerdict('unsupported'), 'unverified');
});

test('gates signed exports and unsigned authoring previews explicitly', () => {
  const cases = [
    {
      name: 'verified signed export',
      input: { deployment: 'verifying', signed: true, verdict: 'verified' },
      renders: true,
    },
    {
      name: 'failed signed export',
      input: { deployment: 'verifying', signed: true, verdict: 'failed' },
      renders: false,
    },
    {
      name: 'signed export the deployment cannot verify',
      input: { deployment: 'verifying', signed: true, verdict: 'unverified' },
      renders: false,
    },
    {
      name: 'unsigned authoring preview with an explicit verdict',
      input: { deployment: 'authoring-preview', signed: false, verdict: 'unverified' },
      renders: true,
    },
    {
      name: 'unsigned input in a verifying deployment',
      input: { deployment: 'verifying', signed: false, verdict: 'unverified' },
      renders: false,
    },
  ] as const;

  for (const entry of cases) {
    assert.equal(hostMayRenderBundle(entry.input), entry.renders, entry.name);
  }
});
