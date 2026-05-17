'use client';

/** @filedesc Repeat-group and accordion-repeat layout rendering for FormspecNode. */
import React, { useMemo, useRef, useCallback, useState } from 'react';
import type { LayoutNode } from '@formspec-org/layout';
import { useFormspecContext, findItemByKey } from './context.js';
import { useRepeatCount } from './use-repeat-count';
import type { NodeRenderer } from './node-renderer-types.js';

function findItemLabel(items: Array<{ key?: string; label?: string; children?: unknown[] }>, key: string): string | undefined {
    const item = findItemByKey(items, key);
    return item?.label;
}

/** Renders a repeat group: stamps template children per instance. */
export function RepeatGroup({ node, renderChild }: { node: LayoutNode; renderChild: NodeRenderer }) {
    const { engine } = useFormspecContext();
    const repeatPath = node.repeatPath!;
    const count = useRepeatCount(repeatPath);
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
        engine.addRepeatInstance(repeatPath);
        const newCount = count + 1;
        setAnnouncement(`${title} ${newCount} added. ${newCount} total.`);
        setTimeout(() => {
            const instanceEls = containerRef.current?.querySelectorAll('.formspec-repeat-instance');
            const last = instanceEls?.[instanceEls.length - 1];
            findRepeatInstanceFocusTarget(last ?? null)?.focus();
        }, 0);
    }, [count, engine, findRepeatInstanceFocusTarget, repeatPath, title]);

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

    return (
        <div className="formspec-repeat" data-bind={node.repeatGroup} ref={containerRef}>
            <div className="formspec-repeat-list">
                {instances.map((children, idx) => (
                    <div key={idx} className="formspec-repeat-instance"
                         role="group"
                         aria-label={`${title} ${idx + 1} of ${count}`}>
                        <div className="formspec-repeat-instance-header">
                            <p className="formspec-repeat-instance-label">{`${title} ${idx + 1}`}</p>
                            <button
                                type="button"
                                className="formspec-repeat-remove formspec-button-danger formspec-focus-ring"
                                aria-label={`Remove ${title} ${idx + 1}`}
                                onClick={() => handleRemove(idx)}
                            >
                                {`Remove ${title}`}
                            </button>
                        </div>
                        {children.map((child) => (
                            <React.Fragment key={child.id}>{renderChild(child)}</React.Fragment>
                        ))}
                    </div>
                ))}
            </div>
            <button
                type="button"
                className="formspec-repeat-add formspec-focus-ring"
                onClick={handleAdd}
                ref={addBtnRef}
            >
                {`Add ${title}`}
            </button>
            <div aria-live="polite" className="formspec-sr-only">{announcement}</div>
        </div>
    );
}

export function RepeatAccordion({ node, renderChild }: { node: LayoutNode; renderChild: NodeRenderer }) {
    const { engine } = useFormspecContext();
    const bindKey = node.props?.bind as string;
    const count = useRepeatCount(bindKey);
    const labels = (node.props?.labels as string[] | undefined) ?? [];
    const allowMultiple = node.props?.allowMultiple === true;
    const defaultOpen = node.props?.defaultOpen as number | undefined;
    const groupTitle = node.fieldItem?.label || findItemLabel(engine.getDefinition().items ?? [], bindKey) || bindKey;
    const [openIndex, setOpenIndex] = useState<number | null>(
        typeof defaultOpen === 'number' ? defaultOpen : count > 0 ? count - 1 : null,
    );
    const [openIndices, setOpenIndices] = useState<Set<number>>(() => {
        const initial = new Set<number>();
        if (typeof defaultOpen === 'number') initial.add(defaultOpen);
        else if (count > 0) initial.add(count - 1);
        return initial;
    });
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
        engine.addRepeatInstance(bindKey);
        const newCount = count + 1;
        setAnnouncement(`${groupTitle} ${newCount} added. ${newCount} total.`);
        setTimeout(() => {
            const items = containerRef.current?.querySelectorAll<HTMLDetailsElement>('.formspec-accordion-item');
            const last = items?.[items.length - 1];
            last?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
        }, 0);
    }, [bindKey, count, engine, groupTitle]);

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
                                {node.children.map((child) => (
                                    <React.Fragment key={`${child.id}-${i}`}>
                                        {renderChild(rewriteBindPaths(child, bindKey, i))}
                                    </React.Fragment>
                                ))}
                                <button
                                    type="button"
                                    className="formspec-repeat-remove formspec-focus-ring"
                                    aria-label={`Remove ${groupTitle} ${i + 1}`}
                                    onClick={() => handleRemove(i)}
                                >
                                    {`Remove ${groupTitle}`}
                                </button>
                            </div>
                        </details>
                    );
                })}
            </div>
            <button
                type="button"
                className="formspec-repeat-add formspec-focus-ring"
                onClick={handleAdd}
                ref={addBtnRef}
            >
                {`Add ${groupTitle}`}
            </button>
            <div aria-live="polite" className="formspec-sr-only">{announcement}</div>
        </div>
    );
}

/**
 * Deep-clone a LayoutNode tree, rewriting `bindPath` from template `[0]` to `[instanceIdx]`.
 */
export function rewriteBindPaths(node: LayoutNode, repeatPath: string, instanceIdx: number): LayoutNode {
    const templatePrefix = `${repeatPath}[0]`;
    const instancePrefix = `${repeatPath}[${instanceIdx}]`;

    const rewritten: LayoutNode = { ...node };

    if (rewritten.bindPath?.startsWith(templatePrefix)) {
        rewritten.bindPath = instancePrefix + rewritten.bindPath.slice(templatePrefix.length);
    }

    rewritten.id = `${node.id}-${instanceIdx}`;

    if (node.children.length > 0) {
        rewritten.children = node.children.map((child) =>
            rewriteBindPaths(child, repeatPath, instanceIdx),
        );
    }

    return rewritten;
}
