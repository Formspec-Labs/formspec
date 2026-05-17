/** @filedesc Layout behavior builders consumed by layout plugin registration tables. */
import type { RenderContext } from '../types';
import { layoutHostSlice } from '../adapters/layout-host';
import { resolveCompText } from './layout-plugin-factory';
import type {
    PageLayoutBehavior,
    StackLayoutBehavior,
    GridLayoutBehavior,
    DividerLayoutBehavior,
    CollapsibleLayoutBehavior,
    ColumnsLayoutBehavior,
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

export function buildPageBehavior(comp: any, ctx: RenderContext): PageLayoutBehavior {
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
    return {
        comp,
        labelText: comp.label ? resolveCompText(ctx, comp, 'label', comp.label) : null,
    };
}

export function buildCollapsibleBehavior(comp: any, ctx: RenderContext): CollapsibleLayoutBehavior {
    return {
        ...hostWithTitleDescription(comp, ctx),
        titleText: resolveCompText(ctx, comp, 'title', comp.title || 'Details'),
    };
}

export function buildColumnsBehavior(comp: any, ctx: RenderContext): ColumnsLayoutBehavior {
    return hostWithTitleDescription(comp, ctx);
}

export function buildPanelBehavior(comp: any, ctx: RenderContext): PanelLayoutBehavior {
    return hostWithTitleDescription(comp, ctx);
}

export function buildAccordionBehavior(comp: any, ctx: RenderContext): AccordionLayoutBehavior {
    const bindKey = comp.bind;
    const fullName = ctx.prefix ? `${ctx.prefix}.${bindKey}` : bindKey;
    const repeatCount = bindKey ? ctx.engine.repeats[fullName] : { value: 0 };
    const item = bindKey ? ctx.findItemByKey(bindKey) : null;
    const groupLabel = item?.label || bindKey || '';

    return {
        comp,
        host: layoutHostSlice(ctx),
        repeatCount: repeatCount as any,
        groupLabel,
        addInstance: () => {
            if (bindKey) ctx.engine.addRepeatInstance(fullName);
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
