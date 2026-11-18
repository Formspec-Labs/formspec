/** @filedesc Browser bridge for the shared draft storage suite. */
import { initFormspecEngine, initFormspecEngineTools, responseSubjectId } from '@formspec-org/engine';
import * as browser from '../../../packages/formspec-surface-react/src/index';
import { draftPortConformance } from '../../../packages/formspec-surface/src/draft-port-conformance';

export async function runConformance(name: keyof typeof draftPortConformance) {
  let allowed = true;
  const port = browser.createBrowserDraftPort({
    databaseName: 'formspec-draft-fixture',
    authorize: () => allowed,
  });
  await initFormspecEngine();
  await initFormspecEngineTools();
  const definitionUrl = 'https://example.test/definition';
  const scope = 'scope-a';
  const type = 'urn:test:unit';
  const keys = { year: 2025 };
  await draftPortConformance[name]({
    port, deny: () => { allowed = false; },
    key: { definitionUrl, scope, subject: { type, keys, id: responseSubjectId(type, keys) } },
  });
}

const preview = browser.createBrowserDraftPort({ databaseName: 'formspec-draft-preview-fixture' });
const key = { scope: 'edition', definitionUrl: 'https://example.test/browser-draft' };
const version = '1.0.0';
const placement = [{ id: 'main', fields: ['answer'] }];
const query = { key: 'filing', definitionUrl: key.definitionUrl, definitionVersion: version, sections: placement };
let commits = 0;

export function watchPreviewCommits() {
  preview.subscribe(() => { commits++; });
}

export function previewCommits() {
  return commits;
}

export function savePreview(expectedRevision: string | null, answer: string) {
  const counts = { total: 1, filled: answer ? 1 : 0, toFix: 0, toCheck: 0 };
  return preview.save({
    key, expectedRevision, definitionVersion: version,
    snapshotJson: JSON.stringify({ definitionUrl: key.definitionUrl, definitionVersion: version, data: { answer } }),
    responseJson: JSON.stringify({
      $formspecResponse: '1.0', definitionUrl: key.definitionUrl, definitionVersion: version,
      status: 'in-progress', authored: '2026-01-01T00:00:00Z', id: 'draft-1', data: { answer },
    }),
    summary: { sections: placement, progress: { status: 'current', form: { ...counts, ready: !!answer }, sections: { main: counts } } },
  });
}

export function loadPreview(definitionVersion: string) {
  return preview.load(key, definitionVersion);
}

export function restartPreview(expectedRevision: string) {
  return preview.restart(key, expectedRevision);
}

export async function readPreviewSummary() {
  const result = await preview.readSummaries([query], { previewScope: key.scope, signal: new AbortController().signal });
  return result.get(query.key);
}
