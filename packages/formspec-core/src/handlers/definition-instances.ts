/**
 * Instance command handlers for Formspec Studio Core.
 *
 * Instances are named external data sources declared in a form definition. FEL
 * expressions reference them via `@instance('name')` to read (or, when
 * `readonly: false`, write) data that lives outside the form's own item tree.
 * Common use cases include pre-populating fields from a patient record, looking
 * up reference data, or exposing a writable scratch-pad for intermediate
 * calculations.
 *
 * Each instance can point to an external URI (`source`), carry inline `data`,
 * declare a JSON Schema for its structure, and be marked `static` (a caching
 * hint) or `readonly` (default `true`).
 *
 * None of these commands affect the component tree, so all handlers return
 * `{ rebuildComponentTree: false }`.
 *
 * @module definition-instances
 */
import type { CommandHandler } from '../types.js';
import { rewriteFELReferences } from '@formspec-org/engine/fel-tools';
import type { FormInstance, FormItem } from '@formspec-org/types';
import {
  allMappingRules,
  rewriteBindFelExpressions,
  rewriteItemFelExpressions,
  rewriteMappingRuleFieldRefs,
  rewriteShapeFelExpressions,
  rewriteVariableExpression,
} from '../bind-fel.js';
import { setRecordProperty } from '../record-mutate.js';

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * Monotonically increasing counter for auto-generating instance names when the
 * caller does not provide one.
 */
let instanceCounter = 0;

export const definitionInstancesHandlers = {

  'definition.addInstance': (state, payload) => {
    const p = payload as Record<string, unknown>;
    if (!state.definition.instances) {
      state.definition.instances = {};
    }

    const name = (p.name as string) ?? `instance_${++instanceCounter}`;
    const instance: FormInstance = {};

    if (typeof p.source === 'string') instance.source = p.source;
    if (objectRecord(p.schema)) instance.schema = p.schema as Record<string, string>;
    if (objectRecord(p.data)) instance.data = p.data as Record<string, unknown>;
    if (typeof p.static === 'boolean') instance.static = p.static;
    if (typeof p.readonly === 'boolean') instance.readonly = p.readonly;
    if (typeof p.description === 'string') instance.description = p.description;
    if (objectRecord(p.extensions)) instance.extensions = p.extensions as {};

    state.definition.instances[name] = instance;
    return { rebuildComponentTree: false };
  },

  'definition.setInstance': (state, payload) => {
    const { name, property, value } = payload as { name: string; property: string; value: unknown };
    const instances = state.definition.instances;
    if (!instances?.[name]) throw new Error(`Instance not found: ${name}`);

    setRecordProperty(instances[name] as Record<string, unknown>, property, value);

    return { rebuildComponentTree: false };
  },

  'definition.renameInstance': (state, payload) => {
    const { name, newName } = payload as { name: string; newName: string };
    const instances = state.definition.instances;
    if (!instances?.[name]) throw new Error(`Instance not found: ${name}`);

    instances[newName] = instances[name];
    delete instances[name];

    const rewrite = (expr: string): string =>
      rewriteFELReferences(expr, {
        rewriteInstanceName(instanceName) {
          return instanceName === name ? newName : instanceName;
        },
      });

    for (const bind of state.definition.binds ?? []) {
      rewriteBindFelExpressions(bind, rewrite);
    }
    for (const shape of state.definition.shapes ?? []) {
      rewriteShapeFelExpressions(shape, path => path, rewrite);
    }
    for (const variable of state.definition.variables ?? []) {
      rewriteVariableExpression(variable, rewrite);
    }
    const walkItems = (items: FormItem[]) => {
      for (const item of items) {
        rewriteItemFelExpressions(item, rewrite);
        if (item.children) walkItems(item.children);
      }
    };
    walkItems(state.definition.items);
    if (state.screener) {
      for (const phase of state.screener.evaluation) {
        for (const route of phase.routes) {
          if (typeof route.condition === 'string') route.condition = rewrite(route.condition);
          if (typeof route.score === 'string') route.score = rewrite(route.score);
        }
      }
    }
    for (const rule of allMappingRules(state.mappings)) {
      rewriteMappingRuleFieldRefs(rule, path => path, rewrite);
    }

    return { rebuildComponentTree: false };
  },

  'definition.deleteInstance': (state, payload) => {
    const { name } = payload as { name: string };
    if (state.definition.instances) {
      delete state.definition.instances[name];
    }
    return { rebuildComponentTree: false };
  },
} satisfies Record<string, CommandHandler>;
