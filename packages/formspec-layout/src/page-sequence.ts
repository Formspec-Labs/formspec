/** @filedesc Resolves assist-friendly page sequences from the authoritative layout planner. */

import type { ComponentDocument, FormDefinition, ThemeDocument } from '@formspec-org/types';
import { findItemAtPath } from './planner-path-utils.js';
import { planComponentTree, planDefinitionFallback, preparePlanContext } from './planner.js';
import type { ComponentTreeNode, LayoutNode, PlanContext } from './types.js';

export interface PageSequenceEntry {
    id: string;
    title?: string;
    fields: string[];
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function slugify(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeId(value: unknown, fallback: string): string {
    if (!isNonEmptyString(value)) {
        return fallback;
    }
    const slug = slugify(value);
    return slug.length > 0 ? slug : fallback;
}

function flattenUnique(values: string[]): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const value of values) {
        if (!isNonEmptyString(value) || seen.has(value)) {
            continue;
        }
        seen.add(value);
        ordered.push(value);
    }
    return ordered;
}

function createPlanContext(
    definition: FormDefinition,
    options: { component?: ComponentDocument; theme?: ThemeDocument } = {},
): PlanContext {
    return preparePlanContext({
        items: definition.items,
        formPresentation: definition.formPresentation,
        componentDocument: options.component,
        theme: options.theme,
        activeBreakpoint: null,
        findItem: (path: string) => findItemAtPath(definition.items, path),
    });
}

function topLevelPages(nodes: LayoutNode[] | LayoutNode): LayoutNode[] {
    if (Array.isArray(nodes)) {
        return nodes.filter((node) => node.component === 'Page');
    }
    if (nodes.component === 'Page') {
        return [nodes];
    }
    return Array.isArray(nodes.children)
        ? nodes.children.filter((node) => node.component === 'Page')
        : [];
}

function collectFieldPaths(node: LayoutNode, output: string[]): void {
    if (node.fieldItem && isNonEmptyString(node.bindPath)) {
        output.push(node.bindPath);
    }
    for (const child of node.children ?? []) {
        collectFieldPaths(child, output);
    }
}

function buildComponentSequence(definition: FormDefinition, component: ComponentDocument): PageSequenceEntry[] {
    if (!component?.tree) {
        return [];
    }
    const planned = planComponentTree(
        component.tree as ComponentTreeNode,
        createPlanContext(definition, { component }),
        '',
        undefined,
        false,
    );
    return topLevelPages(planned).map((page, index) => {
        const fields: string[] = [];
        collectFieldPaths(page, fields);
        return {
            id: normalizeId(page.props?.id ?? page.id, `page-${index + 1}`),
            title: isNonEmptyString(page.props?.title) ? String(page.props.title).trim() : undefined,
            fields: flattenUnique(fields),
        };
    });
}

function buildThemeSequence(
    definition: FormDefinition,
    options: { component?: ComponentDocument; theme: ThemeDocument },
): PageSequenceEntry[] {
    const planned = options.component?.tree
        ? planComponentTree(
            options.component.tree as ComponentTreeNode,
            createPlanContext(definition, options),
            '',
            undefined,
            true,
        )
        : planDefinitionFallback(definition.items, createPlanContext(definition, { theme: options.theme }));
    return topLevelPages(planned).map((page, index) => {
        const fields: string[] = [];
        collectFieldPaths(page, fields);
        return {
            id: normalizeId(page.props?.id ?? page.id, `page-${index + 1}`),
            title: isNonEmptyString(page.props?.title) ? String(page.props.title).trim() : undefined,
            fields: flattenUnique(fields),
        };
    });
}

function buildDefinitionSequence(definition: FormDefinition): PageSequenceEntry[] {
    const planned = planDefinitionFallback(definition.items, createPlanContext(definition));
    const pages = topLevelPages(planned);
    if (pages.length === 0) {
        const fields: string[] = [];
        for (const item of planned) {
            collectFieldPaths(item, fields);
        }
        return [{ id: 'default', fields: flattenUnique(fields) }];
    }

    return pages.map((page, index) => {
        const fields: string[] = [];
        collectFieldPaths(page, fields);
        return {
            id: normalizeId(page.props?.title ?? page.id, `page-${index + 1}`),
            fields: flattenUnique(fields),
        };
    });
}

export function resolvePageSequence(
    definition: FormDefinition,
    options: { component?: ComponentDocument; theme?: ThemeDocument } = {},
): PageSequenceEntry[] {
    // Layer precedence is explicit:
    // component Page nodes > theme.pages > definition-level page hints.
    if (options.component) {
        const componentPages = buildComponentSequence(definition, options.component);
        if (componentPages.length > 0) {
            return componentPages;
        }
    }

    if (options.theme) {
        const themePages = buildThemeSequence(definition, { component: options.component, theme: options.theme });
        if (themePages.length > 0) {
            return themePages;
        }
    }

    return buildDefinitionSequence(definition);
}
