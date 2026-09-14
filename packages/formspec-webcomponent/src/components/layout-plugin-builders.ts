/** @filedesc Layout behavior builders consumed by layout plugin registration tables. */
import type { RenderContext } from '../types';
import { layoutHostSlice } from '../adapters/layout-host';
import { resolveCompText } from './layout-plugin-factory';
import { computed, effect } from '@preact/signals-core';
import { repeatAffordances, renderRepeatRows } from '../rendering/repeat-affordances';
import { itemLabel } from '../rendering/item-label';
import { resolveDisplayItem } from '../adapters/display-host';
import type {
    SectionLayoutBehavior,
    StackLayoutBehavior,
    GridLayoutBehavior,
    DividerLayoutBehavior,
    CollapsibleLayoutBehavior,
    PanelLayoutBehavior,
    AccordionLayoutBehavior,
    ModalLayoutBehavior,
    PopoverLayoutBehavior,
} from '../adapters/layout-behaviors';

function hostWithTitleDescription(comp: any, ctx: RenderContext) {
    return {
        comp,
        host: layoutHostSlice(ctx),
        titleText: comp.title ? resolveCompText(ctx, comp, 'title', comp.title) : null,
        descriptionText: comp.description ? resolveCompText(ctx, comp, 'description', comp.description) : null,
    };
}

export function buildSectionBehavior(comp: any, ctx: RenderContext): SectionLayoutBehavior {
    return {
        ...hostWithTitleDescription(comp, ctx),
        headingLevel: comp.headingLevel || 'h2',
    };
}

export function buildStackBehavior(comp: any, ctx: RenderContext): StackLayoutBehavior {
    return hostWithTitleDescription(comp, ctx);
}

export function buildGridBehavior(comp: any, ctx: RenderContext): GridLayoutBehavior {
    return hostWithTitleDescription(comp, ctx);
}

export function buildDividerBehavior(comp: any, ctx: RenderContext): DividerLayoutBehavior {
    const displayItem = resolveDisplayItem(comp, ctx);
    const label = displayItem
        ? itemLabel(ctx.engine, displayItem.item, displayItem.path, comp.label || '')
        : computed(() => (comp.label ? resolveCompText(ctx, comp, 'label', comp.label) : ''));
    return {
        comp,
        labelText: label.peek() || null,
        watchLabel: (write) => {
            ctx.cleanupFns.push(effect(() => write(label.value)));
        },
    };
}

export function buildCollapsibleBehavior(comp: any, ctx: RenderContext): CollapsibleLayoutBehavior {
    return {
        ...hostWithTitleDescription(comp, ctx),
        titleText: resolveCompText(ctx, comp, 'title', comp.title || 'Details'),
    };
}

export function buildPanelBehavior(comp: any, ctx: RenderContext): PanelLayoutBehavior {
    return hostWithTitleDescription(comp, ctx);
}

export function buildAccordionBehavior(comp: any, ctx: RenderContext): AccordionLayoutBehavior {
    const bindKey = comp.bind;
    const fullName = ctx.prefix ? `${ctx.prefix}.${bindKey}` : bindKey;
    const item = bindKey ? ctx.findItemByKey(bindKey) : null;
    const groupLabel = itemLabel(ctx.engine, item, fullName ?? '', bindKey || '');
    const { count, relevant, canAdd, canRemove } = repeatAffordances(ctx.engine, fullName ?? '', item);

    return {
        comp,
        host: layoutHostSlice(ctx),
        repeatCount: count,
        groupLabel,
        relevant,
        canAdd,
        renderRows: (build) => renderRepeatRows(ctx.cleanupFns, { count, canRemove }, (rows) => build({
            count: rows.count,
            canRemove: rows.canRemove,
            renderComponent: (child, parent, prefix) => ctx.renderComponent(child, parent, prefix, rows.cleanupFns),
            watch: (fn) => { rows.cleanupFns.push(effect(fn)); },
        })),
        addInstance: () => {
            if (bindKey && canAdd.value) ctx.engine.addRepeatInstance(fullName);
        },
        removeInstance: (index: number) => {
            if (bindKey) ctx.engine.removeRepeatInstance(fullName, index);
        },
    };
}

export function buildModalBehavior(comp: any, ctx: RenderContext): ModalLayoutBehavior {
    return {
        ...hostWithTitleDescription(comp, ctx),
        triggerLabelText: resolveCompText(ctx, comp, 'triggerLabel', comp.triggerLabel || 'Open'),
    };
}

export function buildPopoverBehavior(comp: any, ctx: RenderContext): PopoverLayoutBehavior {
    return {
        comp,
        host: layoutHostSlice(ctx),
        titleResolved: resolveCompText(ctx, comp, 'title', comp.title || comp.triggerLabel || 'Popover'),
        triggerLabelFallback: comp.triggerLabel || 'Open',
    };
}
