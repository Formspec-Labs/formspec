/**
 * Definition-level metadata and form-presentation handlers.
 *
 * This module is intentionally narrow: it only mutates Tier 1 authoring state
 * that belongs on the definition itself.
 *
 * That includes:
 * - top-level definition metadata (`definition.setDefinitionProperty`)
 * - form presentation behavior such as `pageMode` (`definition.setFormPresentation`)
 * - group `$ref` composition (`definition.setGroupRef`)
 *
 * It does not author Tier 2 theme pages or Tier 3 component Page nodes. Those
 * higher-precedence layout surfaces are handled elsewhere.
 *
 * @module definition-pages
 */
import type { CommandHandler } from '../types.js';
import { setRecordProperty } from '../record-mutate.js';
import { resolveItemLocation } from './helpers.js';

export const definitionPagesHandlers = {

  'definition.setDefinitionProperty': (state, payload) => {
    const { property, value } = payload as { property: string; value: unknown };

    setRecordProperty(state.definition as Record<string, unknown>, property, value);

    return { rebuildComponentTree: false };
  },

  'definition.setFormPresentation': (state, payload) => {
    const { property, value } = payload as { property: string; value: unknown };

    if (!state.definition.formPresentation) {
      state.definition.formPresentation = {};
    }

    if (value === null || value === undefined) {
      delete state.definition.formPresentation[property];
    } else {
      state.definition.formPresentation[property] = value;
    }

    return { rebuildComponentTree: false };
  },

  'definition.setGroupRef': (state, payload) => {
    const { path, ref, keyPrefix } = payload as { path: string; ref: string | null; keyPrefix?: string };
    const loc = resolveItemLocation(state, path);
    if (!loc) throw new Error(`Item not found: ${path}`);

    if (ref === null) {
      delete loc.item.$ref;
      delete loc.item.keyPrefix;
    } else {
      loc.item.$ref = ref;
      if (keyPrefix) loc.item.keyPrefix = keyPrefix;
    }

    return { rebuildComponentTree: true };
  },
} satisfies Record<string, CommandHandler>;
