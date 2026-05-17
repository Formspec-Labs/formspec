/** @filedesc Definition-items fallback planner when no component document is provided. */

import { widgetTokenToComponent } from '@formspec-org/types';
import type { ItemDescriptor, Tier1Hints } from './theme-resolver.js';
import { resolvePresentation, resolveWidget } from './theme-resolver.js';
import { getDefaultComponent } from './defaults.js';
import type { FormItem, LayoutNode, PlanContext } from './types.js';
import { normalizeCssClass, preparePlanContext } from './node-utils.js';
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
            props: { title: item.label || key, bind: key },
            cssClasses: normalizeCssClass(presentation.cssClass),
            children: [],
            bindPath: fullPath,
            scopeChange: true,
        };

        if (isRepeat) {
            groupNode.repeatGroup = key;
            groupNode.repeatPath = fullPath;
            groupNode.isRepeatTemplate = true;
        }

        const childPrefix = isRepeat ? `${fullPath}[0]` : fullPath;
        if (Array.isArray(item.children)) {
            groupNode.children = planDefinitionFallback(
                item.children as FormItem[],
                planCtx,
                childPrefix,
                false,
            );
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
        if (widget === 'TextInput' && fieldItem.dataType === 'text' && !fieldProps.maxLines) {
            fieldProps.maxLines = 3;
        }

        return {
            id: planCtx.nextId('field'),
            component: widget,
            category: 'field',
            props: fieldProps,
            cssClasses: normalizeCssClass(presentation.cssClass),
            children: [],
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

    const displayItem = item as FormItem & { relevant?: string; presentation?: Record<string, unknown> };
    const displayWidget = widgetTokenToComponent(
        (displayItem.presentation as { widgetHint?: string } | undefined)?.widgetHint,
    ) ?? 'Text';
    const { widgetHint: _wh, cssClass: _dc, labelPosition: _dl, ...displayPresentationProps } = displayItem.presentation ?? {};
    const displayNode: LayoutNode = {
        id: planCtx.nextId('display'),
        component: displayWidget,
        category: 'display',
        props: { text: item.label || '', ...displayPresentationProps },
        cssClasses: normalizeCssClass(presentation.cssClass),
        children: [],
    };

    if (displayItem.relevant) {
        displayNode.when = displayItem.relevant;
        displayNode.whenPrefix = prefix;
    }

    return displayNode;
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
