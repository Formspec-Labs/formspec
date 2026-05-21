/** @filedesc Wizard/tabs page-mode materialization for definition and component plans. */

import type { ComponentDocument } from '@formspec-org/types';
import type { FormItem, LayoutNode, NodeIdGenerator, PlanContext } from './types.js';
import { createNodeIdGenerator } from './node-utils.js';

export type PlannedPage = {
    id?: string;
    title: string;
    children: LayoutNode[];
};

export function emitPageModePages(
    orphans: LayoutNode[],
    pages: PlannedPage[],
    nextId = createNodeIdGenerator(),
): LayoutNode[] {
    if (pages.length === 0) {
        return orphans;
    }

    const pageNodes = pages.map((page, index) => ({
        id: nextId('page'),
        component: 'Section',
        category: 'layout' as const,
        props: {
            ...(page.id ? { id: page.id } : {}),
            title: page.title || `Page ${index + 1}`,
        },
        cssClasses: [],
        children: page.children,
    }));

    return [...pageNodes, ...buildFallbackSections(orphans, nextId)];
}

function buildFallbackSections(
    orphans: LayoutNode[],
    nextId: NodeIdGenerator,
): LayoutNode[] {
    if (orphans.length === 0) {
        return [];
    }
    return [{
        id: nextId('fallback-section'),
        component: 'Section',
        category: 'layout' as const,
        props: { title: 'Additional Items' },
        cssClasses: [],
        children: orphans,
    }];
}

export function buildDefinitionPages(
    nodes: LayoutNode[],
    items: FormItem[],
): { orphans: LayoutNode[]; pages: PlannedPage[] } {
    const pages: PlannedPage[] = [];
    const orphans: LayoutNode[] = [];

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const node = nodes[index];
        if (!node) continue;

        if (item?.type !== 'group') {
            orphans.push(node);
            continue;
        }

        const title = String(
            item.label || node.props.title || node.props.bind || item.key || `Page ${pages.length + 1}`,
        );
        pages.push({
            title,
            children: [stripTitleFromGroupNode(node)],
        });
    }

    for (let index = items.length; index < nodes.length; index += 1) {
        orphans.push(nodes[index]);
    }

    return { orphans, pages };
}

export function applyDefinitionPageMode(nodes: LayoutNode[], ctx: PlanContext): LayoutNode[] {
    const pageMode = ctx.formPresentation?.pageMode;
    if (pageMode !== 'wizard' && pageMode !== 'tabs') {
        return nodes;
    }

    const { orphans, pages } = buildDefinitionPages(nodes, ctx.items);
    if (pages.length === 0) {
        return nodes;
    }

    return emitPageModePages(orphans, pages, ctx.nextId);
}

export function applyGeneratedPageMode(
    rootNode: LayoutNode,
    componentType: string,
    ctx: PlanContext,
): LayoutNode {
    const pageMode = ctx.formPresentation?.pageMode;
    if (pageMode !== 'wizard' && pageMode !== 'tabs') {
        return rootNode;
    }

    if (componentType === 'Section') {
        return {
            id: ctx.nextId('root'),
            component: 'Stack',
            category: 'layout',
            props: {},
            cssClasses: [],
            pageMode,
            children: [rootNode],
        };
    }

    if (componentType !== 'Stack' && componentType !== 'Root') {
        return rootNode;
    }

    if (!Array.isArray(rootNode.children) || rootNode.children.length === 0) {
        return rootNode;
    }

    if (rootNode.children.some((child) => child.component === 'Section')) {
        const orphans = rootNode.children.filter((node) => node.component !== 'Section');
        const pages = rootNode.children.filter((node) => node.component === 'Section');
        return {
            ...rootNode,
            pageMode,
            children: [...pages, ...buildFallbackSections(orphans, ctx.nextId)],
        };
    }

    if (!isStudioGeneratedComponentDoc(ctx.componentDocument)) {
        return rootNode;
    }

    const topLevelNodes = rootNode.children.slice(0, ctx.items.length);
    const preservedExtras = rootNode.children.slice(ctx.items.length);
    const orphanChildren: LayoutNode[] = [];
    const pages: PlannedPage[] = [];

    for (let index = 0; index < ctx.items.length; index += 1) {
        const item = ctx.items[index];
        const node = topLevelNodes[index];
        if (!node) continue;

        if (item?.type === 'group') {
            const title = String(
                item.label || node.props.title || node.props.bind || item.key || `Page ${pages.length + 1}`,
            );
            pages.push({
                title,
                children: [stripTitleFromGroupNode(node)],
            });
        } else {
            orphanChildren.push(node);
        }
    }

    if (pages.length === 0) {
        return rootNode;
    }

    return {
        ...rootNode,
        pageMode,
        children: [...emitPageModePages(orphanChildren, pages, ctx.nextId), ...preservedExtras],
    };
}

export function isStudioGeneratedComponentDoc(doc: ComponentDocument | undefined): boolean {
    if (!doc || typeof doc !== 'object') return false;
    return doc['x-studio-generated'] === true || doc.$formspecComponent == null;
}

export function stripTitleFromGroupNode(node: LayoutNode): LayoutNode {
    if (node.component !== 'Stack') {
        return node;
    }

    const { title: _title, ...restProps } = node.props;
    return {
        ...node,
        props: restProps,
    };
}
