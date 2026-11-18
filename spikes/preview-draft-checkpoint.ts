/** @filedesc Checkpoint a detached spike form before a local preview filing. */
import type { DraftPort } from '@formspec-org/surface';
import type { FormResponse } from '@formspec-org/types';

/** Checkpoint a detached preview form whose host has no editable draft session. */
export async function checkpointPreviewResponse(drafts: DraftPort, scope: string, response: FormResponse) {
  const { definitionUrl, definitionVersion } = response;
  const subject = response.subject;
  const key = { scope, definitionUrl, ...(subject?.type && subject.keys &&
    { subject: { id: subject.id, type: subject.type, keys: subject.keys } }) };
  const prior = await drafts.load(key, definitionVersion);
  if (prior.status !== 'loaded' && prior.status !== 'absent') throw new Error('Preview draft is unavailable.');
  const responseJson = JSON.stringify({ ...response, status: 'in-progress' });
  const saved = await drafts.save({
    key, definitionVersion, responseJson,
    snapshotJson: JSON.stringify({ definitionUrl, definitionVersion, data: response.data }),
    expectedRevision: prior.status === 'loaded' ? prior.draft.revision : null, summary: null,
  });
  if (saved.status !== 'saved') throw new Error(`Preview checkpoint failed (${saved.status}).`);
  return { key, definitionVersion, responseJson, revision: saved.revision };
}
