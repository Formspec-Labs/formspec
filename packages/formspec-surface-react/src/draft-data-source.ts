/** @filedesc Deliver only committed filtered Response data to authorized draft consumers. */
import { initFormspecEngine, initFormspecEngineTools, selectResponses } from '@formspec-org/engine';
import { catalogResponseProjection, type DataSourceLoader, type DataSourceLoadRequest, type DataSourceLoadResult } from '@formspec-org/surface';
import type { FormDefinition } from '@formspec-org/types';
import type { DraftSession } from './draft-session.js';

const unavailable = { status: 'unavailable', reason: 'Draft unavailable' } as const;

async function loadDraft(session: DraftSession, definition: FormDefinition, request: DataSourceLoadRequest) {
  const { subject } = request.context;
  if (definition.subject && (!subject || subject.type !== definition.subject.type)) return { status: 'unavailable' } as const;
  return session.readCommitted(definition, definition.subject ? subject : undefined);
}

export async function readSessionDraft(
  session: DraftSession, definitions: ReadonlyMap<string, FormDefinition>, request: DataSourceLoadRequest,
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

/** Preview can overlay an open draft for an exact same-unit selection. */
export async function readCurrentDraft(
  session: DraftSession, definitions: ReadonlyMap<string, FormDefinition>, request: DataSourceLoadRequest,
  baseline: DataSourceLoader,
): Promise<DataSourceLoadResult> {
  const { responseSelection: selection, descriptor, context } = request;
  if (selection?.status !== 'current' || selection.pin !== 'none' || selection.mapping !== undefined ||
      selection.disposition !== undefined) return baseline(request);
  const definition = definitions.get(selection.definition.url);
  if (!definition) return baseline(request);
  const keys = Object.keys(definition.subject?.keys ?? {});
  const predicates = new Map(selection.subject.map(predicate => [predicate.key, predicate]));
  if (selection.subject.length !== keys.length ||
      keys.some(key => predicates.get(key)?.op !== 'eq') ||
      (definition.subject && context.subject?.type !== definition.subject.type)) return baseline(request);

  try {
    const loaded = await loadDraft(session, definition, request);
    if (loaded.status === 'loaded') {
      const { response, revision } = loaded;
      await initFormspecEngine();
      await initFormspecEngineTools();
      const projection = catalogResponseProjection(descriptor.source.schema, selection.cardinality);
      const selected = selectResponses([{
        scope: session.scope, response, ...(!definition.subject && { implicitSubjectId: 'browser-respondent' }),
      }], selection, {
        scope: session.scope, authorized: true, source: 'catalog',
        upstreamSubject: definition.subject ?? null, routeParams: context.params,
        ...(context.subject && { consumerSubject: context.subject.keys }),
        ...(projection && { projection }),
      });
      if (selected.status === 'available' && !selected.none) {
        const { value, records, valueDigest, none } = selected;
        return {
          catalogRef: descriptor.catalogRef, sourceRef: descriptor.sourceRef,
          status: 'loaded', freshness: 'fresh', value, records, valueDigest, none, revision,
        };
      }
    } else if (loaded.status !== 'absent') return unavailable;
  } catch {
    return unavailable;
  }
  return baseline(request);
}
