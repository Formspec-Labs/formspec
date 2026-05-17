/**
 * Option set command handlers for the Formspec Studio Core.
 *
 * Option sets are named, reusable collections of selectable options (label/value pairs)
 * that can be shared across multiple choice-type fields (dropdowns, radio groups,
 * checkbox groups, etc.). Instead of duplicating the same list of options on every
 * field that needs them, authors declare a named option set once in
 * `definition.optionSets` and reference it by name from any field via the
 * `optionSet` property.
 *
 * An option set can be defined in two forms:
 * - **Inline**: an array of `Option` objects (each with at least `value` and `label`),
 *   optionally including FEL-based visibility conditions per option.
 * - **External source**: a URI string pointing to a remote option list, with optional
 *   `valueField` and `labelField` mappings.
 *
 * @module definition-optionsets
 */
import type { CommandHandler } from '../types.js';
import type { FormItem, FormOption, OptionSet } from '@formspec-org/types';
import { setRecordProperty } from '../record-mutate.js';

export const definitionOptionsetsHandlers = {

  'definition.setOptionSet': (state, payload) => {
    const p = payload as { name: string; options?: unknown[]; source?: string };
    if (!state.definition.optionSets) {
      state.definition.optionSets = {};
    }
    if (p.options) {
      state.definition.optionSets[p.name] = { options: p.options as FormOption[] };
    } else if (p.source) {
      state.definition.optionSets[p.name] = { source: p.source };
    } else {
      state.definition.optionSets[p.name] = { options: [] };
    }
    return { rebuildComponentTree: false };
  },

  'definition.setOptionSetProperty': (state, payload) => {
    const { name, property, value } = payload as { name: string; property: string; value: unknown };
    const optionSets = state.definition.optionSets;
    if (!optionSets?.[name]) return { rebuildComponentTree: false };

    setRecordProperty(optionSets[name] as Record<string, unknown>, property, value);
    return { rebuildComponentTree: false };
  },

  'definition.deleteOptionSet': (state, payload) => {
    const { name } = payload as { name: string };
    const optionSets = state.definition.optionSets;
    if (!optionSets?.[name]) return { rebuildComponentTree: false };

    const options = optionSets[name];

    // Inline options into referencing fields
    const inlineRefs = (items: FormItem[]) => {
      for (const item of items) {
        if (item.optionSet === name) {
          delete item.optionSet;
          const optionSet: OptionSet = options;
          if (Array.isArray(optionSet.options)) {
            item.options = optionSet.options;
          }
        }
        if (item.children) inlineRefs(item.children);
      }
    };
    inlineRefs(state.definition.items);

    delete optionSets[name];
    return { rebuildComponentTree: false };
  },

  'definition.promoteToOptionSet': (state, payload) => {
    const { path, name } = payload as { path: string; name: string };

    // Find the field by walking the dot-separated path through the item tree
    const parts = path.split('.');
    let items = state.definition.items;
    let item: FormItem | undefined;

    for (let i = 0; i < parts.length; i++) {
      const found = items.find(it => it.key === parts[i]);
      if (!found) throw new Error(`Item not found: ${path}`);
      if (i === parts.length - 1) {
        item = found;
      } else {
        if (!found.children) throw new Error(`Item not found: ${path}`);
        items = found.children;
      }
    }

    if (!item?.options) throw new Error(`Item has no inline options: ${path}`);

    // Create the option set from the field's inline options
    if (!state.definition.optionSets) {
      state.definition.optionSets = {};
    }
    state.definition.optionSets[name] = { options: item.options };

    // Replace inline options with a named reference
    delete item.options;
    item.optionSet = name;

    return { rebuildComponentTree: false };
  },
} satisfies Record<string, CommandHandler>;
