/** @filedesc Tool input readers and JSON-Schema-shaped validation for Assist tool calls. */

import { AssistError } from './errors.js';
import type { ValidationProfile } from '@formspec-org/types';

export type ToolSchema = {
  type?: string;
  enum?: readonly unknown[];
  properties?: Record<string, ToolSchema>;
  items?: ToolSchema;
  required?: string[];
  additionalProperties?: boolean;
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
  return input.audience === undefined ? 'agent' : input.audience as 'human' | 'agent' | 'both';
}

export function readValidationProfile(input: Record<string, unknown>): ValidationProfile {
  if (input.profile === undefined) {
    return 'live';
  }
  if (
    input.profile === 'live'
    || input.profile === 'on-submit'
    || input.profile === 'on-demand'
    || input.profile === 'off'
  ) {
    return input.profile;
  }
  throw new AssistError('INVALID_VALUE', 'Expected profile to be one of: live, on-submit, on-demand, off');
}

export function readNextIncompleteScope(input: Record<string, unknown>): 'field' | 'page' {
  if (input.scope === undefined) {
    return 'field';
  }
  if (input.scope === 'field' || input.scope === 'page') {
    return input.scope;
  }
  throw new AssistError('INVALID_VALUE', 'Expected scope to be one of: field, page');
}

export function readEntries(input: Record<string, unknown>): Array<{ path: string; value: unknown }> {
  if (!Array.isArray(input.entries) && !Array.isArray(input.matches)) {
    throw new AssistError('INVALID_VALUE', 'Expected entries or matches array');
  }
  const entries = Array.isArray(input.entries) ? input.entries : input.matches;
  return (entries as unknown[]).map((entry, index) => {
    if (!isPlainObject(entry) || typeof entry.path !== 'string' || entry.path.length === 0) {
      throw new AssistError('INVALID_VALUE', `Expected entries[${index}].path to be a non-empty string`);
    }
    return {
      path: entry.path,
      value: entry.value,
    };
  });
}

function valueMatchesType(type: string | undefined, value: unknown): boolean {
  if (!type) {
    return true;
  }
  switch (type) {
    case 'array':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number';
    case 'object':
      return isPlainObject(value);
    case 'string':
      return typeof value === 'string';
    default:
      return true;
  }
}

function validateAgainstSchema(schema: ToolSchema, value: unknown, location: string): void {
  if (
    schema.type === undefined
    && schema.enum === undefined
    && schema.properties === undefined
    && schema.items === undefined
    && schema.required === undefined
    && schema.additionalProperties === undefined
  ) {
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    throw new AssistError('INVALID_VALUE', `Invalid value for ${location}`);
  }

  const schemaType = schema.type ?? 'object';
  if (schemaType === 'array') {
    if (!Array.isArray(value)) {
      throw new AssistError('INVALID_VALUE', `Expected ${location} to be an array`);
    }
    if (schema.items) {
      value.forEach((entry, index) => validateAgainstSchema(schema.items as ToolSchema, entry, `${location}[${index}]`));
    }
    return;
  }

  if (schemaType !== 'object') {
    if (!valueMatchesType(schemaType, value)) {
      throw new AssistError('INVALID_VALUE', `Invalid type for ${location}`);
    }
    return;
  }

  if (!isPlainObject(value)) {
    throw new AssistError('INVALID_VALUE', `Expected ${location} to be an object`);
  }
  for (const key of schema.required ?? []) {
    if (!(key in value)) {
      throw new AssistError('INVALID_VALUE', `Missing required input property: ${location}.${key}`);
    }
  }
  const propertyNames = new Set(Object.keys(schema.properties ?? {}));
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!propertyNames.has(key)) {
        throw new AssistError('INVALID_VALUE', `Unexpected input property: ${key}`);
      }
    }
  }
  for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
    if (!(key in value) || value[key] === undefined) {
      continue;
    }
    validateAgainstSchema(propertySchema as ToolSchema, value[key], `${location}.${key}`);
  }
}

export function validateToolInput(schema: ToolSchema, input: Record<string, unknown>): void {
  validateAgainstSchema(schema, input, 'input');
}

