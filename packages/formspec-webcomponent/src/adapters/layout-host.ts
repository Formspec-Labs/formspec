/** @filedesc Minimal render context slice passed to layout adapter behaviors for children and engine access. */
import type { RenderContext } from '../types';

/** Subset of {@link RenderContext} for layout adapters (recursive render + repeat/accordion helpers). */
export interface LayoutHostSlice {
    renderComponent: RenderContext['renderComponent'];
    prefix: string;
    resolveToken: RenderContext['resolveToken'];
    engine: RenderContext['engine'];
    cleanupFns: RenderContext['cleanupFns'];
    findItemByKey: RenderContext['findItemByKey'];
    /** The depth a heading this layout draws over its children sits at — see {@link RenderContext.headingLevel}. */
    headingLevel: RenderContext['headingLevel'];
}

export function layoutHostSlice(ctx: RenderContext): LayoutHostSlice {
    return {
        renderComponent: ctx.renderComponent,
        prefix: ctx.prefix,
        resolveToken: ctx.resolveToken,
        engine: ctx.engine,
        cleanupFns: ctx.cleanupFns,
        findItemByKey: ctx.findItemByKey,
        headingLevel: ctx.headingLevel,
    };
}
