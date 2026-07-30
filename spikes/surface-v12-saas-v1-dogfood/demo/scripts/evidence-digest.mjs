/**
 * Stable identity for the exact inputs reviewed by the v12 browser evidence.
 *
 * The digest covers the closed host source set, its dependency locks, the
 * framework packages it executes, the AppGraph verifier, and both preview
 * artifact sets. Evidence files store this value so a later source or artifact
 * edit makes the historical browser claim fail closed.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export const DEMO_ROOT = resolve(scriptDirectory, '..');
export const REPO_ROOT = resolve(DEMO_ROOT, '../../..');

export const AUDITED_HOST_RUNTIME_FILES = Object.freeze([
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
  'spikes/surface-v12-saas-v1-dogfood/demo/scripts/check-generic-host.mjs',
  'spikes/surface-v12-saas-v1-dogfood/demo/scripts/evidence-digest.mjs',
  'spikes/surface-v12-saas-v1-dogfood/reasoning-review.mjs',
  'spikes/surface-v12-saas-v1-dogfood/reasoning-review.test.mjs',
  'spikes/surface-v12-saas-v1-dogfood/verify-artifacts.mjs',
  'spikes/surface-v12-saas-v1-dogfood/evidence/catalog-and-authoring-findings.md',
  'spikes/surface-v12-saas-v1-dogfood/evidence/lint-edge-case-audit.md',
  'spikes/surface-v12-saas-v1-dogfood/evidence/playwright-review.md',
  'spikes/surface-v12-saas-v1-dogfood/evidence/result.md',
  'spikes/surface-v12-saas-v1-dogfood/evidence/run-manifest.json',
  'spikes/surface-v12-saas-v1-dogfood/evidence/scorecard.json',
];

const REVIEW_INPUT_DIRECTORIES = [
  'crates/formspec-lint/schemas',
  'packages/formspec-app-graph',
  'packages/formspec-engine',
  'packages/formspec-layout',
  'packages/formspec-react',
  'packages/formspec-surface',
  'packages/formspec-surface-react',
  'packages/formspec-types',
  'schemas',
  'spikes/surface-v12-saas-v1-dogfood/artifacts',
  'spikes/surface-v12-saas-v1-dogfood/evidence/screenshots',
];

const IGNORED_DIRECTORY_NAMES = new Set([
  '.playwright-cli',
  'coverage',
  'dist',
  'node_modules',
  'output',
  'wasm-pkg-runtime',
  'wasm-pkg-tools',
]);

const IGNORED_FILE_NAMES = new Set([
  '.DS_Store',
  'tsconfig.tsbuildinfo',
]);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) {
      continue;
    }
    if (!entry.isDirectory() && IGNORED_FILE_NAMES.has(entry.name)) {
      continue;
    }
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) nested.push(...await filesBelow(path));
    else if (entry.isFile()) nested.push(path);
  }
  return nested;
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
    relative(REPO_ROOT, left).localeCompare(relative(REPO_ROOT, right))
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
    const normalizedContent = normalizedReviewedContent(name, content);
    digest.update(name);
    digest.update('\0');
    digest.update(createHash('sha256').update(normalizedContent).digest('hex'));
    digest.update('\n');
  }
  return {
    algorithm: 'sha256',
    digest: digest.digest('hex'),
    fileCount: files.length,
    files: files.map((path) => relative(REPO_ROOT, path).replaceAll('\\', '/')),
  };
}

function normalizedReviewedContent(name, content) {
  if (name.endsWith('/evidence/run-manifest.json')) {
    const document = JSON.parse(content.toString('utf8'));
    if (document.currentResult?.verification) {
      document.currentResult.verification.reviewedInputDigest =
        'sha256:<reviewed-input-digest>';
    }
    return JSON.stringify(document);
  }
  if (name.endsWith('/evidence/scorecard.json')) {
    const document = JSON.parse(content.toString('utf8'));
    if (document.validation) {
      document.validation.reviewed_input_digest =
        'sha256:<reviewed-input-digest>';
    }
    return JSON.stringify(document);
  }
  if (
    name.endsWith('/evidence/playwright-review.md') ||
    name.endsWith('/evidence/result.md')
  ) {
    return content.toString('utf8').replace(
      /Reviewed input digest: `sha256:[0-9a-f]{64}`/gu,
      'Reviewed input digest: `sha256:<reviewed-input-digest>`',
    );
  }
  return content;
}
