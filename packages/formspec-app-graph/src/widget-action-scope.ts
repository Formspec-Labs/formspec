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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    if (Object.getPrototypeOf(prototype) !== null) return false;
    if (Object.getOwnPropertyDescriptor(prototype, Symbol.toStringTag) !== undefined) return false;
    const ctorDesc = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    if (!ctorDesc || !Object.prototype.hasOwnProperty.call(ctorDesc, 'value')) return false;
    const ctor = ctorDesc.value;
    if (typeof ctor !== 'function' || ctor.prototype !== prototype) return false;
    if (!Object.prototype.hasOwnProperty.call(prototype, 'hasOwnProperty')) return false;
    if (Object.prototype.toString.call(value) !== '[object Object]') return false;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (!desc || !Object.prototype.hasOwnProperty.call(desc, 'value') || !desc.enumerable) return false;
  }
  return true;
}

function ownDataProp(record: Record<string, unknown>, key: string): { present: boolean; value: unknown } {
  const desc = Object.getOwnPropertyDescriptor(record, key);
  if (!desc || !Object.prototype.hasOwnProperty.call(desc, 'value') || !desc.enumerable) {
    return { present: false, value: undefined };
  }
  return { present: true, value: desc.value };
}

/** Static ownership only; the host still admits payload, actor and current revision. */
export function widgetActionScopeMatches(input: WidgetActionScopeInput): boolean {
  const { document, responseInput, definition } = input;
  if (!isPlainRecord(document)) return false;
  const scopeProp = ownDataProp(document, 'scope');
  const targetProp = ownDataProp(document, 'targetDefinition');
  if (scopeProp.value === 'app') {
    return targetProp.value === undefined && responseInput === undefined;
  }
  if (scopeProp.value !== undefined && scopeProp.value !== 'response') return false;
  if (typeof responseInput !== 'string' || !responseInput || !definition?.version) return false;
  const declarations = input.inputs.filter((candidate) => candidate.name === responseInput);
  if (declarations.length !== 1 || declarations[0]?.required !== true) return false;
  const schema = input.sourceSchema;
  if (!isPlainRecord(schema)) return false;
  const keys = Object.keys(schema);
  if (keys.length !== 1 || keys[0] !== '$ref') return false;
  const ref = ownDataProp(schema, '$ref');
  if (!ref.present || ref.value !== CANONICAL_RESPONSE_SCHEMA_REF) return false;
  const target = targetProp.value;
  if (!isPlainRecord(target)) return false;
  const urlProp = ownDataProp(target, 'url');
  const compatProp = ownDataProp(target, 'compatibleVersions');
  if (typeof urlProp.value !== 'string') return false;
  if (compatProp.present && compatProp.value !== undefined && typeof compatProp.value !== 'string') return false;
  return targetDefinitionMatches(
    {
      url: urlProp.value,
      ...(typeof compatProp.value === 'string' ? { compatibleVersions: compatProp.value } : {}),
    },
    definition,
  );
}
