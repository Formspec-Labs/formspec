/**
 * Barrel re-export for all query modules.
 *
 * Every function here is a pure read: `(state: ProjectState, ...) => result`.
 */
export {
  fieldPaths,
  itemPaths,
  itemAt,
  responseSchemaRows,
  instanceNames,
  variableNames,
  optionSetUsage,
  searchItems,
  effectivePresentation,
  bindFor,
  componentFor,
  unboundItems,
  resolveToken,
  allDataTypes,
  shapesForPath,
  normalizeBinds,
} from './field-queries.js';
export type { NormalizedBinds } from './field-queries.js';

export {
  parseFEL,
  felFunctionCatalog,
  availableReferences,
  allExpressions,
  expressionDependencies,
} from './expression-index.js';

export {
  fieldDependents,
  variableDependents,
} from './dependency-graph.js';

export { statistics } from './statistics.js';

export { diagnose } from './diagnostics.js';

export {
  diffFromBaseline,
  previewChangelog,
  flattenItems,
} from './versioning.js';

export {
  listRegistries,
  browseExtensions,
  resolveExtension,
} from './registry-queries.js';
export {
  previewMapping,
} from './mapping-queries.js';

export { flattenDefinitionTree } from './tree-flattening.js';
export type { FlatTreeItem } from './tree-flattening.js';

export { commonAncestor, pathsOverlap, expandSelection } from './selection-ops.js';

export { computeDropTargets } from './drop-targets.js';
export type { DropTarget } from './drop-targets.js';

export { describeShapeConstraint } from './shape-display.js';

export { optionSetUsageCount } from './optionset-usage.js';

export { buildSearchIndex } from './search-index.js';
export type { SearchIndexEntry } from './search-index.js';

export { serializeToJSON } from './serialization.js';
