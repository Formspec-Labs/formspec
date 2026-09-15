'use client';

/** @filedesc Repeat-group and accordion-repeat layout rendering for FormspecNode. */
import React, { useMemo, useRef, useCallback, useState } from 'react';
import type { LayoutNode } from '@formspec-org/layout';
import { chromeText } from './use-chrome-text';
import { signal } from '@preact/signals-core';
import type { IFormEngine } from '@formspec-org/engine/render';
import { useFormspecContext } from './context.js';
import { useSignal } from './use-signal';
import type { RepeatAffordanceLocks } from '@formspec-org/engine/render';
import { useRepeatAffordances } from './use-repeat-affordances';
import { RepeatInstanceContext } from './use-localized-node';
import type { NodeRenderer } from './node-renderer-types.js';

const NO_LABEL = signal('');

/** A repeat node's `allowAdd` / `allowRemove` props (Accordion §6.3, or theme widgetConfig on a repeat template). */
function repeatLocks(node: LayoutNode): RepeatAffordanceLocks {
    const { allowAdd, allowRemove } = node.props ?? {};
    return {
        allowAdd: typeof allowAdd === 'boolean' ? allowAdd : undefined,
        allowRemove: typeof allowRemove === 'boolean' ? allowRemove : undefined,
    };
}

/** Renders a repeat group: stamps template children per instance. */
export function RepeatGroup({ node, renderChild }: { node: LayoutNode; renderChild: NodeRenderer }) {
    const { engine } = useFormspecContext();
    useSignal(engine.localeSignal); // re-render add/remove/row text on a locale switch
    const repeatPath = node.repeatPath!;
    // Theme widgetConfig Add/Remove locks, planned onto the template's props (theme §4.2).
    const { count, relevant, canAdd, canRemove } = useRepeatAffordances(repeatPath, repeatLocks(node));
    const title = (node.props?.title as string) || node.repeatGroup || repeatPath;
    const containerRef = useRef<HTMLDivElement>(null);
    const addBtnRef = useRef<HTMLButtonElement>(null);
    const [announcement, setAnnouncement] = useState('');

    const findRepeatInstanceFocusTarget = useCallback((instance: Element | null) => {
        if (!instance) return null;
        return instance.querySelector<HTMLElement>(
            'input:not([type="hidden"]), select, textarea, [contenteditable="true"], button:not(.formspec-repeat-remove)',
        ) ?? instance.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])');
    }, []);

    const instances = useMemo(() => {
        const result: LayoutNode[][] = [];
        for (let i = 0; i < count; i++) {
            result.push(
                node.children.map((child) => rewriteBindPaths(child, repeatPath, i)),
            );
        }
        return result;
    }, [node.children, repeatPath, count]);

    const handleAdd = useCallback(() => {
        if (!canAdd) return;
        engine.addRepeatInstance(repeatPath);
        const newCount = count + 1;
        setAnnouncement(`${title} ${newCount} added. ${newCount} total.`);
        setTimeout(() => {
            const instanceEls = containerRef.current?.querySelectorAll('.formspec-repeat-instance');
            const last = instanceEls?.[instanceEls.length - 1];
            findRepeatInstanceFocusTarget(last ?? null)?.focus();
        }, 0);
    }, [canAdd, count, engine, findRepeatInstanceFocusTarget, repeatPath, title]);

    const handleRemove = useCallback((idx: number) => {
        engine.removeRepeatInstance(repeatPath, idx);
        const newCount = count - 1;
        setAnnouncement(`${title} ${idx + 1} removed. ${newCount} remaining.`);
        setTimeout(() => {
            if (newCount === 0) {
                addBtnRef.current?.focus();
            } else {
                const instanceEls = containerRef.current?.querySelectorAll('.formspec-repeat-instance');
                const target = instanceEls?.[Math.min(idx, newCount - 1)];
                findRepeatInstanceFocusTarget(target ?? null)?.focus();
            }
        }, 0);
    }, [count, engine, findRepeatInstanceFocusTarget, repeatPath, title]);

    if (!relevant) return null;

    return (
        <div className="formspec-repeat" data-bind={node.repeatGroup} ref={containerRef}>
            <div className="formspec-repeat-list">
                {instances.map((children, idx) => (
                    <div key={idx} className="formspec-repeat-instance"
                         role="group"
                         aria-label={chromeText(engine, 'repeat.rowOf', { label: title, index: idx + 1, total: count })}>
                        <div className="formspec-repeat-instance-header">
                            <p className="formspec-repeat-instance-label">{chromeText(engine, 'repeat.row', { label: title, index: idx + 1 })}</p>
                            {canRemove && (
                                <button
                                    type="button"
                                    className="formspec-repeat-remove formspec-button-danger formspec-focus-ring"
                                    aria-label={chromeText(engine, 'repeat.remove', { label: `${title} ${idx + 1}` })}
                                    onClick={() => handleRemove(idx)}
                                >
                                    {chromeText(engine, 'repeat.remove', { label: title })}
                                </button>
                            )}
                        </div>
                        <RepeatInstanceContext.Provider value={`${repeatPath}[${idx}]`}>
                            {children.map((child) => (
                                <React.Fragment key={child.id}>{renderChild(child)}</React.Fragment>
                            ))}
                        </RepeatInstanceContext.Provider>
                    </div>
                ))}
            </div>
            {canAdd && (
                <button
                    type="button"
                    className="formspec-repeat-add formspec-focus-ring"
                    onClick={handleAdd}
                    ref={addBtnRef}
                >
                    {chromeText(engine, 'repeat.add', { label: title })}
                </button>
            )}
            <div aria-live="polite" className="formspec-sr-only">{announcement}</div>
        </div>
    );
}

export function RepeatAccordion({ node, renderChild }: { node: LayoutNode; renderChild: NodeRenderer }) {
    const { engine } = useFormspecContext();
    useSignal(engine.localeSignal); // re-render add/remove text on a locale switch
    const bindKey = node.props?.bind as string;
    const { count, relevant, canAdd, canRemove } = useRepeatAffordances(bindKey, repeatLocks(node));
    const labels = (node.props?.labels as string[] | undefined) ?? [];
    const allowMultiple = node.props?.allowMultiple === true;
    const defaultOpen = node.props?.defaultOpen as number | undefined;
    // The repeated group's live label (Locale, label context, `{{}}`), as webcomponent AccordionLayoutBehavior.groupLabel.
    const groupLabel = useMemo(() => engine.getItemLabelSignal(bindKey) ?? NO_LABEL, [engine, bindKey]);
    const groupTitle = useSignal(groupLabel) || bindKey;
    const [openIndex, setOpenIndex] = useState<number | null>(
        typeof defaultOpen === 'number' ? defaultOpen : count > 0 ? count - 1 : null,
    );
    const [openIndices, setOpenIndices] = useState<Set<number>>(() => {
        const initial = new Set<number>();
        if (typeof defaultOpen === 'number') initial.add(defaultOpen);
        else if (count > 0) initial.add(count - 1);
        return initial;
    });
    // Rebuild row nodes only when rows change: fresh node objects on every toggle would re-derive each row's localized props.
    const rows = useMemo(
        () => Array.from({ length: count }, (_, i) => node.children.map((child) => rewriteBindPaths(child, bindKey, i))),
        [node.children, bindKey, count],
    );
    const previousCountRef = useRef(count);
    const containerRef = useRef<HTMLDivElement>(null);
    const addBtnRef = useRef<HTMLButtonElement>(null);
    const [announcement, setAnnouncement] = useState('');

    React.useEffect(() => {
        const previousCount = previousCountRef.current;
        if (count > previousCount && count > 0) {
            const lastIndex = count - 1;
            if (allowMultiple) {
                setOpenIndices(prev => {
                    const next = new Set(prev);
                    next.add(lastIndex);
                    return next;
                });
            } else {
                setOpenIndex(lastIndex);
            }
        }
        previousCountRef.current = count;
    }, [allowMultiple, count]);

    const handleToggle = useCallback((idx: number, open: boolean) => {
        if (allowMultiple) {
            setOpenIndices(prev => {
                const next = new Set(prev);
                if (open) next.add(idx);
                else next.delete(idx);
                return next;
            });
            return;
        }
        setOpenIndex(open ? idx : null);
    }, [allowMultiple]);

    const handleAdd = useCallback(() => {
        if (!canAdd) return;
        engine.addRepeatInstance(bindKey);
        const newCount = count + 1;
        setAnnouncement(`${groupTitle} ${newCount} added. ${newCount} total.`);
        setTimeout(() => {
            const items = containerRef.current?.querySelectorAll<HTMLDetailsElement>('.formspec-accordion-item');
            const last = items?.[items.length - 1];
            last?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
        }, 0);
    }, [bindKey, canAdd, count, engine, groupTitle]);

    const handleRemove = useCallback((idx: number) => {
        engine.removeRepeatInstance(bindKey, idx);
        const newCount = count - 1;
        setAnnouncement(`${groupTitle} ${idx + 1} removed. ${newCount} remaining.`);
        setTimeout(() => {
            if (newCount <= 0) {
                addBtnRef.current?.focus();
                return;
            }
            const items = containerRef.current?.querySelectorAll<HTMLDetailsElement>('.formspec-accordion-item');
            const target = items?.[Math.min(idx, newCount - 1)];
            target?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
        }, 0);
    }, [bindKey, count, engine, groupTitle]);

    if (!relevant) return null;

    return (
        <div className="formspec-repeat formspec-repeat--accordion" data-bind={bindKey} ref={containerRef}>
            <div className="formspec-accordion formspec-accordion--repeat">
                {Array.from({ length: count }, (_, i) => {
                    const isOpen = allowMultiple ? openIndices.has(i) : openIndex === i;
                    return (
                        <details key={i} className="formspec-accordion-item" open={isOpen}>
                            <summary
                                className="formspec-focus-ring"
                                onClick={(event) => {
                                    event.preventDefault();
                                    handleToggle(i, !isOpen);
                                }}
                            >
                                {labels[i] || `Section ${i + 1}`}
                            </summary>
                            <div className="formspec-accordion-content formspec-accordion-content--repeat">
                                <RepeatInstanceContext.Provider value={`${bindKey}[${i}]`}>
                                    {rows[i].map((child) => (
                                        <React.Fragment key={child.id}>{renderChild(child)}</React.Fragment>
                                    ))}
                                </RepeatInstanceContext.Provider>
                                {canRemove && (
                                    <button
                                        type="button"
                                        className="formspec-repeat-remove formspec-focus-ring"
                                        aria-label={chromeText(engine, 'repeat.remove', { label: `${groupTitle} ${i + 1}` })}
                                        onClick={() => handleRemove(i)}
                                    >
                                        {chromeText(engine, 'repeat.remove', { label: groupTitle })}
                                    </button>
                                )}
                            </div>
                        </details>
                    );
                })}
            </div>
            {canAdd && (
                <button
                    type="button"
                    className="formspec-repeat-add formspec-focus-ring"
                    onClick={handleAdd}
                    ref={addBtnRef}
                >
                    {chromeText(engine, 'repeat.add', { label: groupTitle })}
                </button>
            )}
            <div aria-live="polite" className="formspec-sr-only">{announcement}</div>
        </div>
    );
}

/**
 * Deep-clone a LayoutNode tree, rewriting `bindPath` onto instance `[instanceIdx]`.
 * Repeat templates plan children under `repeatPath[0]`; a bound Accordion plans them under `repeatPath.`.
 */
export function rewriteBindPaths(node: LayoutNode, repeatPath: string, instanceIdx: number): LayoutNode {
    const templatePrefix = `${repeatPath}[0]`;
    const groupScopePrefix = `${repeatPath}.`;
    const instancePrefix = `${repeatPath}[${instanceIdx}]`;

    const rewritten: LayoutNode = { ...node };

    if (rewritten.bindPath?.startsWith(templatePrefix)) {
        rewritten.bindPath = instancePrefix + rewritten.bindPath.slice(templatePrefix.length);
    } else if (rewritten.bindPath?.startsWith(groupScopePrefix)) {
        rewritten.bindPath = `${instancePrefix}.${rewritten.bindPath.slice(groupScopePrefix.length)}`;
    }

    rewritten.id = `${node.id}-${instanceIdx}`;

    if (node.children.length > 0) {
        rewritten.children = node.children.map((child) =>
            rewriteBindPaths(child, repeatPath, instanceIdx),
        );
    }

    return rewritten;
}
