/** @filedesc Display component plugins — delegate DOM to the active render adapter (falls back to default). */
import { ComponentPlugin, RenderContext } from '../types';
import { globalRegistry } from '../registry';
import { displayHostSlice } from '../adapters/display-host';
import type { DisplayComponentBehavior } from '../adapters/display-behaviors';

function runDisplayAdapter(type: string, parent: HTMLElement, ctx: RenderContext, comp: any): void {
    const fn = globalRegistry.resolveAdapterFn(type);
    const behavior: DisplayComponentBehavior = { comp, host: displayHostSlice(ctx) };
    if (fn) fn(behavior, parent, ctx.adapterContext);
}

/** Renders an `<h1>`-`<h6>` heading; reactive when `bind` is set. */
export const HeadingPlugin: ComponentPlugin = {
    type: 'Heading',
    render: (comp, parent, ctx) => runDisplayAdapter('Heading', parent, ctx, comp),
};

/** Renders body text or markdown; reactive when `bind` is set. */
export const TextPlugin: ComponentPlugin = {
    type: 'Text',
    render: (comp, parent, ctx) => runDisplayAdapter('Text', parent, ctx, comp),
};

/** Renders a card container with optional title, subtitle, and children. */
export const CardPlugin: ComponentPlugin = {
    type: 'Card',
    render: (comp, parent, ctx) => runDisplayAdapter('Card', parent, ctx, comp),
};

/** Renders an alert with optional dismiss control. */
export const AlertPlugin: ComponentPlugin = {
    type: 'Alert',
    render: (comp, parent, ctx) => runDisplayAdapter('Alert', parent, ctx, comp),
};

/** Renders an inline badge. */
export const BadgePlugin: ComponentPlugin = {
    type: 'Badge',
    render: (comp, parent, ctx) => runDisplayAdapter('Badge', parent, ctx, comp),
};

/** Renders a `<progress>` bar with optional percent label. */
export const ProgressBarPlugin: ComponentPlugin = {
    type: 'ProgressBar',
    render: (comp, parent, ctx) => runDisplayAdapter('ProgressBar', parent, ctx, comp),
};

/** Renders a definition list summary of bound values. */
export const SummaryPlugin: ComponentPlugin = {
    type: 'Summary',
    render: (comp, parent, ctx) => runDisplayAdapter('Summary', parent, ctx, comp),
};

/** Renders validation messages with optional jump links. */
export const ValidationSummaryPlugin: ComponentPlugin = {
    type: 'ValidationSummary',
    render: (comp, parent, ctx) => runDisplayAdapter('ValidationSummary', parent, ctx, comp),
};
