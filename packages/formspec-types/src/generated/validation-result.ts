/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * A single structured validation finding produced by constraint evaluation during the Revalidate phase (§2.4 Phase 3). Every failed constraint — whether from a Bind 'constraint' expression, a Bind 'required' check, a dataType type check, a repeatable group cardinality violation, a named Validation Shape, or an external system injection — produces exactly one ValidationResult entry. Results are structured JSON objects carrying severity, a resolved instance path, a human-readable message, and machine-readable codes — never boolean pass/fail flags. The absence of a result for a given path means all constraints on that path passed. The six constraintKind values partition results into categories that map 1:1 to the five built-in constraint mechanisms plus external injection. Results from all sources (bind, shape, external) participate equally in conformance determination: any error-severity result blocks completion regardless of source.
 */
export interface ValidationResult {
  /**
   * Validation result specification version. MUST be '1.0'.
   */
  $formspecValidationResult: '1.0';
  /**
   * The resolved instance path to the data node that produced this result. Uses dot-notation for nesting and 0-based bracket notation for repeat instances (core §4.3.3): 'lineItems[2].amount' is the third instance, while FEL '@index' for that instance is 3. MUST use concrete indexes, NOT definition-time wildcards ('lineItems[*].amount'). This unambiguously identifies the specific data node that failed, even within deeply nested repeatable groups. For root-level fields, the path is just the field key. For form-level Shape results targeting '#', the path is the Shape's target (typically '#' or a specific field the Shape was evaluated against).
   */
  path: string;
  /**
   * The severity level of this finding. Strictly ordered: error > warning > info. Only 'error' results affect the Response's validity and block the transition to 'completed' status. 'warning' results flag suspect data — the user SHOULD review but the form is submittable. 'info' results are observational (e.g., calculated summaries, guidance notes). Severity is inherited from the constraint source: Bind constraints and required checks always produce 'error'; Shapes declare their severity explicitly (default 'error'); external systems specify severity per result. Processors MUST NOT collapse warning into error or omit info results without explicit user configuration.
   */
  severity: 'error' | 'warning' | 'info';
  /**
   * The category of constraint that produced this result. Maps 1:1 to the six validation mechanisms:
   *
   * - 'required': A required field (Bind required=true) has null or empty string value. Standard code: REQUIRED.
   * - 'type': The field's value does not conform to its declared dataType (e.g., 'abc' in an integer field). Standard code: TYPE_MISMATCH.
   * - 'cardinality': A repeatable group violates its minRepeat or maxRepeat bounds. Standard codes: MIN_REPEAT, MAX_REPEAT.
   * - 'constraint': A Bind 'constraint' expression evaluated to false (e.g., '$ > 0' on a negative value), or has a definition error (it failed to parse or calls an undefined function). Standard codes: CONSTRAINT_FAILED, CONSTRAINT_PARSE_ERROR.
   * - 'shape': A named Validation Shape's constraint or composition evaluated to invalid. Standard code: SHAPE_FAILED. The shapeId property identifies which Shape.
   * - 'external': Injected by an external system (server-side API, third-party validator, business rule engine). Standard code: EXTERNAL_FAILED. The source property will be 'external' and sourceId identifies the system.
   */
  constraintKind: 'required' | 'type' | 'cardinality' | 'constraint' | 'shape' | 'external';
  /**
   * A human-readable description of the finding, suitable for display to end users. All '{{expression}}' interpolation sequences from Shape messages MUST be fully resolved before this value is surfaced — consumers receive final text, never templates. Processors SHOULD support localization of messages but the mechanism is implementation-defined. For required violations, a processor-generated default (e.g., 'This field is required.') is used unless the Bind declares a requiredMessage. For constraint violations, the Bind's constraintMessage is used. For Shape violations, the Shape's message (with interpolation resolved) is used.
   */
  message: string;
  /**
   * A machine-readable identifier for this class of finding. Enables programmatic handling: suppressing known warnings, mapping to external error catalogs, localization key lookups, analytics grouping, and API-level error routing. The standard built-in codes below are RESERVED (core spec §2.5.1) and processors MUST use them for corresponding built-in constraints:
   *
   * - REQUIRED — required field is null, empty string, or empty array
   * - TYPE_MISMATCH — value cannot be interpreted as the field's dataType
   * - MIN_REPEAT — fewer repeat instances than minRepeat
   * - MAX_REPEAT — more repeat instances than maxRepeat
   * - CONSTRAINT_FAILED — Bind constraint returned false
   * - CONSTRAINT_PARSE_ERROR — Bind constraint expression has a definition error: it failed to parse or calls an undefined function
   * - SHAPE_FAILED — Shape constraint returned false (when no specific code declared)
   * - EXTERNAL_FAILED — external system reported failure (when no specific code declared)
   *
   * Shape-level codes (e.g., 'BUDGET_SUM_MISMATCH') and external system codes (e.g., 'EIN_NOT_FOUND') override the generic defaults.
   */
  code?: string;
  /**
   * The 'id' of the Validation Shape that produced this result. Present only when constraintKind is 'shape' (and source is 'shape'). MUST be absent for results produced by Bind constraints, type checks, required checks, or cardinality checks. Enables tracing results back to named Shape definitions for debugging, reporting, suppression rules, and UI-level grouping of related cross-field errors.
   */
  shapeId?: string;
  /**
   * The origin category of this finding, identifying which validation subsystem produced it:
   *
   * - 'bind': Produced by a Bind constraint expression returning false, a Bind required check, or a dataType type check. These are per-field, definition-authored validations.
   * - 'shape': Produced by a named Validation Shape — cross-field, composable validation rules declared in the Definition's shapes array.
   * - 'external': Injected by an external system outside the Formspec processing model (server-side API, third-party validator, business rule engine). External results are merged into the report and participate equally in conformance determination — an external error blocks submission identically to a local error.
   *
   * Distinguishing source enables UIs to display origin badges, analytics to track validation hit rates by source, and systems to selectively clear external results when the external system confirms resolution.
   */
  source?: 'bind' | 'shape' | 'external';
  /**
   * Identifies the specific origin of the finding within its source category. For external results, this is the identifier of the external system or validation endpoint (e.g., 'x-irs-validation'). For bind results, this MAY be the bind path. For shape results, this is typically the same as shapeId. Supports audit trails, debugging, and selective clearing of external results (clear all results from a specific sourceId when the external system confirms resolution).
   */
  sourceId?: string;
  /**
   * The actual value of the data node at the time of validation failure. Any JSON type is valid (string, number, boolean, null, object, array). Included for debugging, diagnostic dashboards, and structured logging. For attachment fields, SHOULD be omitted or replaced with metadata (filename, size) to avoid excessive payload size. For required violations, this is typically null or empty string. For constraint violations, this is the value that failed the constraint.
   */
  value?: {
    [k: string]: unknown;
  };
  /**
   * The FEL constraint expression that failed, as authored in the Definition. Included for diagnostic and logging purposes only. Processors MUST NOT display raw constraint expressions to end users — use the 'message' property for user-facing display. MAY be omitted in production deployments to reduce payload size. For required violations, this is absent (there is no expression — the check is structural). For Shape violations, this is the Shape's constraint expression. For external violations, this is absent.
   */
  constraint?: string;
  /**
   * Additional structured context data providing diagnostic detail beyond the message string. For Shape results: propagated from the Shape's 'context' property, with FEL expressions evaluated at failure time. For external results: diagnostic metadata from the external system (endpoint, response code, timestamp). Keys are context field names; values are evaluated results (any JSON type). Useful for rich error messages, diagnostic dashboards, structured logging, and programmatic remediation hints.
   */
  context?: {};
  /**
   * Extension data on individual validation results. All keys MUST be prefixed with 'x-'. Processors MUST ignore unrecognized extensions and preserve them during round-tripping.
   */
  extensions?: {};
}
