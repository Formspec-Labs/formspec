/**
 * Pure query function for multi-pass project diagnostics.
 */
import type { FormItem } from '@formspec-org/types';
import { analyzeFEL, normalizeIndexedPath } from '@formspec-org/engine/fel-runtime';
import {
  validateExtensionUsage,
  type DocumentType,
  type SchemaValidator,
} from '@formspec-org/engine/fel-tools';
import { getCurrentComponentDocument } from '../component-documents.js';
import { allExpressions } from './expression-index.js';
import { dependencyGraph } from './dependency-graph.js';
import { flattenItems } from './versioning.js';
import type { ProjectState, Diagnostic, Diagnostics } from '../types.js';

/**
 * On-demand multi-pass validation of the current project state.
 */
export function diagnose(state: ProjectState, schemaValidator?: SchemaValidator): Diagnostics {
  const log = (msg: string) => {
    if (typeof process !== 'undefined' && process.env?.DIAGNOSE_DEBUG) process.stderr.write(`[diagnose] ${msg}\n`);
  };
  log('start');
  const structural: Diagnostic[] = [];
  const expressions: Diagnostic[] = [];
  const extensions: Diagnostic[] = [];
  const consistency: Diagnostic[] = [];

  // Structural: JSON Schema validation when a validator was provided
  if (schemaValidator) {
    log('structural...');
    const artifacts: Array<{ artifact: Diagnostic['artifact']; doc: unknown; type: DocumentType }> = [
      { artifact: 'definition', doc: state.definition, type: 'definition' },
      { artifact: 'component', doc: getCurrentComponentDocument(state), type: 'component' },
      { artifact: 'theme', doc: state.theme, type: 'theme' },
    ];
    for (const [id, m] of Object.entries(state.mappings)) {
      artifacts.push({ artifact: 'mapping', doc: m, type: 'mapping' });
    }
    for (const { artifact, doc, type } of artifacts) {
      if (doc == null || (typeof doc === 'object' && Object.keys(doc).length === 0)) continue;
      const result = schemaValidator.validate(doc, type);
      if (result.documentType === null && result.errors.length > 0) {
        structural.push({
          artifact,
          path: '$',
          severity: 'error',
          code: 'E100',
          message: result.errors[0].message,
        });
      } else {
        for (const e of result.errors) {
          structural.push({
            artifact,
            path: e.path.startsWith('$.') ? e.path.slice(2) : e.path === '$' ? '$' : e.path,
            severity: 'error',
            code: 'E101',
            message: e.message,
          });
        }
      }
    }
    log('structural done');
  }

  // Expression diagnostics
  log('allExpressions...');
  const exprs = allExpressions(state);
  log(`allExpressions done (${exprs.length} exprs)`);
  for (const expr of exprs) {
    const analysis = analyzeFEL(expr.expression);
    if (analysis.valid) continue;
    for (const error of analysis.errors) {
      expressions.push({
        artifact: expr.artifact,
        path: expr.location,
        severity: 'error',
        code: 'FEL_PARSE_ERROR',
        message: error.message,
      });
    }
  }
  log('expressions pass done');

  // Dependency cycle detection
  log('dependency cycles...');
  const graph = dependencyGraph(state);
  for (const cycle of graph.cycles) {
    // Self-edges (length-1 cycles) are normal: a constraint like $age >= 18
    // on field "age" references itself for validation — not a real cycle.
    if (cycle.length <= 1) continue;
    consistency.push({
      artifact: 'definition',
      path: cycle.join(' -> '),
      severity: 'error',
      code: 'CIRCULAR_DEPENDENCY',
      message: `Circular dependency detected: ${cycle.join(' -> ')} -> ${cycle[0]}`,
    });
  }
  log(`dependency cycles done (${graph.cycles.length} cycles)`);

  // Extension diagnostics
  log('extensions...');
  const extensionLookup = new Map<string, Record<string, unknown>>();
  for (const registry of state.extensions.registries) {
    for (const [name, entry] of Object.entries(registry.entries)) {
      if (!extensionLookup.has(name)) {
        extensionLookup.set(name, entry as Record<string, unknown>);
      }
    }
  }
  for (const issue of validateExtensionUsage(state.definition.items, {
    resolveEntry: (name) => extensionLookup.get(name),
  })) {
    extensions.push({
      artifact: 'definition',
      path: issue.path,
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
    });
  }
  log('extensions done');

  log('flattenItems...');
  const itemRows = flattenItems(state.definition.items).filter((row) => row.path);
  log(`flattenItems done (${itemRows.length} rows)`);
  const itemKeySet = new Set(itemRows.map((row) => row.key));
  const itemPathSet = new Set(itemRows.map((row) => row.path));
  const normalizedItemPaths = new Set(itemRows.map((row) => normalizeIndexedPath(row.path)));

  // Consistency: orphan or mis-bound component nodes
  const itemTypeByKey = new Map(itemRows.map((row) => [row.key, row.item.type] as const));
  const itemTypeByPath = new Map(itemRows.map((row) => [row.path, row.item.type] as const));
  const GROUP_AWARE_COMPONENTS = new Set([
    'Stack', 'Grid', 'Columns', 'Panel', 'Collapsible',
    'DataTable', 'Accordion', 'Tabs',
  ]);
  log('component tree...');
  const componentNodeKeySet = new Set<string>();
  const componentDoc = getCurrentComponentDocument(state);
  const tree = componentDoc.tree;
  if (tree) {
    const visited = new WeakSet<object>();
    const queue: unknown[] = [tree];
    let componentNodes = 0;
    while (queue.length > 0) {
      componentNodes++;
      if (componentNodes % 500 === 0) log(`component tree node ${componentNodes}`);
      const raw = queue.shift();
      if (!raw || typeof raw !== 'object') continue;
      if (visited.has(raw)) continue;
      visited.add(raw);
      const node = raw as { bind?: string; nodeId?: string; component?: string; children?: unknown[] };
      // Collect all node identifiers for region-key validity checks
      if (node.nodeId) componentNodeKeySet.add(node.nodeId);
      if (node.bind) {
        componentNodeKeySet.add(node.bind);
        const bindExists = itemKeySet.has(node.bind) || itemPathSet.has(node.bind);
        if (!bindExists) {
          consistency.push({
            artifact: 'component',
            path: node.bind,
            severity: 'warning',
            code: 'ORPHAN_COMPONENT_BIND',
            message: `Component node bound to "${node.bind}" but no such item exists in the definition`,
          });
        } else {
          const itemType = itemTypeByKey.get(node.bind) ?? itemTypeByPath.get(node.bind);
          if (itemType === 'group' && !GROUP_AWARE_COMPONENTS.has(node.component ?? '')) {
            consistency.push({
              artifact: 'component',
              path: node.bind,
              severity: 'warning',
              code: 'DISPLAY_ITEM_BIND',
              message: `Component "${node.component}" is bound to "${node.bind}" which is a group item, not a field — no value to display`,
            });
          }
        }
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          if (child && typeof child === 'object' && !visited.has(child as object)) queue.push(child);
        }
      }
    }
    log(`component tree done (${componentNodes} nodes)`);
  }

  // Consistency: stale mapping rule source paths
  log('consistency mapping/theme...');
  for (const [mid, m] of Object.entries(state.mappings)) {
    const rules = m.rules;
    if (rules) {
      for (let i = 0; i < rules.length; i++) {
        const sp = rules[i].sourcePath;
        const isKnownPath = (p: string): boolean => {
          const norm = normalizeIndexedPath(p);
          if (normalizedItemPaths.has(norm)) return true;
          const dot = norm.lastIndexOf('.');
          return dot > 0 && normalizedItemPaths.has(norm.slice(0, dot));
        };
        if (typeof sp === 'string' && !isKnownPath(sp)) {
          consistency.push({
            artifact: 'mapping',
            path: mid === 'default' ? `rules[${i}].sourcePath` : `${mid}:rules[${i}].sourcePath`,
            severity: 'warning',
            code: 'STALE_MAPPING_SOURCE',
            message: `Mapping "${mid}" rule source path "${sp}" does not match any field in the definition`,
          });
        }
      }
    }
  }

  // Consistency: theme selector matches and stale item/page references
  const selectors = state.theme.selectors;
  if (Array.isArray(selectors)) {
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      const match = selector?.match;
      if (!match || typeof match !== 'object') continue;
      const hasMatch = itemRows.some((row) => {
        if (typeof match.type === 'string' && row.item.type !== match.type) return false;
        if (typeof match.dataType === 'string' && row.item.dataType !== match.dataType) return false;
        return true;
      });
      if (!hasMatch) {
        consistency.push({
          artifact: 'theme',
          path: `selectors[${i}]`,
          severity: 'warning',
          code: 'UNMATCHED_THEME_SELECTOR',
          message: 'Theme selector does not match any current definition item',
        });
      }
    }
  }

  const themeItems = state.theme.items;
  if (themeItems) {
    for (const key of Object.keys(themeItems)) {
      if (!itemKeySet.has(key) && !itemPathSet.has(key)) {
        consistency.push({
          artifact: 'theme',
          path: `items.${key}`,
          severity: 'warning',
          code: 'STALE_THEME_ITEM_OVERRIDE',
          message: `Theme item override "${key}" does not match any item key in the definition`,
        });
      }
    }
  }

  // Consistency: stale bound keys inside component tree Page nodes
  // Page nodes live as children of the component tree root with component === 'Page'.
  const rootChildren = Array.isArray((tree as { children?: unknown[] } | undefined)?.children)
    ? (tree as { children: unknown[] }).children
    : [];
  const pageNodes = rootChildren.filter(
    (c): c is { component?: string; children?: { bind?: string }[] } =>
      typeof c === 'object' && c !== null && (c as { component?: string }).component === 'Page',
  );
  for (let i = 0; i < pageNodes.length; i++) {
    const pageChildren = pageNodes[i]?.children;
    if (!Array.isArray(pageChildren)) continue;
    for (let j = 0; j < pageChildren.length; j++) {
      const key = pageChildren[j]?.bind;
      if (typeof key !== 'string') continue;
      if (itemKeySet.has(key) || itemPathSet.has(key) || componentNodeKeySet.has(key)) continue;
      consistency.push({
        artifact: 'component',
        path: `tree.children[${i}].children[${j}].bind`,
        severity: 'warning',
        code: 'STALE_THEME_REGION_KEY',
        message: `Page region key "${key}" does not match any item key in the definition`,
      });
    }
  }

  // Consistency: root-level non-group items in paged definitions
  const defPageMode = state.definition.formPresentation?.pageMode;
  if (defPageMode === 'wizard' || defPageMode === 'tabs') {
    // Build set of item keys placed on Page nodes in the component tree
    const pagePlacedKeys = new Set<string>();
    for (const pageNode of pageNodes) {
      for (const child of pageNode.children ?? []) {
        if (typeof child.bind === 'string') pagePlacedKeys.add(child.bind);
      }
    }

    for (const item of state.definition.items) {
      if (item.type !== 'group' && !pagePlacedKeys.has(item.key)) {
        consistency.push({
          artifact: 'definition',
          path: item.key,
          severity: 'warning',
          code: 'PAGED_ROOT_NON_GROUP',
          message: `Root-level ${item.type} "${item.key}" is not assigned to a page — it will appear in an auto-generated "Other" page in ${defPageMode} mode`,
        });
      }
    }
  }

  log('consistency done');
  // Aggregate counts
  const all = [...structural, ...expressions, ...extensions, ...consistency];
  const counts = { error: 0, warning: 0, info: 0 };
  for (const d of all) {
    counts[d.severity]++;
  }

  log('done');
  return { structural, expressions, extensions, consistency, counts };
}
