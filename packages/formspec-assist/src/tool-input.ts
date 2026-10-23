/** @filedesc Tool input readers and JSON-Schema validation for Assist tool calls using Ajv. */

import Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';
import { AssistError } from './errors.js';
import type { ValidationProfile } from '@formspec-org/types';

export type ToolSchema = {
  type?: string;
  description?: string;
  enum?: readonly unknown[];
  minimum?: number;
  properties?: Record<string, ToolSchema>;
  items?: ToolSchema;
  required?: string[];
  additionalProperties?: boolean;
  /** Alternatives; the value must satisfy at least one. */
  anyOf?: readonly ToolSchema[];
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function readPath(input: Record<string, unknown>): string {
  if (typeof input.path !== 'string' || input.path.length === 0) {
    throw new AssistError('INVALID_PATH', 'Expected a non-empty string path');
  }
  return input.path;
}

export function readAudience(input: Record<string, unknown>): 'human' | 'agent' | 'both' {
  const aud = input.audience;
  if (aud === 'human' || aud === 'agent' || aud === 'both') {
    return aud;
  }
  if (aud === undefined) {
    return 'agent';
  }
  throw new AssistError('INVALID_VALUE', `input.audience must be one of: human, agent, both (got ${JSON.stringify(aud)})`);
}

export function readValidationProfile(input: Record<string, unknown>): ValidationProfile {
  return (input.profile as ValidationProfile | undefined) ?? 'live';
}

export function readNextIncompleteScope(input: Record<string, unknown>): 'field' | 'page' {
  return (input.scope as 'field' | 'page' | undefined) ?? 'field';
}

/**
 * Assist spec §4.2: an INVALID_VALUE message names the fix. Four shapes —
 * enum (allowed values + what was given), unknown key (accepted keys), missing
 * required (the property's type and description), wrong type (expected shape).
 */
function invalid(message: string): AssistError {
  return new AssistError('INVALID_VALUE', message);
}

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

const validatorCache = new WeakMap<object, ValidateFunction>();

function getValidator(schema: ToolSchema): ValidateFunction {
  let validator = validatorCache.get(schema);
  if (!validator) {
    validator = ajv.compile(schema as Record<string, unknown>);
    validatorCache.set(schema, validator);
  }
  return validator;
}

/** `{ path, value }` for an object schema with properties; empty when it has none. */
function braces(schema: ToolSchema): string {
  const keys = Object.keys(schema.properties ?? {});
  return keys.length ? ` { ${keys.join(', ')} }` : '';
}

/** The expected shape a caller must supply, e.g. `an array of { path, value }`, `an integer >= 512`. */
function shapeOf(schema: ToolSchema): string {
  if (schema.anyOf) {
    return schema.anyOf.map(shapeOf).join(' or ');
  }
  switch (schema.type) {
    case 'array':
      if (schema.items?.anyOf) {
        return `an array of ${shapeOf(schema.items)}`;
      }
      if (!schema.items?.type) {
        return 'an array';
      }
      return schema.items.type === 'object' && schema.items.properties
        ? `an array of${braces(schema.items)}`
        : `an array of ${schema.items.type}s`;
    case 'object':
      return `an object${braces(schema)}`;
    case 'integer':
      return schema.minimum === undefined ? 'an integer' : `an integer >= ${schema.minimum}`;
    case 'number':
      return schema.minimum === undefined ? 'a number' : `a number >= ${schema.minimum}`;
    default:
      return `a ${schema.type}`;
  }
}

function formatLocation(instancePath: string): string {
  if (!instancePath) return 'input';
  const parts = instancePath.split('/').filter(Boolean);
  let loc = 'input';
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      loc += `[${part}]`;
    } else {
      loc += `.${part}`;
    }
  }
  return loc;
}

function formatPropertyName(instancePath: string, key: string): string {
  const loc = formatLocation(instancePath);
  return loc === 'input' ? key : `${loc.slice('input.'.length)}.${key}`;
}

function getValueAtPath(root: unknown, instancePath: string): unknown {
  const parts = instancePath.split('/').filter(Boolean);
  let cur = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function findSubSchema(rootSchema: ToolSchema, instancePath: string): { subSchema: ToolSchema; parentSchema: ToolSchema | undefined } {
  const parts = instancePath.split('/').filter(Boolean);
  let current = rootSchema;
  let parent: ToolSchema | undefined = undefined;
  for (const part of parts) {
    parent = current;
    if (/^\d+$/.test(part)) {
      if (current.items) current = current.items;
    } else if (current.properties && current.properties[part]) {
      current = current.properties[part];
    }
  }
  return { subSchema: current, parentSchema: parent };
}

export function validateToolInput(schema: ToolSchema, input: Record<string, unknown>): void {
  const validator = getValidator(schema);
  const valid = validator(input);
  if (valid) return;

  const errors = validator.errors;
  if (!errors || errors.length === 0) return;

  // If there is an anyOf error, prefer anyOf over individual branch failures
  const anyOfErr = errors.find((e) => e.keyword === 'anyOf');
  const err = anyOfErr || errors[0];
  const { subSchema } = findSubSchema(schema, err.instancePath);
  const location = formatLocation(err.instancePath);
  const val = getValueAtPath(input, err.instancePath);

  if (subSchema.enum && !subSchema.enum.includes(val)) {
    throw invalid(`${location} must be one of: ${subSchema.enum.map(String).join(', ')} (got ${JSON.stringify(val)})`);
  }
  if (err.keyword === 'enum') {
    const allowed = (err.params.allowedValues as unknown[]).map(String).join(', ');
    throw invalid(`${location} must be one of: ${allowed} (got ${JSON.stringify(val)})`);
  }
  if (err.keyword === 'additionalProperties') {
    const propName = formatPropertyName(err.instancePath, err.params.additionalProperty);
    const accepted = Object.keys(subSchema.properties ?? {});
    throw invalid(`unexpected input property "${propName}"; accepted: ${accepted.length ? accepted.join(', ') : 'none'}`);
  }
  if (err.keyword === 'required') {
    const propName = formatPropertyName(err.instancePath, err.params.missingProperty);
    const prop = subSchema.properties?.[err.params.missingProperty] ?? {};
    const description = prop.description?.replace(/\.$/, '') ?? '';
    throw invalid(`missing required input property "${propName}" (${prop.type ?? 'any'}: ${description})`);
  }
  if (err.keyword === 'type') {
    throw invalid(`${location} must be ${shapeOf(subSchema)}`);
  }
  if (err.keyword === 'minimum') {
    throw invalid(`${location} must be ${shapeOf(subSchema)} (got ${JSON.stringify(val)})`);
  }
  if (err.keyword === 'anyOf') {
    throw invalid(`${location} must be ${shapeOf(subSchema)} (got ${JSON.stringify(val)})`);
  }
  throw invalid(err.message ?? 'Invalid tool input');
}
