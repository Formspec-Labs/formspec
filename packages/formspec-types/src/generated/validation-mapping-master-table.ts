/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { MappingEntry } from './validation-mapping.js';

/**
 * Frozen mirror of schemas/validation-mapping.schema.json#/$defs/MasterTable/const.
 * Runtime consumers (Response Actions intent->validation-tuple resolution)
 * MUST consult this generated const, never a hand-authored copy.
 */
export const VALIDATION_MAPPING_MASTER_TABLE: readonly MappingEntry[] =
  [
    {
      "intent": "save-draft",
      "profile": "off",
      "blocking": "non-blocking",
      "persistence": "draft-checkpoint"
    },
    {
      "intent": "autosave",
      "profile": "off",
      "blocking": "non-blocking",
      "persistence": "draft-checkpoint"
    },
    {
      "intent": "review",
      "profile": "on-submit",
      "blocking": "non-blocking",
      "persistence": "none"
    },
    {
      "intent": "submit",
      "profile": "on-submit",
      "blocking": "block-on-error",
      "persistence": "complete-response"
    },
    {
      "intent": "request-evidence",
      "profile": "on-demand",
      "blocking": "non-blocking",
      "persistence": "draft-checkpoint"
    }
  ] as const;
