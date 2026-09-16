/** @filedesc Pre-engine skeleton — the planned tree in real adapter markup, inert, so the swap moves nothing. */
import { signal } from '@preact/signals-core';
import type { LayoutNode } from '@formspec-org/layout';
import { Path } from '@formspec-org/types';
import { globalRegistry } from '../registry';
import type { AdapterContext } from '../adapters/types';
import { uiText } from '../adapters/ui-text';
import type { DisplayHostSlice } from '../adapters/display-host';
import type { LayoutHostSlice } from '../adapters/layout-host';
import { nodeDescriptor, repeatAdapterType } from './emit-node';

/** A path is conditional when its Bind carries a `relevant` expression, indices aside. */
function conditionalMatcher(conditionalPaths: ReadonlySet<string>) {
    return (bindPath: string | undefined): boolean => {
        if (!bindPath || conditionalPaths.size === 0) return false;
        return conditionalPaths.has(Path.parse(bindPath).stripIndices());
    };
}

function fieldId(path: string): string {
    return `field-${path.replace(/[.[\]]+/g, '-')}`;
}

/**
 * Authored text as the skeleton may show it. A Locale override is the same length class as the
 * Definition's string, so the string itself holds the height; a `{{}}` expression is not — it is
 * the engine's to evaluate, and its source is many times longer than the value it stands for. Each
 * one becomes a single mark, so the reader sees a form loading, not its source.
 */
function pendingText(text: string): string {
    return text.replace(/\{\{[\s\S]*?\}\}/g, '\u2026');
}

/** Everything the skeleton can answer without an engine. */
function placeholderFieldBehavior(node: LayoutNode): Record<string, unknown> {
    const comp = nodeDescriptor(node) as unknown as Record<string, unknown>;
    const item = (node.fieldItem ?? {}) as Record<string, unknown>;
    const path = node.bindPath ?? String(item.key ?? '');
    return {
        ...comp,
        fieldPath: path,
        id: fieldId(path),
        label: pendingText((item.label as string) ?? String(item.key ?? '')),
        hint: item.hint ? pendingText(String(item.hint)) : null,
        description: comp.description ? pendingText(String(comp.description)) : null,
        dataType: item.dataType,
        presentation: node.presentation ?? {},
        widgetClassSlots: {},
        compOverrides: {},
        remoteOptionsState: { loading: false, error: null },
        extensionAttrs: {},
        options: () => (item.options as unknown[]) ?? [],
        setValue: () => {},
        touch: () => {},
        bind: () => () => {},
    };
}

/** Text without the engine: whatever the planner already put on the node. */
function staticDisplayHost(): DisplayHostSlice {
    return {
        engine: undefined as never,
        prefix: '',
        cleanupFns: [],
        watchCompText: (comp, prop, fallback, write) =>
            write(pendingText(String((comp as unknown as Record<string, unknown>)[prop] ?? fallback ?? ''))),
        renderComponent: () => {},
        resolveToken: (val) => val,
        findItemByKey: () => null,
        resolveValidationTarget: () => ({}) as never,
        focusField: () => false,
        latestSubmitDetailSignal: signal(null) as never,
        touchedVersion: signal(0) as never,
    };
}

export interface SkeletonOptions {
    adapterName: string;
    actx: AdapterContext;
    resolveToken: (val: unknown) => unknown;
    /** Bind paths gated by `relevant`: the engine decides them, so they stay out of the reservation. */
    conditionalPaths?: ReadonlySet<string>;
    /** Rows a repeatable group opens with — from supplied data, else `minRepeat`. Known without the engine. */
    repeatCount?: (bindPath: string) => number;
    /** A bound Item's authored label, for the group titles and row legends the adapter draws. */
    itemLabel?: (bindPath: string) => string;
}

/**
 * Draw the planned tree with the adapter's real markup, inert. Every control is disabled and the
 * container is `aria-busy`, so the swap is controls going live in place — nothing animates, nothing moves.
 * Returns the number of fields drawn.
 */
export function renderSkeleton(node: LayoutNode, parent: HTMLElement, options: SkeletonOptions): number {
    const { adapterName, actx } = options;
    const isConditional = conditionalMatcher(options.conditionalPaths ?? new Set());
    const adapterFor = (type: string) => globalRegistry.resolveAdapterFn(type, adapterName);
    let fields = 0;

    const layoutHost = (into: HTMLElement, headingLevel: number): LayoutHostSlice => ({
        renderComponent: (child, target) => walk(child as LayoutNode, (target ?? into) as HTMLElement, headingLevel),
        prefix: '',
        resolveToken: options.resolveToken as LayoutHostSlice['resolveToken'],
        engine: undefined as never,
        cleanupFns: [],
        findItemByKey: () => null,
    });

    /** Adapters are third-party code fed a stand-in; one that trips must not cost the whole reservation. */
    const attempt = (type: string, behavior: unknown, into: HTMLElement): boolean => {
        const render = adapterFor(type);
        if (!render) return false;
        try {
            render(behavior as never, into, actx);
            return true;
        } catch {
            return false;
        }
    };

    function walk(current: LayoutNode, into: HTMLElement, headingLevel: number): void {
        if (current.when || isConditional(current.bindPath)) return;

        if (current.category === 'field') {
            if (attempt(current.component, placeholderFieldBehavior(current), into)) fields += 1;
            return;
        }

        if (current.isRepeatTemplate && current.props?.bind) {
            const path = current.bindPath ?? String(current.props.bind);
            const label = pendingText(options.itemLabel?.(path) ?? String(current.props.bind));
            const count = Math.max(1, options.repeatCount?.(path) ?? 1);
            // The chrome the live render draws, from the same inventory, in its English default: no
            // engine yet means no Locale yet.
            const chrome = (key: Parameters<typeof uiText>[1], params: Record<string, string | number>) =>
                uiText(undefined, key, params);
            // Same routing as the live render, so the swap does not change the repeat's shape.
            attempt(repeatAdapterType(current, adapterName), {
                comp: current,
                host: layoutHost(into, headingLevel),
                bindKey: String(current.props.bind),
                headingLevel: `h${Math.min(headingLevel, 6)}`,
                addLabel: chrome('repeat.add', { label }),
                renderRows: (build: (rows: unknown) => void) => build({
                    count,
                    // Theme widgetConfig locks land on the template's props; a Remove the form forbids
                    // must not appear even for a moment.
                    canRemove: current.props.allowRemove !== false,
                    rowText: (index: number) => ({
                        label: chrome('repeat.row', { label, index: index + 1 }),
                        ariaLabel: chrome('repeat.rowOf', { label, index: index + 1, total: count }),
                        removeLabel: chrome('repeat.remove', { label }),
                        removeAriaLabel: chrome('repeat.remove', { label: `${label} ${index + 1}` }),
                    }),
                    renderRow: (_index: number, target: HTMLElement) => {
                        for (const child of current.children ?? []) walk(child as LayoutNode, target, headingLevel);
                    },
                    watch: (fn: () => void) => fn(),
                }),
                addInstance: () => {},
                removeInstance: () => {},
                bind: () => () => {},
            }, into);
            return;
        }

        if (current.scopeChange && current.props?.bind) {
            const path = current.bindPath ?? String(current.props.bind);
            const title = (current.props.title as string | undefined) ?? options.itemLabel?.(path);
            const childLevel = Math.min(headingLevel + 1, 6);
            attempt('Group', {
                comp: current,
                host: layoutHost(into, childLevel),
                titleText: title ? signal(pendingText(title)) : null,
                titleHidden: current.labelPosition === 'hidden',
                hintText: null,
                headingLevel: `h${Math.min(headingLevel, 6)}`,
                renderChildren: (target: HTMLElement) => {
                    for (const child of current.children ?? []) walk(child as LayoutNode, target, childLevel);
                },
                bind: () => () => {},
            }, into);
            return;
        }

        if (current.category === 'display') {
            attempt(current.component, { comp: nodeDescriptor(current), host: staticDisplayHost() }, into);
            return;
        }

        // Layout containers: their own chrome when the adapter has it, otherwise just their children.
        const title = current.props?.title as string | undefined;
        const childLevel = title ? Math.min(headingLevel + 1, 6) : headingLevel;
        const drew = attempt(current.component, {
            comp: { ...current, children: [] },
            host: layoutHost(into, childLevel),
            titleText: title ? signal(pendingText(title)) : null,
            descriptionText: current.props?.description ? signal(pendingText(String(current.props.description))) : null,
            headingLevel: `h${Math.min(headingLevel, 6)}`,
        }, into);
        const target = drew ? (into.lastElementChild as HTMLElement | null) ?? into : into;
        for (const child of current.children ?? []) walk(child as LayoutNode, target, childLevel);
    }

    walk(node, parent, 3);

    for (const control of parent.querySelectorAll('input, select, textarea, button')) {
        (control as HTMLInputElement).disabled = true;
    }
    return fields;
}
