/** @filedesc Layout behavior builders consumed by layout plugin registration tables. */
import type { RenderContext } from '../types';
import { layoutHostSlice } from '../adapters/layout-host';
import { compText } from './layout-plugin-factory';
import { effect } from '@preact/signals-core';
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
        titleText: comp.title ? compText(ctx, comp, 'title', comp.title) : null,
        descriptionText: comp.description ? compText(ctx, comp, 'description', comp.description) : null,
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
    const hasLabel = !!displayItem || typeof comp.label === 'string';
    // No fallback to the inline label: an Item label whose `{{}}` is still empty shows as a plain rule, not raw text.
    const label = displayItem
        ? itemLabel(ctx.engine, displayItem.item, displayItem.path)
        : compText(ctx, comp, 'label', comp.label ?? '');
    return {
        comp,
        labelText: hasLabel ? label.peek() : null,
        watchLabel: (write) => {
            ctx.cleanupFns.push(effect(() => write(label.value)));
        },
    };
}

export function buildCollapsibleBehavior(comp: any, ctx: RenderContext): CollapsibleLayoutBehavior {
    return {
        ...hostWithTitleDescription(comp, ctx),
        titleText: compText(ctx, comp, 'title', comp.title || 'Details'),
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
    const { count, relevant, canAdd, canRemove } = repeatAffordances(ctx.engine, fullName ?? '', item, {
        allowAdd: comp.allowAdd,
        allowRemove: comp.allowRemove,
    });

    return {
        comp,
        host: layoutHostSlice(ctx),
        sectionLabel: (index) => compText(ctx, comp, `labels[${index}]`, comp.labels?.[index] || `Section ${index + 1}`),
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
        triggerLabelText: compText(ctx, comp, 'triggerLabel', comp.triggerLabel || 'Open'),
    };
}

export function buildPopoverBehavior(comp: any, ctx: RenderContext): PopoverLayoutBehavior {
    return {
        comp,
        host: layoutHostSlice(ctx),
        titleResolved: compText(ctx, comp, 'title', comp.title || comp.triggerLabel || 'Popover'),
        triggerLabelFallback: compText(ctx, comp, 'triggerLabel', comp.triggerLabel || 'Open'),
    };
}
