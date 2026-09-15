/** @filedesc Factory and shared helpers for layout component plugins. */
import { computed, type ReadonlySignal } from '@preact/signals-core';
import { ComponentPlugin, RenderContext } from '../types';
import { globalRegistry } from '../registry';
import { renderWithDisplayItemRelevance } from '../adapters/display-host';

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

/**
 * {@link resolveCompText} as a signal: it recomputes on a locale switch, a Locale Document load, or a change to a
 * value its `{{}}` reads. Read it in an effect (adapters: `watchText`), never while rendering rows, so a
 * string change rewrites text in place instead of re-rendering the list around it.
 */
export function compText(
    ctx: Pick<RenderContext, 'engine' | 'prefix'>,
    comp: { id?: string },
    prop: string,
    fallback: string,
): ReadonlySignal<string> {
    return computed(() => {
        ctx.engine.localeSignal.value;
        return resolveCompText(ctx, comp, prop, fallback);
    });
}

export function runLayoutAdapter<T>(type: string, behavior: T, parent: HTMLElement, ctx: RenderContext): void {
    const fn = globalRegistry.resolveAdapterFn(type, ctx.adapterName);
    if (fn) fn(behavior as any, parent, ctx.adapterContext);
}

/** Builds a {@link ComponentPlugin} that materializes layout behavior then delegates to the adapter. */
export function makeLayoutPlugin(type: string, buildBehavior: LayoutBehaviorBuilder): ComponentPlugin {
    return {
        type,
        // Divider is display-category but renders here; a definition display Item can plan to one.
        render: (comp: any, parent: HTMLElement, ctx: RenderContext) => renderWithDisplayItemRelevance(
            comp, parent, ctx, () => runLayoutAdapter(type, buildBehavior(comp, ctx), parent, ctx),
        ),
    };
}
