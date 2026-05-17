/**
 * Handlers for definition bind management and field configuration commands.
 *
 * **Binds** in Formspec are declarative rules that connect a field (identified by
 * a dot-path) to dynamic behaviors: calculated values, relevance conditions,
 * required/readonly state, validation constraints, default values, and various
 * processing directives. Each bind entry targets a single path and carries one
 * or more property expressions (typically FEL strings). The binds array lives at
 * `definition.binds` and is the primary mechanism for making fields reactive.
 *
 * This module also registers handlers for direct field/item property editing
 * (data type, options, extensions) which operate on the `definition.items` tree
 * rather than the binds array.
 *
 * @module definition-binds
 */

import type { CommandHandler } from '../types.js';
import { resolveItemLocation } from './helpers.js';
import type { FormBind, FormItem } from '@formspec-org/types';
import { setRecordProperty } from '../record-mutate.js';

// ── setBind helpers ──────────────────────────────────────────────────

/** Properties accepted on any item type by `definition.setItemProperty`. */
const COMMON_ITEM_PROPERTIES = new Set([
  'label',
  'description',
  'hint',
  'labels',
  'presentation',
  'relevant',
  'required',
  'readonly',
  'calculate',
  'constraint',
  'constraintMessage',
  'initialValue',
]);

/** Properties restricted to field items. */
const FIELD_ONLY_PROPERTIES = new Set([
  'dataType',
  'currency',
  'precision',
  'prefix',
  'suffix',
  'semanticType',
  'prePopulate',
  'optionSet',
  'options',
]);

/** Properties restricted to group items. */
const GROUP_ONLY_PROPERTIES = new Set([
  'repeatable',
  'minRepeat',
  'maxRepeat',
]);

/** Reject attempts to write structurally invalid properties onto an item. */
function assertPropertyApplicable(item: FormItem, propertyPath: string): void {
  const rootProperty = propertyPath.split('.').filter(Boolean)[0];
  if (!rootProperty) {
    throw new Error('Property path cannot be empty');
  }
  if (rootProperty.startsWith('x-')) return;
  if (rootProperty === 'children') {
    throw new Error('children is managed structurally and cannot be set with definition.setItemProperty');
  }
  if (COMMON_ITEM_PROPERTIES.has(rootProperty)) return;
  if (FIELD_ONLY_PROPERTIES.has(rootProperty) && item.type !== 'field') {
    throw new Error(`Property "${rootProperty}" is only valid for field items`);
  }
  if (GROUP_ONLY_PROPERTIES.has(rootProperty) && item.type !== 'group') {
    throw new Error(`Property "${rootProperty}" is only valid for group items`);
  }
}

/** Delete a nested property and prune any parent objects left empty by that removal. */
function deleteNestedProperty(target: Record<string, unknown>, segments: string[]): void {
  const stack: Array<{ obj: Record<string, unknown>; key: string }> = [];
  let cursor: Record<string, unknown> = target;

  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const next = cursor[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) return;
    stack.push({ obj: cursor, key });
    cursor = next as Record<string, unknown>;
  }

  delete cursor[segments[segments.length - 1]];

  // Prune empty parent objects so clearing `presentation.widget`, for example,
  // does not leave behind `{ presentation: {} }`.
  for (let i = stack.length - 1; i >= 0; i--) {
    const { obj, key } = stack[i];
    const candidate = obj[key];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) break;
    if (Object.keys(candidate as Record<string, unknown>).length > 0) break;
    delete obj[key];
  }
}

/** Set or clear a dotted property path on an item, creating intermediate objects as needed. */
function setNestedProperty(target: Record<string, unknown>, propertyPath: string, value: unknown): void {
  const segments = propertyPath.split('.').filter(Boolean);
  if (segments.length === 0) {
    throw new Error('Property path cannot be empty');
  }

  if (value === null || value === undefined) {
    deleteNestedProperty(target, segments);
    return;
  }

  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const existing = cursor[key];

    // Materialize missing intermediate objects so callers can assign deep
    // properties like `presentation.widget` in one command.
    if (existing === undefined || existing === null) {
      const nested: Record<string, unknown> = {};
      cursor[key] = nested;
      cursor = nested;
      continue;
    }

    if (typeof existing !== 'object' || Array.isArray(existing)) {
      throw new Error(`Cannot assign nested property "${propertyPath}" through non-object "${key}"`);
    }

    cursor = existing as Record<string, unknown>;
  }

  cursor[segments[segments.length - 1]] = value;
}

// ── Handler table ────────────────────────────────────────────────────

export const definitionBindsHandlers = {

  'definition.setBind': (state, payload) => {
    const { path, properties } = payload as {
      path: string;
      properties: Record<string, unknown>;
    };

    const binds = (state.definition.binds ??= []);

    let bind = binds.find(b => b.path === path);
    if (!bind) {
      bind = { path };
      binds.push(bind);
    }

    // Apply properties — null removes
    for (const [key, value] of Object.entries(properties)) {
      setRecordProperty(bind as Record<string, unknown>, key, value);
    }

    // If only 'path' remains, remove the bind entry
    const keys = Object.keys(bind).filter(k => k !== 'path');
    if (keys.length === 0) {
      state.definition.binds = binds.filter((b: FormBind) => b !== bind);
    }

    return { rebuildComponentTree: false };
  },

  'definition.setItemProperty': (state, payload) => {
    const { path, property, value } = payload as { path: string; property: string; value: unknown };
    const loc = resolveItemLocation(state, path);
    if (!loc) throw new Error(`Item not found: ${path}`);

    assertPropertyApplicable(loc.item, property);
    setNestedProperty(loc.item as Record<string, unknown>, property, value);
    // Display body is mirrored to component `text` during reconcile; without a rebuild the tree stays stale
    // (e.g. live preview and layout canvas keep showing the old string).
    const rebuild =
      loc.item.type === 'display' && property === 'label';
    return { rebuildComponentTree: rebuild };
  },

  'definition.setFieldDataType': (state, payload) => {
    const { path, dataType } = payload as {
      path: string;
      dataType: NonNullable<FormItem['dataType']>;
    };
    const loc = resolveItemLocation(state, path);
    if (!loc) throw new Error(`Item not found: ${path}`);

    loc.item.dataType = dataType;
    return { rebuildComponentTree: false };
  },

  'definition.setFieldOptions': (state, payload) => {
    const { path, options } = payload as { path: string; options: unknown };
    const loc = resolveItemLocation(state, path);
    if (!loc) throw new Error(`Item not found: ${path}`);

    if (typeof options === 'string') {
      loc.item.optionSet = options;
      delete loc.item.options;
    } else {
      loc.item.options = options as { value: string; label: string }[];
      delete loc.item.optionSet;
    }

    return { rebuildComponentTree: false };
  },

  'definition.setItemExtension': (state, payload) => {
    const { path, extension, value } = payload as { path: string; extension: string; value: unknown };
    const loc = resolveItemLocation(state, path);
    if (!loc) throw new Error(`Item not found: ${path}`);

    if (value === null) {
      if (loc.item.extensions) {
        delete (loc.item.extensions as Record<string, unknown>)[extension];
        if (Object.keys(loc.item.extensions).length === 0) {
          delete loc.item.extensions;
        }
      }
    } else {
      loc.item.extensions = loc.item.extensions || {};
      (loc.item.extensions as Record<string, unknown>)[extension] = value;
    }

    return { rebuildComponentTree: false };
  },
} satisfies Record<string, CommandHandler>;
