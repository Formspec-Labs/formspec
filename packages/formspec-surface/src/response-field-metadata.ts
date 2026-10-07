/** @filedesc Pure capture of supplied field wording for retained Response data. */
import type { FormDefinition, FormResponse } from '@formspec-org/types';

export type CapturedResponseFields = Readonly<Record<string, {
  label: string;
  options?: readonly { value: string; label: string }[];
}>>;

/** Readers supply already qualified wording; this helper does not establish its origin. */
export interface ResponseFieldMetadataReader {
  label(path: string): string | undefined;
  /** Undefined refuses a missing field; an empty array admits a field without options. */
  options(path: string): readonly { value: string; label: string }[] | undefined;
}

/**
 * Capture only Definition paths present in retained Response data, including
 * indexed repeat rows. Copy metadata so subsequent reader changes cannot alter
 * this snapshot. Reader refusals propagate. No evaluation or Locale lookup occurs.
 */
export function captureResponseFieldMetadata(
  definition: FormDefinition,
  response: FormResponse,
  reader: ResponseFieldMetadataReader,
): CapturedResponseFields {
  const fields: Record<string, { label: string; options?: { value: string; label: string }[] }> = {};
  function walk(items: FormDefinition['items'], values: Record<string, unknown>, prefix = ''): void {
    for (const item of items) {
      if (!Object.hasOwn(values, item.key)) continue;
      const path = prefix ? `${prefix}.${item.key}` : item.key;
      const label = reader.label(path);
      if (typeof label !== 'string' || !label) throw new Error('response-review-label-unavailable');
      const supplied = item.type === 'field' ? reader.options(path) : [];
      if (supplied === undefined) throw new Error('response-review-field-unavailable');
      const options = supplied.map(option => ({ value: option.value, label: option.label }));
      // Define an own data property even for a legitimate Item key such as __proto__.
      Object.defineProperty(fields, path, {
        value: { label, ...(options.length ? { options } : {}) },
        enumerable: true, configurable: true, writable: true,
      });
      if (item.type === 'group' && item.children) {
        const value = values[item.key];
        if (Array.isArray(value)) {
          value.forEach((row, index) => {
            if (!row || typeof row !== 'object' || Array.isArray(row)) {
              throw new Error('response-review-data-invalid');
            }
            walk(item.children!, row as Record<string, unknown>, `${path}[${index}]`);
          });
        } else if (value && typeof value === 'object') {
          walk(item.children, value as Record<string, unknown>, path);
        }
      }
    }
  }
  walk(definition.items, response.data);
  return fields;
}
