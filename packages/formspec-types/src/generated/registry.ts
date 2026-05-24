/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { Party, LangMap, ContactPoint, ModuleRef } from './common.js';
/**
 * Organization publishing this registry document. Provides provenance and contact information for all entries unless overridden at the entry level.
 */
export type Publisher = Party & {
  name: string | LangMap;
  identifier?: string;
  homepage?: string;
  contactPoint?: ContactPoint | ContactPoint[];
  /**
   * @deprecated
   * DEPRECATED: alias for `homepage`. Removed in v1.2.
   */
  url?: string;
  /**
   * @deprecated
   * DEPRECATED: prefer structured `contactPoint`. Removed in v1.2.
   */
  contact?: string;
};
/**
 * A single registry entry. Describes one Formspec extension or semantic metadata entry — its identity, category, lifecycle status, compatibility bounds, and category-specific metadata. Category-specific properties become required based on the category value: dataType requires baseType; function requires parameters and returns; constraint requires parameters; concept requires conceptUri; vocabulary requires vocabularySystem.
 *
 * This interface was referenced by `RegistryDocument`'s JSON-Schema
 * via the `definition` "RegistryEntry".
 */
export type RegistryEntry = {
  [k: string]: unknown;
} & {
  /**
   * The x-prefixed extension identifier. Must be lowercase ASCII with hyphen-separated segments, each starting with a letter. The prefix x-formspec- is reserved for future core promotion.
   */
  name: string;
  /**
   * The entry category. Determines which category-specific properties are required: dataType requires baseType; function requires parameters and returns; constraint requires parameters; concept requires conceptUri; vocabulary requires vocabularySystem; module requires contributes; unit-kind requires semantics; widget requires widgetShape; action-intent requires validation; slot-type requires slotShape; validation-mapping-row requires row; token-category requires categoryShape. property has no additional required properties. `namespace` was renamed to `module` per ADR 0150 §4.1 (greenfield rename, no alias).
   */
  category:
    | 'dataType'
    | 'function'
    | 'constraint'
    | 'property'
    | 'module'
    | 'concept'
    | 'vocabulary'
    | 'unit-kind'
    | 'widget'
    | 'action-intent'
    | 'slot-type'
    | 'validation-mapping-row'
    | 'token-category';
  /**
   * Semver version of the extension itself (not the Formspec version). Within a registry document, the (name, version) tuple MUST be unique. A new major version MAY re-enter draft status.
   */
  version: string;
  /**
   * Lifecycle status. Transitions: draft → stable → deprecated → retired. Transitions MUST NOT skip states. Stable means the interface is frozen for the major version. Deprecated requires a deprecationNotice. Processors encountering retired extensions SHOULD emit a warning.
   */
  status: 'draft' | 'stable' | 'deprecated' | 'retired';
  publisher?: Publisher;
  /**
   * Human-readable summary of the extension's purpose and behavior.
   */
  description: string;
  /**
   * Link to the full human-readable extension documentation or specification.
   */
  specUrl?: string;
  /**
   * Link to a JSON Schema for validating the extension's data as it appears in a Formspec Definition document. Registry-aware processors SHOULD fetch and validate against this schema.
   */
  schemaUrl?: string;
  /**
   * Version compatibility bounds. Processors MUST verify the current Formspec version satisfies formspecVersion. A mismatch produces a warning (or hard error if x-formspec-strict is set in extensions).
   */
  compatibility: {
    /**
     * Semver range of compatible Formspec core specification versions. Uses npm-style range syntax.
     */
    formspecVersion: string;
    /**
     * Semver range of compatible Mapping DSL versions. Only relevant for extensions that interact with the Mapping specification.
     */
    mappingDslVersion?: string;
  };
  /**
   * SPDX license identifier for the extension (e.g. 'Apache-2.0', 'MIT', 'CC0-1.0'). See https://spdx.org/licenses/ for valid identifiers.
   */
  license?: string;
  /**
   * Human-readable deprecation message explaining why the extension is deprecated and identifying a replacement if one exists. REQUIRED when status is 'deprecated'. Processors SHOULD surface this message to form authors.
   */
  deprecationNotice?: string;
  /**
   * Array of JSON values demonstrating how this extension is used in a Formspec Definition. Each element is a free-form JSON value — typically a fragment of a definition document or an item using the extension.
   */
  examples?: unknown[];
  /**
   * Entry-level extension properties for vendor-specific metadata. All property keys MUST be x-prefixed.
   */
  extensions?: {};
  /**
   * The core Formspec data type that this custom dataType extends. REQUIRED when category is 'dataType'. The custom type inherits the base type's serialization, comparison, and FEL operator semantics.
   */
  baseType?: 'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'dateTime' | 'time' | 'uri';
  /**
   * Default constraint values applied to fields using this custom dataType. Keys are constraint names, values are their defaults. Only meaningful when category is 'dataType'.
   */
  constraints?: {};
  /**
   * Presentation and descriptive metadata for this entry. For dataType entries, provides rendering hints (prefix, precision, formatting). For concept and vocabulary entries, provides display metadata (displayName). Open object — keys are not restricted.
   */
  metadata?: {};
  /**
   * Function or constraint signature parameters. REQUIRED when category is 'function' or 'constraint'. Each parameter declares name, type, and optional description. Parameters are positional — order matters for function calls in FEL.
   */
  parameters?: {
    /**
     * Parameter name used in documentation and error messages.
     */
    name: string;
    /**
     * Core Formspec data type name for this parameter (e.g. 'string', 'number', 'date', 'boolean', 'array').
     */
    type: string;
    /**
     * Human-readable explanation of what this parameter represents.
     */
    description?: string;
  }[];
  /**
   * Core Formspec data type name for the return value of a custom function. REQUIRED when category is 'function'. Used by processors for type checking in FEL expressions.
   */
  returns?: string;
  /**
   * Array of x-prefixed Registry entry names this module bundles. REQUIRED when category is 'module'. Each MUST exist in this or a referenced registry. Replaces the old `members[]` per ADR 0150 §4.1.
   */
  contributes?: string[];
  /**
   * Other modules this module requires. OPTIONAL when category is 'module'. Uses the canonical `ModuleRef` $def for shape parity with document `modules[]` and `posture.allowedModules[]`.
   */
  dependencies?: ModuleRef[];
  /**
   * Processor/renderer obligations describing the unit-kind's behavioral semantics. REQUIRED when category is 'unit-kind'. Free-form per module; module ships canonical sub-schema referenced from `schemaUrl` for richer validation. Per ADR 0150 §4.2.
   */
  semantics?: {};
  /**
   * Widget contract (props, children policy, fallback chain). REQUIRED when category is 'widget'. The `props` sub-object is the JSON Schema validating Theme's `widgetConfig` slot (theme.schema.json) when a Theme configures a module-supplied widget. Per ADR 0150 §4.2 / Component §progressive-to-core.
   */
  widgetShape?: {};
  /**
   * Full ValidationTuple per VM §6.1. REQUIRED when category is 'action-intent'. Per ADR 0150 §4.2.
   */
  validation?: {};
  /**
   * What the slot binds to + composition rules. REQUIRED when category is 'slot-type'. Per ADR 0150 §4.2.
   */
  slotShape?: {};
  /**
   * Closed MappingEntry shape per VM §6. REQUIRED when category is 'validation-mapping-row'. Contributes a row to the `validation-mapping.MasterTable` after the §4.2 four-constraint demotion. Per ADR 0150 §4.2.
   */
  row?: {};
  /**
   * Token category shape (mirrors today's token-registry.schema.json `Category` shape). REQUIRED when category is 'token-category'. Folds Token Registry into the unified Registry as a contribution profile per ADR 0150 §2.3/§4.2.
   */
  categoryShape?: {};
  /**
   * The concept IRI in the external ontology or standard. REQUIRED when category is 'concept'. This is the globally unique identifier for the concept this entry represents.
   */
  conceptUri?: string;
  /**
   * The ontology or concept system URI. RECOMMENDED when category is 'concept'. Identifies which ontology or standard the concept belongs to.
   */
  conceptSystem?: string;
  /**
   * Short code within the concept system (e.g., 'EIN', 'MR'). Only meaningful when category is 'concept'.
   */
  conceptCode?: string;
  /**
   * Cross-system equivalences for this concept. Each element declares that the concept is equivalent to a concept in another system, with a SKOS-inspired relationship type. Only meaningful when category is 'concept'.
   */
  equivalents?: ConceptEquivalent[];
  /**
   * The terminology system URI. REQUIRED when category is 'vocabulary'. Identifies the external terminology system this entry represents.
   */
  vocabularySystem?: string;
  /**
   * Version of the external terminology. Only meaningful when category is 'vocabulary'.
   */
  vocabularyVersion?: string;
  filter?: VocabularyFilter;
};
/**
 * A static JSON document format for publishing, discovering, and validating Formspec extensions and semantic metadata. A Registry Document enumerates named entries — custom data types, functions, constraints, properties, namespaces, concept identities, and vocabulary bindings — with metadata, version history, compatibility bounds, and machine-readable schemas. Any organization MAY publish its own Registry Document. Interoperability is achieved through the common format, not centralized authority.
 */
export interface RegistryDocument {
  /**
   * Registry specification version. MUST be '1.0'.
   */
  $formspecRegistry: '1.0';
  /**
   * Optional JSON Schema URI for editor validation and autocompletion.
   */
  $schema?: string;
  publisher: Publisher;
  /**
   * ISO 8601 timestamp indicating when this registry version was published. Used for freshness checks and conditional GET cache validation.
   */
  published: string;
  /**
   * Array of extension registry entries. Each entry describes one extension with its category, version, compatibility bounds, and category-specific metadata. Within a single document, the (name, version) tuple MUST be unique.
   */
  entries: RegistryEntry[];
  /**
   * Registry-level extension properties for vendor-specific metadata. All property keys MUST be x-prefixed.
   */
  extensions?: {};
}
/**
 * Extension object whose keys must be prefixed with x-.
 */
export interface Extensions {}
/**
 * Declares that the bound concept is equivalent to a concept in another system. Relationship types follow SKOS (Simple Knowledge Organization System) semantics.
 *
 * This interface was referenced by `RegistryDocument`'s JSON-Schema
 * via the `definition` "ConceptEquivalent".
 */
export interface ConceptEquivalent {
  /**
   * The target system URI.
   */
  system: string;
  /**
   * The concept code within the target system.
   */
  code: string;
  /**
   * Human-readable name in the target system.
   */
  display?: string;
  /**
   * Relationship type (SKOS-inspired). When absent, processors MUST treat as 'exact'. Standard values: 'exact' (identical concept), 'close' (very similar), 'broader' (source is more specific), 'narrower' (source is more general), 'related' (associatively related). Custom types MUST be x-prefixed.
   */
  type?: string;
}
/**
 * Subset constraints limiting which portion of the vocabulary is in scope. Only meaningful when category is 'vocabulary'.
 */
export interface VocabularyFilter {
  /**
   * Root code for hierarchical filtering. Only descendants of this code are included.
   */
  ancestor?: string;
  /**
   * Maximum depth from the ancestor code.
   */
  maxDepth?: number;
  /**
   * Explicit list of codes to include.
   *
   * @minItems 1
   */
  include?: [string, ...string[]];
  /**
   * Explicit list of codes to exclude.
   *
   * @minItems 1
   */
  exclude?: [string, ...string[]];
}
