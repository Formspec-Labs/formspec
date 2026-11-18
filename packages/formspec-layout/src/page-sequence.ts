/** @filedesc Plans renderable sections and stable Item ownership in Core page-authority order. */

import type { ComponentDocument, FormDefinition } from '@formspec-org/types';
import { componentTreeOwnsPages, findItemAtPath, getParentPath } from './planner-path-utils.js';
import {
    buildThemePageNodes, planComponentTree, planDefinitionFallback, planDefinitionItem, preparePlanContext,
} from './planner.js';
import type { ComponentTreeNode, LayoutNode, PlanContext } from './types.js';
import { mergeFormPresentationForPlanning } from './form-presentation.js';
import { UI_STRINGS } from './ui-strings.js';

export interface PageSequenceEntry {
    id?: string;
    title?: string;
    /** Item whose Locale-resolved label supplies the generated title. */
    titleBind?: string;
    titleLocaleKey?: string;
    /** Layout node ID of the Heading promoted to the page title. */
    titleHeadingId?: string;
    nodes: LayoutNode[];
    /** Trailing instructions and controls shown on every page. */
    sharedNodes?: LayoutNode[];
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

type Section = Omit<PageSequenceEntry, 'fields' | 'fieldTemplates' | 'groups'> & { loose?: true; themeRemainder?: true };

function stringProp(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function walkNodes(
    nodes: LayoutNode[],
    visit: (node: LayoutNode, parents: LayoutNode[], painted?: LayoutNode) => void,
    parents: LayoutNode[] = [],
    painted: LayoutNode[] = nodes,
): void {
    nodes.forEach((node, index) => {
        const paintedNode = painted[index];
        visit(node, parents, paintedNode);
        if (node.children.length) walkNodes(node.children, visit, [...parents, node], paintedNode?.children ?? []);
    });
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
    const unassigned = remaining.filter(hasItem);
    const loose = remaining.filter(node => !hasItem(node));
    return [
        ...pages.map(node => authoredSection(node, '$page')),
        ...(loose.length ? [{ nodes: loose, loose: true as const }] : []),
        ...(unassigned.length ? [{ nodes: unassigned, loose: true as const, themeRemainder: true as const }] : []),
    ];
}

function hasItem(node: LayoutNode): boolean {
    return !!node.bindPath || node.children.some(hasItem);
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

function isSharedControl(node: LayoutNode): boolean {
    return node.component === 'ActionButton' || node.component === 'ValidationSummary';
}

function planSections(ctx: PlanContext): { sections: Section[]; sharedNodes: LayoutNode[] } {
    const tree = ctx.componentDocument?.tree as ComponentTreeNode | undefined;
    const root = tree && planComponentTree(tree, ctx, '', undefined, false);
    const authoredPages = componentTreeOwnsPages(tree);
    const container = root && (!root.bindPath || authoredPages) && root.component !== 'Section' && root.children.length
        ? { ...root, children: [] }
        : undefined;
    const nodes = container ? root!.children : root ? [root] : planDefinitionFallback(ctx.items, ctx, '', false);
    // Studio can place unbound instructions beside actions intended for every step.
    const lastContent = [...nodes].reverse().findIndex(node =>
        !(node.category === 'display' && !node.bindPath) && !isSharedControl(node));
    const suffix = lastContent < 0 ? nodes : nodes.slice(nodes.length - lastContent);
    const sharedNodes = suffix.length < nodes.length && suffix.some(isSharedControl) ? suffix : [];
    const base = nodes.slice(0, nodes.length - sharedNodes.length);

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
    return { sections: sections.map(section => ({ ...section, container })), sharedNodes };
}

function nameLooseSections(sections: Section[], painted: Section[], ctx: PlanContext): void {
    const ids = new Set(sections.flatMap(section => section.id ? [section.id] : []));
    sections.forEach((section, index) => {
        if (!section.loose) return;
        let id: string | undefined;
        walkNodes(section.nodes, (node, _parents, paintedNode) => {
            if (id && section.title) return;
            const item = node.bindPath ? ctx.findItem(node.bindPath) : null;
            if (!id && item?.key && !ids.has(item.key)) id = item.key;
            if (section.title || node.component !== 'Heading' || node.bindPath && item?.type !== 'display') return;
            const title = stringProp(node.props.text);
            if (!title?.trim()) return;
            const paintedTitle = stringProp(paintedNode?.props.text);
            section.title = paintedTitle?.trim() ? paintedTitle : title;
            section.titleHeadingId = paintedNode?.id;
            section.titleBind = node.bindPath;
            const componentId = stringProp(node.props.id);
            if (!node.bindPath && componentId) section.titleLocaleKey = `$component.${componentId}.text`;
        }, [], painted[index].nodes);
        if (!id) return;
        if (section.themeRemainder && !section.title) {
            section.title = UI_STRINGS['wizard.otherItems'];
            section.titleLocaleKey = '$ui.wizard.otherItems';
        }
        if (section.title) {
            section.id = id;
            ids.add(id);
        }
    });
}

function attachLooseSections(sections: Section[], definitionTitle: string, workspace: boolean) {
    const pages: Array<{ section: Section; owner: number; indexes: number[] }> = [];
    let leading: number[] = [];
    sections.forEach((section, index) => {
        if (!section.id && (section.loose || workspace)) {
            (pages.at(-1)?.indexes ?? leading).push(index);
        } else {
            pages.push({ section, owner: index, indexes: [...leading, index] });
            leading = [];
        }
    });
    if (!pages.length && leading.length) {
        pages.push({
            section: { nodes: [], title: definitionTitle, titleLocaleKey: '$form.title', container: sections[0].container },
            owner: 0, indexes: leading,
        });
    }
    return pages;
}

export function resolvePageSequence(definition: FormDefinition, options: PageSequenceOptions = {}): PageSequenceEntry[] {
    const componentPresentation = options.component && 'formPresentation' in options.component
        ? options.component.formPresentation : undefined;
    const presentation = options.context?.formPresentation
        ?? mergeFormPresentationForPlanning(definition.formPresentation, componentPresentation);
    const ctx = preparePlanContext({
        ...options.context,
        items: definition.items,
        componentDocument: options.component,
        theme: options.theme,
        // Retain presentation hints while collecting unpaginated nodes for this section plan.
        formPresentation: { ...presentation, pageMode: 'single' },
        activeBreakpoint: null,
        findItem: path => findItemAtPath(definition.items, path),
    });
    const structural = planSections(ctx);
    const { sections } = structural;
    // Responsive overrides affect paint. Bindings and children are authored structure (Component §9.2).
    const painted = options.context?.activeBreakpoint
        ? planSections({ ...ctx, activeBreakpoint: options.context.activeBreakpoint })
        : structural;

    nameLooseSections(sections, painted.sections, ctx);
    const placements = new Map<string, string[]>();
    const templates = new Set<string>();
    const pages = attachLooseSections(sections, definition.title, presentation?.pageMode === 'workspace')
        .map(({ section: { loose, themeRemainder: _themeRemainder, ...section }, owner, indexes }): PageSequenceEntry => {
            const fields = new Set<string>();
            const groups = new Set<string>();
            if (!loose && section.titleBind) groups.add(section.titleBind);
            const nodes = indexes.flatMap(index => sections[index].nodes);
            const structuralNodes = section.container ? [{ ...section.container, children: nodes }] : nodes;
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
            const paintedOwner = painted.sections[owner];
            const title = section.nodes[0]?.component === 'Section'
                ? paintedOwner.title : section.title;
            return { ...section, title,
                nodes: indexes.flatMap(index => painted.sections[index].nodes), container: paintedOwner.container,
                fields: ownedFields, fieldTemplates, groups: [...groups] };
        });
    const last = pages.at(-1);
    if (last && painted.sharedNodes.length) last.sharedNodes = painted.sharedNodes;
    return pages;
}
