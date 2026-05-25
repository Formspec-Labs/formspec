/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { TargetDefinition, Party, LangMap, ContactPoint } from './common.js';
/**
 * Organization publishing this ontology document.
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
 * A Formspec Ontology Document per the Ontology specification. A standalone sidecar that attaches semantic concept identifiers, cross-system equivalences, vocabulary bindings, and alignment metadata to a Formspec Definition. Like Theme, Component, and References documents, an Ontology Document targets a Definition but lives alongside it. Multiple Ontology Documents MAY target the same Definition (e.g., different domains, standards bodies, or interoperability contexts). Ontology metadata MUST NOT alter core behavioral semantics (required, relevant, readonly, calculate, validation). Ontology property values are static — FEL expressions MUST NOT appear in any ontology property.
 */
export interface OntologyDocument {
  /**
   * Ontology specification version. MUST be '1.0'.
   */
  $formspecOntology: '1.0';
  /**
   * Optional JSON Schema URI for editor validation and autocompletion.
   */
  $schema?: string;
  /**
   * Version of this Ontology Document.
   */
  version: string;
  /**
   * Canonical URI identifier for this Ontology Document.
   */
  url?: string;
  /**
   * Machine-readable short name for this Ontology Document. Pattern: letters, digits, hyphens, underscores; must start with a letter.
   */
  name?: string;
  targetDefinition: TargetDefinition;
  /**
   * Human-readable name for this Ontology Document.
   */
  title?: string;
  /**
   * Human-readable description of this document's purpose and scope.
   */
  description?: string;
  publisher?: Publisher;
  /**
   * ISO 8601 timestamp indicating when this ontology document was published.
   */
  published?: string;
  /**
   * Default concept system URI. Applied when a concept binding omits 'system'.
   */
  defaultSystem?: string;
  /**
   * Map of item paths to Concept Bindings. Keys use the same path syntax as Bind.path in Core §4.3.3. Dot notation for nesting, [*] for all repeat instances.
   */
  concepts?: {
    [k: string]: ConceptBinding;
  };
  /**
   * Map of option set names to Vocabulary Bindings. Keys match names in the Definition's optionSets.
   */
  vocabularies?: {
    [k: string]: VocabularyBinding;
  };
  /**
   * Array of cross-system alignment declarations. Each entry declares a typed relationship between a Definition field and a concept in an external system.
   */
  alignments?: Alignment[];
  /**
   * JSON-LD context fragment for response export. Enables form responses to participate in linked data ecosystems.
   */
  context?: {
    /**
     * JSON-LD @context fragment. When applied to a response document, makes the response a valid JSON-LD document. May be a URI string, a context object, or an array of both.
     */
    '@context'?: string | {} | unknown[];
  };
  /**
   * Document-level extension properties. All keys MUST be x-prefixed.
   */
  extensions?: {};
}
/**
 * Associates a Definition item with a concept in an external ontology or standard.
 *
 * This interface was referenced by `OntologyDocument`'s JSON-Schema
 * via the `definition` "ConceptBinding".
 */
export interface ConceptBinding {
  /**
   * The concept URI in the external system.
   */
  concept: string;
  /**
   * The concept system or ontology URI. Falls back to the document's defaultSystem if omitted.
   */
  system?: string;
  /**
   * Human-readable name of the concept.
   */
  display?: string;
  /**
   * Short code within the system (e.g., 'MR' for Medical Record Number).
   */
  code?: string;
  /**
   * Cross-system equivalences for this concept.
   */
  equivalents?: ConceptEquivalent[];
}
/**
 * Declares that the bound concept is equivalent to a concept in another system.
 *
 * This interface was referenced by `OntologyDocument`'s JSON-Schema
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
   * Relationship type (SKOS-inspired). When absent, processors MUST treat as 'exact'. Values: 'exact', 'close', 'broader', 'narrower', 'related'. Custom types MUST be x-prefixed.
   */
  type?: string;
}
/**
 * Associates a named option set with an external terminology system.
 *
 * This interface was referenced by `OntologyDocument`'s JSON-Schema
 * via the `definition` "VocabularyBinding".
 */
export interface VocabularyBinding {
  /**
   * The terminology system URI.
   */
  system: string;
  /**
   * Version of the terminology.
   */
  version?: string;
  /**
   * Human-readable name of the terminology.
   */
  display?: string;
  filter?: VocabularyFilter;
  /**
   * Map from option set 'value' strings to terminology codes, when they differ. Keys are the Definition's option values; values are the external terminology codes.
   */
  valueMap?: {
    [k: string]: string;
  };
}
/**
 * Subset constraints limiting which portion of the vocabulary is in scope.
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
/**
 * Declares a typed relationship between a Definition field and a concept in an external system.
 *
 * This interface was referenced by `OntologyDocument`'s JSON-Schema
 * via the `definition` "Alignment".
 */
export interface Alignment {
  /**
   * Item path in the Definition. Uses the same path syntax as Bind.path.
   */
  field: string;
  /**
   * External system concept reference.
   */
  target: {
    /**
     * External system URI.
     */
    system: string;
    /**
     * Concept code in the external system.
     */
    code: string;
    /**
     * Human-readable name in the external system.
     */
    display?: string;
  };
  /**
   * Relationship type (SKOS-inspired). 'exact', 'close', 'broader', 'narrower', 'related'. Custom types MUST be x-prefixed.
   */
  type: string;
  /**
   * Whether the alignment applies in both directions. When absent, processors MUST treat as false.
   */
  bidirectional?: boolean;
  /**
   * Human-readable explanation of the alignment rationale.
   */
  notes?: string;
}
