/** @filedesc Host slice passed to display/special adapter renderers (engine, prefix, validation helpers). */
import { effect } from '@preact/signals-core';
import type { LayoutNode } from '@formspec-org/layout';
import { Path, type FormItem, type ValidationResult } from '@formspec-org/types';
import { interpolateMessage } from '@formspec-org/engine';
import type { IFormEngine } from '@formspec-org/engine/render';
import type { ComponentDescriptor, TokenResolvable } from '../hub-types.js';
import type { RenderContext, ValidationTargetMetadata } from '../types';
import { resolveCompText as resolveComponentText } from '../components/layout-plugin-factory';

export interface DisplayHostSlice {
    engine: IFormEngine;
    prefix: string;
    cleanupFns: Array<() => void>;
    resolveCompText(comp: ComponentDescriptor, prop: string, fallback: string): string;
    /**
     * Call `write` with the text for `comp[prop]` now and whenever it changes.
     * A node planned from a display Item shows the Item label: Locale `<key>.label`,
     * else the inline label, FEL `{{}}`-interpolated in the Item's instance scope.
     * Any other node writes `resolveCompText` once.
     */
    watchCompText(comp: ComponentDescriptor, prop: string, fallback: string, write: (text: string) => void): void;
    renderComponent(comp: LayoutNode | ComponentDescriptor, parent: HTMLElement, prefix?: string): void;
    resolveToken(val: TokenResolvable): TokenResolvable;
    findItemByKey(key: string, items?: FormItem[]): FormItem | null;
    resolveValidationTarget(resultOrPath: string | ValidationResult): ValidationTargetMetadata;
    focusField(path: string): boolean;
    latestSubmitDetailSignal: RenderContext['latestSubmitDetailSignal'];
    touchedVersion: RenderContext['touchedVersion'];
}

/** A display Item a node was planned from, with its instance path in the current render scope. */
export interface ScopedDisplayItem {
    item: FormItem;
    path: string;
}

/**
 * The display Item behind `comp`: the planner links it by `bindPath` and drops the
 * value `bind` (a Text with `bind` shows a field value instead).
 */
export function resolveDisplayItem(
    comp: ComponentDescriptor & { bind?: unknown },
    ctx: Pick<RenderContext, 'prefix' | 'findItemByKey'>,
): ScopedDisplayItem | null {
    if (comp.bind || typeof comp.bindPath !== 'string') return null;
    const item = ctx.findItemByKey(Path.parse(comp.bindPath).stripIndices());
    if (item?.type !== 'display') return null;
    return { item, path: pathInScope(comp.bindPath, ctx.prefix) };
}

/**
 * Run `render` (which appends to `parent`) and, when `comp` was planned from a display Item, hide what it
 * appended while that Item is not relevant. Core §4.2.4: a display Item's only Bind property is
 * `relevant`, hiding its DOM like a field's.
 */
export function renderWithDisplayItemRelevance(
    comp: ComponentDescriptor & { bind?: unknown },
    parent: HTMLElement,
    ctx: Pick<RenderContext, 'prefix' | 'findItemByKey' | 'engine' | 'cleanupFns'>,
    render: () => void,
): void {
    const firstNewChild = parent.childElementCount;
    render();
    const displayItem = resolveDisplayItem(comp, ctx);
    const rendered = Array.from(parent.children).slice(firstNewChild);
    if (!displayItem || rendered.length === 0) return;
    ctx.cleanupFns.push(effect(() => {
        const relevant = ctx.engine.relevantSignals[displayItem.path]?.value ?? true;
        for (const el of rendered) {
            el.classList.toggle('formspec-hidden', !relevant);
            if (el instanceof HTMLElement) el.inert = !relevant;
            if (relevant) el.removeAttribute('aria-hidden');
            else el.setAttribute('aria-hidden', 'true');
        }
    }));
}

/** Planner paths index repeats as template `[0]`; re-home one onto the render scope (e.g. `rows[2]`). */
function pathInScope(plannedPath: string, prefix: string): string {
    if (!prefix) return plannedPath;
    const base = Path.parse(plannedPath).stripIndices();
    const scopeBase = Path.parse(prefix).stripIndices();
    return base.startsWith(`${scopeBase}.`) ? prefix + base.slice(scopeBase.length) : plannedPath;
}

export function displayHostSlice(ctx: RenderContext): DisplayHostSlice {
    const resolveCompText = (comp: ComponentDescriptor, prop: string, fallback: string): string =>
        resolveComponentText(ctx, comp, prop, fallback);
    return {
        engine: ctx.engine,
        prefix: ctx.prefix,
        cleanupFns: ctx.cleanupFns,
        resolveCompText,
        watchCompText(comp, prop, fallback, write) {
            const displayItem = prop === 'text' ? resolveDisplayItem(comp, ctx) : null;
            if (!displayItem) {
                write(resolveCompText(comp, prop, fallback));
                return;
            }
            const { engine } = ctx;
            const { item, path } = displayItem;
            let written: string | undefined;
            ctx.cleanupFns.push(effect(() => {
                engine.localeSignal.value;
                const inline = interpolateMessage(
                    engine.getLabel(item),
                    (expr) => engine.compileExpression(expr, path)(),
                ).text;
                const text = engine.resolveLocaleString(`${item.key}.label`, inline, path);
                if (text !== written) {
                    written = text;
                    write(text);
                }
            }));
        },
        renderComponent: (comp, parent, pfx) => ctx.renderComponent(comp, parent, pfx),
        resolveToken: (val) => ctx.resolveToken(val),
        findItemByKey: (key, items) => ctx.findItemByKey(key, items),
        resolveValidationTarget: (r) => ctx.resolveValidationTarget(r),
        focusField: (path) => ctx.focusField(path),
        latestSubmitDetailSignal: ctx.latestSubmitDetailSignal,
        touchedVersion: ctx.touchedVersion,
    };
}
