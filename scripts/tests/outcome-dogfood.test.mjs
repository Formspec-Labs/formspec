/** @filedesc Exercise v12 Outcome Verification graph and Bind refusals. */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { sha256Digest } from '@formspec-org/outcome-verification';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = join(repoRoot, 'spikes/surface-v12-saas-v1-dogfood/artifacts');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function runWithDefinition(t, changeDefinition) {
  const directory = await mkdtemp(join(tmpdir(), 'formspec-outcome-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runSet = await readJson(join(artifacts, 'outcome-run-set.json'));
  const previewSet = await readJson(join(artifacts, runSet.previewSet));
  const entry = runSet.cases.find(
    ({ path }) => path === 'outcome-cases/organization-empty-is-blocked.case.json'
  );
  const outcomeCase = await readJson(join(artifacts, entry.path));
  const { subject } = outcomeCase.expectedObservations.find(
    ({ kind }) => kind === 'validation-report'
  );
  const preview = Object.values(previewSet.previews).find(
    ({ bundle }) => bundle.manifest.id === outcomeCase.app.id &&
      bundle.manifest.version === outcomeCase.app.version
  );
  const definition = preview.bundle.documents[subject.artifactRef];
  assert.equal(await sha256Digest(definition), subject.artifactDigest);
  changeDefinition(definition, subject.subjectRef, outcomeCase.need);
  const definitionDigest = await sha256Digest(definition);
  const updatedCase = JSON.parse(JSON.stringify(outcomeCase).replaceAll(
    subject.artifactDigest,
    definitionDigest
  ));
  runSet.cases = [{
    ...entry,
    path: 'case.json',
    digest: await sha256Digest(updatedCase),
  }];
  runSet.needsDocuments = runSet.needsDocuments.map((path) => join(artifacts, path));
  const runSetPath = join(directory, 'outcome-run-set.json');
  await Promise.all([
    writeFile(join(directory, 'case.json'), JSON.stringify(updatedCase)),
    writeFile(join(directory, runSet.previewSet), JSON.stringify(previewSet)),
    writeFile(runSetPath, JSON.stringify(runSet)),
  ]);

  const result = spawnSync('npm', ['run', 'check:outcome-dogfood', '--', runSetPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.ifError(result.error);
  return { ...result, subject };
}

test('refuses duplicate item keys before deriving Need traces', async (t) => {
  const { status, stderr } = await runWithDefinition(t, (definition, path, need) => {
    const duplicate = structuredClone(definition.items.find(({ key }) => key === path));
    // Trace validation would report this stale pin if it ran after document lint failed.
    duplicate['x-generation'] = { anchors: [`need:${need.id}@${need.revision + 1}`] };
    definition.items.push(duplicate);
  });
  assert.equal(status, 1, stderr);
  assert.match(
    stderr,
    /^Error: AppGraph validation did not establish a current graph: E200, E201\r?$/m
  );
});

test('identifies an ambiguous Bind subject when multiple Binds share the cited path', async (t) => {
  const { status, stderr, subject } = await runWithDefinition(t, (definition, path) => {
    definition.binds.push({ path, readonly: 'false' });
  });
  assert.equal(status, 1, stderr);
  const location = `Definition ${subject.artifactRef} has 2 Binds at path ${JSON.stringify(subject.subjectRef)}.`;
  assert.ok(
    stderr.includes(`${location} Outcome Verification requires one Bind per cited path.`),
    stderr
  );
});

test('allows several Binds on an uncited path', async (t) => {
  const { status, stderr, stdout } = await runWithDefinition(t, (definition, path) => {
    const uncited = definition.binds.find((bind) => bind.path !== path);
    definition.binds.push({ path: uncited.path, readonly: 'false' });
  });
  assert.equal(status, 0, stderr);
  assert.match(stdout, /: passed \(\d+\/\d+\)/);
});
