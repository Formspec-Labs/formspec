/** @filedesc Wizard/tabs page-mode materialization for definition and component plans. */

import type { ComponentDocument } from '@formspec-org/types';
import type { FormItem, LayoutNode, PlanContext } from './types.js';
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
        component: 'Page',
        category: 'layout' as const,
        props: {
            ...(page.id ? { id: page.id } : {}),
            title: page.title || `Page ${index + 1}`,
        },
        cssClasses: [],
        children: page.children,
    }));

    return [...orphans, ...pageNodes];
}

export function buildDefinitionPages(
    nodes: LayoutNode[],
    items: FormItem[],
): { orphans: LayoutNode[]; pages: PlannedPage[] } {
    const pageByName = new Map<string, PlannedPage>();
    const pages: PlannedPage[] = [];
    const orphans: LayoutNode[] = [];
    let lastPage: PlannedPage | null = null;
    let sawExplicitPage = false;

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const node = nodes[index];
        if (!node) continue;

        if (item?.type !== 'group') {
            orphans.push(node);
            continue;
        }

        const pageName = getItemPageName(item);
        if (pageName) {
            sawExplicitPage = true;
            const page = pageByName.get(pageName) ?? { title: pageName, children: [] };
            if (!pageByName.has(pageName)) {
                pageByName.set(pageName, page);
                pages.push(page);
            }
            page.children.push(stripTitleFromGroupNode(node));
            lastPage = page;
        } else if (lastPage && sawExplicitPage) {
            lastPage.children.push(stripTitleFromGroupNode(node));
        } else {
            const title = String(
                item.label || node.props.title || node.props.bind || item.key || `Page ${pages.length + 1}`,
            );
            pages.push({
                title,
                children: [stripTitleFromGroupNode(node)],
            });
            lastPage = pages[pages.length - 1];
        }
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

    if (!isStudioGeneratedComponentDoc(ctx.componentDocument)) {
        return rootNode;
    }

    if (componentType !== 'Stack' && componentType !== 'Root') {
        return rootNode;
    }

    if (!Array.isArray(rootNode.children) || rootNode.children.length === 0) {
        return rootNode;
    }

    if (rootNode.children.some((child) => child.component === 'Page')) {
        const orphans = rootNode.children.filter((node) => node.component !== 'Page');
        const pages = rootNode.children.filter((node) => node.component === 'Page');
        return {
            ...rootNode,
            children: [...orphans, ...pages],
        };
    }

    const topLevelNodes = rootNode.children.slice(0, ctx.items.length);
    const preservedExtras = rootNode.children.slice(ctx.items.length);
    const orphanChildren: LayoutNode[] = [];
    const pages: PlannedPage[] = [];
    const pageByName = new Map<string, PlannedPage>();
    let lastPage: PlannedPage | null = null;
    let sawExplicitPage = false;

    for (let index = 0; index < ctx.items.length; index += 1) {
        const item = ctx.items[index];
        const node = topLevelNodes[index];
        if (!node) continue;

        if (item?.type === 'group') {
            const pageName = getItemPageName(item);
            if (pageName) {
                sawExplicitPage = true;
                const page = pageByName.get(pageName) ?? { title: pageName, children: [] };
                if (!pageByName.has(pageName)) {
                    pageByName.set(pageName, page);
                    pages.push(page);
                }
                page.children.push(stripTitleFromGroupNode(node));
                lastPage = page;
            } else if (lastPage && sawExplicitPage) {
                lastPage.children.push(stripTitleFromGroupNode(node));
            } else {
                const title = String(
                    item.label || node.props.title || node.props.bind || item.key || `Page ${pages.length + 1}`,
                );
                pages.push({
                    title,
                    children: [stripTitleFromGroupNode(node)],
                });
                lastPage = pages[pages.length - 1];
            }
        } else {
            orphanChildren.push(node);
        }
    }

    if (pages.length === 0) {
        return rootNode;
    }

    return {
        ...rootNode,
        children: [...emitPageModePages(orphanChildren, pages, ctx.nextId), ...preservedExtras],
    };
}

export function isStudioGeneratedComponentDoc(doc: ComponentDocument | undefined): boolean {
    if (!doc || typeof doc !== 'object') return false;
    return doc['x-studio-generated'] === true || doc.$formspecComponent == null;
}

function getItemPageName(item: FormItem): string | null {
    const layout = item.presentation as { layout?: { page?: string } } | undefined;
    const page = layout?.layout?.page;
    return typeof page === 'string' && page.trim().length > 0 ? page.trim() : null;
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
