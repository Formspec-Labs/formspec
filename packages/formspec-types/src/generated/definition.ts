/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { ModuleRef, Extensions, WidgetName } from './common.js';
import type { IssuerDocument as FormspecIssuerDocument } from './issuer.js';
export type { FormspecIssuerDocument };
/**
 * A node in the form's structural tree. Every Item has a key (stable machine identifier unique across the entire Definition), a type ('field', 'group', or 'display'), and a label (human-readable). The type determines which additional properties apply. Items form a tree via the 'children' property on groups. The item tree determines the shape of the Instance (form data): fields produce values, groups produce JSON objects (or arrays if repeatable), display items produce nothing.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "Item".
 */
export type Item = {
  [k: string]: unknown;
} & {
  /**
   * Stable identifier for this Item. MUST be unique across the entire Definition (not merely among siblings). Used in Bind paths, Shape targets, FEL field references ($key), and to bridge Definition items to Response data nodes. MUST NOT change across versions if the semantic meaning is preserved.
   */
  key: string;
  /**
   * Item type. 'field': captures a single data value (requires dataType). 'group': structural container with children, optionally repeatable. 'display': read-only presentational content (instructions, headings) — no data, no children.
   */
  type: 'group' | 'field' | 'display';
  /**
   * Primary human-readable label. Implementations MUST display this (or a 'labels' alternative) when rendering the Item.
   */
  label: string;
  /**
   * Human-readable help text. Implementations SHOULD make this available on demand (e.g., tooltip or help icon).
   */
  description?: string;
  /**
   * Short instructional text displayed alongside the input (e.g., below the label or as placeholder guidance). Distinct from 'description', which is typically shown on demand.
   */
  hint?: string;
  /**
   * Alternative display labels keyed by context name. Well-known contexts: 'short' (abbreviated), 'pdf' (print layout), 'csv' (column header), 'accessibility' (screen reader). Implementations MAY define additional context names.
   */
  labels?: {
    [k: string]: string;
  };
  consequences?: ConsequencesMetadata;
  purpose?: PurposeMetadata;
  /**
   * Item-level extension data. All keys MUST be prefixed with 'x-'. MUST NOT alter core semantics.
   */
  extensions?: Extensions;
};
/**
 * A named, composable validation rule set (inspired by W3C SHACL). Shapes provide cross-field and form-level validation beyond per-field Bind constraints. Each Shape targets data node(s) by path, evaluates a FEL constraint expression, and produces structured ValidationResult entries on failure. Shapes compose via logical operators (and, or, not, xone) where elements can be either shape IDs (referencing other shapes) or inline FEL boolean expressions. MUST have at least one of: constraint, and, or, not, xone.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "Shape".
 */
export type Shape = Shape1 & {
  /**
   * Unique identifier for this Shape within the Definition. Used in composition operators to reference this Shape from other Shapes, and reported in ValidationResult.shapeId.
   */
  id: string;
  /**
   * Path expression identifying the data node(s) this Shape validates. Same path syntax as Bind.path. The special value '#' targets the entire Response root for form-level validation. For repeats, use [*] notation.
   */
  target: string;
  /**
   * Severity of the ValidationResult produced when this Shape fails. 'error': data is invalid, MUST be resolved before submission (blocks completion). 'warning': data is suspect, SHOULD be reviewed but does not block submission. 'info': informational observation, no action required.
   */
  severity?: 'error' | 'warning' | 'info';
  /**
   * FEL expression returning boolean. Evaluates to true when data is valid, false when invalid. REQUIRED unless the Shape uses composition operators (and/or/not/xone). If both constraint and a composition operator are present, they combine with implicit AND.
   */
  constraint?: string;
  /**
   * Human-readable failure message displayed when the constraint evaluates to false. MAY contain {{expression}} interpolation sequences, where expression is a FEL expression evaluated in the Shape's target context.
   */
  message: string;
  /**
   * Machine-readable error code for programmatic handling, localization lookups, and API responses. Processors SHOULD use standard built-in codes (REQUIRED, TYPE_MISMATCH, MIN_REPEAT, MAX_REPEAT, CONSTRAINT_FAILED, SHAPE_FAILED) when no specific code is declared.
   */
  code?: string;
  /**
   * Additional context data included in the ValidationResult on failure. Keys are context field names; values are FEL expression strings evaluated in the Shape's target context at failure time. Useful for diagnostic and programmatic handling.
   */
  context?: {
    [k: string]: FELExpression;
  };
  /**
   * A Formspec Expression Language (FEL) v1.0 expression. FEL is a small, deterministic, side-effect-free language for form logic — no statements, loops, variable assignment, or I/O. Strictly typed: no truthy/falsy coercion.
   *
   * FIELD REFERENCES: '$' = current node value (used in constraint binds); '$field' = field value from nearest scope; '$group.field' = nested path; '$repeat[n].field' = 1-based index into repeat; '$repeat[*].field' = array of all values across repeat instances.
   *
   * CONTEXT REFERENCES: '@index' = 1-based repeat position; '@count' = repeat instance count; '@current' = current repeat instance object; '@instance("name")' = secondary data source by name; '@varName' = variable from definition's variables array.
   *
   * OPERATORS (lowest to highest precedence): (0) let x = e in e, if e then e else e; (1) ? : ternary; (2) or; (3) and; (4) = != equality; (5) < > <= >= comparison; (6) in, not in (right operand must be array); (7) ?? null-coalescing; (8) + - arithmetic, & string concatenation; (9) * / % multiply/divide/modulo; (10) not, - (unary prefix). Postfix .field and [index] bind tightest.
   *
   * KEY RULES: Arithmetic requires number operands. String concatenation uses '&' (not '+'). Logical operators require boolean operands. null = null is true. Division by zero produces null + diagnostic. Cross-type comparison is a type error.
   *
   * LITERALS: Strings in single or double quotes with backslash escapes for backslash, quotes, newline, return, tab, and unicode (4 hex digits). Numbers with decimal semantics (0.1 + 0.2 = 0.3), no leading/trailing dot. Booleans: true, false. null. Dates: @2025-01-15. DateTimes: @2025-01-15T09:30:00Z. Arrays: [1, 2, 3]. Objects: {key: expr}.
   *
   * BUILT-IN FUNCTIONS (~40+): Aggregates — sum, count, countWhere, avg, min, max (operate on arrays, skip nulls). String — length, contains, startsWith, endsWith, substring (1-based), replace (literal), upper, lower, trim, matches (regex), format (positional {0} {1}). Numeric — round (banker's rounding), floor, ceil, abs, power. Date — today, now, year, month, day, dateDiff (unit: 'years'/'months'/'days'), dateAdd, hours, minutes, seconds, time, timeDiff. Logical — if(cond, then, else) with short-circuit evaluation, coalesce (first non-null), empty (null/empty-string/empty-array), present (inverse), selected (multiChoice contains value). Type-checking — isNumber, isString, isDate, isNull, typeOf. Money — money(amount, currency), moneyAmount, moneyCurrency, moneyAdd (same currency required), moneySum. MIP queries — valid($path), relevant($path), readonly($path), required($path). Repeat navigation — prev(), next() return adjacent rows or null, parent() returns enclosing context.
   *
   * NULL PROPAGATION: null propagates through most operations (null + 5 is null, null < 5 is null). Bind-context defaults: relevant null treated as true (show), required null as false (not required), readonly null as false (editable), constraint null as true (passes). Special null handling: coalesce/empty/present/isNull/typeOf accept null; aggregates skip nulls; ?? returns right operand when left is null; string(null) yields empty string; boolean(null) yields false; length(null) yields 0.
   *
   * ARRAY OPS: Equal-length arrays with binary operator produce element-wise result. Scalar + array broadcasts scalar. Different-length arrays produce error. Example: sum($items[*].qty * $items[*].price).
   *
   * TYPES: Primitives: string, number (decimal, min 18 significant digits), boolean, date, money ({amount: string, currency: string}), null. Compound: array (homogeneous). No implicit coercion — use explicit casts: number(), string(), boolean(), date(). Empty string and null are distinct values.
   *
   * RESERVED WORDS (cannot be used as function names): true, false, null, and, or, not, in, if, then, else, let.
   */
  activeWhen?: string;
  /**
   * Controls when this shape is evaluated. 'continuous' (DEFAULT): evaluated whenever any dependency changes. 'submit': evaluated only when submission is requested. 'demand': evaluated only when explicitly requested by the application. The global validation mode overrides: 'disabled' suppresses all; 'deferred' defers all; 'continuous' respects individual timing.
   */
  timing?: 'continuous' | 'submit' | 'demand';
  /**
   * Logical AND composition. ALL elements must pass for this Shape to pass. Elements can be shape IDs (referencing other shapes in this Definition) or inline FEL boolean expressions. If both 'constraint' and 'and' are present, they combine with implicit AND.
   */
  and?: string[];
  /**
   * Logical OR composition. AT LEAST ONE element must pass for this Shape to pass. Elements can be shape IDs or inline FEL boolean expressions.
   */
  or?: string[];
  /**
   * Logical NOT composition. The referenced shape or inline FEL expression MUST FAIL for this Shape to pass. Value is a shape ID or an inline FEL boolean expression.
   */
  not?: string;
  /**
   * Exclusive-OR composition. EXACTLY ONE element must pass for this Shape to pass. Elements can be shape IDs or inline FEL boolean expressions.
   */
  xone?: string[];
  /**
   * Shape-level extension data. All keys MUST be prefixed with 'x-'.
   */
  extensions?: Extensions;
};
export type Shape1 = {
  [k: string]: unknown;
};
/**
 * A Formspec Expression Language (FEL) v1.0 expression. FEL is a small, deterministic, side-effect-free language for form logic — no statements, loops, variable assignment, or I/O. Strictly typed: no truthy/falsy coercion.
 *
 * FIELD REFERENCES: '$' = current node value (used in constraint binds); '$field' = field value from nearest scope; '$group.field' = nested path; '$repeat[n].field' = 1-based index into repeat; '$repeat[*].field' = array of all values across repeat instances.
 *
 * CONTEXT REFERENCES: '@index' = 1-based repeat position; '@count' = repeat instance count; '@current' = current repeat instance object; '@instance("name")' = secondary data source by name; '@varName' = variable from definition's variables array.
 *
 * OPERATORS (lowest to highest precedence): (0) let x = e in e, if e then e else e; (1) ? : ternary; (2) or; (3) and; (4) = != equality; (5) < > <= >= comparison; (6) in, not in (right operand must be array); (7) ?? null-coalescing; (8) + - arithmetic, & string concatenation; (9) * / % multiply/divide/modulo; (10) not, - (unary prefix). Postfix .field and [index] bind tightest.
 *
 * KEY RULES: Arithmetic requires number operands. String concatenation uses '&' (not '+'). Logical operators require boolean operands. null = null is true. Division by zero produces null + diagnostic. Cross-type comparison is a type error.
 *
 * LITERALS: Strings in single or double quotes with backslash escapes for backslash, quotes, newline, return, tab, and unicode (4 hex digits). Numbers with decimal semantics (0.1 + 0.2 = 0.3), no leading/trailing dot. Booleans: true, false. null. Dates: @2025-01-15. DateTimes: @2025-01-15T09:30:00Z. Arrays: [1, 2, 3]. Objects: {key: expr}.
 *
 * BUILT-IN FUNCTIONS (~40+): Aggregates — sum, count, countWhere, avg, min, max (operate on arrays, skip nulls). String — length, contains, startsWith, endsWith, substring (1-based), replace (literal), upper, lower, trim, matches (regex), format (positional {0} {1}). Numeric — round (banker's rounding), floor, ceil, abs, power. Date — today, now, year, month, day, dateDiff (unit: 'years'/'months'/'days'), dateAdd, hours, minutes, seconds, time, timeDiff. Logical — if(cond, then, else) with short-circuit evaluation, coalesce (first non-null), empty (null/empty-string/empty-array), present (inverse), selected (multiChoice contains value). Type-checking — isNumber, isString, isDate, isNull, typeOf. Money — money(amount, currency), moneyAmount, moneyCurrency, moneyAdd (same currency required), moneySum. MIP queries — valid($path), relevant($path), readonly($path), required($path). Repeat navigation — prev(), next() return adjacent rows or null, parent() returns enclosing context.
 *
 * NULL PROPAGATION: null propagates through most operations (null + 5 is null, null < 5 is null). Bind-context defaults: relevant null treated as true (show), required null as false (not required), readonly null as false (editable), constraint null as true (passes). Special null handling: coalesce/empty/present/isNull/typeOf accept null; aggregates skip nulls; ?? returns right operand when left is null; string(null) yields empty string; boolean(null) yields false; length(null) yields 0.
 *
 * ARRAY OPS: Equal-length arrays with binary operator produce element-wise result. Scalar + array broadcasts scalar. Different-length arrays produce error. Example: sum($items[*].qty * $items[*].price).
 *
 * TYPES: Primitives: string, number (decimal, min 18 significant digits), boolean, date, money ({amount: string, currency: string}), null. Compound: array (homogeneous). No implicit coercion — use explicit casts: number(), string(), boolean(), date(). Empty string and null are distinct values.
 *
 * RESERVED WORDS (cannot be used as function names): true, false, null, and, or, not, in, if, then, else, let.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "FELExpression".
 */
export type FELExpression = string;
/**
 * A named secondary data source available to FEL expressions via @instance('name'). Provides lookup tables, prior-year data, configuration values, and external reference data. At least one of 'source' or 'data' MUST be present. When both exist, 'data' serves as the fallback when 'source' is unavailable. Secondary instances are read-only by default during form completion; a calculate Bind MUST NOT target a path within a read-only instance.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "Instance".
 */
export type Instance = Instance1 & {
  /**
   * Human-readable description of this instance's purpose and contents.
   */
  description?: string;
  /**
   * URL from which to fetch the instance data at runtime. The response MUST be JSON. MAY contain {{paramName}} template variables resolved by the implementation at runtime. The processor MUST fetch the data before the first Rebuild phase; if the fetch fails and no 'data' fallback exists, @instance() returns null.
   */
  source?: string;
  /**
   * If true, the instance data does not change during a single form session. Implementations MAY cache static instance data aggressively.
   */
  static?: boolean;
  /**
   * Inline instance data embedded directly in the Definition. Suitable for small, static lookup tables (country codes, status enums). If both 'source' and 'data' are present, 'data' is the fallback. If only 'data', the instance is fully inline.
   */
  data?: {
    [k: string]: unknown;
  };
  /**
   * Type declarations for the instance's fields. Keys are field names; values are dataType strings (same as Field dataTypes: string, decimal, integer, date, etc.). Informative — aids tooling and type-checking but processors are NOT required to validate instance data against it.
   */
  schema?: {
    [k: string]: string;
  };
  /**
   * If true (DEFAULT), the instance MUST NOT be modified by calculate Binds or any mechanism during form execution. When false, the instance acts as a writable scratch-pad for intermediate calculations that should not be submitted.
   */
  readonly?: boolean;
  /**
   * Instance-level extension data. All keys MUST be prefixed with 'x-'.
   */
  extensions?: Extensions;
};
export type Instance1 = {
  [k: string]: unknown;
};
/**
 * A named, reusable option list for choice and multiChoice fields. Defined either inline (via 'options' array) or by reference (via 'source' URI). At least one of 'options' or 'source' MUST be present. Referenced by Field items via the 'optionSet' property.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "OptionSet".
 */
export type OptionSet = OptionSet1 & {
  /**
   * Inline list of permitted values. Each entry has a machine-readable 'value' and a human-readable 'label'.
   */
  options?: OptionEntry[];
  /**
   * External endpoint returning an array of option objects. Used with valueField and labelField to map the response to {value, label} pairs.
   */
  source?: string;
  /**
   * When using 'source', the JSON property name for the option value in the external response. Default: 'value'.
   */
  valueField?: string;
  /**
   * When using 'source', the JSON property name for the option label in the external response. Default: 'label'.
   */
  labelField?: string;
  extensions?: Extensions;
};
export type OptionSet1 = {
  [k: string]: unknown;
};
/**
 * Ordered assurance level taxonomy shared with respondent-ledger-spec.md §6.6.1.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "AssuranceLevel".
 */
export type AssuranceLevel = 'L1' | 'L2' | 'L3' | 'L4';

/**
 * A Formspec Definition document per the Formspec v1.0 specification. A Definition is a versioned, self-contained JSON document that completely describes the structure, behavior, and constraints of a data-collection instrument. The tuple (url, version) uniquely identifies a Definition across all systems. Definitions are organized into three layers: Structure (Items), Behavior (Binds + Shapes), and Presentation (advisory hints). A conformant processor implements the four-phase processing cycle: Rebuild → Recalculate → Revalidate → Notify.
 */
export interface FormDefinition {
  /**
   * Definition specification version. MUST be '1.0'.
   */
  $formspec: '1.0';
  /**
   * OPTIONAL declaration of substrate modules this document depends on. Each entry is a canonical ModuleRef (id + version, with optional publisher + lockHash for posture admission). Default-module-set behavior per ADR 0150 §4.9 preserves form-only documents — omitting modules[] is identical to declaring the core module set. Per ADR 0150 §4.3.
   */
  modules?: ModuleRef[];
  /**
   * Canonical URI identifier of the logical form. Stable across versions — all versions of the same form share this URL. Combined with 'version' to form the immutable identity tuple. Referenced by Responses via definitionUrl.
   */
  url: string;
  /**
   * Version identifier of this specific Definition document. Interpretation governed by versionAlgorithm (default: semver). Once a Definition reaches 'active' status, its content MUST NOT be modified — any change requires a new version.
   */
  version: string;
  /**
   * Controls how version strings are interpreted and compared. 'semver': MAJOR.MINOR.PATCH per semver.org (pre-release labels supported). 'date': YYYY.MM.DD chronological comparison. 'integer': numeric comparison of non-negative integers. 'natural': equality-only comparison, no ordering defined.
   */
  versionAlgorithm?: 'semver' | 'date' | 'integer' | 'natural';
  /**
   * Definition lifecycle state. Transitions: draft → active → retired. Backward transitions are forbidden for the same version. 'draft': under development, not for production. 'active': in production, content is immutable. 'retired': no longer used for new data collection, but existing Responses remain valid.
   */
  status: 'draft' | 'active' | 'retired';
  /**
   * Parent definition this form is derived from. Informational only — does NOT imply behavioral inheritance or runtime linkage. Enables change analysis, pre-population from parent Responses, and lineage tracking. A plain URI string indicates derivation from the logical form in general; an object with url+version pins to a specific version.
   */
  derivedFrom?:
    | string
    | {
        url: string;
        version?: string;
      };
  /**
   * Machine-readable short name for the definition. Must start with a letter, may contain letters, digits, and hyphens. Unlike 'url', this is a local identifier for tooling convenience, not a globally unique reference.
   */
  name?: string;
  /**
   * Human-readable definition title. Displayed by authoring tools and form renderers.
   */
  title: string;
  /**
   * Human-readable description of the form's purpose and scope.
   */
  description?: string;
  /**
   * Publication or last-modified date of this Definition version, in ISO 8601 date format (YYYY-MM-DD).
   */
  date?: string;
  metadata?: DefinitionMetadata;
  /**
   * Root item tree defining the form's structural content. Items form a tree: each Item may have 'children' (groups) creating nested hierarchy. Three item types exist: 'field' (captures data), 'group' (structural container, optionally repeatable), 'display' (read-only presentational content). The item tree determines the shape of the Instance (form data).
   */
  items: Item[];
  /**
   * Behavioral declarations that attach reactive FEL expressions to data nodes by path. Binds are the bridge between items (structure) and behavior (logic). Each Bind targets one or more nodes and may declare: calculate (computed value), relevant (conditional visibility), required (dynamic requiredness), readonly (edit protection), constraint (per-field validation), default (re-relevance value). Binds are evaluated reactively whenever dependencies change.
   */
  binds?: Bind[];
  /**
   * Named, composable validation rule sets (inspired by W3C SHACL). Shapes provide cross-field and form-level validation beyond per-field Bind constraints. Each Shape targets a data path, evaluates a FEL constraint expression, and produces structured ValidationResult entries with severity, message, and code on failure. Shapes compose via 'and', 'or', 'not', 'xone' operators. Only error-severity results block submission; warnings and info are advisory.
   */
  shapes?: Shape[];
  /**
   * Named secondary data sources available to FEL expressions at runtime via @instance('name'). Instances provide lookup tables, prior-year data, and external reference data. The property name is the instance identifier used in @instance() references. Secondary instances are read-only by default during form completion.
   */
  instances?: {
    [k: string]: Instance;
  };
  /**
   * Named computed values with lexical scoping, continuously recalculated when dependencies change. Variables provide intermediate calculations reusable across Binds, Shapes, and other expressions without repetition. Referenced in FEL expressions as @variableName. MUST NOT form circular dependencies.
   */
  variables?: Variable[];
  /**
   * Form-wide default for how non-relevant fields are treated in submitted Response data. 'remove' (DEFAULT): non-relevant nodes and descendants excluded from Response. 'empty': retained but values set to null. 'keep': retained with current values. Per-Bind overrides via Bind.nonRelevantBehavior take precedence. Regardless of this setting, non-relevant fields are always exempt from validation.
   */
  nonRelevantBehavior?: 'remove' | 'empty' | 'keep';
  /**
   * Named, reusable option lists for choice and multiChoice fields. The property name is the set identifier, referenced by Field items via the 'optionSet' property. Avoids duplicating the same options across multiple fields.
   */
  optionSets?: {
    [k: string]: OptionSet;
  };
  migrations?: Migrations;
  fees?: Fees;
  /**
   * Optional Issuer binding. Inline (full Issuer document) for individual/small-org case; ref ({url} only) for shared/agency case. Inverse cardinality from locale/references/ontology (Definition points OUT to Issuer).
   */
  issuer?:
    | FormspecIssuerDocument
    | {
        url: string;
      };
  extensions?: Extensions;
  /**
   * Form-wide presentation defaults. All properties OPTIONAL and advisory — a conforming processor MAY ignore any or all. These are Tier 1 baseline hints; overridden by Theme (Tier 2) and Component (Tier 3) specifications. MUST NOT affect data capture, validation, or submission semantics.
   */
  formPresentation?: {
    /**
     * How top-level groups are paginated. 'single': all items on one page. 'wizard': sequential steps with navigation controls. 'tabs': tabbed sections. Processors that don't support the declared mode SHOULD fall back to 'single'.
     */
    pageMode?: 'single' | 'wizard' | 'tabs';
    /**
     * Default label placement for all Fields. 'top': label above input. 'start': label to the leading side (left in LTR, right in RTL). 'hidden': label suppressed visually but MUST remain in accessible markup.
     */
    labelPosition?: 'top' | 'start' | 'hidden';
    /**
     * Spacing density hint for the overall form layout.
     */
    density?: 'compact' | 'comfortable' | 'spacious';
    /**
     * Default ISO 4217 currency code applied to all money fields that do not declare their own currency. When set, the currency input on MoneyInput widgets is pre-filled and locked to this value.
     */
    defaultCurrency?: string;
    /**
     * Base text direction. 'auto' derives direction from the active locale code (RTL for ar, he, fa, ur, ps, sd, yi).
     */
    direction?: 'ltr' | 'rtl' | 'auto';
    /**
     * Wizard mode: display a step progress indicator.
     */
    showProgress?: boolean;
    /**
     * Wizard mode: allow navigating forward without validating the current page.
     */
    allowSkip?: boolean;
    /**
     * Wizard mode: render a vertical side navigation listing all steps instead of the default horizontal progress bar.
     */
    sidenav?: boolean;
    /**
     * Tabs mode: zero-based index of the initially selected tab.
     */
    defaultTab?: number;
    /**
     * Tabs mode: position of the tab bar relative to the content.
     */
    tabPosition?: 'top' | 'bottom' | 'left' | 'right';
  };
  /**
   * This interface was referenced by `FormDefinition`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * Form-level metadata that affects respondent-facing explanation and policy resolution without changing the item tree. Current core entries cover preparation guidance and form-level assurance requirements.
 */
export interface DefinitionMetadata {
  preparation?: PreparationMetadata;
  assurance?: AssuranceRequirement;
}
/**
 * Respondent-facing preparation guidance for trailhead pages: documents to have ready and realistic acquisition windows for those documents.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "PreparationMetadata".
 */
export interface PreparationMetadata {
  /**
   * Documents, credentials, attachments, or facts the respondent should have available before starting.
   */
  documents?: PreparationDocument[];
  /**
   * Named acquisition windows keyed by document id, item path, or preparation category.
   */
  expectedAcquisitionWindows?: {
    [k: string]: AcquisitionWindow;
  };
}
/**
 * One preparation item a respondent may need before completing the form.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "PreparationDocument".
 */
export interface PreparationDocument {
  /**
   * Stable preparation document identifier.
   */
  id: string;
  /**
   * Human-readable document name.
   */
  label: string;
  /**
   * Optional plain-language explanation of why the respondent may need this item.
   */
  description?: string;
  /**
   * Whether this item is expected for all respondents. Conditional documents SHOULD explain the condition in description or itemPaths.
   */
  required?: boolean;
  /**
   * Definition item paths this preparation item supports.
   */
  itemPaths?: string[];
  /**
   * Reference to a rule, citation, or authority chain requiring or explaining this preparation item.
   */
  authorityRef?: string;
}
/**
 * Expected time window for acquiring a preparation item.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "AcquisitionWindow".
 */
export interface AcquisitionWindow {
  /**
   * Plain-language acquisition estimate, such as `same day` or `2-5 business days`.
   */
  label: string;
  /**
   * Lower-bound calendar-day estimate.
   */
  minDays?: number;
  /**
   * Upper-bound calendar-day estimate.
   */
  maxDays?: number;
  /**
   * Reference supporting the estimate, when known.
   */
  sourceRef?: string;
}
/**
 * Form-side identity and authentication assurance floor. Levels use the same L1-L4 taxonomy documented by the Respondent Ledger assurance model.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "AssuranceRequirement".
 */
export interface AssuranceRequirement {
  /**
   * Identity assurance level required for this form.
   */
  ial?: 'L1' | 'L2' | 'L3' | 'L4';
  /**
   * Authentication assurance level required for this form.
   */
  aal?: 'L1' | 'L2' | 'L3' | 'L4';
  /**
   * Jurisdiction or policy namespace in which this assurance requirement applies.
   */
  jurisdiction?: string;
}
/**
 * Respondent-facing consequences associated with this item, including triggered deadlines, lock-in effects, and external actions such as referrals.
 */
export interface ConsequencesMetadata {
  /**
   * Plain-language consequence summary.
   */
  summary?: string;
  /**
   * Whether the action or answer creates an irreversible effect.
   */
  irreversible?: boolean;
  /**
   * Whether this item becomes locked after submission.
   */
  locksAfterSubmit?: boolean;
  /**
   * Deadlines or clocks triggered by this item or action.
   */
  deadlines?: ConsequenceDeadline[];
  /**
   * External actions triggered by this item or action, such as a referral, payment, or mandatory report.
   */
  externalActions?: ExternalAction[];
  /**
   * Reference to the rule, citation, or authority chain explaining the consequence.
   */
  authorityRef?: string;
}
/**
 * One clock or deadline that starts when an answer or submission action occurs.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "ConsequenceDeadline".
 */
export interface ConsequenceDeadline {
  label: string;
  /**
   * Absolute deadline when known.
   */
  due?: string;
  /**
   * Relative deadline such as `30 days after submission`.
   */
  offset?: string;
  authorityRef?: string;
}
/**
 * External act that may require its own deliberate consent moment.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "ExternalAction".
 */
export interface ExternalAction {
  /**
   * Closed core external-action kind. `referral` covers cross-agency referral warnings.
   */
  kind: 'referral' | 'payment' | 'credit-check' | 'mandatory-report' | 'identity-verification' | 'other';
  label: string;
  description?: string;
  /**
   * Agency, system, or recipient that receives the action.
   */
  recipient?: string;
  /**
   * Whether the renderer should collect a distinct deliberate consent act before this action fires.
   */
  consentRequired?: boolean;
  authorityRef?: string;
}
/**
 * Plain-language purpose and citation metadata explaining why this item is asked or shown.
 */
export interface PurposeMetadata {
  /**
   * Plain-language reason this item is asked or shown.
   */
  summary?: string;
  /**
   * Reference to a rule, citation, or PKAF authority chain supporting the question.
   */
  authorityRef?: string;
  /**
   * References to citations in a References document or external citation registry.
   */
  citationRefs?: string[];
  /**
   * Plain-language or registry-backed audience names that use this answer.
   */
  recipientAudiences?: string[];
  /**
   * Plain-language retention statement when known.
   */
  retention?: string;
}
/**
 * A behavioral declaration attached to one or more data nodes by path. Binds are the bridge between structure (Items) and behavior (reactive expressions). All FEL expressions within a Bind are evaluated in the context of the node identified by 'path'. Binds are evaluated reactively: when a referenced value changes, affected Binds are re-evaluated in dependency-graph order. Inheritance: relevant is AND-inherited (child is non-relevant if any ancestor is), readonly is OR-inherited (child is readonly if any ancestor is), required and constraint are NOT inherited.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "Bind".
 */
export interface Bind {
  /**
   * Path expression identifying the target data node(s). Uses dot notation for nesting and [*] for all instances of a repeatable group. MUST resolve to at least one Item key in the Definition. Examples: 'fieldKey', 'group.field', 'repeat[*].field', 'groupA.groupB[*].field'.
   */
  path: string;
  /**
   * FEL expression whose result replaces the node's value on each recalculation cycle. The field is implicitly readonly (unless readonly is explicitly 'false'). Re-evaluated whenever any dependency changes. Each field MUST have at most one calculate Bind.
   */
  calculate?: string;
  /**
   * FEL expression returning boolean. When false, the target node (and all descendants if a group) is non-relevant: hidden from user, excluded from validation, and its submission behavior is governed by nonRelevantBehavior. AND-inherited: if any ancestor is non-relevant, all descendants are too. Null result treated as true (field remains visible).
   */
  relevant?: string;
  /**
   * FEL expression returning boolean. When true, the node MUST have a non-null, non-empty-string value for validation to pass. Evaluated dynamically — a field may be required only under certain conditions. Null result treated as false (field is not required). NOT inherited.
   */
  required?: string;
  /**
   * FEL expression returning boolean. When true, the field MUST NOT be modified by user input (but MAY still be modified by calculate). OR-inherited: if any ancestor is readonly, all descendants are too. Null result treated as false (field is editable). Fields with a calculate Bind are implicitly readonly.
   */
  readonly?: string;
  /**
   * FEL expression returning boolean. Per-field validation predicate evaluated after type and required checks. The token '$' (bare dollar sign) within this expression is bound to the current value of the targeted node. Constraint passes when expression evaluates to true. Null result treated as true (constraint passes). NOT inherited.
   */
  constraint?: string;
  /**
   * Human-readable message displayed when 'constraint' evaluates to false. If absent, a generic failure message is generated by the processor.
   */
  constraintMessage?: string;
  /**
   * Value to assign when a previously non-relevant node becomes relevant again. Distinct from Field initialValue (which is applied once at Response creation). Applied on each non-relevant → relevant transition. May be a literal value or a FEL expression string.
   */
  default?: {
    [k: string]: unknown;
  };
  /**
   * Controls how text values are normalized on input. Applied BEFORE storage and BEFORE validation. 'preserve' (DEFAULT): no modification. 'trim': remove leading/trailing whitespace. 'normalize': trim then collapse internal runs to single space. 'remove': remove all whitespace (useful for identifiers like phone numbers, EINs). Integer/decimal fields always trim regardless.
   */
  whitespace?: 'preserve' | 'trim' | 'normalize' | 'remove';
  /**
   * Controls what downstream FEL expressions see when this field is non-relevant. 'preserve' (DEFAULT): expressions see the field's last value. 'null': expressions see null. This controls the in-memory evaluation model; nonRelevantBehavior controls the serialized output.
   */
  excludedValue?: 'preserve' | 'null';
  /**
   * Per-path override of the Definition-level nonRelevantBehavior. Takes precedence over the Definition default. 'remove': exclude from Response. 'empty': retain but set to null. 'keep': retain with current value.
   */
  nonRelevantBehavior?: 'remove' | 'empty' | 'keep';
  /**
   * Presentation hint for non-relevant items. 'hidden' (DEFAULT): removed from visual layout. 'protected': remains visible but rendered as disabled/greyed-out. Borrowed from FHIR R5 Questionnaire.
   */
  disabledDisplay?: 'hidden' | 'protected';
  /**
   * Bind-level extension data. All keys MUST be prefixed with 'x-'. MUST NOT alter core semantics.
   */
  extensions?: Extensions;
}
/**
 * A named computed value with lexical scoping. Variables provide intermediate calculations reusable across multiple Binds, Shapes, and other expressions. Continuously recalculated when dependencies change (analogous to XForms calculate / FHIR SDC calculatedExpression). MUST NOT form circular dependencies. For one-time initialization, use Field initialValue instead.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "Variable".
 */
export interface Variable {
  /**
   * Variable name. Referenced in FEL expressions as @name. MUST be unique within its scope.
   */
  name: string;
  /**
   * A Formspec Expression Language (FEL) v1.0 expression. FEL is a small, deterministic, side-effect-free language for form logic — no statements, loops, variable assignment, or I/O. Strictly typed: no truthy/falsy coercion.
   *
   * FIELD REFERENCES: '$' = current node value (used in constraint binds); '$field' = field value from nearest scope; '$group.field' = nested path; '$repeat[n].field' = 1-based index into repeat; '$repeat[*].field' = array of all values across repeat instances.
   *
   * CONTEXT REFERENCES: '@index' = 1-based repeat position; '@count' = repeat instance count; '@current' = current repeat instance object; '@instance("name")' = secondary data source by name; '@varName' = variable from definition's variables array.
   *
   * OPERATORS (lowest to highest precedence): (0) let x = e in e, if e then e else e; (1) ? : ternary; (2) or; (3) and; (4) = != equality; (5) < > <= >= comparison; (6) in, not in (right operand must be array); (7) ?? null-coalescing; (8) + - arithmetic, & string concatenation; (9) * / % multiply/divide/modulo; (10) not, - (unary prefix). Postfix .field and [index] bind tightest.
   *
   * KEY RULES: Arithmetic requires number operands. String concatenation uses '&' (not '+'). Logical operators require boolean operands. null = null is true. Division by zero produces null + diagnostic. Cross-type comparison is a type error.
   *
   * LITERALS: Strings in single or double quotes with backslash escapes for backslash, quotes, newline, return, tab, and unicode (4 hex digits). Numbers with decimal semantics (0.1 + 0.2 = 0.3), no leading/trailing dot. Booleans: true, false. null. Dates: @2025-01-15. DateTimes: @2025-01-15T09:30:00Z. Arrays: [1, 2, 3]. Objects: {key: expr}.
   *
   * BUILT-IN FUNCTIONS (~40+): Aggregates — sum, count, countWhere, avg, min, max (operate on arrays, skip nulls). String — length, contains, startsWith, endsWith, substring (1-based), replace (literal), upper, lower, trim, matches (regex), format (positional {0} {1}). Numeric — round (banker's rounding), floor, ceil, abs, power. Date — today, now, year, month, day, dateDiff (unit: 'years'/'months'/'days'), dateAdd, hours, minutes, seconds, time, timeDiff. Logical — if(cond, then, else) with short-circuit evaluation, coalesce (first non-null), empty (null/empty-string/empty-array), present (inverse), selected (multiChoice contains value). Type-checking — isNumber, isString, isDate, isNull, typeOf. Money — money(amount, currency), moneyAmount, moneyCurrency, moneyAdd (same currency required), moneySum. MIP queries — valid($path), relevant($path), readonly($path), required($path). Repeat navigation — prev(), next() return adjacent rows or null, parent() returns enclosing context.
   *
   * NULL PROPAGATION: null propagates through most operations (null + 5 is null, null < 5 is null). Bind-context defaults: relevant null treated as true (show), required null as false (not required), readonly null as false (editable), constraint null as true (passes). Special null handling: coalesce/empty/present/isNull/typeOf accept null; aggregates skip nulls; ?? returns right operand when left is null; string(null) yields empty string; boolean(null) yields false; length(null) yields 0.
   *
   * ARRAY OPS: Equal-length arrays with binary operator produce element-wise result. Scalar + array broadcasts scalar. Different-length arrays produce error. Example: sum($items[*].qty * $items[*].price).
   *
   * TYPES: Primitives: string, number (decimal, min 18 significant digits), boolean, date, money ({amount: string, currency: string}), null. Compound: array (homogeneous). No implicit coercion — use explicit casts: number(), string(), boolean(), date(). Empty string and null are distinct values.
   *
   * RESERVED WORDS (cannot be used as function names): true, false, null, and, or, not, in, if, then, else, let.
   */
  expression: string;
  /**
   * The Item key this variable is scoped to. The variable is visible to expressions on that Item and all its descendants. The special value '#' means definition-wide scope (visible everywhere). Default: '#'.
   */
  scope?: string;
  /**
   * Variable-level extension data. All keys MUST be prefixed with 'x-'.
   */
  extensions?: Extensions;
}
/**
 * A single permitted value for a choice or multiChoice field. The 'value' is the machine-readable key stored in the Response data; the 'label' is the human-readable text displayed to users.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "OptionEntry".
 */
export interface OptionEntry {
  /**
   * Machine-readable key stored in the Response data when this option is selected.
   */
  value: string;
  /**
   * Human-readable text displayed to the user for this option.
   */
  label: string;
  /**
   * Extra type-ahead strings for combobox/searchable Select filtering (abbreviations, codes, alternate names). Matched case-insensitively in addition to label and value.
   */
  keywords?: string[];
  extensions?: Extensions;
}
/**
 * Declares how to transform Responses from prior versions into this version's structure. Migration produces a new Response pinned to the target version; the original is preserved. Fields not in fieldMap are carried forward by path matching or dropped.
 */
export interface Migrations {
  /**
   * Migration descriptors keyed by source version string. Each entry describes how to transform a Response from that specific prior version into the current version's structure.
   */
  from?: {
    [k: string]: MigrationDescriptor;
  };
  extensions?: Extensions;
}
/**
 * Describes how to transform Responses from a single prior version into the current version. Contains field mapping rules and default values for new fields. Fields present in the source but absent from fieldMap are carried forward by path matching (if the path exists in target) or dropped (if it doesn't). The migrated Response's status SHOULD be reset to 'in-progress'.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "MigrationDescriptor".
 */
export interface MigrationDescriptor {
  /**
   * Human-readable description of what changed in this version migration.
   */
  description?: string;
  /**
   * Ordered list of field mapping rules describing how each source field maps to the target version.
   */
  fieldMap?: {
    /**
     * Field path in the source (prior) version's instance data.
     */
    source: string;
    /**
     * Field path in the target (current) version. Null means the field is dropped.
     */
    target: string | null;
    /**
     * 'preserve': copy value as-is to target path. 'drop': discard the source value. 'expression': apply a FEL transform (requires 'expression' property).
     */
    transform: 'preserve' | 'drop' | 'expression';
    /**
     * A Formspec Expression Language (FEL) v1.0 expression. FEL is a small, deterministic, side-effect-free language for form logic — no statements, loops, variable assignment, or I/O. Strictly typed: no truthy/falsy coercion.
     *
     * FIELD REFERENCES: '$' = current node value (used in constraint binds); '$field' = field value from nearest scope; '$group.field' = nested path; '$repeat[n].field' = 1-based index into repeat; '$repeat[*].field' = array of all values across repeat instances.
     *
     * CONTEXT REFERENCES: '@index' = 1-based repeat position; '@count' = repeat instance count; '@current' = current repeat instance object; '@instance("name")' = secondary data source by name; '@varName' = variable from definition's variables array.
     *
     * OPERATORS (lowest to highest precedence): (0) let x = e in e, if e then e else e; (1) ? : ternary; (2) or; (3) and; (4) = != equality; (5) < > <= >= comparison; (6) in, not in (right operand must be array); (7) ?? null-coalescing; (8) + - arithmetic, & string concatenation; (9) * / % multiply/divide/modulo; (10) not, - (unary prefix). Postfix .field and [index] bind tightest.
     *
     * KEY RULES: Arithmetic requires number operands. String concatenation uses '&' (not '+'). Logical operators require boolean operands. null = null is true. Division by zero produces null + diagnostic. Cross-type comparison is a type error.
     *
     * LITERALS: Strings in single or double quotes with backslash escapes for backslash, quotes, newline, return, tab, and unicode (4 hex digits). Numbers with decimal semantics (0.1 + 0.2 = 0.3), no leading/trailing dot. Booleans: true, false. null. Dates: @2025-01-15. DateTimes: @2025-01-15T09:30:00Z. Arrays: [1, 2, 3]. Objects: {key: expr}.
     *
     * BUILT-IN FUNCTIONS (~40+): Aggregates — sum, count, countWhere, avg, min, max (operate on arrays, skip nulls). String — length, contains, startsWith, endsWith, substring (1-based), replace (literal), upper, lower, trim, matches (regex), format (positional {0} {1}). Numeric — round (banker's rounding), floor, ceil, abs, power. Date — today, now, year, month, day, dateDiff (unit: 'years'/'months'/'days'), dateAdd, hours, minutes, seconds, time, timeDiff. Logical — if(cond, then, else) with short-circuit evaluation, coalesce (first non-null), empty (null/empty-string/empty-array), present (inverse), selected (multiChoice contains value). Type-checking — isNumber, isString, isDate, isNull, typeOf. Money — money(amount, currency), moneyAmount, moneyCurrency, moneyAdd (same currency required), moneySum. MIP queries — valid($path), relevant($path), readonly($path), required($path). Repeat navigation — prev(), next() return adjacent rows or null, parent() returns enclosing context.
     *
     * NULL PROPAGATION: null propagates through most operations (null + 5 is null, null < 5 is null). Bind-context defaults: relevant null treated as true (show), required null as false (not required), readonly null as false (editable), constraint null as true (passes). Special null handling: coalesce/empty/present/isNull/typeOf accept null; aggregates skip nulls; ?? returns right operand when left is null; string(null) yields empty string; boolean(null) yields false; length(null) yields 0.
     *
     * ARRAY OPS: Equal-length arrays with binary operator produce element-wise result. Scalar + array broadcasts scalar. Different-length arrays produce error. Example: sum($items[*].qty * $items[*].price).
     *
     * TYPES: Primitives: string, number (decimal, min 18 significant digits), boolean, date, money ({amount: string, currency: string}), null. Compound: array (homogeneous). No implicit coercion — use explicit casts: number(), string(), boolean(), date(). Empty string and null are distinct values.
     *
     * RESERVED WORDS (cannot be used as function names): true, false, null, and, or, not, in, if, then, else, let.
     */
    expression?: string;
  }[];
  /**
   * Default values for new fields that have no source mapping. Keys are target field paths; values are literal defaults.
   */
  defaults?: {};
  extensions?: Extensions;
}
/**
 * FEL-calculated fee line items for respondent-facing cost disclosure.
 */
export interface Fees {
  /**
   * @minItems 1
   */
  lineItems: [FeeLineItem, ...FeeLineItem[]];
  /**
   * Default ISO 4217 currency for fee line items that do not declare their own currency.
   */
  currency?: string;
}
/**
 * One fee, surcharge, processing cost, discount, or waiver line.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "FeeLineItem".
 */
export interface FeeLineItem {
  /**
   * Stable fee line identifier.
   */
  id: string;
  /**
   * Human-readable label for the fee line.
   */
  label: string;
  /**
   * Optional explanation of what triggers this fee line.
   */
  description?: string;
  /**
   * A Formspec Expression Language (FEL) v1.0 expression. FEL is a small, deterministic, side-effect-free language for form logic — no statements, loops, variable assignment, or I/O. Strictly typed: no truthy/falsy coercion.
   *
   * FIELD REFERENCES: '$' = current node value (used in constraint binds); '$field' = field value from nearest scope; '$group.field' = nested path; '$repeat[n].field' = 1-based index into repeat; '$repeat[*].field' = array of all values across repeat instances.
   *
   * CONTEXT REFERENCES: '@index' = 1-based repeat position; '@count' = repeat instance count; '@current' = current repeat instance object; '@instance("name")' = secondary data source by name; '@varName' = variable from definition's variables array.
   *
   * OPERATORS (lowest to highest precedence): (0) let x = e in e, if e then e else e; (1) ? : ternary; (2) or; (3) and; (4) = != equality; (5) < > <= >= comparison; (6) in, not in (right operand must be array); (7) ?? null-coalescing; (8) + - arithmetic, & string concatenation; (9) * / % multiply/divide/modulo; (10) not, - (unary prefix). Postfix .field and [index] bind tightest.
   *
   * KEY RULES: Arithmetic requires number operands. String concatenation uses '&' (not '+'). Logical operators require boolean operands. null = null is true. Division by zero produces null + diagnostic. Cross-type comparison is a type error.
   *
   * LITERALS: Strings in single or double quotes with backslash escapes for backslash, quotes, newline, return, tab, and unicode (4 hex digits). Numbers with decimal semantics (0.1 + 0.2 = 0.3), no leading/trailing dot. Booleans: true, false. null. Dates: @2025-01-15. DateTimes: @2025-01-15T09:30:00Z. Arrays: [1, 2, 3]. Objects: {key: expr}.
   *
   * BUILT-IN FUNCTIONS (~40+): Aggregates — sum, count, countWhere, avg, min, max (operate on arrays, skip nulls). String — length, contains, startsWith, endsWith, substring (1-based), replace (literal), upper, lower, trim, matches (regex), format (positional {0} {1}). Numeric — round (banker's rounding), floor, ceil, abs, power. Date — today, now, year, month, day, dateDiff (unit: 'years'/'months'/'days'), dateAdd, hours, minutes, seconds, time, timeDiff. Logical — if(cond, then, else) with short-circuit evaluation, coalesce (first non-null), empty (null/empty-string/empty-array), present (inverse), selected (multiChoice contains value). Type-checking — isNumber, isString, isDate, isNull, typeOf. Money — money(amount, currency), moneyAmount, moneyCurrency, moneyAdd (same currency required), moneySum. MIP queries — valid($path), relevant($path), readonly($path), required($path). Repeat navigation — prev(), next() return adjacent rows or null, parent() returns enclosing context.
   *
   * NULL PROPAGATION: null propagates through most operations (null + 5 is null, null < 5 is null). Bind-context defaults: relevant null treated as true (show), required null as false (not required), readonly null as false (editable), constraint null as true (passes). Special null handling: coalesce/empty/present/isNull/typeOf accept null; aggregates skip nulls; ?? returns right operand when left is null; string(null) yields empty string; boolean(null) yields false; length(null) yields 0.
   *
   * ARRAY OPS: Equal-length arrays with binary operator produce element-wise result. Scalar + array broadcasts scalar. Different-length arrays produce error. Example: sum($items[*].qty * $items[*].price).
   *
   * TYPES: Primitives: string, number (decimal, min 18 significant digits), boolean, date, money ({amount: string, currency: string}), null. Compound: array (homogeneous). No implicit coercion — use explicit casts: number(), string(), boolean(), date(). Empty string and null are distinct values.
   *
   * RESERVED WORDS (cannot be used as function names): true, false, null, and, or, not, in, if, then, else, let.
   */
  calculate: string;
  /**
   * ISO 4217 currency for this line item. Defaults to fees.currency when omitted.
   */
  currency?: string;
  /**
   * Fee category for grouping and display.
   */
  category?: 'base' | 'surcharge' | 'processing' | 'discount' | 'waiver' | 'other';
  /**
   * Reference to the rule, citation, or authority chain authorizing this fee.
   */
  authorityRef?: string;
}
/**
 * Shared base for entities that publish or issue Formspec documents. Issuer and Publisher both extend Party.
 */
export interface Party {
  /**
   * Display name. Plain string or LangMap.
   */
  name: string | LangMap;
  /**
   * Stable entity URI - ROR, Wikidata, DID, or own-domain URL.
   */
  identifier?: string;
  /**
   * Public organizational homepage (distinct from any document URL).
   */
  homepage?: string;
  contactPoint?: ContactPoint | ContactPoint[];
}
/**
 * Language-keyed string map (BCP 47 keys). JSON-LD-compatible with @container: '@language'.
 */
export interface LangMap {
  [k: string]: string;
}
/**
 * Contact point - schema.org-aligned, vCard 4.0 semantics.
 */
export interface ContactPoint {
  /**
   * Open vocabulary: 'customer support', 'accessibility', 'language line', etc. Renderers SHOULD honor 'customer support' as default.
   */
  contactType?: string;
  email?: string;
  telephone?: string;
  url?: string;
  availableLanguage?: string[];
}
/**
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "LogoVariant".
 */
export interface LogoVariant {
  url: string;
  altText?: string | LangMap;
  aspectRatio?: string;
  preferredBackground?: 'light' | 'dark' | 'any';
}
/**
 * Advisory presentation hints for an Item. All properties OPTIONAL. A conforming processor MAY ignore any property. Presentation hints MUST NOT affect data capture, validation, calculation, or submission semantics. These are Tier 1 hints; overridden by Theme (Tier 2) and Component (Tier 3) specifications. Properties do NOT cascade from parent Group to child Items.
 *
 * This interface was referenced by `FormDefinition`'s JSON-Schema
 * via the `definition` "Presentation".
 */
export interface Presentation {
  /**
   * Preferred UI control. Built-in values use the canonical PascalCase component/widget vocabulary. Custom values MUST be prefixed with x-.
   */
  widgetHint?: WidgetName;
  /**
   * Spatial arrangement hints. Group-level properties control how children are arranged; field/display-level properties control grid positioning within a parent.
   */
  layout?: {
    /**
     * How children are arranged within a Group. 'stack': vertical sequence. 'grid': multi-column grid (use 'columns' to set count). 'inline': horizontal flow.
     */
    flow?: 'stack' | 'grid' | 'inline';
    /**
     * Column count when flow is 'grid'. Ignored otherwise. Based on a 12-column grid system.
     */
    columns?: number;
    /**
     * Grid-scoped placement hints for items inside a parent grid context.
     */
    grid?: {
      /**
       * Grid columns this item spans within a parent grid context.
       */
      span?: number;
      /**
       * Grid column start within a parent grid context.
       */
      start?: number;
      /**
       * Grid rows this item spans within a parent grid context.
       */
      rowSpan?: number;
      /**
       * Grid row start within a parent grid context.
       */
      rowStart?: number;
    };
    /**
     * Whether a group can be collapsed/expanded by the user.
     */
    collapsible?: boolean;
    /**
     * Initial collapsed state. Ignored if collapsible is not true.
     */
    collapsedByDefault?: boolean;
  };
  /**
   * Semantic visual tokens mapped by renderers to their own palette and sizing. These are NOT CSS — they express intent, not implementation.
   */
  styleHints?: {
    /**
     * Semantic importance or tone. 'primary': highlighted/prominent. 'success': positive/complete. 'warning': needs attention. 'danger': critical/error-related. 'muted': de-emphasized.
     */
    emphasis?: 'primary' | 'success' | 'warning' | 'danger' | 'muted';
    /**
     * Relative sizing of the item's visual treatment.
     */
    size?: 'compact' | 'default' | 'large';
  };
  /**
   * Metadata for assistive technologies. Named after ARIA concepts but this specification does NOT require ARIA. Non-web renderers SHOULD map to equivalent platform accessibility APIs.
   */
  accessibility?: {
    /**
     * Semantic role hint. Well-known values: 'alert', 'status', 'navigation', 'complementary', 'region'. Renderers SHOULD map to platform-equivalent accessibility APIs (ARIA on web, UIAccessibility on iOS, etc.).
     */
    role?: string;
    /**
     * Screen-reader-only supplemental description. Distinct from the Item's hint and description (which are visible text); this is for assistive-technology-only context.
     */
    description?: string;
    /**
     * How aggressively to announce value changes to assistive technology. 'off': no announcements. 'polite': announce when idle. 'assertive': announce immediately, interrupting current speech. Most useful for dynamic/calculated fields.
     */
    liveRegion?: 'off' | 'polite' | 'assertive';
  };
}
