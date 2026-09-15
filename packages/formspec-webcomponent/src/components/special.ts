/** @filedesc Special component plugins — delegate DOM to the active render adapter (falls back to default). */
import { ComponentPlugin, RenderContext } from '../types';
import { globalRegistry } from '../registry';
import { displayHostSlice } from '../adapters/display-host';
import type { DisplayComponentBehavior } from '../adapters/display-behaviors';
import { useDataTable } from '../behaviors/data-table';

function runSpecialAdapter(type: string, parent: HTMLElement, ctx: RenderContext, comp: any): void {
    const fn = globalRegistry.resolveAdapterFn(type, ctx.adapterName);
    const behavior: DisplayComponentBehavior = { comp, host: displayHostSlice(ctx) };
    if (fn) fn(behavior, parent, ctx.adapterContext);
}

/** Renders a wrapper for conditional (relevance-gated) content. */
export const ConditionalGroupPlugin: ComponentPlugin = {
    type: 'ConditionalGroup',
    render: (comp, parent, ctx) => runSpecialAdapter('ConditionalGroup', parent, ctx, comp),
};

/** Renders a data-bound editable table for a repeat group. */
export const DataTablePlugin: ComponentPlugin = {
    type: 'DataTable',
    render: (comp, parent, ctx) => {
        const behavior = useDataTable(ctx.behaviorContext, comp);
        const fn = globalRegistry.resolveAdapterFn('DataTable', ctx.adapterName);
        if (fn) fn(behavior, parent, ctx.adapterContext);
    },
};
