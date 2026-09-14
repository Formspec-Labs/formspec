/** @filedesc Factory and shared helpers for layout component plugins. */
import { ComponentPlugin, RenderContext } from '../types';
import { globalRegistry } from '../registry';

export type LayoutBehaviorBuilder = (comp: any, ctx: RenderContext) => unknown;

/**
 * Resolve a component string via the `$component.<id>.<prop>` Locale key, falling back to inline.
 * Locale §3.3.2: `{{}}` evaluates in form scope, or inside a repeat in the innermost repeat instance
 * scope. The engine scopes by Item path (the Item's parent), so address the component as a child
 * of that instance.
 */
export function resolveCompText(
    ctx: Pick<RenderContext, 'engine' | 'prefix'>,
    comp: { id?: string },
    prop: string,
    fallback: string,
): string {
    if (!comp?.id) return fallback;
    const instance = ctx.prefix.slice(0, ctx.prefix.lastIndexOf(']') + 1);
    const scopePath = instance ? `${instance}.${comp.id}` : '';
    return ctx.engine.resolveLocaleString(`$component.${comp.id}.${prop}`, fallback, scopePath);
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
