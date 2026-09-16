'use client';

/** @filedesc useLocalizedNode — a LayoutNode with its Locale `$component.<id>.<prop>` strings and live group title applied. */
import { createContext, useContext, useMemo } from 'react';
import { computed, signal } from '@preact/signals-core';
import type { LayoutNode } from '@formspec-org/layout';
import type { ChromeStringKey } from '@formspec-org/layout';
import type { IFormEngine } from '@formspec-org/engine/render';
import { useFormspecContext, findItemByKey } from './context';
import { chromeText } from './use-chrome-text';
import { useSignal } from './use-signal';

/** The innermost repeat instance (`jobs[1]`) around the node being rendered; '' outside repeats. */
export const RepeatInstanceContext = createContext('');

/** Top-level string props a `$component` key addresses (Locale §3.1.8); an ActionButton label may be `{ literal }`. */
const LOCALIZABLE_PROPS = ['text', 'label', 'title', 'subtitle', 'description', 'triggerLabel', 'pendingLabel', 'placeholder'];

/**
 * Array props whose elements a `$component` key addresses by index (Locale §3.1.8): `<prop>[N]` for a string
 * element, `<prop>[N].<subProp>` for an object element. Keyed by component: `columns` and `items` mean other
 * things elsewhere (Grid tracks).
 */
const LOCALIZABLE_ARRAY_PROPS: Record<string, { prop: string; subProp?: string }> = {
    Tabs: { prop: 'tabLabels' },
    Accordion: { prop: 'labels' },
    DataTable: { prop: 'columns', subProp: 'header' },
    Summary: { prop: 'items', subProp: 'label' },
};

const UNCHANGED = signal<Record<string, unknown> | null>(null);

/**
 * The live title of a node the planner titled (same rule as the web component's `plannedTitle`): a page
 * made from a group is titled by that group's label (`titleBind`), a page nobody authored by its `$ui`
 * chrome key (`titleKey`); undefined for any other node. Read inside a locale-signal subscription.
 */
export function plannedTitle(engine: IFormEngine, props: Record<string, unknown> | undefined): string | undefined {
    const titleBind = typeof props?.titleBind === 'string' ? props.titleBind : undefined;
    const titleKey = typeof props?.titleKey === 'string' ? props.titleKey : undefined;
    return (titleBind && engine.getItemLabelSignal(titleBind)?.value)
        || (titleKey && chromeText(engine, titleKey as ChromeStringKey))
        || undefined;
}

function literalOf(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    const literal = (value as { literal?: unknown } | null)?.literal;
    return typeof value === 'object' && typeof literal === 'string' ? literal : undefined;
}

/**
 * The node renderers see, live:
 * - an authored node's string props, and string elements of its array props (`tabLabels[0]`,
 *   `columns[0].header`), replaced by `$component.<id>.<prop>` Locale strings, `{{}}` evaluated in
 *   form scope, or in the innermost repeat instance scope inside a repeat (Locale §3.3.2);
 * - a group node titled with its group's inline label titled with that group's live label instead
 *   (`engine.getItemLabelSignal`: Locale, label context, `{{}}`).
 * Same rules as webcomponent `resolveCompText` and emit-node's group heading.
 */
export function useLocalizedNode(node: LayoutNode): LayoutNode {
    const { engine } = useFormspecContext();
    const instance = useContext(RepeatInstanceContext);
    const localizedProps = useMemo(() => {
        const props = node.props ?? {};
        const id = typeof props.id === 'string' ? props.id : null;
        const groupPath = node.scopeChange && node.bindPath && typeof props.title === 'string' ? node.bindPath : null;
        const planned = typeof props.titleBind === 'string' || typeof props.titleKey === 'string';
        if (!id && !groupPath && !planned) return UNCHANGED;
        const group = groupPath ? findItemByKey(engine.getDefinition().items ?? [], groupPath) : null;
        return computed(() => {
            engine.localeSignal.value;
            let next: Record<string, unknown> | null = null;
            const set = (prop: string, value: unknown) => { (next ??= { ...props })[prop] = value; };
            if (id) {
                const scopePath = instance ? `${instance}.${id}` : '';
                for (const prop of LOCALIZABLE_PROPS) {
                    const inline = literalOf(props[prop]);
                    if (inline === undefined) continue;
                    const resolved = engine.resolveLocaleString(`$component.${id}.${prop}`, inline, scopePath);
                    if (resolved === inline) continue;
                    set(prop, typeof props[prop] === 'string' ? resolved : { ...(props[prop] as object), literal: resolved });
                }
                const arrayProp = LOCALIZABLE_ARRAY_PROPS[node.component];
                const elements = arrayProp ? props[arrayProp.prop] : undefined;
                if (arrayProp && Array.isArray(elements)) {
                    const { prop, subProp } = arrayProp;
                    let changed = false;
                    const localized = elements.map((element, index) => {
                        const inline = subProp ? (element as Record<string, unknown> | null)?.[subProp] : element;
                        if (typeof inline !== 'string') return element;
                        const key = `$component.${id}.${prop}[${index}]${subProp ? `.${subProp}` : ''}`;
                        const resolved = engine.resolveLocaleString(key, inline, scopePath);
                        if (resolved === inline) return element;
                        changed = true;
                        return subProp ? { ...(element as object), [subProp]: resolved } : resolved;
                    });
                    if (changed) set(prop, localized);
                }
            }
            if (groupPath && group?.type === 'group' && (next ?? props).title === group.label) {
                const label = engine.getItemLabelSignal(groupPath)?.value;
                if (label && label !== group.label) set('title', label);
            }
            const planned = plannedTitle(engine, props);
            if (planned && planned !== (next ?? props).title) set('title', planned);
            return next;
        });
    }, [engine, instance, node]);
    const props = useSignal(localizedProps);
    return useMemo(() => (props ? { ...node, props } : node), [node, props]);
}
