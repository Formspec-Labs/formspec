/** @filedesc Resolves component-tree or theme pages into enriched page structures with diagnostics. */
import type { FormDefinition, FormItem, ComponentState, ThemeDocument } from './types.js';
import type { TreeNode } from './handlers/tree-utils.js';
import { resolvePageStructureFromTree } from './queries/component-page-resolution.js';

// ── Public types ─────────────────────────────────────────────────────

/**
 * Enriched region with existence check.
 * Each region represents a bound item placed on a page.
 */
export interface ResolvedRegion {
  key: string;
  span: number;       // default 12
  start?: number;
  responsive?: Record<string, { span?: number; start?: number; hidden?: boolean }>;
  exists: boolean;     // key exists in definition items?
}

/**
 * Resolved page with enriched regions.
 * Derived from direct-root Section nodes in the component tree, falling back
 * to theme pages when no component-owned pages exist.
 */
export interface ResolvedPage {
  id: string;
  title: string;
  description?: string;
  regions: ResolvedRegion[];
}

export interface PageDiagnostic {
  code: 'UNKNOWN_REGION_KEY' | 'PAGEMODE_MISMATCH';
  severity: 'warning' | 'error';
  message: string;
}

export interface ResolvedPageStructure {
  mode: 'single' | 'wizard' | 'tabs';
  pages: ResolvedPage[];
  diagnostics: PageDiagnostic[];
  unassignedItems: string[];
  itemPageMap: Record<string, string>;
}

/** The document slices resolvePageStructure reads. */
export type PageStructureInput = {
  definition: Pick<FormDefinition, 'formPresentation' | 'items'>;
  component?: Pick<ComponentState, 'tree'>;
  theme?: Pick<ThemeDocument, 'pages'> | { pages?: unknown[] };
};

/**
 * Resolves the current page structure from the component tree.
 *
 * Reads direct-root Section nodes from `component.tree`, or `theme.pages`
 * when the component tree has no root page Sections.
 * Applies bidirectional propagation (groups ↔ children) and emits diagnostics.
 */
export function resolvePageStructure(
  state: PageStructureInput,
  definitionItemKeys: string[],
): ResolvedPageStructure {
  const diagnostics: PageDiagnostic[] = [];
  const pageMode: string = state.definition.formPresentation?.pageMode ?? 'single';
  const knownKeys = new Set(definitionItemKeys);

  const effectiveMode: 'single' | 'wizard' | 'tabs' =
    pageMode === 'tabs' ? 'tabs' : pageMode === 'wizard' ? 'wizard' : 'single';

  // Extract raw page structure from the component tree. Component-owned pages
  // take precedence; theme pages are the lower-precedence declarative page
  // source when no direct-root Section page units exist.
  const tree = state.component?.tree as TreeNode | undefined;
  if (tree) {
    const rawResult = resolvePageStructureFromTree(tree, effectiveMode, definitionItemKeys);
    if (rawResult.pages.length > 0) {
      return finalizePageStructure({
        effectiveMode,
        pageMode,
        pages: rawResult.pages,
        itemPageMap: { ...rawResult.itemPageMap },
        definitionItems: state.definition.items ?? [],
        definitionItemKeys,
        knownKeys,
        diagnostics,
      });
    }
  }

  const themeResult = resolvePageStructureFromTheme(state.theme?.pages, knownKeys);
  return finalizePageStructure({
    effectiveMode,
    pageMode,
    pages: themeResult.pages,
    itemPageMap: themeResult.itemPageMap,
    definitionItems: state.definition.items ?? [],
    definitionItemKeys,
    knownKeys,
    diagnostics,
  });
}

// ── Internal helpers ────────────────────────────────────────────────

function finalizePageStructure(args: {
  effectiveMode: 'single' | 'wizard' | 'tabs';
  pageMode: string;
  pages: ResolvedPage[];
  itemPageMap: Record<string, string>;
  definitionItems: FormItem[];
  definitionItemKeys: string[];
  knownKeys: Set<string>;
  diagnostics: PageDiagnostic[];
}): ResolvedPageStructure {
  const {
    effectiveMode,
    pageMode,
    pages,
    itemPageMap,
    definitionItems,
    definitionItemKeys,
    diagnostics,
  } = args;

  // Emit UNKNOWN_REGION_KEY diagnostics for non-existent region keys
  for (const page of pages) {
    for (const region of page.regions) {
      if (!region.exists && region.key) {
        diagnostics.push({
          code: 'UNKNOWN_REGION_KEY',
          severity: 'warning',
          message: `Region key "${region.key}" on page "${page.title || page.id}" does not match any definition item.`,
        });
      }
    }
  }

  // Bidirectional page ID propagation on the definition item tree
  // Top-down: groups assigned to a page propagate to their children.
  // Bottom-up: groups whose children are ALL assigned inherit a page ID.
  propagatePageIds(definitionItems, itemPageMap);

  // Compute unassigned items with smart group/child logic
  const unassignedItems: string[] = [];
  const visited = new Set<string>();
  collectUnassigned(definitionItems, itemPageMap, visited, unassignedItems);

  // Keys from the input list not in the definition item tree
  for (const key of definitionItemKeys) {
    if (!visited.has(key) && !(key in itemPageMap)) {
      unassignedItems.push(key);
    }
  }

  // Emit PAGEMODE_MISMATCH
  if (pages.length > 0 && pageMode === 'single') {
    diagnostics.push({
      code: 'PAGEMODE_MISMATCH',
      severity: 'warning',
      message: 'Pages exist but definition pageMode is "single". Pages may not render.',
    });
  }

  return {
    mode: effectiveMode,
    pages,
    diagnostics,
    unassignedItems,
    itemPageMap,
  };
}

function resolvePageStructureFromTheme(
  themePages: unknown,
  knownKeys: Set<string>,
): { pages: ResolvedPage[]; itemPageMap: Record<string, string> } {
  const itemPageMap: Record<string, string> = {};
  const pages: ResolvedPage[] = [];

  for (const [index, rawPage] of (Array.isArray(themePages) ? themePages : []).entries()) {
    if (!rawPage || typeof rawPage !== 'object') continue;
    const page = rawPage as {
      id?: unknown;
      title?: unknown;
      description?: unknown;
      regions?: unknown;
    };
    const pageId = typeof page.id === 'string' && page.id ? page.id : `page-${index + 1}`;
    const regions: ResolvedRegion[] = [];
    for (const rawRegion of Array.isArray(page.regions) ? page.regions : []) {
      if (!rawRegion || typeof rawRegion !== 'object') continue;
      const region = rawRegion as {
        key?: unknown;
        span?: unknown;
        start?: unknown;
        responsive?: unknown;
      };
      if (typeof region.key !== 'string' || !region.key) continue;
      regions.push({
        key: region.key,
        span: typeof region.span === 'number' ? region.span : 12,
        ...(typeof region.start === 'number' ? { start: region.start } : {}),
        ...(region.responsive && typeof region.responsive === 'object' && !Array.isArray(region.responsive)
          ? { responsive: region.responsive as ResolvedRegion['responsive'] }
          : {}),
        exists: knownKeys.has(region.key),
      });
      itemPageMap[region.key] = pageId;
    }
    pages.push({
      id: pageId,
      title: typeof page.title === 'string' && page.title ? page.title : pageId,
      ...(typeof page.description === 'string' ? { description: page.description } : {}),
      regions,
    });
  }

  return { pages, itemPageMap };
}

function propagatePageIds(
  items: FormItem[],
  itemPageMap: Record<string, string>,
  parentPageId?: string,
) {
  for (const item of items) {
    const inheritedId = itemPageMap[item.key] ?? parentPageId;
    if (inheritedId && !itemPageMap[item.key]) {
      itemPageMap[item.key] = inheritedId;
    }
    if (item.children) {
      propagatePageIds(item.children, itemPageMap, inheritedId);
      // Bottom-up: if all children are assigned, mark the group as assigned too
      if (!(item.key in itemPageMap)) {
        const allChildrenAssigned = item.children.length > 0 &&
          item.children.every(c => c.key in itemPageMap);
        if (allChildrenAssigned) {
          itemPageMap[item.key] = itemPageMap[item.children[0].key];
        }
      }
    }
  }
}

function collectUnassigned(
  items: FormItem[],
  itemPageMap: Record<string, string>,
  visited: Set<string>,
  unassignedItems: string[],
) {
  for (const item of items) {
    visited.add(item.key);
    const isAssigned = item.key in itemPageMap;

    if (item.children && item.children.length > 0) {
      const anyChildAssigned = item.children.some(c => c.key in itemPageMap);
      if (isAssigned) {
        // Group fully assigned — nothing to show
      } else if (anyChildAssigned) {
        // Partial: some children placed, some not — show only unassigned children
        for (const child of item.children) {
          visited.add(child.key);
          if (!(child.key in itemPageMap)) {
            unassignedItems.push(child.key);
          }
        }
      } else {
        // No children assigned — show the group itself
        unassignedItems.push(item.key);
        for (const child of item.children) {
          visited.add(child.key);
        }
      }
    } else if (!isAssigned) {
      unassignedItems.push(item.key);
    }
  }
}
