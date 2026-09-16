/** @filedesc Tool input readers and JSON-Schema-shaped validation for Assist tool calls. */

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

// The readers below run after validateToolInput, which has already enforced each enum and shape.

export function readAudience(input: Record<string, unknown>): 'human' | 'agent' | 'both' {
  return (input.audience as 'human' | 'agent' | 'both' | undefined) ?? 'agent';
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

function propertyName(location: string, key: string): string {
  return location === 'input' ? key : `${location.slice('input.'.length)}.${key}`;
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

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case 'array':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'object':
      return isPlainObject(value);
    case 'string':
      return typeof value === 'string';
    default:
      return true;
  }
}

function validateAgainstSchema(schema: ToolSchema, value: unknown, location: string): void {
  if (schema.anyOf) {
    for (const branch of schema.anyOf) {
      try {
        validateAgainstSchema(branch, value, location);
        return;
      } catch {
        // try the next alternative
      }
    }
    throw invalid(`${location} must be ${schema.anyOf.map(shapeOf).join(' or ')} (got ${JSON.stringify(value)})`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    throw invalid(`${location} must be one of: ${schema.enum.map(String).join(', ')} (got ${JSON.stringify(value)})`);
  }
  if (!schema.type) {
    return;
  }
  if (!matchesType(schema.type, value)) {
    throw invalid(`${location} must be ${shapeOf(schema)}`);
  }
  if (schema.minimum !== undefined && (value as number) < schema.minimum) {
    throw invalid(`${location} must be ${shapeOf(schema)} (got ${JSON.stringify(value)})`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => schema.items && validateAgainstSchema(schema.items, entry, `${location}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  const properties = schema.properties ?? {};
  for (const key of schema.required ?? []) {
    if (value[key] === undefined) {
      const property = properties[key] ?? {};
      const description = property.description?.replace(/\.$/, '') ?? '';
      throw invalid(`missing required input property "${propertyName(location, key)}" (${property.type ?? 'any'}: ${description})`);
    }
  }
  if (schema.additionalProperties === false) {
    const accepted = Object.keys(properties);
    for (const key of Object.keys(value)) {
      if (!(key in properties)) {
        throw invalid(`unexpected input property "${propertyName(location, key)}"; accepted: ${accepted.length ? accepted.join(', ') : 'none'}`);
      }
    }
  }
  for (const [key, property] of Object.entries(properties)) {
    if (value[key] !== undefined) {
      validateAgainstSchema(property, value[key], `${location}.${key}`);
    }
  }
}

export function validateToolInput(schema: ToolSchema, input: Record<string, unknown>): void {
  validateAgainstSchema(schema, input, 'input');
}
