/**
 * Stable identity for the v13 host, its direct bundle input, and the generic
 * Formspec packages it executes. No v12 scenario, runner, or evidence enters
 * this digest.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export const DEMO_ROOT = resolve(scriptDirectory, '..');
export const REPO_ROOT = resolve(DEMO_ROOT, '../../..');
export const BUNDLE_PATH = resolve(DEMO_ROOT, '../artifacts/prod-mvp.bundle.json');

export const AUDITED_HOST_RUNTIME_FILES = Object.freeze([
  '.env',
  'index.html',
  'package-lock.json',
  'package.json',
  'src/App.tsx',
  'src/app.css',
  'src/main.tsx',
  'tsconfig.json',
  'vite.config.ts',
]);

const REVIEW_INPUT_FILES = [
  'package-lock.json',
  'spikes/surface-v13-prod-mvp-dogfood/artifacts/prod-mvp.bundle.json',
  'spikes/surface-v13-prod-mvp-dogfood/demo/scripts/check-generic-host.mjs',
  'spikes/surface-v13-prod-mvp-dogfood/demo/scripts/evidence-digest.mjs',
];

const REVIEW_INPUT_DIRECTORIES = [
  'packages/formspec-app-graph/src',
  'packages/formspec-assist/src',
  'packages/formspec-engine/src',
  'packages/formspec-layout/src',
  'packages/formspec-react/src',
  'packages/formspec-surface/src',
  'packages/formspec-surface-react/src',
  'packages/formspec-types/src',
];

const IGNORED_DIRECTORY_NAMES = new Set([
  'coverage',
  'dist',
  'node_modules',
  'output',
]);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile() && entry.name !== '.DS_Store') files.push(path);
  }
  return files;
}

export async function reviewedInputFiles() {
  const files = [
    ...AUDITED_HOST_RUNTIME_FILES.map((path) => resolve(DEMO_ROOT, path)),
    ...REVIEW_INPUT_FILES.map((path) => resolve(REPO_ROOT, path)),
  ];
  for (const directory of REVIEW_INPUT_DIRECTORIES) {
    files.push(...await filesBelow(resolve(REPO_ROOT, directory)));
  }
  return [...new Set(files)].sort((left, right) =>
    relative(REPO_ROOT, left).localeCompare(relative(REPO_ROOT, right)),
  );
}

export async function computeReviewedInputDigest() {
  const digest = createHash('sha256');
  const files = await reviewedInputFiles();
  for (const path of files) {
    const info = await stat(path);
    if (!info.isFile()) {
      throw new Error(`Reviewed input is not a file: ${relative(REPO_ROOT, path)}`);
    }
    const name = relative(REPO_ROOT, path).replaceAll('\\', '/');
    const content = await readFile(path);
    digest.update(name);
    digest.update('\0');
    digest.update(createHash('sha256').update(content).digest('hex'));
    digest.update('\n');
  }
  return {
    algorithm: 'sha256',
    digest: digest.digest('hex'),
    fileCount: files.length,
    files: files.map((path) =>
      relative(REPO_ROOT, path).replaceAll('\\', '/'),
    ),
  };
}
