/** @filedesc IProjectCore interface defining the contract between core and studio. */
import type {
  FormItem, FormDefinition, ComponentDocument, ThemeDocument, MappingDocument,
} from '@formspec-org/types';
import type {
  ProjectState,
  LocaleState,
  CommandResult,
  ChangeListener,
  LogEntry,
  ProjectStatistics,
  ProjectBundle,
  BuiltinCommandType,
  ProjectCommandMap,
  ItemFilter,
  ItemSearchResult,
  DataTypeInfo,
  RegistrySummary,
  ExtensionFilter,
  Change,
  FormspecChangelog,
  FELParseContext,
  FELParseResult,
  FELReferenceSet,
  FELFunctionEntry,
  ExpressionLocation,
  DependencyGraph,
  FieldDependents,
  Diagnostics,
  ResponseSchemaRow,
  Command,
  AnyCommand,
  InternalCommand,
} from './types.js';

/**
 * Abstraction over the raw project core.
 * Implemented by RawProject (formspec-core). Consumed by Project (formspec-studio-core).
 * This is the seam between the two packages.
 */
export interface IProjectCore {
  // ── State getters ────────────────────────────────────────────
  readonly state: Readonly<ProjectState>;
  readonly definition: Readonly<FormDefinition>;
  readonly component: Readonly<ComponentDocument>;
  readonly theme: Readonly<ThemeDocument>;
  readonly mapping: Readonly<MappingDocument>;
  readonly mappings: Readonly<Record<string, MappingDocument>>;
  /** Read-only view of all loaded locale states, keyed by BCP 47 code. */
  readonly locales: Readonly<Record<string, LocaleState>>;

  // ── Command dispatch ─────────────────────────────────────────
  dispatch<T extends BuiltinCommandType = BuiltinCommandType>(command: Command<T, ProjectCommandMap[T]>): CommandResult;
  dispatch<T extends BuiltinCommandType = BuiltinCommandType>(command: Command<T, ProjectCommandMap[T]>[]): CommandResult[];
  batch<T extends BuiltinCommandType = BuiltinCommandType>(commands: Command<T, ProjectCommandMap[T]>[]): CommandResult[];
  batchWithRebuild<T extends BuiltinCommandType = BuiltinCommandType>(phase1: Command<T, ProjectCommandMap[T]>[], phase2: Command<T, ProjectCommandMap[T]>[]): CommandResult[];

  // ── History ──────────────────────────────────────────────────
  undo(): boolean;
  redo(): boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /**
   * The command the next `undo()` reverses / the next `redo()` re-executes,
   * or `null` when that stack is empty. Peeking is what lets a caller refuse
   * a history step before the state moves (ADR 0152 §5.2 — replay is write).
   */
  readonly nextUndoCommand: AnyCommand | InternalCommand | null;
  readonly nextRedoCommand: AnyCommand | InternalCommand | null;
  readonly log: readonly LogEntry[];
  resetHistory(): void;

  // ── State restoration ─────────────────────────────────────────
  /**
   * Wholesale replace the project state with a prior snapshot.
   *
   * Used by the ProposalManager for changeset reject/partial-merge
   * (snapshot-and-replay). History stack is cleared on restore because
   * the changeset is the undo mechanism during its lifetime.
   *
   * Invalidates all cached views.
   */
  restoreState(snapshot: ProjectState): void;

  // ── Change notifications ─────────────────────────────────────
  onChange(listener: ChangeListener): () => void;

  // ── Queries ───────────────────────────────────────────────────
  fieldPaths(): string[];
  itemPaths(): string[];
  itemAt(path: string): FormItem | undefined;
  responseSchemaRows(): ResponseSchemaRow[];
  statistics(): ProjectStatistics;
  instanceNames(): string[];
  variableNames(): string[];
  optionSetUsage(name: string): string[];
  searchItems(filter: ItemFilter): ItemSearchResult[];
  effectivePresentation(fieldKey: string): Record<string, unknown>;
  bindFor(path: string): Record<string, unknown> | undefined;
  componentFor(fieldKey: string): Record<string, unknown> | undefined;
  resolveExtension(name: string): Record<string, unknown> | undefined;
  unboundItems(): string[];
  resolveToken(key: string): string | number | undefined;
  allDataTypes(): DataTypeInfo[];
  parseFEL(expression: string, context?: FELParseContext): FELParseResult;
  /**
   * Evaluate a FEL expression and return a structured trace of evaluation
   * steps. Intended for MCP / LLM surfaces; values are projected to JSON
   * so type fidelity (money, date) is lost but readability is universal.
   */
  traceFEL(expression: string, fields?: Record<string, unknown>): import('@formspec-org/engine/fel-runtime').FelTraceResult;
  felFunctionCatalog(): FELFunctionEntry[];
  availableReferences(context?: string | FELParseContext): FELReferenceSet;
  allExpressions(): ExpressionLocation[];
  expressionDependencies(expression: string): string[];
  fieldDependents(fieldPath: string): FieldDependents;
  variableDependents(variableName: string): string[];
  dependencyGraph(): DependencyGraph;
  listRegistries(): RegistrySummary[];
  browseExtensions(filter?: ExtensionFilter): Record<string, unknown>[];
  diffFromBaseline(fromVersion?: string): Change[];
  previewChangelog(): FormspecChangelog;
  diagnose(): Diagnostics;
  previewMapping(params: import('./types.js').MappingPreviewParams): import('./types.js').MappingPreviewResult;
  /** Get a specific locale state by BCP 47 code. */
  localeAt(code: string): LocaleState | undefined;
  /** Get the currently selected locale code in the editor. */
  activeLocaleCode(): string | undefined;
  export(): ProjectBundle;
}
