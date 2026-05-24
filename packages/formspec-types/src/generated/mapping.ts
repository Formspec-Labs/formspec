/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { ModuleRef } from './common.js';
/**
 * Descriptor for the external system schema targeted by this mapping. Determines the adapter used for serialization and the path syntax rules for targetPath values.
 */
export type TargetSchema = {
  [k: string]: unknown;
} & {
  /**
   * Structural format of the target. 'json': dot-notation paths with bracket indexing, identity serialization. 'xml': dot-notation for elements, '@' prefix for attributes, requires rootElement. 'csv': flat column-name paths only (no dots), per RFC 4180. Custom formats use x- prefix (e.g. 'x-protobuf').
   */
  format: (
    | ('json' | 'xml' | 'csv')
    | {
        [k: string]: unknown;
      }
  ) &
    string;
  /**
   * Human-readable name of the target schema for documentation and diagnostics.
   */
  name?: string;
  /**
   * Canonical URL or URI pointing to the target schema definition. Informational; not fetched at runtime.
   */
  url?: string;
  /**
   * Local name of the root XML element. REQUIRED when format is 'xml'; ignored otherwise.
   */
  rootElement?: string;
  /**
   * XML namespace prefix-to-URI map. The default namespace uses the empty string key. Prefixes are used in target paths with colon notation (e.g. 'xsi:type').
   */
  namespaces?: {
    [k: string]: string;
  };
  /**
   * This interface was referenced by `undefined`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
};
/**
 * A single field mapping rule — the atomic unit of a Mapping Document. Binds a source path to a target path and specifies how the value is transformed in transit. At least one of sourcePath or targetPath MUST be present. Rules are executed in priority-sorted order; when two rules target the same path, last-write-wins.
 *
 * This interface was referenced by `MappingDocument`'s JSON-Schema
 * via the `definition` "FieldRule".
 */
export type FieldRule = {
  [k: string]: unknown;
} & FieldRule1 & {
    /**
     * Dot-notation path identifying the value in the source document. Supports bracket indexing for arrays (e.g. 'items[0].name') and wildcard '[*]' for all elements. REQUIRED for all transforms except 'constant' (sourcePath ignored) and 'drop' (when used with targetPath only).
     */
    sourcePath?: string;
    /**
     * Dot-notation path identifying the destination in the target document. Path syntax depends on targetSchema.format: JSON uses dot + bracket indexing, XML uses dot for elements and '@' for attributes, CSV requires simple identifiers (no dots). May be null for drop rules. REQUIRED for all transforms except 'drop'.
     */
    targetPath?: string | null;
    /**
     * Transform type determining how the source value is converted to the target value. Closed-core: 'preserve' (identity copy, auto-reversible); 'drop' (discard field, never reversible); 'expression' (evaluate FEL, requires `expression`); 'coerce' (type conversion, requires `coerce`); 'valueMap' (lookup substitution, requires `valueMap`); 'flatten' / 'nest' (structural collapse/expand per mapping spec §4.7/§4.8); 'constant' (fixed value, requires `expression`); 'concat' / 'split' (join/decompose, require `expression`). Module-contributed: `x-` extension following the canonical regex (ADR 0150 §4.5).
     */
    transform:
      | (
          | 'preserve'
          | 'drop'
          | 'expression'
          | 'coerce'
          | 'valueMap'
          | 'flatten'
          | 'nest'
          | 'constant'
          | 'concat'
          | 'split'
        )
      | string;
    /**
     * FEL expression evaluated to produce the target value. Within the expression: '$' binds to the resolved source value at sourcePath (or null if absent); '@source' binds to the entire source document root. REQUIRED when transform is 'expression', 'constant', 'concat', or 'split'. For 'flatten' and 'nest', OPTIONAL when using only the structural modes in the mapping spec (delimited/positional/dot-prefix); REQUIRED when the spec calls for non-trivial projection. For 'constant', the expression SHOULD be a FEL literal or deterministic expression. For 'concat', MUST evaluate to a string. For 'split', MUST return an array or object.
     */
    expression?: string;
    /**
     * Type conversion descriptor. Object form specifies 'from', 'to', and optional 'format'. Shorthand string form specifies only the target type (source type is inferred). REQUIRED when transform is 'coerce'. Lossless pairs (string<->integer, string<->number, string<->boolean, date<->string with ISO format) are auto-reversible. Lossy pairs (datetime->date loses time, money->number loses currency) MUST NOT be auto-reversed.
     */
    coerce?:
      | Coerce
      | ('string' | 'number' | 'boolean' | 'date' | 'datetime' | 'integer' | 'array' | 'object' | 'money');
    valueMap?: ValueMap;
    reverse?: ReverseOverride;
    /**
     * Controls whether this rule participates in reverse execution. If false, the rule is skipped during reverse mapping (even when document direction is 'both'). MUST be false (or omitted) for inherently lossy transforms: 'drop', and 'expression'/'constant'/'concat'/'split' without an explicit reverse block. 'preserve' is always auto-reversible. Setting true on a lossy rule without a reverse block MUST produce a validation error.
     */
    bidirectional?: boolean;
    /**
     * FEL boolean guard expression. Evaluated before any transform. If the expression evaluates to false or null, the entire rule is skipped — no target value is written and no error is produced even if the expression or sourcePath would be invalid. '$' binds to the sourcePath value; '@source' binds to the full source document. During reverse mapping, '$' and '@source' bind to external values.
     */
    condition?: string;
    /**
     * Fallback value emitted when sourcePath resolves to undefined, null, or is absent from the source document. For 'preserve': writes the default instead. For 'expression': writes the default and skips expression evaluation. For 'coerce'/'valueMap': writes the default instead. When sourcePath is absent and no default is provided: 'preserve'/'coerce'/'valueMap' omit the target field; 'expression' evaluates with $ = null.
     */
    default?: {
      [k: string]: unknown;
    };
    array?: ArrayDescriptor;
    projection?: ProjectionHint;
    /**
     * Delimiter for flatten/nest string serialization. For 'flatten': joins array elements into a delimited string. For 'nest': splits a delimited string into an array.
     */
    separator?: string;
    /**
     * Human-readable description of the rule's intent. Implementations MUST ignore this property during execution.
     */
    description?: string;
    /**
     * Execution priority. Rules are sorted by priority descending (higher executes first) with stable sort preserving document order for equal priorities. When two rules write to the same targetPath, the later-executing rule overwrites the earlier one (last-write-wins). Auto-mapped synthetic rules use priority -1.
     */
    priority?: number;
    /**
     * Reverse-direction precedence when multiple rules write to the same Response path during reverse mapping. Highest reversePriority wins regardless of document order; equal values fall back to last-rule-wins. Only meaningful when direction is 'both' or 'reverse'.
     */
    reversePriority?: number;
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^x-".
     */
    [k: `x-${string}`]: unknown;
  };
export type FieldRule1 = {
  [k: string]: unknown;
};
/**
 * A Field Rule used inside array.innerRules. Identical to FieldRule with an additional optional 'index' property for indexed mode. Paths resolve relative to the current array element, not the document root.
 *
 * This interface was referenced by `MappingDocument`'s JSON-Schema
 * via the `definition` "InnerRule".
 */
export type InnerRule = {
  [k: string]: unknown;
} & InnerRule1 & {
    /**
     * Element-relative dot-notation path in the source array element.
     */
    sourcePath?: string;
    /**
     * Element-relative dot-notation path in the target array element, or absolute target path for indexed mode.
     */
    targetPath?: string | null;
    /**
     * Transform type. Same semantics as FieldRule.transform — closed-core enum + module-extensible `x-` branch per ADR 0150 §4.5.
     */
    transform:
      | (
          | 'preserve'
          | 'drop'
          | 'expression'
          | 'coerce'
          | 'valueMap'
          | 'flatten'
          | 'nest'
          | 'constant'
          | 'concat'
          | 'split'
        )
      | string;
    /**
     * FEL expression. $ = current element's sourcePath value; @source = full source document.
     */
    expression?: string;
    /**
     * Type conversion descriptor or shorthand target-type string.
     */
    coerce?:
      | Coerce
      | ('string' | 'number' | 'boolean' | 'date' | 'datetime' | 'integer' | 'array' | 'object' | 'money');
    valueMap?: ValueMap;
    reverse?: ReverseOverride;
    /**
     * If false, this inner rule is skipped during reverse execution.
     */
    bidirectional?: boolean;
    /**
     * FEL boolean guard. Inner rule is skipped when false or null.
     */
    condition?: string;
    /**
     * Fallback value when the element-relative sourcePath is absent or null.
     */
    default?: {
      [k: string]: unknown;
    };
    array?: ArrayDescriptor;
    projection?: ProjectionHint;
    /**
     * Delimiter for flatten/nest string serialization within the element.
     */
    separator?: string;
    /**
     * Human-readable description. Ignored during execution.
     */
    description?: string;
    /**
     * Execution priority within the innerRules array.
     */
    priority?: number;
    /**
     * Reverse-direction precedence within innerRules.
     */
    reversePriority?: number;
    /**
     * Zero-based positional index into the source array. REQUIRED when parent array.mode is 'indexed'. Only the element at this index is processed by this inner rule; all other elements are ignored by this rule.
     */
    index?: number;
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^x-".
     */
    [k: `x-${string}`]: unknown;
  };
export type InnerRule1 = {
  [k: string]: unknown;
};
/**
 * A Formspec Mapping DSL v1.0 document describing bidirectional data transformation between a Formspec Response and an external schema. A Mapping Document is a standalone JSON artifact — not embedded in a Definition — that declares field-level correspondences, structural reorganizations, type coercions, value translations, and conditional logic sufficient to convert a Response into an API payload, database record, CSV export, or XML document, and to reverse that transformation when importing. All computed transforms use the Formspec Expression Language (FEL). The DSL generalizes the version-migration fieldMap from §6.7 of the core specification.
 */
export interface MappingDocument {
  /**
   * Mapping specification version. MUST be '1.0'.
   */
  $formspecMapping: '1.0';
  /**
   * OPTIONAL declaration of substrate modules this document depends on. Each entry is a canonical ModuleRef (id + version, with optional publisher + lockHash for posture admission). Default-module-set behavior per ADR 0150 §4.9 preserves form-only documents — omitting modules[] is identical to declaring the core module set. Per ADR 0150 §4.3.
   */
  modules?: ModuleRef[];
  /**
   * URI identifying the version of the Mapping DSL specification this document conforms to.
   */
  $schema?: string;
  /**
   * Semantic version of this Mapping Document. Independent of both the Formspec Definition version and the DSL specification version. Implementations SHOULD use this for cache invalidation and change detection.
   */
  version: string;
  /**
   * URI or stable identifier of the Formspec Definition this mapping targets. Corresponds to the Definition's 'url' property — the canonical identity that is stable across versions.
   */
  definitionRef: string;
  /**
   * Semver range of compatible Formspec Definition versions per node-semver syntax. An implementation MUST refuse to execute a Mapping Document when the resolved Definition version does not satisfy this range.
   */
  definitionVersion: string;
  targetSchema: TargetSchema;
  /**
   * Execution direction. 'forward': Response→External (default), reverse execution MUST raise an error. 'reverse': External→Response only, forward execution MUST raise an error. 'both': rules are evaluated in either direction; each Field Rule MAY supply an explicit reverse override.
   */
  direction?: 'forward' | 'reverse' | 'both';
  /**
   * Leaf values applied to the target document before any Field Rules execute. Keys are dot-notation target paths; values are literal JSON values. Any Field Rule that writes to the same path will overwrite the default. Defaults are applied only in the forward direction.
   */
  defaults?: {};
  /**
   * When true, the processor generates synthetic 'preserve' rules (at priority -1) for every source field not already covered by an explicit rule's sourcePath. Synthetic rules use identical source and target paths. Explicit rules always take precedence. When targetSchema.format is 'csv', auto-mapped paths containing dots are silently skipped.
   */
  autoMap?: boolean;
  /**
   * Declares the minimum conformance level required to process this mapping document. 'core': forward JSON mapping only. 'bidirectional': adds reverse mapping with round-trip fidelity. 'extended': adds XML and CSV adapters. Each level is a strict superset of the preceding level.
   */
  conformanceLevel?: 'core' | 'bidirectional' | 'extended';
  /**
   * Ordered array of Field Rule objects. Rules are sorted by priority (descending, stable sort) before execution. Equal-priority rules retain document order. When two rules write to the same targetPath, last-write-wins. MUST contain at least one element.
   *
   * @minItems 1
   */
  rules: [FieldRule, ...FieldRule[]];
  /**
   * Adapter-specific configuration keyed by adapter identifier. The active adapter is determined by targetSchema.format. Built-in adapters: 'json' (Mapping Core), 'xml' and 'csv' (Mapping Extended). Custom adapters use x- prefix.
   */
  adapters?: {
    json?: JsonAdapter;
    xml?: XmlAdapter;
    csv?: CsvAdapter;
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^x-".
     */
    [k: `x-${string}`]: unknown;
  };
  /**
   * Document-level extension properties. All keys MUST be prefixed with 'x-'.
   */
  extensions?: {};
  /**
   * This interface was referenced by `MappingDocument`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * Extension object whose keys must be prefixed with x-.
 */
export interface Extensions {}
/**
 * Type conversion descriptor specifying source type, target type, and optional format pattern. Supported conversions: string<->number, string<->integer, string<->boolean, string<->date, string<->datetime, number<->integer, number<->boolean, integer<->boolean, date<->datetime, money->string, money->number (lossy), money->integer (lossy). Unsupported pairs MUST be rejected at validation time.
 *
 * This interface was referenced by `MappingDocument`'s JSON-Schema
 * via the `definition` "Coerce".
 */
export interface Coerce {
  /**
   * Source data type before conversion.
   */
  from: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'integer' | 'array' | 'object' | 'money';
  /**
   * Target data type after conversion.
   */
  to: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'integer' | 'array' | 'object' | 'money';
  /**
   * Format pattern applied during coercion. For date/datetime->string: output pattern (e.g. 'YYYY-MM-DD', 'MM/DD/YYYY'). If omitted for date types, ISO 8601 is the default. For number->string: numeric format (e.g. '0.00').
   */
  format?: string;
}
/**
 * Lookup table for value substitution. REQUIRED when transform is 'valueMap'. Auto-reversible only when the forward map is bijective (every value is unique); non-injective maps require an explicit reverse.valueMap.
 */
export interface ValueMap {
  /**
   * Forward-direction lookup: each key is a source value (as string), each value is the corresponding target value. Keys are matched by string equality.
   */
  forward: {};
  /**
   * Reverse-direction lookup: each key is a target value (as string), each value is the corresponding source value. If omitted and forward is bijective, auto-inferred by inverting forward. If forward is not injective (multiple keys map to same value), omission MUST produce a validation error for bidirectional rules.
   */
  reverse?: {};
  /**
   * Strategy when a source value has no matching key in the lookup table. 'error' (default): produce a runtime mapping error. 'drop': omit the target field entirely. 'passthrough': copy the source value through unchanged. 'default': use the value from the 'default' property. Applied in both forward and reverse directions unless the reverse block specifies its own unmapped override.
   */
  unmapped?: 'error' | 'drop' | 'passthrough' | 'default';
  /**
   * Fallback value when unmapped is 'drop' or 'default', or when the source value is null. MUST be defined when unmapped is 'default'.
   */
  default?: {
    [k: string]: unknown;
  };
}
/**
 * Explicit override configuration for reverse-direction execution. sourcePath and targetPath are swapped automatically during reverse — the reverse block MUST NOT re-specify them. Required for bidirectional 'expression' rules (no auto-reversal). May override execution Field Rule properties except sourcePath, targetPath, reverse, and projection itself.
 */
export interface ReverseOverride {
  /**
   * Reverse transform type — closed-core enum + module-extensible `x-` branch per ADR 0150 §4.5. If omitted, uses the forward rule's transform type.
   */
  transform?:
    | (
        | 'preserve'
        | 'drop'
        | 'expression'
        | 'coerce'
        | 'valueMap'
        | 'flatten'
        | 'nest'
        | 'constant'
        | 'concat'
        | 'split'
      )
    | string;
  /**
   * FEL expression for the reverse direction. $ = the external value; @source = the full external document.
   */
  expression?: string;
  /**
   * Reverse coercion descriptor (from/to types for the reverse direction).
   */
  coerce?: Coerce | ('string' | 'number' | 'boolean' | 'date' | 'datetime' | 'integer' | 'array' | 'object' | 'money');
  valueMap?: ValueMap;
  /**
   * FEL boolean guard for the reverse direction. Overrides the forward condition.
   */
  condition?: string;
  /**
   * Default value for reverse direction when external field is absent.
   */
  default?: {
    [k: string]: unknown;
  };
  bidirectional?: boolean;
  array?: ArrayDescriptor;
  /**
   * Reverse-direction delimiter override.
   */
  separator?: string;
  /**
   * Reverse-direction execution priority override.
   */
  priority?: number;
  /**
   * Reverse precedence override.
   */
  reversePriority?: number;
  /**
   * Human-readable description of the reverse transform intent.
   */
  description?: string;
  /**
   * This interface was referenced by `ReverseOverride`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   *
   * This interface was referenced by `ReverseOverride`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   *
   * This interface was referenced by `ReverseOverride`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * Reverse-direction array handling override.
 */
export interface ArrayDescriptor {
  /**
   * 'each': iterate every source element, applying the parent rule's transform or innerRules per element. Within scope: $ = current element, $index = zero-based index, @source = full document. Target produces one output element per source element, in order. 'whole': treat the entire array as a single value ($ = complete array). Appropriate for aggregate operations (sum, filter, join). 'indexed': apply innerRules by positional index. Each inner rule MUST include an 'index' property. Uncovered elements are dropped.
   */
  mode: 'each' | 'whole' | 'indexed';
  /**
   * Delimiter for string serialization. Valid only with 'whole' mode. Used when flattening an array to a delimited string or nesting a delimited string back to an array.
   */
  separator?: string;
  /**
   * Nested Field Rules applied within the array context. Paths in innerRules resolve relative to the current array element (for 'each' mode) or the element at the declared index (for 'indexed' mode). InnerRules support the same transform types and properties as top-level FieldRules, plus an optional 'index' property for indexed mode.
   */
  innerRules?: InnerRule[];
}
/**
 * Optional static contract-projection metadata for this inner rule. Runtime Mapping processors MUST ignore this property during execution.
 */
export interface ProjectionHint {
  /**
   * Additional Definition field paths used by this rule. The containing rule's sourcePath is implicit when present.
   */
  sourcePaths?: string[];
  /**
   * Target type override when the transform emits a different type than the Definition-derived source contract.
   */
  targetType?: 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'datetime' | 'array' | 'object' | 'money';
  /**
   * Target value domain override when the transform emits a closed set that cannot be inferred from the Definition or valueMap.
   *
   * @minItems 1
   */
  targetEnum?: [unknown, ...unknown[]];
  /**
   * Whether a static projector should require the targetPath field in the emitted target contract. Use only when mapping semantics change the Definition-derived requiredness.
   */
  required?: boolean;
  /**
   * Whether the static projection is less precise than the runtime output shape.
   */
  lossy?: boolean;
  /**
   * When false, static projectors SHOULD omit this rule from emitted target contracts.
   */
  emit?: boolean;
  /**
   * Human-readable projection note for authors and reviewers.
   */
  notes?: string;
  /**
   * This interface was referenced by `ProjectionHint`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   *
   * This interface was referenced by `ProjectionHint`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   *
   * This interface was referenced by `ProjectionHint`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * JSON format adapter configuration. The JSON adapter performs identity serialization — the engine's internal representation is already JSON. Target paths use dot-notation with bracket indexing (e.g. 'user.tags[0]'). Intermediate objects and arrays are created automatically.
 *
 * This interface was referenced by `MappingDocument`'s JSON-Schema
 * via the `definition` "JsonAdapter".
 */
export interface JsonAdapter {
  /**
   * Emit indented JSON for human readability.
   */
  pretty?: boolean;
  /**
   * Sort object keys lexicographically in output.
   */
  sortKeys?: boolean;
  /**
   * 'include': null-valued keys appear in output. 'omit': null-valued keys are suppressed from output.
   */
  nullHandling?: 'include' | 'omit';
}
/**
 * XML format adapter configuration (Mapping Extended conformance). Serializes internal JSON as an XML 1.0 document. Target paths use dot-notation for elements and '@' prefix for attributes (e.g. 'order.@id'). Namespace prefixes use colon notation in paths (e.g. 'xsi:type'). The targetSchema MUST declare rootElement and SHOULD declare namespaces.
 *
 * This interface was referenced by `MappingDocument`'s JSON-Schema
 * via the `definition` "XmlAdapter".
 */
export interface XmlAdapter {
  /**
   * Include '<?xml version="1.0" encoding="UTF-8"?>' declaration at the start of the document.
   */
  declaration?: boolean;
  /**
   * Spaces per indentation level. 0 disables indentation (compact output).
   */
  indent?: number;
  /**
   * Target paths whose text content is wrapped in CDATA sections. Use for values containing characters that would need XML escaping (e.g. '&', '<').
   */
  cdata?: string[];
}
/**
 * CSV format adapter configuration (Mapping Extended conformance). Serializes internal JSON as RFC 4180 delimited text. STRUCTURAL CONSTRAINT: all targetPath values MUST be simple identifiers (no dot-notation, no brackets). A nested targetPath MUST produce a validation error. Repeat groups emit one row per iteration; fields outside the repeat are duplicated across rows.
 *
 * This interface was referenced by `MappingDocument`'s JSON-Schema
 * via the `definition` "CsvAdapter".
 */
export interface CsvAdapter {
  /**
   * Field delimiter character.
   */
  delimiter?: string;
  /**
   * Quote character for field values containing the delimiter, newlines, or the quote character itself.
   */
  quote?: string;
  /**
   * Whether to emit a header row with column names derived from targetPath values.
   */
  header?: boolean;
  /**
   * Character encoding for the output file.
   */
  encoding?: string;
  /**
   * Line ending style. 'crlf' (\r\n) per RFC 4180. 'lf' (\n) for Unix-style output.
   */
  lineEnding?: 'crlf' | 'lf';
}
