/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * Enumerates differences between two versions of a Formspec Definition. Each change is an atomic record describing an addition, removal, modification, move, or rename of a definition element (item, bind, shape, optionSet, dataSource, screener, migration, or metadata). Impact classification (breaking/compatible/cosmetic) drives semver governance and migration generation.
 */
export interface ChangelogDocument {
  /**
   * Changelog specification version. MUST be '1.0'.
   */
  $formspecChangelog: '1.0';
  $schema?: string;
  /**
   * Canonical URL of the Definition whose versions are compared. Must match the definition's top-level 'url' property.
   */
  definitionUrl: string;
  /**
   * Base version (before changes). Interpreted per the definition's versionAlgorithm (default: semver).
   */
  fromVersion: string;
  /**
   * Target version (after changes). Interpreted per the definition's versionAlgorithm (default: semver).
   */
  toVersion: string;
  /**
   * ISO 8601 timestamp when this changelog was generated.
   */
  generatedAt?: string;
  /**
   * Maximum impact across all changes. Must equal the highest impact in the changes array: breaking → major, compatible → minor, cosmetic → patch.
   */
  semverImpact: 'major' | 'minor' | 'patch';
  /**
   * Human-readable summary of changes for release notes.
   */
  summary?: string;
  /**
   * Ordered array of Change objects. Each entry describes one atomic modification to a definition element.
   */
  changes: Change[];
}
/**
 * A single atomic modification to a definition element. The combination of type + target + path uniquely identifies what changed; impact classifies severity; before/after capture the structural diff; migrationHint suggests how to transform existing response data.
 *
 * This interface was referenced by `ChangelogDocument`'s JSON-Schema
 * via the `definition` "Change".
 */
export interface Change {
  /**
   * Kind of change. 'added': new element in toVersion. 'removed': element absent in toVersion. 'modified': element exists in both but properties differ. 'moved': element relocated to a different parent group (key preserved). 'renamed': item key changed (detected heuristically — unpaired remove/add with matching dataType, children, and binds).
   */
  type: 'added' | 'removed' | 'modified' | 'moved' | 'renamed';
  /**
   * Category of affected definition element. Closed-core: 'item' (field, group, or display node), 'bind' (reactive behavioral declaration — calculate, relevant, required, readonly, constraint), 'shape' (composable validation rule), 'optionSet' (named reusable option list), 'dataSource' (secondary instance declaration), 'screener' (routing rule), 'migration' (version migration map), 'metadata' (top-level properties — title, description, status, formPresentation). Module-extensible via `x-` prefix following the canonical regex (ADR 0150 §4.5).
   */
  target: ('item' | 'bind' | 'shape' | 'optionSet' | 'dataSource' | 'screener' | 'migration' | 'metadata') | string;
  /**
   * Dot-path to the affected element within the definition. For items: 'items.' prefix followed by group nesting (e.g., 'items.budget.personnel'). For binds: the bind's target path (e.g., 'budget.totalCost'). For shapes: 'shapes.' + shape id. For optionSets: 'optionSets.' + set name. For metadata: the property name (e.g., 'title', 'status').
   */
  path: string;
  /**
   * The item's key property when target is 'item'. Provides the stable identifier used to match items across versions.
   */
  key?: string;
  /**
   * Severity classification of this change. 'breaking' (→ major): existing responses may be invalid — item removed, key renamed, dataType changed, required added to existing field, repeat toggled, itemType changed, option removed from closed set. 'compatible' (→ minor): additive, no data loss — optional item added, option added, constraint relaxed, item moved, new shape/bind. 'cosmetic' (→ patch): display-only — label/hint/description/help changed, display order changed.
   */
  impact: 'breaking' | 'compatible' | 'cosmetic';
  /**
   * Human-readable description of the change for release notes and reviewer context.
   */
  description?: string;
  /**
   * Previous value or structural fragment. Present for 'modified' (changed properties only), 'removed' (full element snapshot), 'renamed' (object with old key), and 'moved' (object with old path). Omitted for 'added'.
   */
  before?: {
    [k: string]: unknown;
  };
  /**
   * New value or structural fragment. Present for 'added' (full element snapshot), 'modified' (changed properties only), 'renamed' (object with new key), and 'moved' (object with new path). Omitted for 'removed'.
   */
  after?: {
    [k: string]: unknown;
  };
  /**
   * Suggested transform for existing response data. Three forms: 'drop' (discard the value), 'preserve' (carry forward unchanged or into extension data), or a FEL expression referencing $old (e.g., '$old.cost', 'string($old.amount)'). Used to auto-generate §6.7 migration fieldMap entries.
   */
  migrationHint?: string;
}
