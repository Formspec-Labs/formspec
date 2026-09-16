/** @filedesc Factory and shared helpers for layout component plugins. */
import { computed, type ReadonlySignal } from '@preact/signals-core';
import { ComponentPlugin, RenderContext } from '../types';
import { globalRegistry } from '../registry';
import { renderWithDisplayItemRelevance } from '../adapters/display-host';
import { uiText } from '../adapters/ui-text.js';
import type { ChromeStringKey } from '@formspec-org/layout';

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
    /** A function is re-read on every locale change — what a `$ui` chrome default needs. */
    fallback: string | (() => string),
): ReadonlySignal<string> {
    return computed(() => {
        ctx.engine.localeSignal.value;
        return resolveCompText(ctx, comp, prop, typeof fallback === 'function' ? fallback() : fallback);
    });
}

/**
 * The live title of a node the planner titled: a page made from a group is titled by that group's label
 * (`titleBind`, so a Locale's `<key>.label` and a `{{}}` reach it); a page nobody authored by its `$ui`
 * chrome key (`titleKey`); anything else by its `$component.<id>.title` string, else the inline title.
 * A node arrives either flattened (`comp.title`) or as a layout node (`comp.props.title`).
 */
export function plannedTitle(
    ctx: Pick<RenderContext, 'engine' | 'prefix'>,
    comp: { id?: string; title?: unknown; titleBind?: unknown; titleKey?: unknown; props?: Record<string, unknown> },
): ReadonlySignal<string> {
    const prop = (name: 'title' | 'titleBind' | 'titleKey') => {
        const value = comp[name] ?? comp.props?.[name];
        return typeof value === 'string' ? value : undefined;
    };
    const titleBind = prop('titleBind');
    const titleKey = prop('titleKey');
    const inline = compText(ctx, comp, 'title', prop('title') ?? '');
    return computed(() =>
        (titleBind && ctx.engine.getItemLabelSignal(titleBind)?.value)
        || (titleKey && uiText(ctx.engine, titleKey as ChromeStringKey).value)
        || inline.value);
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
