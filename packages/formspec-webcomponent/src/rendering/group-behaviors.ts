/** @filedesc Behaviors for bound groups and repeatable groups — scope, relevance, row state, focus and announcements. */
import { computed, effect, untracked } from '@preact/signals-core';
import { Path } from '@formspec-org/types';
import type { LayoutNode } from '@formspec-org/layout';
import type { RenderHost } from '../hub-types.js';
import type {
    GroupLayoutBehavior,
    GroupRefs,
    LocalizedText,
    RepeatGroupLayoutBehavior,
    RepeatGroupRefs,
    RepeatGroupRowsPass,
    RepeatRowText,
} from '../adapters/layout-behaviors';
import type { LayoutHostSlice } from '../adapters/layout-host';
import { uiText } from '../adapters/ui-text.js';
import { compText } from '../components/layout-plugin-factory';
import { itemLabel } from './item-label';
import { repeatAffordances, renderRepeatRows } from './repeat-affordances';

/** Render one child of the group, in the group's scope. The renderer owns recursion; behaviors only ask for it. */
export type EmitChild = (
    child: LayoutNode,
    parent: HTMLElement,
    prefix: string,
    headingLevel: number,
    scope: Array<() => void>,
) => void;

/** The slice layout adapters get, scoped to the group's own path. */
function groupHostSlice(
    host: RenderHost,
    path: string,
    cleanupFns: Array<() => void>,
    renderComponent: LayoutHostSlice['renderComponent'],
): LayoutHostSlice {
    return {
        renderComponent,
        prefix: path,
        resolveToken: host.resolveToken,
        engine: host.engine,
        cleanupFns,
        findItemByKey: host.findItemByKey,
    };
}

/**
 * Sentinel fallback for a Locale lookup: no authored string is a lone NUL, so a resolved value equal to
 * it means the key is absent — which is what separates "no string" from an authored empty one.
 */
const ABSENT = String.fromCharCode(0);

/** The child a person tabs to when a repeat row gains or loses focus: a field first, any focusable second. */
function rowFocusTarget(row: Element | null | undefined): HTMLElement | null {
    return row?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea, [contenteditable="true"]')
        ?? row?.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')
        ?? null;
}

export function buildGroupBehavior(
    host: RenderHost,
    node: LayoutNode,
    prefix: string,
    headingLevel: number,
    cleanupFns: Array<() => void>,
    emitChild: EmitChild,
): GroupLayoutBehavior {
    const bindKey = node.props.bind as string;
    const path = prefix ? `${prefix}.${bindKey}` : bindKey;
    const childHeadingLevel = Math.min(headingLevel + 1, 6);

    let titleText = null;
    if (node.props.title) {
        // An authored `$component.<id>.title` Locale string wins; the group sits in the enclosing scope.
        const authored = compText({ engine: host.engine, prefix }, node.props, 'title', node.props.title as string);
        const groupItem = host.findItemByKey(Path.parse(path).stripIndices());
        // The definition planner titles a group with its inline label: show that label live.
        const label = groupItem ? itemLabel(host.engine, groupItem, path, bindKey) : null;
        titleText = computed(() => (
            label && authored.value === groupItem?.label ? label.value : authored.value
        ));
    }

    // The group's own hint, through the Item hint cascade (Locale `<key>.hint` → inline, `{{}}` in the
    // group's scope) — the same source a field's hint comes from, so a Locale can translate it.
    const hint = host.engine.getItemHintSignal(path);
    const hintText = hint && untracked(() => hint.value) != null ? computed(() => hint.value ?? '') : null;

    return {
        comp: node,
        host: groupHostSlice(host, path, cleanupFns, (child, parent, pfx) =>
            emitChild(child as LayoutNode, parent, pfx ?? path, childHeadingLevel, cleanupFns)),
        titleText,
        titleHidden: node.labelPosition === 'hidden',
        hintText,
        headingLevel: `h${Math.min(headingLevel, 6)}`,

        renderChildren(parent: HTMLElement): void {
            for (const child of node.children) emitChild(child, parent, path, childHeadingLevel, cleanupFns);
        },

        bind(refs: GroupRefs): () => void {
            const relevance = host.engine.relevantSignals[path];
            if (!relevance) return () => {};
            return effect(() => {
                refs.root.classList.toggle('formspec-hidden', !relevance.value);
            });
        },
    };
}

export function buildRepeatGroupBehavior(
    host: RenderHost,
    node: LayoutNode,
    prefix: string,
    headingLevel: number,
    cleanupFns: Array<() => void>,
    emitChild: EmitChild,
): RepeatGroupLayoutBehavior {
    const bindKey = node.props.bind as string;
    const path = prefix ? `${prefix}.${bindKey}` : bindKey;
    const item = host.findItemByKey(bindKey);
    const groupLabel = itemLabel(host.engine, item, path, bindKey);
    // A row's heading sits at this level; what a row contains is one deeper, as in a plain group.
    const childHeadingLevel = Math.min(headingLevel + 1, 6);

    // The group's own title, same cascade as a non-repeat group (`buildGroupBehavior`): an authored
    // `$component.<id>.title` Locale string wins over the planner's inline label, which is otherwise
    // this group's live label (Locale, `{{}}`).
    let titleText: LocalizedText | null = null;
    if (node.props.title) {
        const authored = compText({ engine: host.engine, prefix }, node.props, 'title', node.props.title as string);
        titleText = computed(() => (
            item && authored.value === item.label ? groupLabel.value : authored.value
        ));
    }
    // Theme widgetConfig Add/Remove locks, planned onto the template's props (theme §4.2).
    const { count, relevant, canAdd, canRemove } = repeatAffordances(host.engine, path, item, {
        allowAdd: node.props.allowAdd as boolean | undefined,
        allowRemove: node.props.allowRemove as boolean | undefined,
    });

    let bound: RepeatGroupRefs | null = null;
    const announce = (text: string) => {
        if (bound?.announcer) bound.announcer.textContent = text;
    };

    /**
     * An authored Locale string for the group's chrome (Locale §3.1.1 `<key>.rowLabel` / `.addLabel` /
     * `.removeLabel`), `{{}}` interpolated in `scope`; null when the Locale is silent, which is what
     * separates "no string" from an authored empty one. Reads `localeSignal`, so it follows a switch.
     */
    const localeText = (property: string, scope: string) => computed(() => {
        host.engine.localeSignal.value;
        const text = host.engine.resolveLocaleString(`${bindKey}.${property}`, ABSENT, scope);
        return text === ABSENT ? null : text;
    });

    const rowText = (index: number, total: number): RepeatRowText => {
        const scope = `${path}[${index}]`;
        const authoredRow = localeText('rowLabel', scope);
        const authoredRemove = localeText('removeLabel', scope);
        // Derived defaults, unauthored: Locale §3.1.10 $ui.repeat.row / .rowOf / .remove, `{{$label}}`-filled
        // with the group's own live label — same closed vocabulary the webcomponent uses everywhere else.
        const derivedRow = computed(() =>
            uiText(host.engine, 'repeat.row', { label: groupLabel.value, index: index + 1 }).value);
        const derivedRowOf = computed(() =>
            uiText(host.engine, 'repeat.rowOf', { label: groupLabel.value, index: index + 1, total }).value);
        const derivedRemove = computed(() =>
            uiText(host.engine, 'repeat.remove', { label: groupLabel.value }).value);
        // An authored Remove label is the accessible name as written — `{{@index}}` is how its author
        // tells one row's control from another's; the derived default composes the index into $label
        // itself, so $ui.repeat.remove stays one template either way.
        const derivedRemoveIndexed = computed(() =>
            uiText(host.engine, 'repeat.remove', { label: `${groupLabel.value} ${index + 1}` }).value);
        return {
            label: computed(() => authoredRow.value ?? derivedRow.value),
            // An empty rowLabel drops the heading, never the row's accessible name (Locale §3.1.1).
            ariaLabel: computed(() => (authoredRow.value ? `${authoredRow.value} of ${total}` : derivedRowOf.value)),
            removeLabel: computed(() => authoredRemove.value ?? derivedRemove.value),
            removeAriaLabel: computed(() => authoredRemove.value ?? derivedRemoveIndexed.value),
        };
    };

    return {
        comp: node,
        host: groupHostSlice(host, path, cleanupFns, (child, parent, pfx) =>
            emitChild(child as LayoutNode, parent, pfx ?? path, childHeadingLevel, cleanupFns)),
        bindKey,
        titleText,
        titleHidden: node.labelPosition === 'hidden',
        headingLevel: `h${Math.min(headingLevel, 6)}`,
        addLabel: computed(() =>
            localeText('addLabel', path).value ?? uiText(host.engine, 'repeat.add', { label: groupLabel.value }).value),

        renderRows(build: (rows: RepeatGroupRowsPass) => void): void {
            renderRepeatRows(cleanupFns, { count, canRemove }, (pass) => build({
                count: pass.count,
                canRemove: pass.canRemove,
                rowText: (index) => rowText(index, pass.count),
                renderRow: (index, parent) => {
                    for (const child of node.children) {
                        emitChild(child, parent, `${path}[${index}]`, childHeadingLevel, pass.cleanupFns);
                    }
                },
                watch: (fn) => { pass.cleanupFns.push(effect(fn)); },
            }));
        },

        addInstance(): void {
            if (!canAdd.value) return;
            host.engine.addRepeatInstance(path);
            const total = count.value;
            announce(`${groupLabel.value} ${total} added. ${total} total.`);
            queueMicrotask(() => {
                const rows = bound?.list.children;
                rowFocusTarget(rows?.[rows.length - 1])?.focus();
            });
        },

        removeInstance(index: number): void {
            const remaining = Math.max(0, count.value - 1);
            host.engine.removeRepeatInstance(path, index);
            announce(`${groupLabel.value} ${index + 1} removed. ${remaining} remaining.`);
            queueMicrotask(() => {
                if (remaining === 0) {
                    (bound?.addButton as HTMLElement | undefined)?.focus();
                    return;
                }
                rowFocusTarget(bound?.list.children[Math.min(index, remaining - 1)])?.focus();
            });
        },

        bind(refs: RepeatGroupRefs): () => void {
            bound = refs;
            const disposers = [effect(() => {
                refs.root.classList.toggle('formspec-hidden', !relevant.value);
            })];
            if (refs.addButton) {
                const addButton = refs.addButton;
                disposers.push(effect(() => {
                    addButton.classList.toggle('formspec-hidden', !canAdd.value);
                }));
            }
            return () => {
                bound = null;
                for (const dispose of disposers) dispose();
            };
        },
    };
}
