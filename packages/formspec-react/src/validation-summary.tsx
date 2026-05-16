'use client';

/** @filedesc ValidationSummary — displays validation results with jump-to-field links. */
import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';

export interface ValidationSummaryProps {
    /** Validation results for 'submit' source mode (from engine.getValidationReport()). */
    results?: Array<{ path: string; message: string; severity: string }>;
    /**
     * 'live' — subscribe to engine validation signals and re-render on every change.
     * 'submit' — show results from the `results` prop only (existing behavior).
     * Default: 'submit'.
     */
    source?: 'live' | 'submit';
    /** Which severities to render. Default: ['error', 'warning']. */
    severityFilter?: string[];
    /** Whether to auto-focus the summary when results appear. Default: true. */
    autoFocus?: boolean;
    /** Optional className override for the container. */
    className?: string;
}

interface ResolvedResult {
    path: string;
    message: string;
    severity: string;
    label: string;
    fieldId: string;
}

function resolveResults(
    raw: Array<{ path: string; message: string; severity: string }>,
    engine: ReturnType<typeof useFormspecContext>['engine'],
): ResolvedResult[] {
    return raw.map(r => {
        try {
            const vm = engine.getFieldVM(r.path);
            return { ...r, label: vm?.label.value || r.path, fieldId: vm?.id || '' };
        } catch {
            return { ...r, label: r.path, fieldId: '' };
        }
    });
}

function deduplicateResults(results: ResolvedResult[]): ResolvedResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
        const key = `${r.severity}|${r.path}|${r.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Renders a validation error/warning summary with clickable jump links.
 * Resolves field paths to human-readable labels and field element IDs
 * via the FormEngine's FieldViewModels.
 *
 * When source='live', subscribes to engine.structureVersion so the summary
 * re-renders on any form state change without requiring a submit.
 */
export function ValidationSummary({
    results: resultsProp = [],
    source = 'submit',
    severityFilter = ['error', 'warning'],
    autoFocus = true,
    className,
}: ValidationSummaryProps) {
    const { engine } = useFormspecContext();
    const containerRef = useRef<HTMLDivElement>(null);

    // Subscribe to structureVersion in live mode — reading the signal here
    // causes React to re-render whenever form state changes.
    const structureVersion = useSignal(engine.structureVersion);

    const rawResults = useMemo(() => {
        if (source === 'live') {
            // structureVersion consumed above ensures this memo re-runs on changes
            void structureVersion;
            return engine.getValidationReport({ mode: 'continuous' }).results as Array<{
                path: string;
                message: string;
                severity: string;
            }>;
        }
        return resultsProp;
    }, [source, structureVersion, resultsProp, engine]);

    const filtered = useMemo(
        () => rawResults.filter(r => severityFilter.includes(r.severity)),
        [rawResults, severityFilter],
    );

    const deduped = useMemo(() => deduplicateResults(resolveResults(filtered, engine)), [filtered, engine]);

    const errors = useMemo(() => deduped.filter(r => r.severity === 'error'), [deduped]);
    const warnings = useMemo(() => deduped.filter(r => r.severity === 'warning'), [deduped]);
    const hasErrors = errors.length > 0;
    const hasWarnings = warnings.length > 0;
    const summaryClassName = className
        ? `formspec-validation-summary formspec-validation-summary--visible ${className}`
        : 'formspec-validation-summary formspec-validation-summary--visible';
    const headerText = hasErrors
        ? (errors.length === 1
            ? 'Please fix this error before continuing:'
            : `Please fix these ${errors.length} errors before continuing:`)
        : (warnings.length === 1
            ? 'Please review this warning before continuing:'
            : `Please review these ${warnings.length} warnings before continuing:`);

    // Auto-focus the summary container when errors appear
    useEffect(() => {
        if (autoFocus && hasErrors && containerRef.current) {
            containerRef.current.focus();
        }
    }, [autoFocus, hasErrors]);

    const handleJump = useCallback((fieldId: string) => {
        const el = document.getElementById(fieldId);
        if (!el) return;

        // Expand any collapsed <details> ancestors so the field is visible
        let ancestor: HTMLElement | null = el.parentElement;
        while (ancestor) {
            if (ancestor.tagName === 'DETAILS' && !(ancestor as HTMLDetailsElement).open) {
                (ancestor as HTMLDetailsElement).open = true;
            }
            ancestor = ancestor.parentElement;
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Focus the first focusable input inside the field container, or the element itself
        const focusTarget = el.querySelector<HTMLElement>('input, select, textarea, button') ?? el;
        focusTarget.focus({ preventScroll: true });
    }, []);

    if (!hasErrors && !hasWarnings) return null;

    // role="alert" when errors are present (assertive), role="status" for warnings-only (polite)
    const containerRole = hasErrors ? 'alert' : 'status';

    const renderRows = (items: ResolvedResult[]) => (
        <>
            {items.map((r, i) => {
                const severityClass = `formspec-shape-${r.severity || 'error'}`;
                const severityIcon = r.severity === 'warning' ? '!' : r.severity === 'info' ? 'i' : '✕';
                const content = `${r.label}: ${r.message}`;
                return (
                    <div key={i} className={severityClass}>
                        <span className="formspec-shape-icon" aria-hidden="true">{severityIcon}</span>
                        {r.fieldId ? (
                            <button
                                type="button"
                                className="formspec-validation-summary-link"
                                onClick={() => handleJump(r.fieldId)}
                            >
                                {content}
                            </button>
                        ) : (
                            <span>{content}</span>
                        )}
                    </div>
                );
            })}
        </>
    );

    return (
        <div
            ref={containerRef}
            tabIndex={-1}
            role={containerRole}
            className={summaryClassName}
        >
            <h2 className="formspec-validation-summary-title">{headerText}</h2>
            {renderRows(errors)}
            {renderRows(warnings)}
        </div>
    );
}
