import { responseSubjectId } from '@formspec-org/engine';
import { checkpointPreviewResponse } from '../preview-draft-checkpoint.ts';
import type { PreviewFilingStore } from '@formspec-org/surface-react';
import type { FormDefinition, FormResponse } from '@formspec-org/types';

/** Supplies the filing unit for an unsigned singleton Response in the preview store. */
export function withPreviewSingletonSubject(
  response: FormResponse,
  definitions: ReadonlyMap<string, FormDefinition>,
): FormResponse {
  const definition = definitions.get(response.definitionUrl);
  const subject = definition?.subject;
  if (response.subject || response.authoredSignatures?.length ||
      definition?.version !== response.definitionVersion ||
      !subject || Object.keys(subject.keys).length !== 0) {
    return response;
  }
  const { type } = subject;
  return { ...response, subject: { type, keys: {}, id: responseSubjectId(type, {}) } };
}

export async function filePreviewResponse(store: PreviewFilingStore, scope: string, response: FormResponse) {
  const fence = await checkpointPreviewResponse(store.drafts, scope, response);
  const result = await store.submit(fence, JSON.stringify(response));
  if (result.status !== 'filed') throw new Error(`Preview filing failed (${result.status}).`);
  return { receiptRef: result.receiptRef, label: result.label };
}
