import { responseSubjectId } from '@formspec-org/engine';
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
