/** @filedesc Core type definitions for project state, commands, queries, and diagnostics. */
import type { SchemaValidator } from '@formspec-org/engine/fel-tools';
import type {
  FormItem, FormDefinition, ComponentDocument, ThemeDocument, MappingDocument,
  ScreenerDocument, FieldRule, TargetSchema,
} from '@formspec-org/types';

// ── Schema-derived types (re-exported from formspec-types) ──────────
// These are the canonical schema types shared across all packages.
export type {
  FormItem, FormBind, FormShape, FormVariable, FormInstance, FormOption,
  FormDefinition, ComponentDocument, ThemeDocument, MappingDocument,
  ScreenerDocument,
} from '@formspec-org/types';

// ── Internal content types ──────────────────────────────────────────
// Working state for the four artifacts. Envelope metadata ($formspec*,
// version, targetDefinition) may be present from imports but is NOT
// required internally. Envelope defaults are merged at the export
// boundary (IProjectCore getters / export()) to produce valid
// formspec-types documents.

/**
 * Component working state — content without required envelope metadata.
 * Handlers read/write tree, tokens, breakpoints, etc.
 */
export interface ComponentState {
  tree?: unknown;
  targetDefinition?: { url: string };
  tokens?: Record<string, unknown>;
  breakpoints?: Record<string, number>;
  components?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Theme working state — content without required envelope metadata.
 * Handlers read/write defaults, selectors, items, pages, etc.
 */
export interface ThemeState {
  targetDefinition?: { url: string; compatibleVersions?: string };
  tokens?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
  selectors?: unknown[];
  items?: Record<string, unknown>;
  pages?: unknown[];
  breakpoints?: Record<string, number>;
  stylesheets?: string[];
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Mapping working state — content without required envelope metadata.
 * Handlers read/write rules, targetSchema, adapters, etc.
 */
export interface MappingState {
  rules?: FieldRule[];
  targetSchema?: TargetSchema;
  definitionRef?: string;
  definitionVersion?: string;
  direction?: 'forward' | 'reverse' | 'both';
  defaults?: Record<string, unknown>;
  autoMap?: boolean;
  conformanceLevel?: 'core' | 'bidirectional' | 'extended';
  adapters?: Record<string, unknown>;
  [key: string]: unknown;
}

// ── Locale state ─────────────────────────────────────────────────────

import type { LocaleDocument as LocaleState } from '@formspec-org/types';
export type { LocaleState };

// ── Extension state ──────────────────────────────────────────────────

/**
 * Read-only extension state loaded into a project.
 *
 * Registries provide custom data types, FEL functions, constraints, and properties.
 * They are reference data -- the project loads them but does not author them.
 */
export interface ExtensionsState {
  /** All extension registries currently loaded into the project. */
  registries: LoadedRegistry[];
}

/**
 * A single extension registry that has been fetched and indexed.
 * All fields are JSON-serializable — no Maps or class instances.
 */
export interface LoadedRegistry {
  /** Canonical URL of the registry document. */
  url: string;
  /** The raw registry document as loaded. */
  document: unknown;
  /** Extension entries keyed by name. Plain object for JSON serializability. */
  entries: Record<string, unknown>;
}

// ── Versioning state ─────────────────────────────────────────────────

/**
 * Tracks the definition's version history.
 *
 * Enables changelog generation (structured diff with semver impact classification)
 * and version publishing. The baseline is compared against the current definition
 * to compute pending changes.
 */
export interface VersioningState {
  /** Snapshot of the definition at the last publish (or project creation). */
  baseline: FormDefinition;
  /** Ordered release history, oldest first. */
  releases: VersionRelease[];
}

/**
 * A published version of the definition, including its changelog and frozen snapshot.
 */
export interface VersionRelease {
  /** Semver version string (e.g. `"1.2.0"`). */
  version: string;
  /** ISO 8601 timestamp of when this version was published. */
  publishedAt: string;
  /** Structured diff from the previous version. */
  changelog: unknown;
  /** Frozen definition snapshot at this version. */
  snapshot: FormDefinition;
}

// ── Project state ────────────────────────────────────────────────────

/**
 * The complete state of a studio project.
 *
 * Contains four editable Formspec artifacts (definition, component, theme, mapping)
 * plus two supporting subsystems (extensions, versioning). No UI state (selection,
 * panel visibility, viewport) lives here -- that belongs to the consumer.
 *
 * Mutations happen exclusively through dispatched commands; never mutate directly.
 */
export interface ProjectState {
  /** The form's structure and behavior: items, binds, shapes, variables, etc. */
  definition: FormDefinition;
  /** The form's component document and layout structure. */
  component: ComponentState;
  /** Visual presentation content: tokens, defaults, selectors, page layout. */
  theme: ThemeState;
  /** Named mapping collection: rules, targetSchema, adapters, etc. keyed by unique ID. */
  mappings: Record<string, MappingState>;
  /** ID of the mapping currently being edited in the UI. */
  selectedMappingId?: string;
  /** Loaded locale documents keyed by BCP 47 code. */
  locales: Record<string, LocaleState>;
  /** BCP 47 code of the active locale in the editor. */
  selectedLocaleId?: string;
  /** Loaded extension registries providing custom types, functions, and constraints. */
  extensions: ExtensionsState;
  /** Standalone Screener Document, or null if no screener is loaded. */
  screener: ScreenerDocument | null;
  /** Baseline snapshot and release history for changelog generation. */
  versioning: VersioningState;
}

// ── Commands ─────────────────────────────────────────────────────────

/**
 * A serializable edit operation dispatched against a Project.
 *
 * Every mutation to project state is expressed as a command. Commands can be
 * logged, replayed, transmitted, and persisted -- enabling undo/redo, collaboration,
 * and audit trails.
 *
 * @typeParam T - The command type discriminant (e.g. `'definition.addItem'`).
 * @typeParam P - The payload shape specific to this command type.
 */
export interface Command<T extends string = string, P = unknown> {
  /** Discriminant identifying which handler processes this command. */
  type: T;
  /** Command-specific data (e.g. the item to add, the path to remove). */
  payload: P;
  /** Optional client-generated ID for correlation (not used by the engine). */
  id?: string;
}

import type { ProjectCommandMap } from './project-commands.js';
export type BuiltinCommandType = keyof ProjectCommandMap;

export type { ProjectCommandMap };

/** A command with any type and payload -- used when the specific command type is not known statically. */
export type AnyCommand = {
  [K in BuiltinCommandType]: Command<K, ProjectCommandMap[K]>;
}[BuiltinCommandType];

/**
 * Synthetic lifecycle labels emitted by the project for history/notification
 * purposes only. These are never dispatched through command handlers and
 * therefore do not belong in ProjectCommandMap.
 */
export type InternalCommandType = 'undo' | 'redo' | 'restoreState' | 'batch' | 'batchWithRebuild';
export type InternalCommand = Command<InternalCommandType, Record<string, unknown>>;

/**
 * Result returned by every command handler after mutating state.
 *
 * Tells the Project (and consumers) what side effects are needed.
 */
export interface CommandResult {
  /** Whether the component tree needs rebuilding (e.g. after structural item changes). */
  rebuildComponentTree: boolean;
  /** If true, discard all undo/redo history (e.g. after a full project replacement). */
  clearHistory?: boolean;
  /** Canonical path of a newly inserted item, returned by add-item style handlers. */
  insertedPath?: string;
  /** Canonical path after a move or rename operation. */
  newPath?: string;
  /** Reference to a created/wrapped component node, returned by component tree handlers. */
  nodeRef?: { bind?: string; nodeId?: string };
  /** True when the target component node was not found (non-throwing). */
  nodeNotFound?: boolean;
  /** Extra handler-specific return data. */
  [key: string]: unknown;
}

/**
 * A function that applies a command's payload to a cloned project state.
 * Handlers receive a mutable clone of ProjectState and mutate it in-place.
 * They return a CommandResult indicating what side effects are needed.
 */
export type CommandHandler = (
  state: ProjectState,
  payload: unknown,
) => CommandResult & Record<string, unknown>;

// ── History ──────────────────────────────────────────────────────────

/**
 * A timestamped record of a dispatched command.
 *
 * The full command log is serializable and can be persisted then replayed
 * on a fresh project to reconstruct state.
 */
export interface LogEntry {
  /** The command that was dispatched (or an internal lifecycle label for batch/undo/redo). */
  command: AnyCommand | InternalCommand;
  /** Epoch milliseconds when the command was dispatched. */
  timestamp: number;
}

// ── Project options ──────────────────────────────────────────────────

/**
 * Configuration for creating a new Project instance via `createProject()`.
 */
export interface ProjectOptions {
  /** Partial initial state. Omitted fields get sensible defaults (empty definition
   *  with a generated URL, blank component/theme/mapping documents, no extensions). */
  seed?: Partial<ProjectState>;
  /** Extension registry documents to load at creation time. */
  registries?: unknown[];
  /** Maximum number of undo snapshots to retain (default: 50). Oldest pruned first. */
  maxHistoryDepth?: number;
  /** Middleware functions inserted into the dispatch pipeline. */
  middleware?: Middleware[];
  /** Optional schema validator. A wrapper around formspec-engine `lintDocument()` is sufficient. When set, diagnose() runs structural validation and populates the structural diagnostics array. Omit in environments where schemas are not available (e.g. browser without bundled schemas). */
  schemaValidator?: SchemaValidator;
  /** Additional command handlers merged with builtins. Keys override builtins. */
  handlers?: Record<string, CommandHandler>;
}

/**
 * A function that wraps the command execution pipeline.
 *
 * Middleware sees the current (read-only) state and the full command plan
 * (an array of phases, each phase being an array of commands). It must call
 * `next(commands)` to continue the pipeline, or may short-circuit, transform
 * the commands, or perform side effects before/after.
 *
 * @param state - Current project state (read-only snapshot).
 * @param commands - The full command plan: phases of commands to execute.
 * @param next - Passes the (possibly modified) command plan to the next middleware or handler.
 * @returns The execution result containing the new state and per-command results.
 */
export type Middleware = (
  state: Readonly<ProjectState>,
  commands: Readonly<AnyCommand[][]>,
  next: (commands: AnyCommand[][]) => { newState: ProjectState; results: CommandResult[] },
) => { newState: ProjectState; results: CommandResult[] };

// ── Change notification ──────────────────────────────────────────────

/**
 * Callback invoked after every state change (dispatch, undo, redo, batch).
 *
 * @param state - The new project state after the change.
 * @param event - Details about what caused the change.
 */
export type ChangeListener = (
  state: Readonly<ProjectState>,
  event: ChangeEvent,
) => void;

/**
 * Describes a state change that just occurred. Passed to {@link ChangeListener} callbacks.
 */
export interface ChangeEvent {
  /** The command that triggered this change, or an internal lifecycle label for undo/redo/batch. */
  command: AnyCommand | InternalCommand;
  /** The result returned by the command handler. */
  result: CommandResult;
  /** How the change originated: `'dispatch'`, `'undo'`, `'redo'`, or `'batch'`. */
  source: string;
}

// ── Query types ──────────────────────────────────────────────────────

/**
 * Aggregate complexity metrics for a project.
 * Returned by `Project.statistics()` for dashboards and heuristic checks.
 */
export interface ProjectStatistics {
  /** Number of leaf field items in the definition. */
  fieldCount: number;
  /** Number of group (repeatable/non-repeatable) items. */
  groupCount: number;
  /** Number of display (read-only output) items. */
  displayCount: number;
  /** Deepest nesting level of groups within groups. */
  maxNestingDepth: number;
  /** Total number of bind entries (calculate, relevant, required, readonly, constraint). */
  bindCount: number;
  /** Number of cross-field validation shapes. */
  shapeCount: number;
  /** Number of named FEL variables. */
  variableCount: number;
  /** Total FEL expressions across all artifacts. */
  expressionCount: number;
  /** Number of nodes in the component tree. */
  componentNodeCount: number;
  /** Total number of mapping rules across all integrations. */
  totalMappingRuleCount: number;
  /** Number of distinct mapping documents. */
  mappingCount: number;
  /** Number of fields in the screener (0 if no screener loaded). */
  screenerFieldCount: number;
  /** Total routing rules across all screener phases (0 if no screener loaded). */
  screenerRouteCount: number;
  /** Number of evaluation phases in the screener (0 if no screener loaded). */
  screenerPhaseCount: number;
}

// ProjectBundle is now canonical in formspec-types.
export type { ProjectBundle } from '@formspec-org/types';

// ── Search & filter types ───────────────────────────────────────────

/**
 * Criteria for searching definition items via `Project.searchItems()`.
 * All fields are optional; when multiple are set they are AND-combined.
 */
export interface ItemFilter {
  /** Filter by item kind. */
  type?: 'field' | 'group' | 'display';
  /** Filter by data type name (exact match). */
  dataType?: string;
  /** Filter by label text (substring match). */
  label?: string;
  /** Filter to items that declare this extension name. */
  hasExtension?: string;
}

/**
 * A search result item augmented with its full dot-notation path.
 * The `path` disambiguates same-named items in different groups.
 */
export interface ItemSearchResult extends FormItem {
  /** Full dot-notation path (e.g. `"contact.email"`). */
  path: string;
}

/**
 * Describes a data type available in the project.
 * Includes the 13 core types plus any extension-provided types from loaded registries.
 */
export interface DataTypeInfo {
  /** The data type name (e.g. `'string'`, `'x-formspec-url'`). */
  name: string;
  /** Whether this type is built-in or provided by an extension registry. */
  source: 'core' | 'extension';
  /** For extension data types, the core type it extends. */
  baseType?: string;
  /** URL of the registry that provides this extension type. */
  registryUrl?: string;
}

/**
 * Summary of a loaded extension registry for display purposes.
 */
export interface RegistrySummary {
  /** Canonical URL of the registry. */
  url: string;
  /** Number of extension entries in this registry. */
  entryCount: number;
}

/**
 * Criteria for filtering extension entries within loaded registries.
 */
export interface ExtensionFilter {
  /** Filter by extension category. */
  category?: 'dataType' | 'function' | 'constraint' | 'property' | 'namespace';
  /** Filter by lifecycle status. */
  status?: 'draft' | 'stable' | 'deprecated' | 'retired';
  /** Filter by name (substring or glob match). */
  namePattern?: string;
}

// ── FEL query types ─────────────────────────────────────────────────

/**
 * Mapping-editor context for expression parsing/autocomplete.
 */
export interface FELMappingContext {
  /** Optional mapping rule index in the current document. */
  ruleIndex?: number;
  /** Mapping transform direction. */
  direction?: 'forward' | 'reverse';
  /** Source path context for the current rule/expression. */
  sourcePath?: string;
  /** Target path context for the current rule/expression. */
  targetPath?: string;
}

/**
 * Configuration for running a mapping preview.
 */
export interface MappingPreviewParams {
  /** ID of the mapping to simulate. If omitted, uses the currently selected mapping. */
  mappingId?: string;
  /** The source data to transform (form response if forward, external data if reverse). */
  sampleData: Record<string, unknown>;
  /** Transform direction: 'forward' (form->target) or 'reverse' (target->form). */
  direction?: 'forward' | 'reverse';
  /** Optional subset of rule indices to execute. If omitted, all rules are run. */
  ruleIndices?: number[];
}

/**
 * Results of a mapping preview simulation.
 */
export interface MappingPreviewResult {
  /** The transformed output data. */
  output: unknown;
  /** Issues encountered during the transformation. */
  diagnostics: unknown[];
  /** Keys or indices of rules that were successfully applied. */
  appliedRules: number;
  /** Direction that was executed. */
  direction: string;
}

/**
 * Editor context for parsing FEL and assembling reference suggestions.
 */
export interface FELParseContext {
  /** Definition path currently being edited (supports repeat-scope inference). */
  targetPath?: string;
  /** Optional mapping-editor context for mapping-specific references. */
  mappingContext?: FELMappingContext;
}

/**
 * Result of parsing and validating a FEL expression via `Project.parseFEL()`.
 * Enables inline validation and autocomplete in expression editors.
 */
export interface FELParseResult {
  /** Whether the expression is syntactically and semantically valid. */
  valid: boolean;
  /** Parse or validation errors found in the expression. */
  errors: Diagnostic[];
  /** Warnings (non-fatal issues like unknown function names). */
  warnings: Diagnostic[];
  /** Field paths referenced by the expression ($ references). */
  references: string[];
  /** Variable names referenced by the expression (@ references). */
  variables: string[];
  /** FEL function names called in the expression. */
  functions: string[];
}

/**
 * Scope-aware set of valid references available at a given path.
 *
 * Returned by `Project.availableReferences()`. Includes repeat-group context
 * refs (`@current`, `@index`, `@count`) when inside a repeat, and mapping
 * context refs (`@source`, `@target`) when inside a mapping expression.
 */
export interface FELReferenceSet {
  /** Fields that can be referenced, with their data type and optional label. */
  fields: {
    path: string;
    dataType: string;
    label?: string;
    /**
     * Present only when contextPath is inside a repeatable group.
     * - `'local'` — field is inside the same innermost repeat group as contextPath.
     * - `'global'` — field is outside that repeat group.
     */
    scope?: 'local' | 'global';
  }[];
  /** Named variables declared in the definition. */
  variables: { name: string; expression: string }[];
  /** External data source instances. */
  instances: { name: string; source?: string }[];
  /** Context-specific references (e.g. `@current`, `@index`, `@source`). */
  contextRefs: string[];
}

/**
 * A FEL function available in the project.
 * Combines built-in stdlib functions with extension-provided functions.
 */
export interface FELFunctionEntry {
  /** Function name as used in FEL expressions. */
  name: string;
  /** Functional category (e.g. `'aggregate'`, `'string'`, `'date'`). */
  category: string;
  /** Whether this function is built-in or provided by an extension. */
  source: 'builtin' | 'extension';
  /** Function signature (e.g. `'sum(array<number>) -> number'`). */
  signature?: string;
  /** Human-readable description of what the function does. */
  description?: string;
  /** URL of the registry providing this function, if extension-sourced. */
  registryUrl?: string;
}

/**
 * Location of a FEL expression within the project's artifacts.
 * Returned by `Project.allExpressions()` for cross-artifact expression indexing.
 */
export interface ExpressionLocation {
  /** The FEL expression string. */
  expression: string;
  /** Which artifact contains this expression. */
  artifact: 'definition' | 'component' | 'mapping';
  /** Human-readable location descriptor (e.g. `'binds.age.calculate'`). */
  location: string;
}

/**
 * Full dependency graph across all FEL expressions in the project.
 *
 * Nodes are fields, variables, or shapes. Edges indicate that one node's
 * expression references another. Cycles are detected and reported separately.
 */
export interface DependencyGraph {
  /** All nodes participating in FEL dependency relationships. */
  nodes: { id: string; type: 'field' | 'variable' | 'shape' }[];
  /** Directed edges: `from` references `to` via the named expression property. */
  edges: { from: string; to: string; via: string }[];
  /** Groups of node IDs forming circular dependency chains. */
  cycles: string[][];
}

/**
 * Reverse lookup: everything that depends on a specific field.
 * Returned by `Project.fieldDependents()`.
 */
export interface FieldDependents {
  /** Bind entries whose expressions reference this field. */
  binds: { path: string; property: string }[];
  /** Shape rules whose expressions reference this field. */
  shapes: { id: string; property: string }[];
  /** Names of variables whose expressions reference this field. */
  variables: string[];
  /** Identifiers of mapping rules that reference this field (format: `mappingId:index`). */
  mappingRules: string[];
  /** Screener routes whose expressions reference this field. */
  screenerRoutes: Array<{ phaseId: string; routeIndex: number }>;
}

/**
 * A single diagnostic message produced during project validation.
 * Used across structural, expression, extension, and consistency checks.
 */
export interface Diagnostic {
  /** Which artifact produced this diagnostic. */
  artifact: 'definition' | 'component' | 'theme' | 'mapping';
  /** JSON-pointer-style path to the problematic element. */
  path: string;
  /** Severity level. */
  severity: 'error' | 'warning' | 'info';
  /** Machine-readable diagnostic code (e.g. `'UNRESOLVED_EXTENSION'`). */
  code: string;
  /** Human-readable description of the issue. */
  message: string;
  /** 1-based line number within the expression, when available (FEL parse errors). */
  line?: number;
  /** 1-based column number within the expression, when available (FEL parse errors). */
  column?: number;
  /** Character span in source when provided by the analyzer (Rust lexer indices). */
  span?: { start: number; end: number };
}

// ── Diagnostics types ───────────────────────────────────────────────

/**
 * Grouped diagnostic results from `Project.diagnostics()`.
 *
 * Diagnostics are categorized by check type and include aggregate severity counts
 * for quick status display.
 */
export interface Diagnostics {
  /** Schema and structural validity issues. */
  structural: Diagnostic[];
  /** FEL parse errors, unresolved references, and type mismatches. */
  expressions: Diagnostic[];
  /** Unresolved extensions and registry-related issues. */
  extensions: Diagnostic[];
  /** Cross-artifact consistency problems (e.g. component refs to missing items). */
  consistency: Diagnostic[];
  /** Aggregate counts by severity across all categories. */
  counts: { error: number; warning: number; info: number };
}

// ── Response schema types ───────────────────────────────────────────

/**
 * A single row in the response schema view.
 *
 * Describes one item (field or group) from the definition in terms of its
 * JSON representation in a submitted form response. Rows are returned in
 * document order (depth-first) by `Project.responseSchemaRows()`.
 */
export interface ResponseSchemaRow {
  /** Full dotted path to this item (e.g. `"contact.email"`). */
  path: string;
  /** The item's key (leaf segment of path). */
  key: string;
  /** The item's label, or the key if no label is set. */
  label: string;
  /** Nesting depth: 0 for root items, 1 for children of root groups, etc. */
  depth: number;
  /**
   * JSON type of the item's value in a form response:
   * - `"object"` for non-repeatable groups
   * - `"array<object>"` for repeatable groups
   * - `"number"` for fields with dataType `integer` or `decimal`
   * - `"boolean"` for fields with dataType `boolean`
   * - `"string"` for all other fields
   */
  jsonType: 'string' | 'number' | 'boolean' | 'object' | 'array<object>';
  /** Whether any bind for this path has a `required` property. */
  required: boolean;
  /** Whether any bind for this path has a `calculate` property. */
  calculated: boolean;
  /** Whether any bind for this path has a `relevant` or `readonly` property. */
  conditional: boolean;
}

// ── Versioning query types ──────────────────────────────────────────

/**
 * A single change detected between two definition versions.
 * Part of a {@link FormspecChangelog}.
 */
export interface Change {
  /** Kind of change: structural addition/removal, modification, relocation, or rename. */
  type: 'added' | 'removed' | 'modified' | 'moved' | 'renamed';
  /** Which definition element was affected. */
  target: 'item' | 'bind' | 'shape' | 'optionSet' | 'dataSource' | 'screener' | 'migration' | 'metadata';
  /** Dot-path to the affected element. */
  path: string;
  /** Semver impact classification: breaking changes require a major bump. */
  impact: 'breaking' | 'compatible' | 'cosmetic';
  /** Human-readable description of the change. */
  description?: string;
  /** Previous value (for modified/removed changes). */
  before?: unknown;
  /** New value (for modified/added changes). */
  after?: unknown;
}

/**
 * Structured diff between two definition versions.
 *
 * Generated by comparing the versioning baseline against the current definition,
 * or between two published releases. Includes an overall semver impact classification
 * derived from the highest-impact individual change.
 */
export interface FormspecChangelog {
  /** URL of the definition these changes apply to. */
  definitionUrl: string;
  /** Version string of the earlier snapshot. */
  fromVersion: string;
  /** Version string of the later snapshot. */
  toVersion: string;
  /** Overall semver impact (the maximum across all individual changes). */
  semverImpact: 'breaking' | 'compatible' | 'cosmetic';
  /** Individual changes detected between the two versions. */
  changes: Change[];
}
