'use client';

/** @filedesc Recursive LayoutNode renderer — dispatches to field or layout components. */
import React, { useMemo, useRef, useCallback, useState } from 'react';
import { signal as createSignal } from '@preact/signals-core';
import type { LayoutNode } from '@formspec-org/layout';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';
import { useField } from './use-field';
import { useForm } from './use-form';
import { useWhen } from './use-when';
import { useRepeatCount } from './use-repeat-count';
import type { FieldComponentProps, LayoutComponentProps } from './component-map';
import { DefaultField } from './defaults/fields/default-field';
import { DefaultLayout } from './defaults/layout/default-layout';
import { Wizard } from './defaults/layout/wizard';
import { Tabs } from './defaults/layout/tabs';
import { ValidationSummary } from './validation-summary';

/**
 * Built-in layout component map. Components here are used by default when no
 * user override is provided via `components.layout`. This wires complex
 * components (Wizard, Tabs) into the rendering pipeline without requiring
 * consumers to register them manually.
 */
const BUILTIN_LAYOUT: Record<string, React.ComponentType<LayoutComponentProps>> = {
    Wizard,
    Tabs,
};

/**
 * Progressive component fallback map. When a component has no entry in the component map,
 * substitute its Core equivalent so Progressive components degrade gracefully.
 */
const FALLBACK_MAP: Record<string, string> = {
    MoneyInput: 'NumberInput',
    Slider: 'NumberInput',
    Rating: 'NumberInput',
    Signature: 'FileUpload',
    Badge: 'Text',
    ProgressBar: 'Text',
    Summary: 'Text',
    Panel: 'Card',
    Modal: 'Collapsible',
    Popover: 'Collapsible',
    DataTable: 'Card',
    Tabs: 'Stack',
    Wizard: 'Stack',
};

/**
 * Minimal markdown-to-HTML converter. Handles the subset required by the Text
 * component spec: bold, italic, links, inline code, and newlines.
 */
function simpleMarkdown(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
            const trimmed = url.trim().toLowerCase();
            if (
                trimmed.startsWith('javascript:') ||
                trimmed.startsWith('data:') ||
                trimmed.startsWith('vbscript:')
            ) {
                return `<span>${text}</span>`;
            }
            return `<a href="${url}">${text}</a>`;
        })
        .replace(/\n/g, '<br>');
}

/** Render a single LayoutNode, recursing into children. */
export function FormspecNode({ node }: { node: LayoutNode }) {
    // Repeat template: render instances with add/remove controls
    if (node.isRepeatTemplate && node.repeatPath) {
        return <RepeatGroup node={node} />;
    }

    if (node.component === 'Accordion' && typeof node.props?.bind === 'string') {
        return <RepeatAccordion node={node} />;
    }

    // Conditional rendering: evaluate `when` FEL expression.
    // Modal with trigger:auto owns `when` for open state (matches web component).
    const modalAutoSkipsWhenGuard = node.component === 'Modal' && node.props?.trigger === 'auto';
    if (node.when && !modalAutoSkipsWhenGuard) {
        return <WhenGuard node={node} />;
    }

    if (node.category === 'field' && node.bindPath) {
        return <FieldNode node={node} />;
    }

    if (node.category === 'display') {
        return <DisplayNode node={node} />;
    }

    // DataTable is classified as 'interactive' by the planner but renders
    // through DisplayNode which contains the editable table implementation.
    if (node.component === 'DataTable') {
        return <DisplayNode node={node} />;
    }

    if (node.component === 'SubmitButton') {
        return <SubmitButtonNode node={node} />;
    }

    // container, interactive, special, and layout all route through LayoutNodeRenderer
    return <LayoutNodeRenderer node={node} />;
}

/** Renders a SubmitButton plan node — dispatches onSubmit from context. */
function SubmitButtonNode({ node }: { node: LayoutNode }) {
    const { onSubmit } = useFormspecContext();
    const form = useForm();
    const label = (node.props?.label as string) || 'Submit';

    const handleClick = useCallback(() => {
        if (!onSubmit) return;
        onSubmit(form.submit({ mode: 'submit' }));
    }, [form, onSubmit]);

    return (
        <button
            type="submit"
            className={node.cssClasses?.join(' ') || 'formspec-submit'}
            onClick={handleClick}
        >
            {label}
        </button>
    );
}

/** Evaluates a `when` FEL expression and conditionally renders the node. */
function WhenGuard({ node }: { node: LayoutNode }) {
    const visible = useWhen(node.when!, node.whenPrefix);

    if (!visible) return null;

    // Render the node without the `when` — strip it to avoid infinite recursion
    const innerNode = useMemo(
        () => ({ ...node, when: undefined, whenPrefix: undefined }),
        [node],
    );

    return <FormspecNode node={innerNode} />;
}

/** Renders a repeat group: stamps template children per instance. */
function RepeatGroup({ node }: { node: LayoutNode }) {
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

    // Build instances by rewriting template child bindPaths
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
        // Focus first focusable element in the new instance after render
        setTimeout(() => {
            const instances = containerRef.current?.querySelectorAll('.formspec-repeat-instance');
            const last = instances?.[instances.length - 1];
            findRepeatInstanceFocusTarget(last ?? null)?.focus();
        }, 0);
    }, [count, engine, findRepeatInstanceFocusTarget, repeatPath, title]);

    const handleRemove = useCallback((idx: number) => {
        engine.removeRepeatInstance(repeatPath, idx);
        const newCount = count - 1;
        setAnnouncement(`${title} ${idx + 1} removed. ${newCount} remaining.`);
        // Focus: previous instance's first element, or the add button
        setTimeout(() => {
            if (newCount === 0) {
                addBtnRef.current?.focus();
            } else {
                const instances = containerRef.current?.querySelectorAll('.formspec-repeat-instance');
                const target = instances?.[Math.min(idx, newCount - 1)];
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
                            <FormspecNode key={child.id} node={child} />
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
            {/* Live region for add/remove announcements */}
            <div aria-live="polite" className="formspec-sr-only">{announcement}</div>
        </div>
    );
}

function RepeatAccordion({ node }: { node: LayoutNode }) {
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
                                    <FormspecNode key={`${child.id}-${i}`} node={rewriteBindPaths(child, bindKey, i)} />
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

function findItemLabel(items: Array<any>, key: string): string | undefined {
    for (const item of items) {
        if (item?.key === key) return item.label;
        if (Array.isArray(item?.children)) {
            const nested = findItemLabel(item.children, key);
            if (nested) return nested;
        }
    }
    return undefined;
}

function findItemByKey(items: Array<any>, key: string): any | undefined {
    for (const item of items) {
        if (item?.key === key) return item;
        if (Array.isArray(item?.children)) {
            const nested = findItemByKey(item.children, key);
            if (nested) return nested;
        }
    }
    return undefined;
}

/** Renders a display node — checks for user override before built-in rendering. */
function DisplayNode({ node }: { node: LayoutNode }) {
    const { components } = useFormspecContext();
    const text = (node.props?.text as string) || node.fieldItem?.label || '';

    // Check for user-provided display component override
    const Override = components.display?.[node.component];
    if (Override) {
        return <Override node={node} text={text} />;
    }

    const cssClass = node.cssClasses?.join(' ') || undefined;
    const style = node.style as React.CSSProperties | undefined;

    switch (node.component) {
        case 'Heading': {
            const level = (node.props?.level as number) || 2;
            const Tag = `h${Math.min(6, Math.max(1, level))}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
            // Spec: Heading MUST NOT accept a bind property — purely presentational
            return <Tag className={cssClass || 'formspec-heading'} style={style}>{text}</Tag>;
        }

        case 'Divider':
            return <hr className={cssClass || 'formspec-divider'} style={style} />;

        case 'Alert': {
            const severity = (node.props?.severity as string) || 'info';
            // Spec: role="alert" for error AND warning, role="status" for info/success
            const alertRole = severity === 'error' || severity === 'warning' ? 'alert' : 'status';
            const dismissible = node.props?.dismissible === true;
            // Spec: Alert MUST NOT accept a bind property
            return (
                <DismissibleAlert
                    severity={severity}
                    alertRole={alertRole}
                    dismissible={dismissible}
                    text={text}
                    cssClass={cssClass}
                    style={style}
                />
            );
        }

        case 'Badge': {
            const variant = (node.props?.variant as string) || 'default';
            // Spec: Badge MUST NOT accept a bind property
            return (
                <span
                    className={`formspec-badge formspec-badge--${variant}${cssClass ? ' ' + cssClass : ''}`}
                    style={style}
                >
                    {text}
                </span>
            );
        }

        case 'Spacer': {
            const height = (node.props?.size as string) || '1rem';
            return (
                <div
                    className={`formspec-spacer${cssClass ? ' ' + cssClass : ''}`}
                    style={{ height, ...style }}
                />
            );
        }

        case 'ProgressBar': {
            const bindPath = node.props?.bind as string | undefined;
            const max = (node.props?.max as number) ?? 100;
            const showPercent = node.props?.showPercent === true;
            const progressLabel = (node.props?.label as string) || 'Progress';
            if (bindPath) {
                return (
                    <BoundProgressBar
                        bind={bindPath}
                        max={max}
                        showPercent={showPercent}
                        progressLabel={progressLabel}
                        cssClass={cssClass}
                        style={style}
                    />
                );
            }
            const value = (node.props?.value as number) ?? 0;
            const pct = Math.round((value / max) * 100);
            return (
                <div className={`formspec-progress-bar${cssClass ? ' ' + cssClass : ''}`} style={style}>
                    <progress value={value} max={max} aria-label={progressLabel} />
                    {showPercent && (
                        <span className="formspec-progress-percent">{pct}%</span>
                    )}
                </div>
            );
        }

        case 'Summary': {
            const items = (node.props?.items as Array<{ label: string; bind?: string }>) || [];
            return (
                <SummaryDisplay node={node} items={items} cssClass={cssClass} style={style} />
            );
        }

        case 'DataTable':
            return <DataTableDisplay node={node} cssClass={cssClass} style={style} />;

        case 'ValidationSummary':
            return <ValidationSummaryDisplay />;

        case 'Text':
        default: {
            const format = node.props?.format as string | undefined;
            const bindPath = node.props?.bind as string | undefined;
            const textClassName = `formspec-text${format === 'markdown' ? ' formspec-text--markdown' : ''}${cssClass ? ` ${cssClass}` : ''}`;
            if (format === 'markdown' && !bindPath) {
                return (
                    <p
                        className={textClassName}
                        style={style}
                        dangerouslySetInnerHTML={{ __html: simpleMarkdown(text) }}
                    />
                );
            }
            return (
                <p className={textClassName} style={style}>
                    {bindPath ? <BoundText bind={bindPath} /> : text}
                </p>
            );
        }
    }
}

/** Renders a Summary display node as a definition list with reactive field values. */
function SummaryDisplay({
    node,
    items,
    cssClass,
    style,
}: {
    node: LayoutNode;
    items: Array<{ label: string; bind?: string }>;
    cssClass: string | undefined;
    style: React.CSSProperties | undefined;
}) {
    return (
        <dl className={`formspec-summary${cssClass ? ' ' + cssClass : ''}`} style={style}>
            {items.map((item, i) => (
                <SummaryItem key={item.bind || i} label={item.label} bind={item.bind} />
            ))}
        </dl>
    );
}

const NO_VALUE = createSignal(null);

/** Subscribes to a bind signal for reactive display node text. */
function BoundText({ bind }: { bind: string }) {
    const { engine } = useFormspecContext();
    const sig = engine.signals[bind] ?? NO_VALUE;
    const rawValue = useSignal(sig);
    return <>{rawValue != null ? String(rawValue) : ''}</>;
}

/** ProgressBar that subscribes to a bind signal for reactive value updates. */
function BoundProgressBar({ bind, max, showPercent, progressLabel, cssClass, style }: {
    bind: string;
    max: number;
    showPercent: boolean;
    progressLabel: string;
    cssClass?: string;
    style?: React.CSSProperties;
}) {
    const { engine } = useFormspecContext();
    const sig = engine.signals[bind] ?? NO_VALUE;
    const rawValue = useSignal(sig);
    const value = typeof rawValue === 'number' ? rawValue : 0;
    const pct = Math.round((value / max) * 100);
    return (
        <div className={`formspec-progress-bar${cssClass ? ' ' + cssClass : ''}`} style={style}>
            <progress value={value} max={max} aria-label={progressLabel} />
            {showPercent && (
                <span className="formspec-progress-percent">{pct}%</span>
            )}
        </div>
    );
}

/** Dismissible alert component — needs useState for dismissed state. */
function DismissibleAlert({ severity, alertRole, dismissible, text, cssClass, style }: {
    severity: string;
    alertRole: string;
    dismissible: boolean;
    text: string;
    cssClass?: string;
    style?: React.CSSProperties;
}) {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) return null;
    return (
        <div
            role={alertRole}
            className={`formspec-alert formspec-alert--${severity}${dismissible ? ' formspec-alert--dismissible' : ''}${cssClass ? ' ' + cssClass : ''}`}
            style={style}
        >
            {text}
            {dismissible && (
                <button
                    type="button"
                    className="formspec-alert-close"
                    aria-label="Dismiss"
                    onClick={() => setDismissed(true)}
                >
                    <span aria-hidden="true">&times;</span>
                </button>
            )}
        </div>
    );
}

/** Format a money value ({ amount, currency }) using Intl.NumberFormat. */
function formatMoney(value: any, locale = 'en-US'): string {
    if (value == null) return '\u2014';
    if (typeof value === 'object' && 'amount' in value) {
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: value.currency || 'USD',
            }).format(Number(value.amount));
        } catch { return String(value.amount); }
    }
    return String(value);
}

/** A single summary row — subscribes to its own field signal for targeted re-renders. */
function SummaryItem({ label, bind }: { label: string; bind?: string }) {
    const { engine } = useFormspecContext();
    const rawValue = useSignal(bind ? (engine.signals[bind] ?? NO_VALUE) : NO_VALUE);
    const displayValue = rawValue != null
        ? (typeof rawValue === 'object' && rawValue !== null && 'amount' in (rawValue as object)
            ? formatMoney(rawValue)
            : String(rawValue))
        : '\u2014';

    return (
        <>
            <dt>{label}</dt>
            <dd>{displayValue}</dd>
        </>
    );
}

const NO_READONLY = createSignal(false);

/** An editable DataTable cell — renders input or select based on column config. */
function DataTableCell({
    signalPath,
    column,
    fieldDef,
    defaultCurrency,
}: {
    signalPath: string;
    column: { header: string; bind: string; type?: string; choices?: Array<{ value: string; label: string }>; editable?: boolean; currency?: string; min?: number; max?: number; step?: number };
    fieldDef?: any;
    defaultCurrency: string;
}) {
    const { engine } = useFormspecContext();
    const rawValue = useSignal(engine.signals[signalPath] ?? NO_VALUE);
    const readonly = useSignal(engine.readonlySignals[signalPath] ?? NO_READONLY);

    const isEditable = column.editable !== false;
    const dataType = fieldDef?.dataType || column.type;
    const choices = column.choices
        || (fieldDef?.optionSet
            ? (((engine.getDefinition()?.optionSets?.[fieldDef.optionSet] as any)?.options)
                ?? engine.getDefinition()?.optionSets?.[fieldDef.optionSet]
                ?? [])
            : fieldDef?.options ?? []);
    const prefix = fieldDef?.prefix;
    const suffix = fieldDef?.suffix;

    const wrapControl = (control: React.ReactNode) => {
        if (!prefix && !suffix) return control;
        return (
            <div className="formspec-datatable-cell-wrapper">
                {prefix ? <span className="formspec-datatable-prefix">{prefix}</span> : null}
                {control}
                {suffix ? <span className="formspec-datatable-prefix">{suffix}</span> : null}
            </div>
        );
    };

    if (!isEditable) {
        // Read-only display with money formatting
        let displayValue = rawValue != null ? String(rawValue) : '';
        if (dataType === 'money' && rawValue != null) {
            try {
                displayValue = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: rawValue?.currency || fieldDef?.currency || column.currency || defaultCurrency,
                }).format(Number(rawValue?.amount ?? rawValue));
            } catch { /* fall through to string */ }
        } else if ((dataType === 'choice' || dataType === 'select') && choices.length > 0) {
            const match = choices.find((c: any) => c.value === rawValue);
            if (match) displayValue = match.label;
        }
        return <td>{displayValue}</td>;
    }

    // Editable cells — all get aria-label from column header
    if (dataType === 'boolean') {
        return (
            <td>
                <input
                    className="formspec-datatable-input"
                    type="checkbox"
                    checked={!!rawValue}
                    aria-label={column.header}
                    disabled={readonly}
                    onChange={(e) => engine.setValue(signalPath, e.target.checked)}
                />
            </td>
        );
    }

    if ((dataType === 'choice' || dataType === 'select') && choices.length > 0) {
        return (
            <td>{wrapControl(
                <select
                    className="formspec-datatable-input"
                    name={signalPath}
                    value={rawValue ?? ''}
                    aria-label={column.header}
                    disabled={readonly}
                    onChange={(e) => engine.setValue(signalPath, e.target.value || null)}
                >
                    <option value=""></option>
                    {choices.map((c: any) => (
                        <option key={c.value} value={c.value}>{c.label ?? c.value}</option>
                    ))}
                </select>,
            )}</td>
        );
    }

    if (dataType === 'number' || dataType === 'integer' || dataType === 'decimal' || dataType === 'money') {
        return (
            <td>{wrapControl(
                <input
                    className="formspec-datatable-input"
                    name={signalPath}
                    type="number"
                    step={column.step != null ? String(column.step) : (dataType === 'integer' ? '1' : 'any')}
                    min={column.min != null ? String(column.min) : undefined}
                    max={column.max != null ? String(column.max) : undefined}
                    value={rawValue?.amount ?? rawValue ?? ''}
                    aria-label={column.header}
                    disabled={readonly}
                    onChange={(e) => {
                        const value = e.target.value.trim();
                        if (!value) {
                            engine.setValue(signalPath, null);
                            return;
                        }
                        const parsed = dataType === 'integer' ? Number.parseInt(value, 10) : Number.parseFloat(value);
                        let next = Number.isFinite(parsed) ? parsed : null;
                        if (typeof next === 'number') {
                            if (column.min != null && next < column.min) next = column.min;
                            if (column.max != null && next > column.max) next = column.max;
                        }
                        if (dataType === 'money' && next != null) {
                            engine.setValue(signalPath, { amount: next, currency: fieldDef?.currency || column.currency || defaultCurrency });
                        } else {
                            engine.setValue(signalPath, next);
                        }
                    }}
                />,
            )}</td>
        );
    }

    if (dataType === 'date') {
        return (
            <td>{wrapControl(
                <input
                    className="formspec-datatable-input"
                    name={signalPath}
                    type="date"
                    value={rawValue ?? ''}
                    aria-label={column.header}
                    disabled={readonly}
                    onChange={(e) => engine.setValue(signalPath, e.target.value)}
                />,
            )}</td>
        );
    }

    // Default: text input
    return (
        <td>{wrapControl(
            <input
                className="formspec-datatable-input"
                name={signalPath}
                type="text"
                value={rawValue ?? ''}
                aria-label={column.header}
                disabled={readonly}
                onChange={(e) => engine.setValue(signalPath, e.target.value)}
            />,
        )}</td>
    );
}

/** Renders a DataTable display node as an HTML table. */
function DataTableDisplay({
    node,
    cssClass,
    style,
}: {
    node: LayoutNode;
    cssClass: string | undefined;
    style: React.CSSProperties | undefined;
}) {
    const { engine } = useFormspecContext();
    const bindKey = node.props?.bind as string | undefined;
    const columns = (node.props?.columns as Array<{ header: string; bind: string; type?: string; choices?: Array<{ value: string; label: string }>; editable?: boolean; currency?: string; min?: number; max?: number; step?: number }>) || [];
    const allowAdd = node.props?.allowAdd === true;
    const allowRemove = node.props?.allowRemove === true;
    const showRowNumbers = node.props?.showRowNumbers === true;
    const groupItem = bindKey ? findItemByKey(engine.getDefinition().items ?? [], bindKey) : null;
    const fieldByKey = new Map<string, any>();
    if (groupItem?.type === 'group' && Array.isArray(groupItem.children)) {
        for (const child of groupItem.children) {
            if (child?.type === 'field' && child.key) fieldByKey.set(child.key, child);
        }
    }
    const defaultCurrency = engine.getDefinition()?.formPresentation?.defaultCurrency || 'USD';

    const repeatPath = bindKey || '';
    const count = useRepeatCount(repeatPath);

    const handleAdd = useCallback(() => {
        if (repeatPath) engine.addRepeatInstance(repeatPath);
    }, [engine, repeatPath]);

    const handleRemove = useCallback((idx: number) => {
        if (repeatPath) engine.removeRepeatInstance(repeatPath, idx);
    }, [engine, repeatPath]);

    if (!bindKey || columns.length === 0) {
        return (
            <div className={`formspec-data-table-wrapper${cssClass ? ' ' + cssClass : ''}`} style={style}>
                <table className="formspec-data-table" />
            </div>
        );
    }

    return (
        <div className={`formspec-data-table-wrapper${cssClass ? ' ' + cssClass : ''}`} style={style}>
            <table className="formspec-data-table">
                {(node.props?.title as string) && (
                    <caption>{node.props.title as string}</caption>
                )}
                <thead>
                    <tr>
                        {showRowNumbers && <th scope="col">#</th>}
                        {columns.map((col, ci) => (
                            <th key={ci} scope="col">{col.header}</th>
                        ))}
                        {allowRemove && (
                            <th scope="col"><span className="formspec-sr-only">Actions</span></th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: count }, (_, i) => (
                        <tr key={i}>
                            {showRowNumbers && <td className="formspec-row-number">{i + 1}</td>}
                            {columns.map((col, ci) => (
                                <DataTableCell
                                    key={ci}
                                    signalPath={`${bindKey}[${i}].${col.bind}`}
                                    column={col}
                                    fieldDef={fieldByKey.get(col.bind)}
                                    defaultCurrency={defaultCurrency}
                                />
                            ))}
                            {allowRemove && (
                                <td>
                                    <button
                                        type="button"
                                        className="formspec-datatable-remove formspec-button-danger formspec-focus-ring"
                                        aria-label={`Remove row ${i + 1}`}
                                        onClick={() => handleRemove(i)}
                                    >
                                        Remove
                                    </button>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
            {allowAdd && (
                <button
                    type="button"
                    className="formspec-datatable-add formspec-focus-ring"
                    onClick={handleAdd}
                >
                    Add Row
                </button>
            )}
        </div>
    );
}

/** Renders a live ValidationSummary display node using the current engine state.
 *  Gates display on touchedVersion > 0 — errors only appear after submit or
 *  wizard navigation, matching the web component's gate behavior. */
function ValidationSummaryDisplay() {
    const { engine, touchedVersion } = useFormspecContext();
    const touched = useSignal(touchedVersion);
    const structureVersion = useSignal(engine.structureVersion);

    // Gate: don't show validation results until fields have been touched
    // (submit calls touchAllFields, wizard navigation touches fields)
    if (touched === 0) {
        return null;
    }

    const report = engine.getValidationReport({ mode: 'continuous' });
    const results = report.results.map((r: any) => ({
        path: r.path || '',
        message: r.message || 'Validation error',
        severity: r.severity || 'error',
    }));
    return <ValidationSummary results={results} autoFocus={false} />;
}

/** Renders a field node via the component map or default. */
function FieldNode({ node }: { node: LayoutNode }) {
    const { components } = useFormspecContext();
    const field = useField(node.bindPath!);

    if (!field.visible && field.disabledDisplay !== 'protected') return null;

    // Resolve component: exact match → fallback substitution → DefaultField
    const componentName = node.component;
    const exact = components.fields?.[componentName];
    const fallbackName = !exact ? FALLBACK_MAP[componentName] : undefined;
    const Component: React.ComponentType<FieldComponentProps> =
        exact ??
        (fallbackName ? components.fields?.[fallbackName] : undefined) ??
        DefaultField;

    return <Component field={field} node={node} />;
}

/** Wrapper that checks group-level relevance before rendering layout nodes. */
function LayoutNodeRenderer({ node }: { node: LayoutNode }) {
    if (node.bindPath) {
        return <RelevanceGatedLayout node={node} />;
    }
    return <LayoutNodeInner node={node} />;
}

const ALWAYS_RELEVANT = createSignal(true);

/** Subscribes to relevance signal for a layout node with a bind path. */
function RelevanceGatedLayout({ node }: { node: LayoutNode }) {
    const { engine } = useFormspecContext();
    const relevanceSignal = engine.relevantSignals[node.bindPath!] ?? ALWAYS_RELEVANT;
    const isRelevant = useSignal(relevanceSignal);
    if (!isRelevant) return null;
    return <LayoutNodeInner node={node} />;
}

/** Renders a layout node via the component map or default, recurses into children. */
function LayoutNodeInner({ node }: { node: LayoutNode }) {
    const { components, formPresentation } = useFormspecContext();

    // Match web component: Stack + Page children + pageMode → Wizard / Tabs (not plain Stack).
    if (node.component === 'Stack' && node.children.length > 0) {
        const pageMode = formPresentation?.pageMode as string | undefined;
        const hasPages = node.children.some((c) => c.component === 'Page');
        if (hasPages && (pageMode === 'wizard' || pageMode === 'tabs')) {
            const orphans = node.children.filter((c) => c.component !== 'Page');
            const pages = node.children.filter((c) => c.component === 'Page');
            const fp = formPresentation ?? {};

            if (pageMode === 'wizard' && pages.length > 0) {
                const wizardNode: LayoutNode = {
                    id: `${node.id}-page-mode-wizard`,
                    component: 'Wizard',
                    category: 'layout',
                    props: {
                        showProgress: fp.showProgress !== false,
                        allowSkip: !!fp.allowSkip,
                        sidenav: fp.sidenav,
                    },
                    cssClasses: node.cssClasses ?? [],
                    style: node.style,
                    accessibility: node.accessibility,
                    children: pages,
                };
                return (
                    <>
                        {orphans.map((child) => (
                            <FormspecNode key={child.id} node={child} />
                        ))}
                        <LayoutNodeInner node={wizardNode} />
                    </>
                );
            }

            if (pageMode === 'tabs' && pages.length > 0) {
                const tabsNode: LayoutNode = {
                    id: `${node.id}-page-mode-tabs`,
                    component: 'Tabs',
                    category: 'layout',
                    props: {
                        tabLabels: pages.map(
                            (p) =>
                                (p.props?.title as string | undefined)
                                || (p.props?.label as string | undefined)
                                || (p.fieldItem?.label as string | undefined),
                        ),
                        position: (fp.tabPosition as string | undefined) || 'top',
                        defaultTab: (fp.defaultTab as number | undefined) ?? 0,
                    },
                    cssClasses: node.cssClasses ?? [],
                    style: node.style,
                    accessibility: node.accessibility,
                    children: pages,
                };
                return (
                    <>
                        {orphans.map((child) => (
                            <FormspecNode key={child.id} node={child} />
                        ))}
                        <LayoutNodeInner node={tabsNode} />
                    </>
                );
            }
        }
    }

    // Resolve component: user override → built-in → fallback substitution → DefaultLayout
    const componentName = node.component;
    const exact = components.layout?.[componentName];
    const builtin = !exact ? BUILTIN_LAYOUT[componentName] : undefined;
    const fallbackName = (!exact && !builtin) ? FALLBACK_MAP[componentName] : undefined;
    const Component: React.ComponentType<LayoutComponentProps> =
        exact ??
        builtin ??
        (fallbackName ? (components.layout?.[fallbackName] ?? BUILTIN_LAYOUT[fallbackName]) : undefined) ??
        DefaultLayout;

    return (
        <Component node={node}>
            {node.children.map((child) => (
                <FormspecNode key={child.id} node={child} />
            ))}
        </Component>
    );
}

/**
 * Deep-clone a LayoutNode tree, rewriting `bindPath` from template `[0]` to `[instanceIdx]`.
 * E.g., `members[0].memberName` -> `members[1].memberName`
 */
function rewriteBindPaths(node: LayoutNode, repeatPath: string, instanceIdx: number): LayoutNode {
    const templatePrefix = `${repeatPath}[0]`;
    const instancePrefix = `${repeatPath}[${instanceIdx}]`;

    const rewritten: LayoutNode = { ...node };

    if (rewritten.bindPath?.startsWith(templatePrefix)) {
        rewritten.bindPath = instancePrefix + rewritten.bindPath.slice(templatePrefix.length);
    }

    // Stable key per instance
    rewritten.id = `${node.id}-${instanceIdx}`;

    if (node.children.length > 0) {
        rewritten.children = node.children.map((child) =>
            rewriteBindPaths(child, repeatPath, instanceIdx),
        );
    }

    return rewritten;
}
