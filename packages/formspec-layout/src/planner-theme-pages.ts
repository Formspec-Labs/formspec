/** @filedesc Theme page grid planning: regions, placement, and page node assembly. */

import type { Region } from './theme-resolver.js';
import type { FormItem, LayoutNode, PlanContext } from './types.js';
import { preparePlanContext } from './node-utils.js';
import { findItemPathByKey } from './planner-path-utils.js';

export function withoutThemePages(ctx: PlanContext): PlanContext {
    if (!ctx.theme?.pages) {
        return ctx;
    }

    const theme = { ...ctx.theme, pages: undefined };
    return { ...ctx, theme };
}

export function collectAssignedTopLevelKeys(
    items: FormItem[],
    pages: NonNullable<PlanContext['theme']>['pages'],
): Set<string> {
    const assigned = new Set<string>();

    for (const page of Array.isArray(pages) ? pages : []) {
        for (const region of Array.isArray(page.regions) ? page.regions : []) {
            const path = findItemPathByKey(items, region.key);
            if (!path) continue;

            const topKey = path.includes('.') ? path.split('.')[0] : path;
            assigned.add(topKey);
        }
    }

    return assigned;
}

export function buildThemePageNodes(
    planRegionNode: (regionPath: string) => LayoutNode | null,
    items: FormItem[],
    ctx: PlanContext,
): LayoutNode[] {
    const pages = Array.isArray(ctx.theme?.pages) ? ctx.theme.pages : [];
    const nodes: LayoutNode[] = [];
    const { nextId } = preparePlanContext(ctx);

    for (const page of pages) {
        const regionNodes: LayoutNode[] = [];
        for (const region of Array.isArray(page.regions) ? page.regions : []) {
            const regionPath = findItemPathByKey(items, region.key);
            if (!regionPath) continue;
            const plannedNode = planRegionNode(regionPath);
            if (!plannedNode) continue;

            if (regionPath.includes('.') && plannedNode.props?.bind) {
                plannedNode.props.bind = regionPath;
                if (plannedNode.bindPath && plannedNode.bindPath !== regionPath) {
                    plannedNode.bindPath = regionPath;
                }
            }

            const wrapped = wrapRegionNode(plannedNode, region, ctx.activeBreakpoint ?? null, nextId);
            if (wrapped) {
                regionNodes.push(wrapped);
            }
        }

        if (regionNodes.length === 0) continue;

        nodes.push({
            id: nextId('page'),
            component: 'Page',
            category: 'layout',
            props: {
                id: page.id,
                title: page.title,
                ...(page.description ? { description: page.description } : {}),
            },
            cssClasses: [],
            children: [
                {
                    id: nextId('grid'),
                    component: 'Grid',
                    category: 'layout',
                    props: { columns: 12 },
                    cssClasses: [],
                    children: regionNodes,
                },
            ],
        });
    }

    return nodes;
}

export function wrapRegionNode(
    node: LayoutNode,
    region: Region,
    activeBreakpoint: string | null,
    nextId: PlanContext['nextId'],
): LayoutNode | null {
    const resolved = resolveRegionPlacement(region, activeBreakpoint);
    if (resolved.hidden) {
        return null;
    }

    const style: Record<string, string> = {
        gridColumn: resolved.start !== undefined
            ? `${resolved.start} / span ${resolved.span}`
            : `span ${resolved.span}`,
    };

    return {
        id: nextId('region'),
        component: 'Stack',
        category: 'layout',
        props: {},
        style,
        cssClasses: [],
        children: [node],
    };
}

function resolveRegionPlacement(
    region: Region,
    activeBreakpoint: string | null,
): { span: number; start?: number; hidden: boolean } {
    const override = activeBreakpoint && region?.responsive
        ? region.responsive[activeBreakpoint]
        : null;
    const span = typeof override?.span === 'number'
        ? override.span
        : typeof region?.span === 'number'
            ? region.span
            : 12;
    const start = typeof override?.start === 'number'
        ? override.start
        : typeof region?.start === 'number'
            ? region.start
            : undefined;
    const hidden = override?.hidden === true;

    return { span, start, hidden };
}
