/** @filedesc Build Definition reads and deliver authorized selector results to FormEngine. */
import type { DraftKey, DraftRecord } from '@formspec-org/surface';
import type { DefinitionResponseSelectionRequest, FormDefinition, ResponseSelector } from '@formspec-org/types';

export function definitionResponseRequests(
  definition: FormDefinition, key: DraftKey, pins?: DraftRecord['pins'],
): DefinitionResponseSelectionRequest[] {
  return Object.entries(definition.instances ?? {}).flatMap(([name, { response, schema, data }]) => {
    if (!response) return [];
    const pin = pins && Object.hasOwn(pins, name) ? pins[name] : undefined;
    // A resumed at-open read must never silently select a replacement.
    if (pins && response.pin === 'at-open' && !pin) return [];
    return [{
      key: name, kind: 'definition', scope: key.scope, selection: response,
      ...(key.subject && { consumerSubject: key.subject.keys }),
      ...(schema && { projection: Object.keys(schema) }), ...(data !== undefined && { fallback: data }),
      ...(pin && { pin }),
    }];
  });
}

export async function resolveDefinitionReads(
  selector: ResponseSelector | undefined, requests: DefinitionResponseSelectionRequest[], signal: AbortSignal,
): Promise<DraftRecord['pins']> {
  if (!selector || !requests.length) return {};
  // A transport failure leaves unpinned drafts editable. Sign requires every delivery.
  const results = await selector.select(requests, signal).catch(() => undefined);
  signal.throwIfAborted();
  return Object.fromEntries(requests.flatMap(({ key }) => {
    const result = results?.get(key);
    if (result?.status !== 'available') return [];
    const { status: _status, newer: _newer, ...delivery } = result;
    return [[key, delivery]];
  }));
}
