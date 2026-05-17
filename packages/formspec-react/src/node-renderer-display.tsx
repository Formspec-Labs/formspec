'use client';

/** @filedesc Display-category LayoutNode rendering (Text, DataTable, Summary, etc.). */
import React, { useCallback, useState } from 'react';
import { signal as createSignal } from '@preact/signals-core';
import type { LayoutNode } from '@formspec-org/layout';
import type { FormItem } from '@formspec-org/types';
import { useFormspecContext, findItemByKey } from './context.js';
import { useSignal } from './use-signal';
import { useRepeatCount } from './use-repeat-count';
import { ValidationSummary } from './validation-summary';

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
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
            const trimmed = url.trim().toLowerCase();
            if (
                trimmed.startsWith('javascript:') ||
                trimmed.startsWith('data:') ||
                trimmed.startsWith('vbscript:')
            ) {
                return `<span>${linkText}</span>`;
            }
            return `<a href="${url}">${linkText}</a>`;
        })
        .replace(/\n/g, '<br>');
}

const NO_VALUE = createSignal(null);
const NO_READONLY = createSignal(false);

/** Renders a display node — checks for user override before built-in rendering. */
export function DisplayNode({ node }: { node: LayoutNode }) {
    const { components } = useFormspecContext();
    const text = (node.props?.text as string) || node.fieldItem?.label || '';

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
            return <Tag className={cssClass || 'formspec-heading'} style={style}>{text}</Tag>;
        }

        case 'Divider':
            return <hr className={cssClass || 'formspec-divider'} style={style} />;

        case 'Alert': {
            const severity = (node.props?.severity as string) || 'info';
            const alertRole = severity === 'error' || severity === 'warning' ? 'alert' : 'status';
            const dismissible = node.props?.dismissible === true;
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

function SummaryDisplay({
    node: _node,
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

function BoundText({ bind }: { bind: string }) {
    const { engine } = useFormspecContext();
    const sig = engine.signals[bind] ?? NO_VALUE;
    const rawValue = useSignal(sig);
    return <>{rawValue != null ? String(rawValue) : ''}</>;
}

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

function formatMoney(value: unknown, locale = 'en-US'): string {
    if (value == null) return '\u2014';
    if (typeof value === 'object' && value !== null && 'amount' in value) {
        const money = value as { amount: unknown; currency?: string };
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: money.currency || 'USD',
            }).format(Number(money.amount));
        } catch {
            return String(money.amount);
        }
    }
    return String(value);
}

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

type DataTableColumn = {
    header: string;
    bind: string;
    type?: string;
    choices?: Array<{ value: string; label: string }>;
    editable?: boolean;
    currency?: string;
    min?: number;
    max?: number;
    step?: number;
};

function DataTableCell({
    signalPath,
    column,
    fieldDef,
    defaultCurrency,
}: {
    signalPath: string;
    column: DataTableColumn;
    fieldDef?: FormItem;
    defaultCurrency: string;
}) {
    const { engine } = useFormspecContext();
    const rawValue = useSignal(engine.signals[signalPath] ?? NO_VALUE);
    const readonly = useSignal(engine.readonlySignals[signalPath] ?? NO_READONLY);

    const isEditable = column.editable !== false;
    const dataType = fieldDef?.dataType || column.type;
    const optionSetEntry = fieldDef?.optionSet
        ? engine.getDefinition()?.optionSets?.[fieldDef.optionSet]
        : undefined;
    const optionSetChoices = optionSetEntry && typeof optionSetEntry === 'object' && 'options' in optionSetEntry
        ? (optionSetEntry as { options?: Array<{ value: string; label: string }> }).options
        : Array.isArray(optionSetEntry)
            ? optionSetEntry as Array<{ value: string; label: string }>
            : undefined;
    const choices = column.choices ?? optionSetChoices ?? fieldDef?.options ?? [];
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
        let displayValue = rawValue != null ? String(rawValue) : '';
        if (dataType === 'money' && rawValue != null && typeof rawValue === 'object') {
            try {
                const money = rawValue as { amount?: unknown; currency?: string };
                displayValue = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: money.currency || fieldDef?.currency || column.currency || defaultCurrency,
                }).format(Number(money.amount ?? rawValue));
            } catch { /* fall through */ }
        } else if ((dataType === 'choice' || dataType === 'select') && choices.length > 0) {
            const match = choices.find((c) => c.value === rawValue);
            if (match) displayValue = match.label;
        }
        return <td>{displayValue}</td>;
    }

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
                    value={rawValue != null ? String(rawValue) : ''}
                    aria-label={column.header}
                    disabled={readonly}
                    onChange={(e) => engine.setValue(signalPath, e.target.value || null)}
                >
                    <option value=""></option>
                    {choices.map((c) => (
                        <option key={c.value} value={c.value}>{c.label ?? c.value}</option>
                    ))}
                </select>,
            )}</td>
        );
    }

    if (dataType === 'number' || dataType === 'integer' || dataType === 'decimal' || dataType === 'money') {
        const moneyValue = rawValue != null && typeof rawValue === 'object' && 'amount' in (rawValue as object)
            ? (rawValue as { amount?: string | number }).amount
            : undefined;
        const numericDisplay = moneyValue ?? (typeof rawValue === 'number' || typeof rawValue === 'string' ? rawValue : '');
        return (
            <td>{wrapControl(
                <input
                    className="formspec-datatable-input"
                    name={signalPath}
                    type="number"
                    step={column.step != null ? String(column.step) : (dataType === 'integer' ? '1' : 'any')}
                    min={column.min != null ? String(column.min) : undefined}
                    max={column.max != null ? String(column.max) : undefined}
                    value={numericDisplay}
                    aria-label={column.header}
                    disabled={readonly}
                    onChange={(e) => {
                        const value = e.target.value.trim();
                        if (!value) {
                            engine.setValue(signalPath, null);
                            return;
                        }
                        const parsed = dataType === 'integer' ? Number.parseInt(value, 10) : Number.parseFloat(value);
                        let next: number | null = Number.isFinite(parsed) ? parsed : null;
                        if (typeof next === 'number') {
                            if (column.min != null && next < column.min) next = column.min;
                            if (column.max != null && next > column.max) next = column.max;
                        }
                        if (dataType === 'money' && next != null) {
                            engine.setValue(signalPath, {
                                amount: next,
                                currency: fieldDef?.currency || column.currency || defaultCurrency,
                            });
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
                    value={rawValue != null ? String(rawValue) : ''}
                    aria-label={column.header}
                    disabled={readonly}
                    onChange={(e) => engine.setValue(signalPath, e.target.value)}
                />,
            )}</td>
        );
    }

    return (
        <td>{wrapControl(
            <input
                className="formspec-datatable-input"
                name={signalPath}
                type="text"
                value={rawValue != null ? String(rawValue) : ''}
                aria-label={column.header}
                disabled={readonly}
                onChange={(e) => engine.setValue(signalPath, e.target.value)}
            />,
        )}</td>
    );
}

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
    const columns = (node.props?.columns as DataTableColumn[]) || [];
    const allowAdd = node.props?.allowAdd === true;
    const allowRemove = node.props?.allowRemove === true;
    const showRowNumbers = node.props?.showRowNumbers === true;
    const groupItem = bindKey ? findItemByKey(engine.getDefinition().items ?? [], bindKey) : null;
    const fieldByKey = new Map<string, FormItem>();
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
                    <caption>{node.props?.title as string}</caption>
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

function ValidationSummaryDisplay() {
    const { engine, touchedVersion } = useFormspecContext();
    const touched = useSignal(touchedVersion);
    useSignal(engine.structureVersion);

    if (touched === 0) {
        return null;
    }

    const report = engine.getValidationReport({ mode: 'continuous' });
    const results = report.results.map((r) => ({
        path: r.path || '',
        message: r.message || 'Validation error',
        severity: r.severity || 'error',
    }));
    return <ValidationSummary results={results} autoFocus={false} />;
}
