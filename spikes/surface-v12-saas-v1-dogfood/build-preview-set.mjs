#!/usr/bin/env node

/** Rebuild the fixed demo input from the standalone data artifacts. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const artifacts = join(root, 'artifacts');
const fixtures = [
  { id: 'main', bundle: 'saas-v1.bundle.json', scenario: 'saas-v1.preview-scenario.json' },
  { id: 'control', bundle: 'control.bundle.json', scenario: 'control.preview-scenario.json' },
];

async function readJson(filename) {
  return JSON.parse(await readFile(join(artifacts, filename), 'utf8'));
}

const previews = Object.fromEntries(
  await Promise.all(
    fixtures.map(async (fixture) => [
      fixture.id,
      {
        bundle: await readJson(fixture.bundle),
        scenario: await readJson(fixture.scenario),
      },
    ]),
  ),
);

await writeFile(
  join(artifacts, 'preview-set.json'),
  `${JSON.stringify({
    $formspecSurfacePreviewSet: '0.1',
    defaultPreview: 'main',
    previews,
  }, null, 2)}\n`,
);

console.log(`Rebuilt preview-set.json from ${fixtures.length} data-only previews.`);
