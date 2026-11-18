/** @filedesc Synthetic accepted filing and current sibling for the browser draft-session journey. */
import { prepareResponseFiling } from '@formspec-org/surface';
import type { FormDefinition, ResponseSelection } from '@formspec-org/types';
import { createBrowserFilingStore, previewResponseRecordTools } from '../../../packages/formspec-surface-react/src/index';

import vectors from '../../conformance/fixtures/response-selection/selection.json';

const prior = vectors.records.old.response;
const current = vectors.records.draft.response;
export const upstreamUrl = prior.definitionUrl;
export const upstream: FormDefinition = {
  $formspec: '1.0', version: prior.definitionVersion, url: upstreamUrl, title: 'Directory',
  subject: { type: prior.subject.type, keys: { agency: { dataType: 'string' },
    first: { dataType: 'integer' }, last: { dataType: 'integer' } } },
  items: [{ key: 'result', type: 'field', dataType: 'string' }],
};

function instance(options: Partial<ResponseSelection>) {
  const response: ResponseSelection = { definition: { url: upstreamUrl }, status: 'completed',
    subject: [], pin: 'none', cardinality: 'latest', ...options };
  return { response, schema: { result: 'string' } };
}

export const hydrationInstances = {
  roster: instance({ pin: 'at-open' }), accepted: instance({ disposition: 'urn:accepted' }),
  sibling: instance({ status: 'current' }),
};

export async function hydrationStorage(scope: string, definitions: ReadonlyMap<string, FormDefinition>) {
  const tools = await previewResponseRecordTools();
  const subject = current.subject;
  const key = { scope, definitionUrl: upstreamUrl, subject };
  const original = { $formspecResponse: '1.0', ...prior };
  const responseJson = JSON.stringify(original);
  const { responseId, responseHash } = prepareResponseFiling(scope, definitions, responseJson, 'fixture', tools);
  const store = createBrowserFilingStore({ scope, definitions, fixtures: {
    filings: [{ responseJson }], decisions: [{ responseId, responseHash,
      decision: { status: 'decided', review: 'accepted', disposition: 'urn:accepted', comments: [] } }],
  } });
  const next = { $formspecResponse: '1.0', ...current, status: 'completed', authored: '2026-02-01T00:00:00Z',
    data: { ...current.data, result: 'updated' } };
  const draftJson = JSON.stringify({ $formspecResponse: '1.0', ...current });
  const latest = await store.responses.select([{ key: 'latest', scope, kind: 'definition', projection: ['result'],
    selection: { definition: { url: upstreamUrl }, status: 'completed', subject: [], cardinality: 'latest', pin: 'none' } }]);
  const selected = latest.get('latest');
  if (selected?.status === 'available' && selected.records[0]?.responseId !== next.id &&
      (await store.drafts.load(key, upstream.version)).status === 'absent') {
    const saved = await store.drafts.save({ key, definitionVersion: upstream.version, expectedRevision: null,
      responseJson: draftJson, snapshotJson: JSON.stringify({ definitionUrl: upstreamUrl, definitionVersion: upstream.version,
        data: current.data }), summary: null });
    if (saved.status !== 'saved') throw Error(saved.status);
  }
  return {
    storage: { scope, port: store.drafts, responses: store.responses },
    async fileNewer() {
      const loaded = await store.drafts.load(key, upstream.version);
      if (loaded.status !== 'loaded') throw Error(loaded.status);
      const filed = await store.submit({ key, definitionVersion: upstream.version, revision: loaded.draft.revision,
        responseJson: loaded.draft.responseJson }, JSON.stringify(next));
      if (filed.status !== 'filed') throw Error(filed.status);
    },
  };
}
