/** @filedesc RawProject class: central editing surface for a Formspec artifact bundle. */
import type { IProjectCore } from './project-core.js';
import type {
  ComponentDocument, ThemeDocument, MappingDocument, FormDefinition, FormItem, FormBind,
} from '@formspec-org/types';
import type {
  ProjectState,
  ProjectOptions,
  ThemeState,
  MappingState,
  LocaleState,
  LoadedRegistry,
  Command,
  AnyCommand,
  InternalCommand,
  BuiltinCommandType,
  ProjectCommandMap,
  CommandResult,
  ChangeListener,
  LogEntry,
  ProjectStatistics,
  ProjectBundle,
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
} from './types.js';
import { builtinHandlers } from './handlers/index.js';
import type { CommandHandler } from './types.js';
import { CommandPipeline } from './pipeline.js';
import {
  createComponentArtifact,
  getCurrentComponentDocument,
  normalizeComponentState,
} from './component-documents.js';
import { HistoryManager } from './history.js';
import { reconcileComponentTree } from './tree-reconciler.js';
import { normalizeState } from './state-normalizer.js';
import {
  fieldPaths as _fieldPaths,
  itemPaths as _itemPaths,
  itemAt as _itemAt,
  responseSchemaRows as _responseSchemaRows,
  instanceNames as _instanceNames,
  variableNames as _variableNames,
  optionSetUsage as _optionSetUsage,
  searchItems as _searchItems,
  effectivePresentation as _effectivePresentation,
  bindFor as _bindFor,
  componentFor as _componentFor,
  unboundItems as _unboundItems,
  resolveToken as _resolveToken,
  allDataTypes as _allDataTypes,
  parseFEL as _parseFEL,
  felFunctionCatalog as _felFunctionCatalog,
  availableReferences as _availableReferences,
  allExpressions as _allExpressions,
  expressionDependencies as _expressionDependencies,
  fieldDependents as _fieldDependents,
  variableDependents as _variableDependents,
  dependencyGraph as _dependencyGraph,
  statistics as _statistics,
  diagnose as _diagnose,
  diffFromBaseline as _diffFromBaseline,
  previewChangelog as _previewChangelog,
  previewMapping as _previewMapping,
  listRegistries as _listRegistries,
  browseExtensions as _browseExtensions,
  resolveExtension as _resolveExtension,
} from './queries/index.js';
import { itemAtPath, evalFELWithTrace, type FelTraceResult } from '@formspec-org/engine/fel-runtime';
import { indexRegistryPayload } from './registry-index.js';
import { normalizeBindsFromUnknown } from './definition-binds.js';

/** Components that manage their own group path binding and MUST keep their bind on export. */
const SELF_MANAGED_GROUP_BINDS = new Set(['Accordion', 'DataTable']);

/**
 * Schema-derived allowlist of valid properties per component type.
 *
 * Every built-in component inherits ComponentBase properties (id, component,
 * when, responsive, style, accessibility, cssClass) plus its own type-specific
 * properties. Only properties in this allowlist survive export; everything else
 * (authoring metadata like widgetHint, repeatable, displayMode, addLabel,
 * removeLabel, dataTableConfig, nodeId, _layout, span, start) is stripped.
 *
 * `bind` and `children` are handled structurally by the export logic and are
 * NOT in the per-type sets — they are added when appropriate.
 *
 * Source of truth: schemas/component.schema.json
 */
const COMPONENT_BASE_PROPS = new Set([
  'id', 'component', 'when', 'responsive', 'style', 'accessibility', 'cssClass',
]);

const COMPONENT_SCHEMA_PROPS: Record<string, Set<string>> = {
  Page:             new Set(['title', 'description']),
  Stack:            new Set(['direction', 'gap', 'align', 'wrap']),
  Grid:             new Set(['columns', 'gap', 'rowGap']),
  Spacer:           new Set(['size']),
  TextInput:        new Set(['placeholder', 'maxLines', 'inputMode', 'prefix', 'suffix']),
  NumberInput:      new Set(['placeholder', 'step', 'min', 'max', 'showStepper', 'locale']),
  DatePicker:       new Set(['placeholder', 'format', 'minDate', 'maxDate', 'showTime']),
  Select:           new Set(['searchable', 'multiple', 'placeholder', 'clearable']),
  CheckboxGroup:    new Set(['columns', 'selectAll']),
  Toggle:           new Set(['onLabel', 'offLabel']),
  FileUpload:       new Set(['accept', 'maxSize', 'multiple', 'dragDrop']),
  Heading:          new Set(['level', 'text']),
  Text:             new Set(['text', 'format']),
  Divider:          new Set(['label']),
  Card:             new Set(['title', 'subtitle', 'elevation']),
  Collapsible:      new Set(['title', 'defaultOpen']),
  ConditionalGroup: new Set(['fallback']),
  Columns:          new Set(['widths', 'gap']),
  Tabs:             new Set(['position', 'tabLabels', 'defaultTab']),
  SubmitButton:     new Set(['label', 'mode', 'emitEvent', 'pendingLabel', 'disableWhenPending']),
  Accordion:        new Set(['allowMultiple', 'defaultOpen', 'labels']),
  RadioGroup:       new Set(['columns', 'orientation']),
  MoneyInput:       new Set(['placeholder', 'step', 'min', 'max', 'showStepper', 'currency', 'showCurrency', 'locale']),
  Slider:           new Set(['min', 'max', 'step', 'showValue', 'showTicks']),
  Rating:           new Set(['max', 'icon', 'allowHalf']),
  Signature:        new Set(['strokeColor', 'height', 'penWidth', 'clearable']),
  Alert:            new Set(['severity', 'text', 'dismissible']),
  Badge:            new Set(['text', 'variant']),
  ProgressBar:      new Set(['value', 'max', 'label', 'showPercent']),
  Summary:          new Set(['items']),
  ValidationSummary: new Set(['source', 'mode', 'showFieldErrors', 'jumpLinks', 'dedupe']),
  DataTable:        new Set(['columns', 'showRowNumbers', 'allowAdd', 'allowRemove']),
  Panel:            new Set(['position', 'title', 'width']),
  Modal:            new Set(['title', 'size', 'trigger', 'triggerLabel', 'closable', 'headingLevel', 'placement']),
  Popover:          new Set(['triggerBind', 'triggerLabel', 'placement']),
};

/**
 * Get the set of schema-valid property names for a component type.
 * For unknown/custom component types, returns ComponentBase props + `params`.
 */
function allowedPropsFor(componentType: string): Set<string> {
  const typeProps = COMPONENT_SCHEMA_PROPS[componentType];
  if (typeProps) {
    const merged = new Set(COMPONENT_BASE_PROPS);
    for (const p of typeProps) merged.add(p);
    return merged;
  }
  // Custom component or unrecognized: allow base props + params (CustomComponentRef)
  const custom = new Set(COMPONENT_BASE_PROPS);
  custom.add('params');
  return custom;
}

/**
 * Filter a tree node to only schema-valid properties for its component type.
 *
 * Strips all authoring-time metadata (nodeId, _layout, widgetHint, repeatable,
 * displayMode, addLabel, removeLabel, dataTableConfig, etc.) by emitting ONLY
 * properties that the component schema declares for the node's component type.
 *
 * `bind` and `children` are structural and handled separately by the caller.
 */
function filterToSchemaProps(
  base: Record<string, unknown>,
  componentType: string,
): Record<string, unknown> {
  const allowed = allowedPropsFor(componentType);
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    if (allowed.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Clean a component tree node for export, applying schema-valid property
 * filtering and bind path normalization.
 *
 * - Only schema-declared properties survive (allowlist per component type).
 * - `nodeId`, `_layout`, and all authoring metadata are implicitly excluded.
 * - For non-self-managed layout/container nodes bound to a group item: bind is
 *   removed and the group path becomes the prefix for all descendant bind values.
 * - For input/display/self-managed nodes: bind is converted to the full absolute path.
 * - If bind references a path not found in the definition, it is kept as-is at the
 *   absolute path (orphaned binds are preserved rather than silently dropped).
 */
function cleanTreeForExport(
  node: Record<string, unknown>,
  definition: { items: FormItem[] },
  prefix: string,
): Record<string, unknown> {
  const componentType = (node.component as string) ?? '';
  const bindKey = node.bind;
  const children = node.children;

  // Filter to schema-valid properties only (excludes bind and children — handled below)
  const base = filterToSchemaProps(node, componentType);

  let output: Record<string, unknown>;
  let childPrefix = prefix;

  if (bindKey) {
    const fullPath = prefix ? `${prefix}.${String(bindKey)}` : String(bindKey);
    const item = itemAtPath(definition.items, fullPath);

    if (item?.type === 'group' && !SELF_MANAGED_GROUP_BINDS.has(componentType)) {
      // Non-self-managed group container: omit bind entirely, propagate full path to children
      output = { ...base };
      childPrefix = fullPath;
    } else {
      // Input, display, or self-managed group component: use absolute path.
      // Unresolved binds (item not found) are also kept at their absolute path.
      output = { ...base, bind: fullPath };
    }
  } else {
    output = { ...base };
  }

  if (Array.isArray(children)) {
    output.children = (children as unknown[]).map((child: unknown) =>
      cleanTreeForExport(child as Record<string, unknown>, definition, childPrefix)
    );
  }

  return output;
}

/**
 * Recursively freeze a value and everything reachable from it.
 *
 * Used in dev to enforce the {@link RawProject.restoreState} by-reference
 * contract: if a caller mutates a snapshot after handing it over, the
 * mutation throws at its own site instead of silently diverging project
 * state from the caller's view.  Safe on plain-JSON `ProjectState` graphs
 * (no cycles, no class instances with methods).
 */
function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
}

/**
 * Generate a unique URN for a new definition.
 */
function generateUrl(): string {
  const id = Math.random().toString(36).slice(2, 10);
  return `urn:formspec:${id}`;
}

/**
 * Create a blank definition with sensible defaults.
 */
function createDefaultDefinition(): FormDefinition {
  return {
    $formspec: '1.0',
    url: generateUrl(),
    version: '0.1.0',
    status: 'draft',
    title: '',
    items: [],
  };
}

/**
 * Create default project state, applying seed overrides.
 */
function createDefaultState(options?: ProjectOptions): ProjectState {
  const rawDefinition = options?.seed?.definition ?? createDefaultDefinition();
  const definition = { ...rawDefinition, binds: normalizeBindsFromUnknown(rawDefinition.binds) } as FormDefinition;
  const url = definition.url;
  const componentState = normalizeComponentState(options?.seed?.component, url);

  const theme: ThemeState = options?.seed?.theme ?? {};
  if (!theme.targetDefinition) {
    theme.targetDefinition = { url };
  }

  const mappings: Record<string, MappingState> = options?.seed?.mappings ?? {};
  const selectedMappingId = options?.seed?.selectedMappingId ?? (Object.keys(mappings)[0] || 'default');
  if (!mappings[selectedMappingId]) {
    mappings[selectedMappingId] = { rules: [] };
  }

  const seedRegs: LoadedRegistry[] = [
    ...((options?.seed?.extensions?.registries as LoadedRegistry[] | undefined) ?? []),
  ];
  const registryUrlSeen = new Set(seedRegs.map((r) => r.url));
  for (const raw of options?.registries ?? []) {
    const indexed = indexRegistryPayload(raw as Record<string, unknown>);
    if (!registryUrlSeen.has(indexed.url)) {
      registryUrlSeen.add(indexed.url);
      seedRegs.push(indexed);
    }
  }

  return {
    definition,
    component: componentState ?? createComponentArtifact(url),
    theme,
    mappings,
    selectedMappingId,
    locales: options?.seed?.locales ?? {},
    selectedLocaleId: options?.seed?.selectedLocaleId,
    extensions: { registries: seedRegs },
    screener: options?.seed?.screener ?? null,
    versioning: options?.seed?.versioning ?? {
      baseline: structuredClone(definition),
      releases: [],
    },
  };
}

/**
 * Central editing surface for a Formspec artifact bundle.
 *
 * Manages four co-evolving artifacts (definition, component, theme, mapping)
 * plus extension registries and version history. Every mutation flows through a
 * command-dispatch pipeline. Queries are delegated to pure functions in `queries/`.
 */
export class RawProject implements IProjectCore {
  private _state: ProjectState;
  private _history: HistoryManager<ProjectState>;
  private _listeners: Set<ChangeListener> = new Set();
  private _pipeline: CommandPipeline;
  private _schemaValidator: ProjectOptions['schemaValidator'];
  private _handlers: Readonly<Record<string, CommandHandler>>;
  private _cachedComponent: ComponentDocument | null = null;
  private _cachedComponentForState: ProjectState | null = null;

  constructor(options?: ProjectOptions) {
    this._state = createDefaultState(options);
    this._history = new HistoryManager(options?.maxHistoryDepth);
    this._schemaValidator = options?.schemaValidator;
    this._handlers = options?.handlers
      ? Object.freeze({ ...builtinHandlers, ...options.handlers })
      : builtinHandlers;
    this._pipeline = new CommandPipeline(
      this._handlers,
      options?.middleware ?? [],
    );

    this._syncComponentTree(this._state);
  }

  // PERF: This runs on every dispatch (via handler pipeline) and on
  // restoreState/undo/redo.  reconcileComponentTree is idempotent, so
  // repeated calls are correct but wasteful when the item tree hasn't
  // changed.  Consider adding a dirty flag (set when items/component
  // handlers fire) so reconciliation only runs when needed.
  private _syncComponentTree(state: ProjectState): void {
    if (typeof (state.component as Record<string, unknown>).$formspecComponent !== 'string') {
      (state.component as Record<string, unknown>).$formspecComponent = '1.0';
    }
    if (typeof (state.component as Record<string, unknown>).version !== 'string') {
      (state.component as Record<string, unknown>).version = '0.1.0';
    }
    if (!state.component.targetDefinition) {
      state.component.targetDefinition = { url: state.definition.url };
    } else {
      state.component.targetDefinition.url = state.definition.url;
    }
    if (state.component.tree || state.definition.items.length > 0) {
      state.component.tree = reconcileComponentTree(
        state.definition,
        state.component.tree,
      );
    }
  }

  // ── State getters ───────────────────────────────────────────────

  get state(): Readonly<ProjectState> { return this._state; }

  get definition(): Readonly<FormDefinition> {
    return this._state.definition as unknown as Readonly<FormDefinition>;
  }

  get component(): Readonly<ComponentDocument> {
    if (this._cachedComponentForState !== this._state) {
      this._cachedComponent = this._state.component as unknown as ComponentDocument;
      this._cachedComponentForState = this._state;
    }
    return this._cachedComponent as Readonly<ComponentDocument>;
  }

  get theme(): Readonly<ThemeDocument> {
    return this._state.theme as unknown as Readonly<ThemeDocument>;
  }

  get mappings(): Readonly<Record<string, MappingDocument>> {
    return this._state.mappings as unknown as Readonly<Record<string, MappingDocument>>;
  }

  /** Returns the mapping document for the currently selected integration. */
  get mapping(): Readonly<MappingDocument> {
    const id = this._state.selectedMappingId || 'default';
    return (this._state.mappings[id] || {}) as unknown as Readonly<MappingDocument>;
  }

  get locales(): Readonly<Record<string, LocaleState>> {
    return this._state.locales;
  }

  localeAt(code: string): LocaleState | undefined {
    return this._state.locales[code];
  }

  activeLocaleCode(): string | undefined {
    return this._state.selectedLocaleId;
  }

  // ── Query wrappers ──────────────────────────────────────────────

  fieldPaths(): string[] { return _fieldPaths(this._state); }
  itemPaths(): string[] { return _itemPaths(this._state); }
  itemAt(path: string): FormItem | undefined { return _itemAt(this._state, path); }
  responseSchemaRows(): ResponseSchemaRow[] { return _responseSchemaRows(this._state); }
  statistics(): ProjectStatistics {
    const stats = _statistics(this._state);
    let totalMappingRuleCount = 0;
    for (const m of Object.values(this._state.mappings)) {
      totalMappingRuleCount += (m.rules?.length ?? 0);
    }
    return {
      ...stats,
      totalMappingRuleCount,
      mappingCount: Object.keys(this._state.mappings).length,
    } as ProjectStatistics;
  }
  instanceNames(): string[] { return _instanceNames(this._state); }
  variableNames(): string[] { return _variableNames(this._state); }
  optionSetUsage(name: string): string[] { return _optionSetUsage(this._state, name); }
  searchItems(filter: ItemFilter): ItemSearchResult[] { return _searchItems(this._state, filter); }
  effectivePresentation(fieldKey: string): Record<string, unknown> { return _effectivePresentation(this._state, fieldKey); }
  bindFor(path: string): Record<string, unknown> | undefined { return _bindFor(this._state, path); }
  componentFor(fieldKey: string): Record<string, unknown> | undefined { return _componentFor(this._state, fieldKey); }
  resolveExtension(name: string): Record<string, unknown> | undefined { return _resolveExtension(this._state, name); }
  unboundItems(): string[] { return _unboundItems(this._state); }
  resolveToken(key: string): string | number | undefined { return _resolveToken(this._state, key); }
  allDataTypes(): DataTypeInfo[] { return _allDataTypes(this._state); }
  parseFEL(expression: string, context?: FELParseContext): FELParseResult { return _parseFEL(this._state, expression, context); }
  traceFEL(expression: string, fields: Record<string, unknown> = {}): FelTraceResult { return evalFELWithTrace(expression, fields); }
  felFunctionCatalog(): FELFunctionEntry[] { return _felFunctionCatalog(this._state); }
  availableReferences(context?: string | FELParseContext): FELReferenceSet { return _availableReferences(this._state, context); }
  allExpressions(): ExpressionLocation[] { return _allExpressions(this._state); }
  expressionDependencies(expression: string): string[] { return _expressionDependencies(this._state, expression); }
  fieldDependents(fieldPath: string): FieldDependents { return _fieldDependents(this._state, fieldPath); }
  variableDependents(variableName: string): string[] { return _variableDependents(this._state, variableName); }
  dependencyGraph(): DependencyGraph { return _dependencyGraph(this._state); }
  listRegistries(): RegistrySummary[] { return _listRegistries(this._state); }
  browseExtensions(filter?: ExtensionFilter): Record<string, unknown>[] { return _browseExtensions(this._state, filter); }
  diffFromBaseline(fromVersion?: string): Change[] { return _diffFromBaseline(this._state, fromVersion); }
  previewChangelog(): FormspecChangelog { return _previewChangelog(this._state); }
  previewMapping(params: import('./types.js').MappingPreviewParams): import('./types.js').MappingPreviewResult {
    return _previewMapping(this._state, params);
  }
  diagnose(): Diagnostics { return _diagnose(this._state, this._schemaValidator); }

  // ── Export ──────────────────────────────────────────────────────

  export(): ProjectBundle {
    const url = this._state.definition.url;
    const { tree, ...restComponent } = this._state.component as Record<string, unknown>;
    const cleanedTree = tree ? cleanTreeForExport(tree as Record<string, unknown>, this._state.definition, '') : null;
    const { targetDefinition: themeTarget, ...restTheme } = this._state.theme;

    const exportMappings: Record<string, MappingDocument> = {};
    for (const [id, m] of Object.entries(this._state.mappings)) {
      const { rules, targetSchema, definitionRef, definitionVersion, ...restMapping } = m;
      exportMappings[id] = {
        version: '0.1.0',
        definitionRef: definitionRef ?? url,
        definitionVersion: definitionVersion ?? '>=0.0.0',
        targetSchema: targetSchema ?? { format: 'json' },
        rules: rules ?? [],
        ...restMapping,
      } as MappingDocument;
    }

    const bundle: ProjectBundle = {
      definition: this._state.definition as unknown as FormDefinition,
      component: {
        $formspecComponent: '1.0',
        version: '0.1.0',
        targetDefinition: { url },
        ...restComponent,
        tree: cleanedTree,
      } as unknown as ComponentDocument,
      theme: {
        $formspecTheme: '1.0',
        version: '0.1.0',
        ...restTheme,
        targetDefinition: themeTarget ?? { url },
      } as ThemeDocument,
      mappings: exportMappings,
    };

    // Export locale documents with $formspecLocale envelope
    if (Object.keys(this._state.locales).length > 0) {
      bundle.locales = {};
      for (const [code, ls] of Object.entries(this._state.locales)) {
        bundle.locales[code] = {
          $formspecLocale: '1.0',
          locale: ls.locale,
          version: ls.version,
          targetDefinition: ls.targetDefinition,
          strings: ls.strings,
          ...(ls.fallback ? { fallback: ls.fallback } : {}),
          ...(ls.name ? { name: ls.name } : {}),
          ...(ls.title ? { title: ls.title } : {}),
          ...(ls.description ? { description: ls.description } : {}),
          ...(ls.url ? { url: ls.url } : {}),
        };
      }
    }

    return structuredClone(bundle);
  }

  // ── History ──────────────────────────────────────────────────────

  get canUndo(): boolean { return this._history.canUndo; }
  get canRedo(): boolean { return this._history.canRedo; }
  get log(): readonly LogEntry[] { return this._history.log; }

  resetHistory(): void { this._history.clear(); }

  /**
   * Wholesale replace project state with a prior snapshot.
   *
   * CONTRACT — the snapshot is held BY REFERENCE:
   *   - Callers MUST NOT mutate `snapshot` after this call. The project will
   *     observe those mutations as corruption of its internal state.
   *   - Callers who intend to keep using their own copy MUST clone before
   *     passing (see ProposalManager — every call site wraps with
   *     `structuredClone`).
   *
   * Why by-reference rather than cloning inside?  Snapshots are already full
   * `ProjectState` graphs (definition + component + theme + mappings + locales
   * + baseline). In snapshot-and-replay flows (reject / partial-merge) the
   * caller clones once from the stored `snapshotBefore`; cloning again here
   * would double the cost of every replay for a guarantee the caller already
   * provides.  In dev builds we deep-freeze the snapshot after assignment so
   * accidental mutation throws at the mutation site rather than silently
   * corrupting downstream reads.
   */
  restoreState(snapshot: ProjectState): void {
    this._state = snapshot;
    this._history.clear();
    // Invalidate cached component views
    this._cachedComponent = null;
    this._cachedComponentForState = null;
    // Reconcile generated component tree if needed (mutates _state in place —
    // must run before we freeze).
    this._syncComponentTree(this._state);
    // Dev-only defense: surface contract violations at the mutation site.
    // Skipped in production to avoid traversal cost on large states.
    if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'production') {
      deepFreeze(this._state);
    }
    this._notify(
      { type: 'restoreState', payload: {} } as InternalCommand,
      { rebuildComponentTree: true },
      'restore',
    );
  }

  undo(): boolean {
    const prev = this._history.popUndo(this._state);
    if (!prev) return false;
    this._state = prev;
    this._notify({ type: 'undo', payload: {} } as InternalCommand, { rebuildComponentTree: false }, 'undo');
    return true;
  }

  redo(): boolean {
    const next = this._history.popRedo(this._state);
    if (!next) return false;
    this._state = next;
    this._notify({ type: 'redo', payload: {} } as InternalCommand, { rebuildComponentTree: false }, 'redo');
    return true;
  }

  // ── Change notification ──────────────────────────────────────────

  onChange(listener: ChangeListener): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  private _notify(command: AnyCommand | InternalCommand, result: CommandResult, source: string): void {
    for (const listener of this._listeners) {
      listener(this._state, { command, result, source });
    }
  }

  // ── Dispatching commands ─────────────────────────────────────────

  dispatch<T extends BuiltinCommandType = BuiltinCommandType>(command: Command<T, ProjectCommandMap[T]>): CommandResult;
  dispatch<T extends BuiltinCommandType = BuiltinCommandType>(command: Command<T, ProjectCommandMap[T]>[]): CommandResult[];
  dispatch<T extends BuiltinCommandType = BuiltinCommandType>(command: Command<T, ProjectCommandMap[T]> | Command<T, ProjectCommandMap[T]>[]): CommandResult | CommandResult[] {
    const commands = (Array.isArray(command) ? command : [command]) as AnyCommand[];
    const results = this._execute([commands]);
    return Array.isArray(command) ? results : results[0];
  }

  batchWithRebuild<T extends BuiltinCommandType = BuiltinCommandType>(phase1: Command<T, ProjectCommandMap[T]>[], phase2: Command<T, ProjectCommandMap[T]>[]): CommandResult[] {
    return this._execute([phase1 as AnyCommand[], phase2 as AnyCommand[]]);
  }

  clearRedo(): void {
    this._history.clearRedo();
  }

  batch<T extends BuiltinCommandType = BuiltinCommandType>(commands: Command<T, ProjectCommandMap[T]>[]): CommandResult[] {
    return this._execute([commands as AnyCommand[]]);
  }

  private _execute(phases: AnyCommand[][]): CommandResult[] {
    const snapshot = this._state;

    const { newState, results } = this._pipeline.execute(
      this._state,
      phases,
      (clone) => {
      this._syncComponentTree(clone);
      },
    );

    normalizeState(newState);

    if (results.some(r => r.clearHistory)) {
      this._history.clear();
      this._history.clearLog();
    } else {
      this._history.push(snapshot);
    }

    this._state = newState;

    if (results.some(r => r.rebuildComponentTree)) {
      this._syncComponentTree(this._state);
    }

    const allCommands = phases.flat();
    const logCommand: AnyCommand | InternalCommand = allCommands.length === 1
      ? allCommands[0]
      : phases.length > 1
        ? { type: 'batchWithRebuild', payload: { phases } } as InternalCommand
        : { type: 'batch', payload: { commands: allCommands } } as InternalCommand;
    this._history.appendLog({ command: logCommand, timestamp: Date.now() });

    const source = allCommands.length === 1 ? 'dispatch' : 'batch';
    this._notify(
      logCommand,
      { rebuildComponentTree: results.some(r => r.rebuildComponentTree) },
      source,
    );

    return results;
  }
}

/**
 * Factory function for creating a new {@link RawProject} instance.
 */
export function createRawProject(options?: ProjectOptions): RawProject {
  return new RawProject(options);
}
