/** @filedesc Definition-items fallback planner when no component document is provided. */

import { isRepeatPresentationWidget, widgetTokenToComponent } from '@formspec-org/types';
import type { ItemDescriptor, Tier1Hints } from './theme-resolver.js';
import { resolvePresentation, resolveWidget } from './theme-resolver.js';
import { getDefaultComponent } from './defaults.js';
import type { FormItem, LayoutNode, PlanContext } from './types.js';
import {
    gridPlacementStyleFromLayout,
    needGenerationAnchors,
    normalizeCssClass,
    preparePlanContext,
} from './node-utils.js';
import {
    findItemAtPath,
    findItemPathByKey,
    getParentPath,
} from './planner-path-utils.js';
import {
    applyDefinitionPageMode,
    emitPageModePages,
    type PlannedPage,
} from './planner-page-mode.js';
import { buildThemePageNodes, collectAssignedTopLevelKeys } from './planner-theme-pages.js';

export function planDefinitionFallback(
    items: FormItem[],
    ctx: PlanContext,
    prefix = '',
    applyThemePages = prefix === '',
): LayoutNode[] {
    const planCtx = preparePlanContext(ctx);

    if (applyThemePages && !prefix && planCtx.theme?.pages?.length) {
        const themed = planThemePagesFromDefinitionItems(items, planCtx);
        if (themed.length > 0) {
            return themed;
        }
    }

    const nodes: LayoutNode[] = [];

    for (const item of items) {
        nodes.push(planDefinitionItem(item, planCtx, prefix));
    }

    return !prefix ? applyDefinitionPageMode(nodes, planCtx) : nodes;
}

/**
 * Core §4.2.5 `layout.flow: 'grid'`: the group arranges its children on a grid, and each child's
 * `layout.grid.span` places it there. A span needs a grid context to mean anything, so the children go
 * inside one `Grid` node — the group keeps its own scope, legend and identity around it. `columns`
 * defaults to 12, the grid a `span` is authored against (core §4.2.5).
 */
function wrapGridFlow(children: LayoutNode[], item: FormItem, ctx: PlanContext): LayoutNode[] {
    const layout = (item.presentation as { layout?: { flow?: string; columns?: number } } | undefined)?.layout;
    if (layout?.flow !== 'grid' || children.length === 0) return children;
    return [{
        id: ctx.nextId('grid'),
        component: 'Grid',
        category: 'layout',
        props: { columns: layout.columns ?? 12 },
        cssClasses: [],
        children,
    }];
}

export function planDefinitionItem(item: FormItem, ctx: PlanContext, prefix = ''): LayoutNode {
    const planCtx = preparePlanContext(ctx);
    const key = item.key || (item as { name?: string }).name || 'item';
    const fullPath = prefix ? `${prefix}.${key}` : key;

    const itemDesc: ItemDescriptor = {
        key,
        type: item.type,
        dataType: (item as { dataType?: ItemDescriptor['dataType'] }).dataType,
    };
    const tier1: Tier1Hints = {
        formPresentation: planCtx.formPresentation,
        itemPresentation: item.presentation as Tier1Hints['itemPresentation'],
    };
    const presentation = resolvePresentation(planCtx.theme, itemDesc, tier1);

    if (item.type === 'group') {
        const isRepeat = (item as { repeatable?: boolean }).repeatable === true;

        const groupNode: LayoutNode = {
            id: planCtx.nextId('group'),
            component: 'Stack',
            category: 'layout',
            // An authored empty label is a decision — a group that titles itself through its children —
            // so only a missing label falls back to the key.
            props: { title: item.label ?? key, bind: key },
            style: gridPlacementStyleFromLayout((item.presentation as { layout?: unknown } | undefined)?.layout),
            cssClasses: normalizeCssClass(presentation.cssClass),
            children: [],
            needAnchors: needGenerationAnchors(item),
            bindPath: fullPath,
            scopeChange: true,
        };
        // Core §4.2.5 `labelPosition: 'hidden'` on a group: the legend stays in the accessible markup and
        // leaves the page (theme §5.2). Renderers read it off the node, as they do for a field.
        if (presentation.labelPosition) groupNode.labelPosition = presentation.labelPosition;

        if (isRepeat) {
            groupNode.repeatGroup = key;
            groupNode.repeatPath = fullPath;
            groupNode.isRepeatTemplate = true;
            // Theme §4.2: with no Component Document binding the group, widgetConfig may lock Add/Remove.
            for (const lock of ['allowAdd', 'allowRemove'] as const) {
                const value = presentation.widgetConfig?.[lock];
                if (typeof value === 'boolean') groupNode.props[lock] = value;
            }
            // Theme §4.2 Item Presentation Widgets: the theme may name how the rows are presented.
            // Availability is the renderer's call — an adapter owns the card render, not the component
            // registry — so the planner records the name and leaves the fallback to the renderer.
            if (isRepeatPresentationWidget(presentation.widget)) {
                groupNode.repeatPresentation = presentation.widget;
            }
        }

        const childPrefix = isRepeat ? `${fullPath}[0]` : fullPath;
        if (Array.isArray(item.children)) {
            const children = planDefinitionFallback(
                item.children as FormItem[],
                planCtx,
                childPrefix,
                false,
            );
            groupNode.children = wrapGridFlow(children, item, planCtx);
        }

        return groupNode;
    }

    if (item.type === 'field') {
        const fieldItem = item as FormItem & {
            dataType?: string;
            hint?: string;
            options?: Array<{ value: string; label: string }>;
            optionSet?: string;
            extensions?: Record<string, boolean>;
            presentation?: Record<string, unknown>;
        };
        const isAvailable = planCtx.isComponentAvailable ?? (() => true);
        const themeWidget = resolveWidget(presentation, isAvailable);
        const tier1Widget = widgetTokenToComponent(
            (fieldItem.presentation as { widgetHint?: string } | undefined)?.widgetHint,
        );
        const widget = themeWidget || tier1Widget || getDefaultComponent(fieldItem);

        const { widgetHint: _, cssClass: _c, labelPosition: _l, ...presentationProps } = fieldItem.presentation ?? {};
        const fieldProps: Record<string, unknown> = { bind: key, ...presentationProps };
        if (widget === 'TextInput' && fieldItem.dataType === 'text') {
            fieldProps.maxLines ??= presentation.widgetConfig?.rows ?? 3;
        }

        return {
            id: planCtx.nextId('field'),
            component: widget,
            category: 'field',
            props: fieldProps,
            style: gridPlacementStyleFromLayout((fieldItem.presentation as { layout?: unknown } | undefined)?.layout),
            cssClasses: normalizeCssClass(presentation.cssClass),
            children: [],
            needAnchors: needGenerationAnchors(item),
            bindPath: fullPath,
            fieldItem: {
                key: key!,
                label: item.label ?? key,
                hint: fieldItem.hint,
                dataType: fieldItem.dataType,
                options: fieldItem.options,
                optionSet: fieldItem.optionSet,
                extensions: fieldItem.extensions,
            },
            presentation,
            labelPosition: presentation.labelPosition ?? 'top',
        };
    }

    const displayPresentation = item.presentation as Record<string, unknown> | undefined;
    // Same ladder as a field: theme `widget` (with its fallback chain), then the Item's own
    // `widgetHint`, then the default. Theme §items/selectors bind display Items too.
    const displayWidget = resolveWidget(presentation, planCtx.isComponentAvailable ?? (() => true))
        || widgetTokenToComponent((displayPresentation as { widgetHint?: string } | undefined)?.widgetHint)
        || 'Text';
    const { widgetHint: _wh, cssClass: _dc, labelPosition: _dl, ...displayPresentationProps } = displayPresentation ?? {};
    // The static inline label goes in the component's text prop (Divider's is `label`, component §5.15);
    // `bindPath` lets renderers resolve the live label (Locale, FEL `{{}}`) and Bind relevance for this Item.
    const textProp = displayWidget === 'Divider' ? 'label' : 'text';
    return {
        id: planCtx.nextId('display'),
        component: displayWidget,
        category: 'display',
        // Display components read their configuration off props (Alert's `severity`/`title`), so the
        // theme's widgetConfig lands there — the cascade outranks the Item's own presentation hints.
        props: { [textProp]: item.label || '', ...displayPresentationProps, ...presentation.widgetConfig },
        style: gridPlacementStyleFromLayout((displayPresentation as { layout?: unknown } | undefined)?.layout),
        cssClasses: normalizeCssClass(presentation.cssClass),
        children: [],
        needAnchors: needGenerationAnchors(item),
        bindPath: fullPath,
    };
}

function planThemePagesFromDefinitionItems(items: FormItem[], ctx: PlanContext): LayoutNode[] {
    const pageNodes = buildThemePageNodes((regionPath) => {
        const item = findItemAtPath(items, regionPath);
        if (!item) return null;
        const parentPath = getParentPath(regionPath);
        return planDefinitionItem(item, ctx, parentPath);
    }, items, ctx);

    if (pageNodes.length === 0) {
        return [];
    }

    const assignedTopLevelKeys = collectAssignedTopLevelKeys(items, ctx.theme?.pages);
    const unassigned = items
        .filter((item) => !assignedTopLevelKeys.has(item.key))
        .map((item) => planDefinitionItem(item, ctx, ''));

    const pageMode = ctx.formPresentation?.pageMode;
    if ((pageMode === 'wizard' || pageMode === 'tabs') && pageNodes.length > 0) {
        const pages: PlannedPage[] = pageNodes.map((pn) => ({
            id: typeof pn.props?.id === 'string' ? pn.props.id : undefined,
            title: String(pn.props?.title || ''),
            children: pn.children,
        }));
        return emitPageModePages(unassigned, pages, ctx.nextId);
    }

    return [...pageNodes, ...unassigned];
}

export { findItemAtPath, findItemPathByKey };
