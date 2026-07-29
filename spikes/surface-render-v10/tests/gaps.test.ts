import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CORRECTED_GAPS,
  GAP_LEDGER,
  IMPLEMENTED_GAPS,
  OPEN_GAPS,
  RESOLVED_GAPS,
  SPLIT_GAPS,
  gapLedgerErrors,
  type GapEntry,
} from '../src/gaps.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function rawSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('the canonical ledger has valid evidence and truthful disposition counts', () => {
  assert.deepEqual(gapLedgerErrors(), []);
  assert.equal(
    OPEN_GAPS.length + IMPLEMENTED_GAPS.length + CORRECTED_GAPS.length + SPLIT_GAPS.length,
    GAP_LEDGER.length,
  );
  assert.equal(RESOLVED_GAPS.length, IMPLEMENTED_GAPS.length + CORRECTED_GAPS.length);
  assert.equal(RESOLVED_GAPS.some((entry) => entry.disposition === 'split'), false);
});

test('no-runtime-state remains a split parent while leaf children carry independent dispositions', () => {
  const parent = GAP_LEDGER.find((entry) => entry.id === 'no-runtime-state');
  assert.equal(parent?.disposition, 'split');
  if (parent?.disposition !== 'split') assert.fail('no-runtime-state must be split');

  assert.deepEqual(parent.childIds, [
    'respondent-runtime-state',
    'operator-runtime-state',
    'public-signer-ceremony',
  ]);

  const expectedChildren = new Map([
    ['respondent-runtime-state', { tracker: 'fs-q1ex', disposition: 'implemented' }],
    ['operator-runtime-state', { tracker: 'fs-3b30', disposition: undefined }],
    ['public-signer-ceremony', { tracker: 'fs-5g59', disposition: undefined }],
  ]);
  for (const [childId, expected] of expectedChildren) {
    const child = GAP_LEDGER.find((entry) => entry.id === childId);
    assert.equal(child?.disposition, expected.disposition);
    assert.equal(child?.tracker, expected.tracker);
  }
});

test('previously untracked vNext and signing findings carry truthful dispositions', () => {
  const openIds = new Set(OPEN_GAPS.map((entry) => entry.id));
  const implementedIds = new Set(IMPLEMENTED_GAPS.map((entry) => entry.id));
  for (const id of [
    'app-entry-surface-undeclared',
    'widget-action-output-undeclared',
    'bundle-publishing-trust-and-rollback',
  ]) {
    assert.equal(implementedIds.has(id), true, `${id} must be implemented`);
  }
  assert.equal(implementedIds.has('locale-app-integration'), true);
});

test('split validation rejects a missing child or another split parent', () => {
  const withBadChildren: readonly GapEntry[] = GAP_LEDGER.map((entry) =>
    entry.id === 'no-runtime-state' && entry.disposition === 'split'
      ? {
          ...entry,
          childIds: ['missing-child', 'no-runtime-state'],
        }
      : entry,
  );

  assert.deepEqual(gapLedgerErrors(withBadChildren), [
    'no-runtime-state.childIds names missing gap "missing-child".',
    'no-runtime-state.childIds names "no-runtime-state", which is not a leaf.',
  ]);
});

test('current signature evidence follows live inputs without rewriting the frozen run', () => {
  const historical = resolve(ROOT, 'evidence/signature-verification.json');
  assert.equal(
    rawSha256(historical),
    'd5826a1b4c92bb95e4f3211802f349fd22863265445edc5a50fad5dfdd962029',
  );

  const current = JSON.parse(
    readFileSync(
      resolve(ROOT, 'evidence/signature-verification-current.json'),
      'utf8',
    ),
  ) as {
    inputRawSha256: {
      bundle: string;
      signature: string;
      methodRegistry: string;
    };
    cleanExport: {
      signatureResult: string;
      digestMatches: boolean;
      recomputedDigest: string;
      claimedDigest: string;
    };
    falsification: { signatureResult: string; digestMatches: boolean };
  };

  assert.equal(
    current.inputRawSha256.bundle,
    rawSha256(
      resolve(
        ROOT,
        '../lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json',
      ),
    ),
  );
  assert.equal(
    current.inputRawSha256.signature,
    rawSha256(
      resolve(
        ROOT,
        '../lifecycle-demo-v10/evidence/stage-4-signoff.authored-signature.json',
      ),
    ),
  );
  assert.equal(
    current.inputRawSha256.methodRegistry,
    rawSha256(
      resolve(ROOT, '../../registries/signature-method-registry.json'),
    ),
  );
  assert.equal(current.cleanExport.signatureResult, 'verified');
  assert.equal(current.cleanExport.digestMatches, true);
  assert.equal(
    current.cleanExport.recomputedDigest,
    current.cleanExport.claimedDigest,
  );
  assert.equal(current.falsification.signatureResult, 'failed');
  assert.equal(current.falsification.digestMatches, false);
});
