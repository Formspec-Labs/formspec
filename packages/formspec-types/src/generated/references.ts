/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * A single reference to an external or inline resource that provides context for a form element. At least one of 'uri' or 'content' MUST be present.
 *
 * This interface was referenced by `ReferencesDocument`'s JSON-Schema
 * via the `definition` "Reference".
 */
export type Reference = Reference1 & {
  /**
   * Identifier for this reference. RECOMMENDED. When present, MUST be unique within this References Document. When used as a referenceDefs key, the key and id MUST match (processing-time validation).
   */
  id?: string;
  /**
   * Classification of the referenced resource. Human-oriented: 'documentation', 'example'. Shared: 'regulation', 'policy', 'glossary', 'schema'. Agent-oriented: 'vector-store', 'knowledge-base', 'retrieval', 'tool', 'api', 'context'. Custom types MUST be prefixed with 'x-'. Unrecognized non-'x-' types: processor SHOULD warn and MAY skip.
   */
  type: string;
  /**
   * Who consumes this reference. 'human': rendered in the UI (help panels, links, tooltips). 'agent': consumed programmatically by AI agents (not rendered). 'both': available to both rendering and agent pipelines.
   */
  audience: 'human' | 'agent' | 'both';
  /**
   * Human-readable label for this reference. RECOMMENDED.
   */
  title?: string;
  /**
   * URI of the referenced resource. REQUIRED unless 'content' is provided. Supports https:, vectorstore:, kb:, formspec-fn:, and urn: schemes.
   */
  uri?: string;
  /**
   * Inline content of the reference. REQUIRED unless 'uri' is provided. May be a plain text string, markdown, or structured JSON object.
   */
  content?: string | {};
  /**
   * MIME type of the referenced resource (RFC 2045).
   */
  mediaType?: string;
  /**
   * BCP 47 language tag for the referenced content.
   */
  language?: string;
  /**
   * Longer explanation of what this reference provides and why it is relevant.
   */
  description?: string;
  /**
   * Categorization tags for filtering and grouping references.
   */
  tags?: string[];
  /**
   * Relative importance. 'primary': surfaced first. 'supplementary' (implicit default): normal. 'background': contextual.
   */
  priority?: 'primary' | 'supplementary' | 'background';
  /**
   * Semantic relationship to the target. Known values: 'authorizes', 'constrains', 'defines', 'exemplifies', 'supersedes', 'superseded-by', 'derived-from', 'see-also' (implicit default). Custom types MUST be prefixed with 'x-'. Unrecognized non-'x-' values: processor SHOULD warn and treat as 'see-also'.
   */
  rel?: string;
  /**
   * Fragment-targeting hint for resources without native fragment semantics.
   */
  selector?: string;
  /**
   * Reference-level extension data. All keys MUST be prefixed with 'x-'.
   */
  extensions?: {};
};
export type Reference1 = {
  [k: string]: unknown;
};
/**
 * A reference bound to a specific location in the target Definition. The 'target' path identifies which item(s) this reference applies to. Uses the same path syntax as Bind.path (core §4.3.3). The special value '#' targets the entire form (form-level reference).
 *
 * This interface was referenced by `ReferencesDocument`'s JSON-Schema
 * via the `definition` "BoundReference".
 */
export type BoundReference = BoundReference1 & {
  /**
   * Path identifying which Definition item(s) this reference applies to. Uses dot notation for nesting and [*] for all instances of a repeatable group. The special value '#' means form-level (applies to the entire form). Multiple references may target the same path.
   */
  target: string;
  /**
   * JSON Pointer (RFC 6901) to a referenceDefs entry. Resolved at load time.
   */
  $ref?: string;
  id?: string;
  type?: string;
  audience?: 'human' | 'agent' | 'both';
  title?: string;
  uri?: string;
  content?: string | {};
  mediaType?: string;
  language?: string;
  description?: string;
  tags?: string[];
  priority?: 'primary' | 'supplementary' | 'background';
  rel?: string;
  selector?: string;
  extensions?: {};
};
export type BoundReference1 = {
  [k: string]: unknown;
};
/**
 * Either a full inline Reference object, or a $ref pointer to a referenceDefs entry with optional property overrides. When $ref is present, the base object is shallow-merged with sibling properties (overrides win). The 'id' property MUST NOT appear alongside $ref — the referenceDefs key becomes the resolved id. MAINTENANCE NOTE: The $ref branch explicitly lists override properties — if a property is added to Reference, it must also be added to the $ref branch or overrides for that property will be silently rejected.
 *
 * This interface was referenced by `ReferencesDocument`'s JSON-Schema
 * via the `definition` "ReferenceOrRef".
 */
export type ReferenceOrRef =
  | Reference
  | {
      /**
       * JSON Pointer (RFC 6901) to a referenceDefs entry. Resolved at load time.
       */
      $ref: string;
      title?: string;
      uri?: string;
      content?: string | {};
      mediaType?: string;
      language?: string;
      description?: string;
      tags?: string[];
      priority?: 'primary' | 'supplementary' | 'background';
      rel?: string;
      selector?: string;
      audience?: 'human' | 'agent' | 'both';
      type?: string;
      extensions?: {};
    };

/**
 * A Formspec References Document per the References specification. A standalone layer that attaches external resources — documentation, regulations, knowledge bases, tool schemas, and other context — to a Formspec Definition. Like Theme (Tier 2) and Component (Tier 3) documents, a References Document targets a Definition but lives alongside it. Multiple References Documents MAY target the same Definition (e.g., different audiences, languages, or domains). References MUST NOT alter core behavioral semantics (required, relevant, readonly, calculate, validation). Reference properties are static — FEL expressions MUST NOT appear in any reference property.
 */
export interface ReferencesDocument {
  /**
   * References specification version. MUST be '1.0'.
   */
  $formspecReferences: '1.0';
  /**
   * Canonical URI identifier for this References Document.
   */
  url?: string;
  /**
   * Machine-readable short name for this References Document. Pattern: letters, digits, hyphens, underscores; must start with a letter.
   */
  name?: string;
  /**
   * Human-readable name for this References Document.
   */
  title?: string;
  /**
   * Human-readable description of this document's purpose and scope.
   */
  description?: string;
  /**
   * Version of this References Document.
   */
  version: string;
  targetDefinition: TargetDefinition;
  referenceDefs?: ReferenceDefs;
  /**
   * Ordered list of references bound to the target Definition. Each entry specifies a target path (item key or '#' for form-level) and a reference or $ref pointer. References are static and resolved at load time.
   */
  references: BoundReference[];
  /**
   * Document-level extension properties. All keys MUST be prefixed with 'x-'.
   */
  extensions?: {};
}
/**
 * Binding to the target Formspec Definition and optional compatibility range.
 */
export interface TargetDefinition {
  /**
   * Canonical URL of the target Definition.
   */
  url: string;
  /**
   * Semver range expression describing which Definition versions this document supports.
   */
  compatibleVersions?: string;
}
/**
 * Registry of reusable Reference objects. Entries in the 'references' array may use {"$ref": "#/referenceDefs/{key}"} to include a definition from this registry with optional property overrides.
 */
export interface ReferenceDefs {
  [k: string]: Reference;
}
