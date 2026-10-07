import { createStaticResponseMetadataReader, type StaticResponseMetadataInput } from '@formspec-org/engine/static-presentation';
import { captureResponseFieldMetadata, type ResponseFieldMetadataReader, type CapturedResponseFields } from '@formspec-org/surface';
import type { AcceptedResponseReviewPresentation } from '@formspec-org/surface-react/widget-metadata';
export function consumeOriginal(input: StaticResponseMetadataInput): CapturedResponseFields {
  const reader: ResponseFieldMetadataReader = createStaticResponseMetadataReader(input);
  const fields: AcceptedResponseReviewPresentation['fields'] = captureResponseFieldMetadata(input.definition, input.response, reader);
  const options = createStaticResponseMetadataReader(input).options('answer');
  // @ts-expect-error Returned option lists are readonly; caller edits cannot affect reader state.
  options.push({ value: 'new', label: 'New' });
  return fields;
}
