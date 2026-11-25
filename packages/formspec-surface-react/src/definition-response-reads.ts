/** @filedesc Build Definition reads and deliver authorized selector results to FormEngine. */
import type { DraftKey, DraftRecord } from '@formspec-org/surface';
import type { DefinitionResponseSelectionRequest, FormDefinition, ResponseSelectionOutcome, ResponseSelector } from '@formspec-org/types';

export interface DraftDefinitionResponseRead {
  key: DraftKey;
  definitionVersion: string;
  /** Null selects opening reads for a filing unit that still has no draft. */
  expectedRevision: string | null;
}

export type DraftDefinitionResponseResult =
  | { status: 'resolved'; outcomes: ReadonlyMap<string, ResponseSelectionOutcome>; missingPrerequisite?: string }
  | { status: 'unconfigured' | 'unavailable' | 'conflict' };

export interface DraftDefinitionResponsePort {
  selectDefinitionResponses(input: Readonly<DraftDefinitionResponseRead>, signal?: AbortSignal): Promise<DraftDefinitionResponseResult>;
}

export async function requireDraftResponsePins(
  port: Partial<DraftDefinitionResponsePort> | undefined, input: Readonly<DraftDefinitionResponseRead>,
): Promise<void> {
  const result = await port?.selectDefinitionResponses?.(input);
  if (!result || result.status === 'unconfigured') return;
  if (result.status === 'resolved' && !result.missingPrerequisite) return;
  const name = result.status === 'resolved' ? result.missingPrerequisite : undefined;
  throw new Error(name ? `Required response instance "${name}" is unavailable.` : 'The saved draft prerequisites could not be verified.');
}

export function definitionResponseRequests(
  definition: FormDefinition, key: DraftKey, pins?: DraftRecord['pins'], required?: ReadonlySet<string>,
): DefinitionResponseSelectionRequest[] {
  return Object.entries(definition.instances ?? {}).flatMap(([name, { response, schema, data }]) => {
    if (!response) return [];
    const pin = pins && Object.hasOwn(pins, name) ? pins[name] : undefined;
    // A resumed at-open read must never silently select a replacement.
    if (pins && response.pin === 'at-open' && !pin && !required?.has(name)) return [];
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
  return responseDeliveries(results, requests.map(({ key }) => key));
}

export function responseDeliveries(
  results: ReadonlyMap<string, ResponseSelectionOutcome> | undefined, keys: Iterable<string> = results?.keys() ?? [],
): DraftRecord['pins'] {
  return Object.fromEntries([...keys].flatMap(key => {
    const result = results?.get(key);
    if (result?.status !== 'available') return [];
    const { status: _status, newer: _newer, ...delivery } = result;
    return [[key, delivery]];
  }));
}
