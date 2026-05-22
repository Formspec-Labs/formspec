/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * Closed, abstract enum naming what a form caller is trying to do. save-draft: persist current Response as a draft, validation findings ignored. autosave: background or periodic save, identical mapping to save-draft. review: read-only validation pass; no persistence transition. submit: attempt transition to Response status 'completed'. request-evidence: invoke demand-timing shapes (Core §5.2.1) only. See specs/core/validation-mapping.md §2.
 *
 * This interface was referenced by `ValidationMappingDocument`'s JSON-Schema
 * via the `definition` "ActionIntent".
 */
export type ActionIntent = 'save-draft' | 'autosave' | 'review' | 'submit' | 'request-evidence';
/**
 * Closed named profile pinning a (Core global mode, per-shape timing filter) pair under a single identifier. live: Core 'continuous' + continuous-timing shapes during normal revalidation. on-submit: Core 'continuous' + continuous and submit-timing shapes; demand shapes excluded. on-demand: Core 'deferred' + only demand-timing shapes fire. off: Core 'disabled' + no shapes fire (no ValidationReport produced). See specs/core/validation-mapping.md §3.
 *
 * This interface was referenced by `ValidationMappingDocument`'s JSON-Schema
 * via the `definition` "ValidationProfile".
 */
export type ValidationProfile = 'live' | 'on-submit' | 'on-demand' | 'off';
/**
 * Closed two-value enum naming whether error-severity findings stop the surrounding intent. non-blocking: findings never stop the intent. block-on-error: intent halts before higher-persistence transitions when ValidationReport.valid is false (counts.error > 0). Preserves Core §5.5 VE-05 by blocking the transition, not the underlying data persistence. See specs/core/validation-mapping.md §4.
 *
 * This interface was referenced by `ValidationMappingDocument`'s JSON-Schema
 * via the `definition` "BlockingPolicy".
 */
export type BlockingPolicy = 'non-blocking' | 'block-on-error';
/**
 * Closed three-value enum naming the Response lifecycle effect of the intent. none: no status change, no persistence. draft-checkpoint: persist current Response state, status remains 'in-progress' (permitted under any validation outcome, VE-05). complete-response: persist AND transition status to 'completed' (requires ValidationReport.valid === true, Core §5.4 invariant). See specs/core/validation-mapping.md §5.
 *
 * This interface was referenced by `ValidationMappingDocument`'s JSON-Schema
 * via the `definition` "PersistencePolicy".
 */
export type PersistencePolicy = 'none' | 'draft-checkpoint' | 'complete-response';
/**
 * Reusable §6.3 validity predicate for any object carrying profile, blocking, and persistence. The four prose clauses collapse into three allOf entries because clauses 1+2 share the antecedent persistence=complete-response and merge into a single if/then. This $def is intentionally open so composing schemas such as MappingEntry can add intent while reusing the predicate. Consumers that need exactly the tuple MUST $ref ValidationTuple, not this predicate helper.
 *
 * This interface was referenced by `ValidationMappingDocument`'s JSON-Schema
 * via the `definition` "ValidationTuplePredicate".
 */
export type ValidationTuplePredicate = {
  [k: string]: unknown;
} & {
  profile?: ValidationProfile;
  blocking?: BlockingPolicy;
  persistence?: PersistencePolicy;
};
/**
 * The exact (profile, blocking, persistence) triple defined by VM §3-§5 with the §6.3 validity predicate enforced as schema-level constraints. Response Actions ValidationOverride and other consumers that carry only the tuple MUST $ref this closed $def.
 *
 * This interface was referenced by `ValidationMappingDocument`'s JSON-Schema
 * via the `definition` "ValidationTuple".
 */
export type ValidationTuple = {
  profile: ValidationProfile;
  blocking: BlockingPolicy;
  persistence: PersistencePolicy;
};
/**
 * A single row of the master mapping table. Permitted (profile, blocking, persistence) tuples are governed by the §6.3 predicate via ValidationTuplePredicate; processors MUST reject rows that violate it. Response Actions overrides use the exact ValidationTuple $def, not MappingEntry, because overrides do not carry intent.
 *
 * This interface was referenced by `ValidationMappingDocument`'s JSON-Schema
 * via the `definition` "MappingEntry".
 */
export type MappingEntry = ValidationTuplePredicate & {
  intent: ActionIntent | string;
  profile: ValidationProfile;
  blocking: BlockingPolicy;
  persistence: PersistencePolicy;
};
/**
 * Frozen master mapping table. MUST equal specs/core/validation-mapping.md §6 row-for-row. The const constrains any document carrying this property to the canonical table; documents that override individual entries do so per Action, not by replacing the master table.
 *
 * @minItems 5
 * @maxItems 5
 *
 * This interface was referenced by `ValidationMappingDocument`'s JSON-Schema
 * via the `definition` "MasterTable".
 */
export type MasterTable = [MappingEntry, MappingEntry, MappingEntry, MappingEntry, MappingEntry];

/**
 * Closed vocabularies and the master mapping table that reconciles Action Intent, Validation Profile, Blocking Policy, and Persistence Policy across Formspec Core §5 (Validation), Component §5.19 (ActionButton), Component §6.13 (ValidationSummary), and the Response status lifecycle. See specs/core/validation-mapping.md for the normative prose. This schema's MasterTable const MUST equal the prose §6 row-for-row; conformance is pinned by tests/conformance/spec/test_validation_mapping_table.py.
 */
export interface ValidationMappingDocument {
  /**
   * Validation Mapping specification version. MUST be '1.0'.
   */
  $formspecValidationMapping: '1.0';
  /**
   * Version of this Validation Mapping Document. SemVer RECOMMENDED.
   */
  version: string;
}
