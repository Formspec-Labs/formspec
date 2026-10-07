/** @filedesc Shared module-widget action scope and qualified Response subject admission. */
import { targetDefinitionMatches } from '@formspec-org/types';

export const CANONICAL_RESPONSE_SCHEMA_REF = 'https://formspec.org/schemas/response/1.0';

export interface WidgetActionScopeInput {
  document: { scope?: unknown; targetDefinition?: unknown };
  responseInput?: unknown;
  inputs: readonly { name: string; required: boolean }[];
  sourceSchema?: unknown;
  definition?: { url: string; version?: string } | undefined;
}

/** Static ownership only; the host still admits payload, actor and current revision. */
export function widgetActionScopeMatches(input: WidgetActionScopeInput): boolean {
  const { document, responseInput, definition } = input;
  if (document.scope === 'app') {
    return document.targetDefinition === undefined && responseInput === undefined;
  }
  if (document.scope !== undefined && document.scope !== 'response') return false;
  if (typeof responseInput !== 'string' || !responseInput || !definition?.version) return false;
  const declarations = input.inputs.filter((candidate) => candidate.name === responseInput);
  if (declarations.length !== 1 || declarations[0]?.required !== true) return false;
  const schema = input.sourceSchema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false;
  const keys = Object.keys(schema);
  if (keys.length !== 1 || keys[0] !== '$ref') return false;
  const ref = Object.getOwnPropertyDescriptor(schema, '$ref');
  if (!ref || !('value' in ref) || ref.value !== CANONICAL_RESPONSE_SCHEMA_REF) return false;
  const target = document.targetDefinition;
  if (!target || typeof target !== 'object' || Array.isArray(target)) return false;
  return targetDefinitionMatches(target, definition);
}
