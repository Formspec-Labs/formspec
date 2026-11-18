/** @filedesc Plans renderable sections and stable Item ownership in Core page-authority order. */

import type { ComponentDocument, FormDefinition } from '@formspec-org/types';
import { componentTreeOwnsPages, findItemAtPath, getParentPath } from './planner-path-utils.js';
import {
    buildThemePageNodes, planComponentTree, planDefinitionFallback, planDefinitionItem, preparePlanContext,
} from './planner.js';
import type { ComponentTreeNode, LayoutNode, PlanContext } from './types.js';

export interface PageSequenceEntry {
    id?: string;
    title?: string;
    /** Item whose Locale-resolved label supplies the generated title. */
    titleBind?: string;
    titleLocaleKey?: string;
    nodes: LayoutNode[];
    /** The Component root to wrap the selected nodes in when the authored root is split. */
    container?: LayoutNode;
    /** Unique field placement paths. A repeat template uses [*], an explicit index stays concrete. */
    fields: string[];
    /** Authored field templates assigned once across the plan, for fixed-width progress segments. */
    fieldTemplates: string[];
    groups: string[];
}

export interface PageSequenceOptions {
    component?: ComponentDocument;
    theme?: PlanContext['theme'];
    context?: Pick<PlanContext, 'formPresentation' | 'componentGraph' | 'hostEvidence' | 'isComponentAvailable' | 'nextId' | 'activeBreakpoint'>;
}

type Section = Omit<PageSequenceEntry, 'fields' | 'fieldTemplates' | 'groups'> & { loose?: true };

function stringProp(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function walkNodes(nodes: LayoutNode[], visit: (node: LayoutNode, parents: LayoutNode[]) => void, parents: LayoutNode[] = []): void {
    for (const node of nodes) {
        visit(node, parents);
        if (node.children.length) walkNodes(node.children, visit, [...parents, node]);
    }
}

function authoredSection(node: LayoutNode, localePrefix: '$component' | '$page'): Section {
    const id = stringProp(node.props.id);
    return { id, title: stringProp(node.props.title), nodes: [node],
        ...(id ? { titleLocaleKey: `${localePrefix}.${id}.title` } : {}) };
}

function splitSections(nodes: LayoutNode[], page: (node: LayoutNode) => Section | undefined): Section[] {
    const sections: Section[] = [];
    let loose: Section | undefined;
    for (const node of nodes) {
        const section = page(node);
        if (section) {
            sections.push(section);
            loose = undefined;
        } else {
            if (!loose) {
                loose = { nodes: [], loose: true };
                sections.push(loose);
            }
            loose.nodes.push(node);
        }
    }
    return sections;
}

function removePlacements(nodes: LayoutNode[], assigned: ReadonlySet<LayoutNode>): LayoutNode[] {
    return nodes.flatMap(node => {
        if (assigned.has(node)) return [];
        if (!node.children.length) return [node];
        const children = removePlacements(node.children, assigned);
        if (!children.length && node.category === 'layout') return [];
        return children.length === node.children.length && children.every((child, i) => child === node.children[i])
            ? [node]
            : [{ ...node, children }];
    });
}

function themeSections(nodes: LayoutNode[], ctx: PlanContext): Section[] | undefined {
    type Placement = { node: LayoutNode; parents: LayoutNode[] };
    const byPath = new Map<string, Placement>();
    const byTemplate = new Map<string, Placement>();
    walkNodes(nodes, (node, parents) => {
        if (!node.bindPath) return;
        const placement = { node, parents };
        if (!byPath.has(node.bindPath)) byPath.set(node.bindPath, placement);
        if (parents.some(parent => parent.isRepeatTemplate || parent.component === 'Accordion')) {
            const key = placementKey(node.bindPath);
            if (!byTemplate.has(key)) byTemplate.set(key, placement);
        }
    });
    const assigned = new Set<LayoutNode>();
    const pages = buildThemePageNodes(path => {
        const indexed = path !== placementKey(path);
        const planned = byPath.get(path) ?? byTemplate.get(path);
        if (planned) {
            const { node, parents } = planned;
            const template = parents.some(parent => parent.isRepeatTemplate || parent.component === 'Accordion');
            if (indexed && template) return node;
            assigned.add(node);
            return parents.reduceRight((child, parent) => parent.scopeChange || parent.when || parent.isRepeatTemplate
                ? { ...parent, id: ctx.nextId('region-scope'), children: [child] }
                : child, node);
        }
        const item = ctx.findItem(path);
        return item ? planDefinitionItem(item, ctx, getParentPath(path)) : null;
    }, ctx.items, ctx, { preserveBinding: true, retainHiddenRegions: true, retainRegionlessPages: true });
    if (!pages.length) return undefined;
    const remaining = removePlacements(nodes, assigned);
    return [...pages.map(node => authoredSection(node, '$page')), ...splitSections(remaining, () => undefined)];
}

/** Convert only indices introduced by a template to wildcards. */
function templatePath(path: string, repeats: readonly string[]): string {
    let result = path;
    for (const repeat of [...repeats].reverse()) {
        if (result.startsWith(`${repeat}[0]`)) {
            result = `${repeat}[*]${result.slice(repeat.length + 3)}`;
        } else if (result.startsWith(`${repeat}.`)) {
            result = `${repeat}[*]${result.slice(repeat.length)}`;
        }
    }
    return result;
}

/** Whether one placement covers every instance of the other placement. */
export function placementCovers(placement: string, path: string): boolean {
    if (placement === path) return true;
    if (!placement.includes('[*]')) return false;
    const parts = placement.split('[*]');
    let rest = path;
    for (const part of parts.slice(0, -1)) {
        if (!rest.startsWith(part)) return false;
        const index = rest.slice(part.length).match(/^\[(?:\d+|\*)\]/);
        if (!index) return false;
        rest = rest.slice(part.length + index[0].length);
    }
    return rest === parts[parts.length - 1];
}

export function placementKey(path: string): string {
    return path.replace(/\[(?:\d+|\*)\]/g, '');
}

function readPlacements(
    nodes: LayoutNode[], ctx: PlanContext, fields: Set<string>, groups: Set<string>, repeats: readonly string[] = [],
): void {
    for (const node of nodes) {
        const path = node.bindPath;
        const item = path ? ctx.findItem(path) : null;
        const childRepeats = item?.repeatable && path && (node.isRepeatTemplate || node.component === 'Accordion')
            ? [...repeats, path]
            : repeats;
        if (path && item?.type === 'group') groups.add(templatePath(path, repeats));
        if (path && node.fieldItem) fields.add(templatePath(path, repeats));
        if (path && item?.repeatable && node.component === 'DataTable' && Array.isArray(node.props.columns)) {
            for (const column of node.props.columns) {
                if (typeof column?.bind !== 'string') continue;
                const fieldPath = `${path}.${column.bind}`;
                if (ctx.findItem(fieldPath)?.type === 'field') fields.add(templatePath(fieldPath, [...repeats, path]));
            }
        }
        readPlacements(node.children, ctx, fields, groups, childRepeats);
    }
}

function definitionSections(nodes: LayoutNode[], ctx: PlanContext): Section[] {
    const groups = ctx.items.filter(item => item.type === 'group');
    const keys = new Set(groups.map(item => item.key));
    type Fragment = { id?: string; node: LayoutNode };

    function splitByGroup(node: LayoutNode): Fragment[] {
        if (node.bindPath) {
            const key = placementKey(node.bindPath).split('.')[0];
            return [{ id: keys.has(key) ? key : undefined, node }];
        }
        const children = node.children.flatMap(splitByGroup);
        const owners = new Set(children.map(child => child.id));
        if (owners.size <= 1) return [{ id: children[0]?.id, node }];
        // The generated pages can split visual wrappers while preserving the controls inside them.
        // Keep mixed interactive containers intact so their own behavior remains available.
        if (node.component !== 'Stack' && node.component !== 'Grid' && node.component !== 'Root') return [{ node }];
        const fragments: Fragment[] = [];
        for (const child of children) {
            const last = fragments[fragments.length - 1];
            if (last && last.id === child.id) last.node.children.push(child.node);
            else fragments.push({ id: child.id, node: { ...node, id: ctx.nextId('section-fragment'), children: [child.node] } });
        }
        return fragments;
    }

    const order: Array<Section | undefined> = [];
    const byGroup = new Map<string, LayoutNode[]>();
    let loose: Section | undefined;
    for (const { id, node } of nodes.flatMap(splitByGroup)) {
        if (id !== undefined) {
            const group = byGroup.get(id);
            if (group) group.push(node);
            else {
                byGroup.set(id, [node]);
                order.push(undefined);
            }
            loose = undefined;
        } else {
            if (!loose) {
                loose = { nodes: [], loose: true };
                order.push(loose);
            }
            loose.nodes.push(node);
        }
    }
    const generated = groups.flatMap(item => {
        const group = byGroup.get(item.key);
        return group ? [{ id: item.key, title: item.label || item.key, titleBind: item.key, nodes: group }] : [];
    });
    let nextGroup = 0;
    return order.map(section => section ?? generated[nextGroup++]);
}

function planSections(ctx: PlanContext): Section[] {
    const tree = ctx.componentDocument?.tree as ComponentTreeNode | undefined;
    const root = tree && planComponentTree(tree, ctx, '', undefined, false);
    const authoredPages = componentTreeOwnsPages(tree);
    const container = root && (!root.bindPath || authoredPages) && root.component !== 'Section' && root.children.length
        ? { ...root, children: [] }
        : undefined;
    const base = container ? root!.children : root ? [root] : planDefinitionFallback(ctx.items, ctx, '', false);

    let sections: Section[] | undefined;
    if (authoredPages) {
        sections = splitSections(base, node => node.component === 'Section' ? authoredSection(node, '$component') : undefined);
    } else if (ctx.theme?.pages?.length) {
        // Theme regions may place Items that the Component document does not bind.
        const represented = new Set<string>();
        walkNodes(base, node => {
            if (node.bindPath) represented.add(placementKey(node.bindPath).split('.')[0]);
        });
        const unplaced = root ? ctx.items.filter(item => !represented.has(item.key)) : [];
        sections = themeSections([...base, ...planDefinitionFallback(unplaced, ctx, '', false)], ctx);
    }
    sections ??= definitionSections(base, ctx);
    return sections.map(section => ({ ...section, container }));
}

export function resolvePageSequence(definition: FormDefinition, options: PageSequenceOptions = {}): PageSequenceEntry[] {
    const ctx = preparePlanContext({
        ...options.context,
        items: definition.items,
        componentDocument: options.component,
        theme: options.theme,
        // Retain presentation hints while collecting unpaginated nodes for this section plan.
        formPresentation: { ...(options.context?.formPresentation ?? definition.formPresentation), pageMode: 'single' },
        activeBreakpoint: null,
        findItem: path => findItemAtPath(definition.items, path),
    });
    const sections = planSections(ctx);
    // Responsive overrides affect paint. Bindings and children are authored structure (Component §9.2).
    const painted = options.context?.activeBreakpoint
        ? planSections({ ...ctx, activeBreakpoint: options.context.activeBreakpoint })
        : sections;

    const ids = new Set(sections.flatMap(section => section.id ? [section.id] : []));
    const placements = new Map<string, string[]>();
    const templates = new Set<string>();
    return sections.map(({ loose, ...section }, index) => {
        if (loose) {
            walkNodes(section.nodes, node => {
                if (section.id || !node.bindPath) return;
                const key = ctx.findItem(node.bindPath)?.key;
                if (key && !ids.has(key)) {
                    section.id = key;
                    section.title = 'Additional items';
                    section.titleLocaleKey = '$ui.wizard.otherItems';
                    ids.add(key);
                }
            });
        }
        const fields = new Set<string>();
        const groups = new Set<string>();
        if (section.titleBind) groups.add(section.titleBind);
        const structuralNodes = section.container ? [{ ...section.container, children: section.nodes }] : section.nodes;
        readPlacements(structuralNodes, ctx, fields, groups);
        const ownedFields = [...fields].filter(path => {
            const key = placementKey(path);
            const previous = placements.get(key) ?? [];
            if (previous.some(placement => placementCovers(placement, path))) return false;
            placements.set(key, [...previous, path]);
            return true;
        });
        const fieldTemplates = [...new Set(ownedFields.map(placementKey))].filter(path => {
            if (templates.has(path)) return false;
            templates.add(path);
            return true;
        });
        return { ...section, nodes: painted[index].nodes, container: painted[index].container,
            fields: ownedFields, fieldTemplates, groups: [...groups] };
    });
}
