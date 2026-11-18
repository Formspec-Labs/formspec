/** @filedesc Deliver only committed filtered Response data to authorized draft consumers. */
import type { DataSourceLoadRequest, DataSourceLoadResult } from '@formspec-org/surface';
import type { FormDefinition } from '@formspec-org/types';
import type { DraftSession } from './draft-session.js';

type DraftReadSession = Pick<DraftSession, 'readCommitted'>;

const unavailable = { status: 'unavailable', reason: 'Draft unavailable' } as const;

async function loadDraft(session: DraftReadSession, definition: FormDefinition, request: DataSourceLoadRequest) {
  const { subject } = request.context;
  if (definition.subject && (!subject || subject.type !== definition.subject.type)) return { status: 'unavailable' } as const;
  return session.readCommitted(definition, definition.subject ? subject : undefined);
}

export async function readSessionDraft(
  session: DraftReadSession, definitions: ReadonlyMap<string, FormDefinition>, request: DataSourceLoadRequest,
): Promise<DataSourceLoadResult> {
  const { definitionRef, kind } = request.descriptor.source;
  const definition = definitionRef && definitions.get(definitionRef);
  if (!definition || kind !== 'definition-response') return unavailable;
  try {
    const loaded = await loadDraft(session, definition, request);
    if (loaded.status !== 'loaded') return unavailable;
    return { status: 'loaded', value: loaded.response.data, recordId: loaded.response.id, revision: loaded.revision, freshness: 'fresh' };
  } catch {
    return unavailable;
  }
}
