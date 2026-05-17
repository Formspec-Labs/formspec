/** @filedesc Host slice passed to display/special adapter renderers (engine, prefix, validation helpers). */
import type { LayoutNode } from '@formspec-org/layout';
import type { FormItem, ValidationResult } from '@formspec-org/types';
import type { IFormEngine } from '@formspec-org/engine/render';
import type { ComponentDescriptor, TokenResolvable } from '../hub-types.js';
import type { RenderContext, ValidationTargetMetadata } from '../types';

export interface DisplayHostSlice {
    engine: IFormEngine;
    prefix: string;
    cleanupFns: Array<() => void>;
    resolveCompText(comp: ComponentDescriptor, prop: string, fallback: string): string;
    renderComponent(comp: LayoutNode | ComponentDescriptor, parent: HTMLElement, prefix?: string): void;
    resolveToken(val: TokenResolvable): TokenResolvable;
    findItemByKey(key: string, items?: FormItem[]): FormItem | null;
    resolveValidationTarget(resultOrPath: string | ValidationResult): ValidationTargetMetadata;
    focusField(path: string): boolean;
    latestSubmitDetailSignal: RenderContext['latestSubmitDetailSignal'];
    touchedVersion: RenderContext['touchedVersion'];
}

export function displayHostSlice(ctx: RenderContext): DisplayHostSlice {
    return {
        engine: ctx.engine,
        prefix: ctx.prefix,
        cleanupFns: ctx.cleanupFns,
        resolveCompText(comp, prop, fallback) {
            if (!comp?.id) return fallback;
            return ctx.engine.resolveLocaleString(`$component.${comp.id}.${prop}`, fallback);
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
