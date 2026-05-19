/**
 * Public read-only query helpers exported from `@formspec-org/core`.
 *
 * Internal query modules stay package-private; consumers should import these
 * helpers from the package root instead of deep `dist/queries/*` paths.
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
  listRegistries,
  browseExtensions,
  resolveExtension,
} from './registry-queries.js';

export { flattenDefinitionTree } from './tree-flattening.js';
export type { FlatTreeItem } from './tree-flattening.js';

export { describeShapeConstraint } from './shape-display.js';
