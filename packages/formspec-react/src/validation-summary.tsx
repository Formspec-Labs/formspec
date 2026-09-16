'use client';

/** @filedesc ValidationSummary — the shared summary rows, each a link to its field, in the default look. */
import React, { useRef, useEffect, useMemo } from 'react';
import {
    readValidationSummaryRows,
    type ValidationSummaryComp,
    type ValidationSummaryRow,
    type ValidationSummarySource,
} from '@formspec-org/layout';
import type { ValidationResult } from '@formspec-org/types';
import { useFormspecContext } from './context';
import { useChromeText } from './use-chrome-text';
import { useHeadingLevel } from './heading-level';
import { useSignal } from './use-signal';
import { focusFieldIn } from './use-focus-field';

export interface ValidationSummaryProps {
    /**
     * The component's own props (component spec `ValidationSummary`: `source`, `mode`, `showFieldErrors`,
     * `jumpLinks`, `dedupe`), as the planner carries them. This is how a placed ValidationSummary renders.
     */
    comp?: ValidationSummaryComp;
    /** Findings to list when `source` is `submit` and no form submit is being read — a host's own results. */
    results?: Array<{ path: string; message: string; severity: string }>;
    /**
     * `live` reads the engine's validation as it changes; `submit` reads the latest submit through the
     * provider, or the `results` prop. Default: `submit`. `comp.source` outranks this.
     */
    source?: 'live' | 'submit';
    /** Which severities to render. Default: ['error', 'warning']. */
    severityFilter?: string[];
    /** Whether to auto-focus the summary when errors appear. Default: true. */
    autoFocus?: boolean;
    /** Optional className override for the container. */
    className?: string;
}

/**
 * The validation summary in the default look: a heading with the count, then every finding as a link to
 * its field. Which findings, in what words, and where each links are the shared reader's
 * (`@formspec-org/layout`) — the same rows the web component's adapters draw — fed from this provider's
 * engine, its latest submit and its touch gate. Jumping lands the focus the way the renderer's own field
 * focus does: disclosures opened, hidden tab or wizard step revealed.
 */
export function ValidationSummary({
    comp,
    results: resultsProp,
    source: sourceProp = 'submit',
    severityFilter = ['error', 'warning'],
    autoFocus = true,
    className,
}: ValidationSummaryProps) {
    const { engine, touchedVersion, latestSubmit } = useFormspecContext();
    const chrome = useChromeText();
    const Heading = `h${useHeadingLevel()}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    const containerRef = useRef<HTMLDivElement>(null);

    // Reading the signals here re-renders on every change they carry: touch, submit, live validation.
    const touched = useSignal(touchedVersion) > 0;
    const submitted = useSignal(latestSubmit);
    useSignal(engine.structureVersion);

    const rows = useMemo(() => {
        const effective: ValidationSummaryComp = comp ?? {
            source: sourceProp,
            // The standalone `live` mode has always shown the live report at once, before any touch.
            mode: 'continuous',
            showFieldErrors: true,
            jumpLinks: true,
        };
        const own = resultsProp ? resultsProp as unknown as ValidationResult[] : null;
        const readerSource: ValidationSummarySource = {
            submitted: own ?? submitted?.validationReport?.results ?? (submitted ? [] : null),
            touched: comp ? touched : true,
            live: () => engine.getValidationReport({ profile: 'live' }).results,
            message: (result) => (own ? result.message : engine.resolveValidationMessage(result)) ?? '',
            field: (path) => {
                const vm = engine.getFieldVM(path);
                return vm ? { label: vm.label.value, controlId: vm.id || null } : null;
            },
            chrome,
        };
        return readValidationSummaryRows(effective, readerSource, { showFieldErrorsByDefault: true })
            .filter((row) => severityFilter.includes(row.severity));
    }, [comp, sourceProp, resultsProp, submitted, touched, engine, chrome, severityFilter]);

    const errors = rows.filter((r) => r.severity === 'error');
    const warnings = rows.filter((r) => r.severity !== 'error');
    const hasErrors = errors.length > 0;
    const hasWarnings = warnings.length > 0;

    // Auto-focus the summary container when errors appear
    useEffect(() => {
        if (autoFocus && hasErrors && containerRef.current) {
            containerRef.current.focus();
        }
    }, [autoFocus, hasErrors]);

    if (!hasErrors && !hasWarnings) return null;

    const summaryClassName = className
        ? `formspec-validation-summary formspec-validation-summary--visible ${className}`
        : 'formspec-validation-summary formspec-validation-summary--visible';
    const headerText = hasErrors
        ? chrome(errors.length === 1 ? 'validationSummary.fixOne' : 'validationSummary.fixMany', { count: errors.length })
        : chrome(warnings.length === 1 ? 'validationSummary.reviewOne' : 'validationSummary.reviewMany', { count: warnings.length });

    const jump = (row: ValidationSummaryRow) => (event: React.MouseEvent) => {
        event.preventDefault();
        const scope = containerRef.current?.closest<HTMLElement>('.formspec-theme-scope') ?? document.body;
        if (row.jumpPath) focusFieldIn(scope, row.jumpPath);
    };

    const renderRows = (items: ValidationSummaryRow[]) => (
        <>
            {items.map((r, i) => {
                const severityIcon = r.severity === 'warning' ? '!' : r.severity === 'info' ? 'i' : '✕';
                return (
                    <div key={i} className={`formspec-shape-${r.severity || 'error'}`}>
                        <span className="formspec-shape-icon" aria-hidden="true">{severityIcon}</span>
                        {r.jumpHref ? (
                            <a href={r.jumpHref} className="formspec-validation-summary-link" onClick={jump(r)}>
                                {r.text}
                            </a>
                        ) : (
                            <span>{r.text}</span>
                        )}
                    </div>
                );
            })}
        </>
    );

    // role="alert" when errors are present (assertive), role="status" for warnings-only (polite)
    const containerRole = hasErrors ? 'alert' : 'status';

    return (
        <div
            ref={containerRef}
            tabIndex={-1}
            role={containerRole}
            className={summaryClassName}
        >
            <Heading className="formspec-validation-summary-title">{headerText}</Heading>
            {renderRows(errors)}
            {renderRows(warnings)}
        </div>
    );
}
