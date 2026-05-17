/**
 * Mapping command handlers.
 *
 * The Formspec mapping document defines bidirectional transforms between form
 * responses (source) and external data schemas (target).
 *
 * All handlers return `{ rebuildComponentTree: false }` because mapping
 * mutations do not alter the definition item tree structure.
 *
 * @module handlers/mapping
 */
import type { CommandHandler, ProjectState, MappingState } from '../types.js';
import type { FieldRule, FormItem, TargetSchema } from '@formspec-org/types';

type EditableFieldRule = FieldRule & { innerRules?: FieldRule[] };

/** Helper to resolve the target mapping record from state and payload. */
function getMapping(state: ProjectState, mappingId?: string): MappingState {
  const id = mappingId || state.selectedMappingId || 'default';
  if (!state.mappings[id]) {
    state.mappings[id] = { rules: [] };
  }
  return state.mappings[id];
}

function mappingRecordProperty(mapping: MappingState, property: string, value: unknown): void {
  if (value === null) {
    delete mapping[property];
  } else {
    mapping[property] = value;
  }
}

function newFieldRule(partial: {
  sourcePath?: string;
  targetPath?: string;
  transform?: FieldRule['transform'];
}): FieldRule {
  const rule: FieldRule = { transform: partial.transform ?? 'preserve' };
  if (partial.sourcePath !== undefined) rule.sourcePath = partial.sourcePath;
  if (partial.targetPath !== undefined) rule.targetPath = partial.targetPath;
  return rule;
}

export const mappingHandlers = {

  'mapping.create': (state, payload) => {
    const { id, targetSchema, ...rest } = payload as {
      id: string;
      targetSchema?: TargetSchema;
    };
    if (state.mappings[id]) throw new Error(`Mapping already exists: ${id}`);
    state.mappings[id] = {
      rules: [],
      targetSchema: targetSchema ?? { format: 'json' },
      ...rest,
    };
    state.selectedMappingId = id;
    return { rebuildComponentTree: false };
  },

  'mapping.delete': (state, payload) => {
    const { id } = payload as { id: string };
    delete state.mappings[id];
    if (state.selectedMappingId === id) {
      state.selectedMappingId = Object.keys(state.mappings)[0] || 'default';
    }
    return { rebuildComponentTree: false };
  },

  'mapping.rename': (state, payload) => {
    const { oldId, newId } = payload as { oldId: string; newId: string };
    if (!state.mappings[oldId]) throw new Error(`Mapping not found: ${oldId}`);
    if (state.mappings[newId]) throw new Error(`Mapping already exists: ${newId}`);
    state.mappings[newId] = state.mappings[oldId];
    delete state.mappings[oldId];
    if (state.selectedMappingId === oldId) state.selectedMappingId = newId;
    return { rebuildComponentTree: false };
  },

  'mapping.select': (state, payload) => {
    const { id } = payload as { id: string };
    state.selectedMappingId = id;
    return { rebuildComponentTree: false };
  },

  'mapping.setProperty': (state, payload) => {
    const { mappingId, property, value } = payload as { mappingId?: string; property: string; value: unknown };
    const mapping = getMapping(state, mappingId);
    mappingRecordProperty(mapping, property, value);
    return { rebuildComponentTree: false };
  },

  'mapping.setTargetSchema': (state, payload) => {
    const { mappingId, property, value } = payload as { mappingId?: string; property: string; value: unknown };
    const mapping = getMapping(state, mappingId);
    if (!mapping.targetSchema) mapping.targetSchema = { format: 'json' };
    if (value === null) {
      delete mapping.targetSchema[property];
    } else {
      mapping.targetSchema[property] = value;
    }
    return { rebuildComponentTree: false };
  },

  'mapping.addRule': (state, payload) => {
    const p = payload as {
      mappingId?: string;
      sourcePath?: string;
      targetPath?: string;
      transform?: FieldRule['transform'];
      insertIndex?: number;
    };
    const mapping = getMapping(state, p.mappingId);
    if (!mapping.rules) mapping.rules = [];

    const rule = newFieldRule(p);

    if (p.insertIndex !== undefined) {
      mapping.rules.splice(p.insertIndex, 0, rule);
    } else {
      mapping.rules.push(rule);
    }
    return { rebuildComponentTree: false };
  },

  'mapping.setRule': (state, payload) => {
    const { mappingId, index, property, value } = payload as {
      mappingId?: string;
      index: number;
      property: string;
      value: unknown;
    };
    const mapping = getMapping(state, mappingId);
    const rules = mapping.rules;
    if (!rules?.[index]) throw new Error(`Rule not found at index: ${index}`);
    rules[index][property] = value;
    return { rebuildComponentTree: false };
  },

  'mapping.deleteRule': (state, payload) => {
    const { mappingId, index } = payload as { mappingId?: string; index: number };
    const mapping = getMapping(state, mappingId);
    if (!mapping.rules) return { rebuildComponentTree: false };
    mapping.rules.splice(index, 1);
    return { rebuildComponentTree: false };
  },

  'mapping.clearRules': (state, payload) => {
    const { mappingId } = payload as { mappingId?: string };
    const mapping = getMapping(state, mappingId);
    mapping.rules = [];
    return { rebuildComponentTree: false };
  },

  'mapping.reorderRule': (state, payload) => {
    const { mappingId, index, direction } = payload as { mappingId?: string; index: number; direction: 'up' | 'down' };
    const mapping = getMapping(state, mappingId);
    const rules = mapping.rules;
    if (!rules) return { rebuildComponentTree: false };
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= rules.length) return { rebuildComponentTree: false };
    [rules[index], rules[target]] = [rules[target], rules[index]];
    return { rebuildComponentTree: false };
  },

  'mapping.setAdapter': (state, payload) => {
    const { mappingId, format, config } = payload as { mappingId?: string; format: string; config: unknown };
    const mapping = getMapping(state, mappingId);
    if (!mapping.adapters) mapping.adapters = {};
    mapping.adapters[format] = config;
    return { rebuildComponentTree: false };
  },

  'mapping.setDefaults': (state, payload) => {
    const { mappingId, defaults } = payload as { mappingId?: string; defaults: Record<string, unknown> };
    const mapping = getMapping(state, mappingId);
    mapping.defaults = defaults;
    return { rebuildComponentTree: false };
  },

  'mapping.autoGenerateRules': (state, payload) => {
    const p = payload as { mappingId?: string; scopePath?: string; priority?: number; replace?: boolean };
    const mapping = getMapping(state, p.mappingId);
    if (!mapping.rules) mapping.rules = [];

    const rules = mapping.rules;

    if (p.replace) {
      for (let i = rules.length - 1; i >= 0; i--) {
        if (rules[i]['x-autoGenerated']) rules.splice(i, 1);
      }
    }

    const covered = new Set(rules.map(r => r.sourcePath));
    const fieldPaths: string[] = [];
    const walk = (items: FormItem[], prefix: string) => {
      for (const item of items) {
        const path = prefix ? `${prefix}.${item.key}` : item.key;
        if (item.type === 'field') fieldPaths.push(path);
        if (item.children) walk(item.children, path);
      }
    };
    walk(state.definition.items, p.scopePath ?? '');

    for (const path of fieldPaths) {
      if (!covered.has(path)) {
        rules.push({
          sourcePath: path,
          targetPath: path,
          transform: 'preserve',
          priority: p.priority ?? -1,
          'x-autoGenerated': true,
        });
      }
    }

    return { rebuildComponentTree: false };
  },

  'mapping.setExtension': (state, payload) => {
    const { mappingId, key, value } = payload as { mappingId?: string; key: string; value: unknown };
    const mapping = getMapping(state, mappingId);
    mappingRecordProperty(mapping, key, value);
    return { rebuildComponentTree: false };
  },

  'mapping.setRuleExtension': (state, payload) => {
    const { mappingId, index, key, value } = payload as { mappingId?: string; index: number; key: string; value: unknown };
    const mapping = getMapping(state, mappingId);
    const rules = mapping.rules;
    if (!rules?.[index]) throw new Error(`Rule not found at index: ${index}`);
    if (value === null) {
      delete rules[index][key];
    } else {
      rules[index][key] = value;
    }
    return { rebuildComponentTree: false };
  },

  'mapping.addInnerRule': (state, payload) => {
    const p = payload as {
      mappingId?: string;
      ruleIndex: number;
      sourcePath?: string;
      targetPath?: string;
      transform?: FieldRule['transform'];
      insertIndex?: number;
    };
    const mapping = getMapping(state, p.mappingId);
    const rules = mapping.rules;
    if (!rules?.[p.ruleIndex]) throw new Error(`Rule not found at index: ${p.ruleIndex}`);

    const rule = rules[p.ruleIndex] as EditableFieldRule;
    if (!rule.innerRules) rule.innerRules = [];

    const inner = newFieldRule(p);

    if (p.insertIndex !== undefined) {
      rule.innerRules.splice(p.insertIndex, 0, inner);
    } else {
      rule.innerRules.push(inner);
    }
    return { rebuildComponentTree: false };
  },

  'mapping.setInnerRule': (state, payload) => {
    const { mappingId, ruleIndex, innerIndex, property, value } = payload as {
      mappingId?: string;
      ruleIndex: number;
      innerIndex: number;
      property: string;
      value: unknown;
    };
    const mapping = getMapping(state, mappingId);
    const rules = mapping.rules;
    const innerRules = (rules?.[ruleIndex] as EditableFieldRule | undefined)?.innerRules;
    if (!innerRules?.[innerIndex]) throw new Error('Inner rule not found');
    innerRules[innerIndex][property] = value;
    return { rebuildComponentTree: false };
  },

  'mapping.deleteInnerRule': (state, payload) => {
    const { mappingId, ruleIndex, innerIndex } = payload as { mappingId?: string; ruleIndex: number; innerIndex: number };
    const mapping = getMapping(state, mappingId);
    const rules = mapping.rules;
    const innerRules = (rules?.[ruleIndex] as EditableFieldRule | undefined)?.innerRules;
    if (!innerRules) throw new Error('Inner rules not found');
    innerRules.splice(innerIndex, 1);
    return { rebuildComponentTree: false };
  },

  'mapping.reorderInnerRule': (state, payload) => {
    const { mappingId, ruleIndex, innerIndex, direction } = payload as {
      mappingId?: string;
      ruleIndex: number;
      innerIndex: number;
      direction: 'up' | 'down';
    };
    const mapping = getMapping(state, mappingId);
    const rules = mapping.rules;
    const inner = (rules?.[ruleIndex] as EditableFieldRule | undefined)?.innerRules;
    if (!inner) throw new Error('Inner rules not found');
    const target = direction === 'up' ? innerIndex - 1 : innerIndex + 1;
    if (target < 0 || target >= inner.length) return { rebuildComponentTree: false };
    [inner[innerIndex], inner[target]] = [inner[target], inner[innerIndex]];
    return { rebuildComponentTree: false };
  },
} satisfies Record<string, CommandHandler>;
