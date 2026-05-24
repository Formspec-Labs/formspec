/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { MappingEntry } from './validation-mapping.js';

/**
 * Frozen mirror of tests/conformance/fixtures/validation-mapping/closed-core-5-rows-jcs.json.
 * Runtime consumers (Response Actions intent->validation-tuple resolution)
 * MUST consult this generated const, never a hand-authored copy.
 */
export const VALIDATION_MAPPING_MASTER_TABLE: readonly MappingEntry[] =
  [
    {
      "blocking": "non-blocking",
      "intent": "save-draft",
      "persistence": "draft-checkpoint",
      "profile": "off"
    },
    {
      "blocking": "non-blocking",
      "intent": "autosave",
      "persistence": "draft-checkpoint",
      "profile": "off"
    },
    {
      "blocking": "non-blocking",
      "intent": "review",
      "persistence": "none",
      "profile": "on-submit"
    },
    {
      "blocking": "block-on-error",
      "intent": "submit",
      "persistence": "complete-response",
      "profile": "on-submit"
    },
    {
      "blocking": "non-blocking",
      "intent": "request-evidence",
      "persistence": "draft-checkpoint",
      "profile": "on-demand"
    }
  ] as const;
