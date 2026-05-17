/** @filedesc Factory and shared helpers for layout component plugins. */
import { ComponentPlugin, RenderContext } from '../types';
import { globalRegistry } from '../registry';

export type LayoutBehaviorBuilder = (comp: any, ctx: RenderContext) => unknown;

/** Resolve a component string via $component.<id>.<prop> locale key, falling back to inline. */
export function resolveCompText(ctx: RenderContext, comp: any, prop: string, fallback: string): string {
    if (!comp.id) return fallback;
    return ctx.engine.resolveLocaleString(`$component.${comp.id}.${prop}`, fallback);
}

export function runLayoutAdapter<T>(type: string, behavior: T, parent: HTMLElement, ctx: RenderContext): void {
    const fn = globalRegistry.resolveAdapterFn(type);
    if (fn) fn(behavior as any, parent, ctx.adapterContext);
}

/** Builds a {@link ComponentPlugin} that materializes layout behavior then delegates to the adapter. */
export function makeLayoutPlugin(type: string, buildBehavior: LayoutBehaviorBuilder): ComponentPlugin {
    return {
        type,
        render: (comp: any, parent: HTMLElement, ctx: RenderContext) => {
            runLayoutAdapter(type, buildBehavior(comp, ctx), parent, ctx);
        },
    };
}
