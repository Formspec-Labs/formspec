'use client';

/** @filedesc ValidationSummary — the shared summary rows, each a link to its field, in the default look. */
import React, { useRef, useEffect, useMemo, useContext } from 'react';
import { computed } from '@preact/signals-core';
import {
    dedupeSeverityPrefix,
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
import { WorkspaceFieldJump } from './workspace';
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
    const workspaceJump = useContext(WorkspaceFieldJump);
    const Heading = `h${useHeadingLevel()}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    const containerRef = useRef<HTMLDivElement>(null);

    // Reading the signals here re-renders on every change they carry: touch, submit, live validation, explanations.
    const touched = useSignal(touchedVersion) > 0;
    const submitted = useSignal(latestSubmit);
    useSignal(engine.structureVersion);
    const explanationState = useSignal(useMemo(
        () => computed(() => {
            if (typeof engine.getExplanationState !== 'function') return null;
            const liveHasWarn = Object.values(engine.shapeResults ?? {}).some(s => s.value.some(r => r.severity === 'warning'));
            const submitHasWarn = submitted?.validationReport?.results?.some(r => r.severity === 'warning' || r.constraintKind === 'explanation') ?? false;
            if (!liveHasWarn && !submitHasWarn) return null;
            return engine.getExplanationState();
        }),
        [engine, submitted],
    ));

    const { rows, explainedSet } = useMemo(() => {
        const effective: ValidationSummaryComp = comp ?? {
            source: sourceProp,
            // The standalone `live` mode has always shown the live report at once, before any touch.
            mode: 'continuous',
            showFieldErrors: true,
            jumpLinks: true,
        };
        const own = resultsProp ? resultsProp as unknown as ValidationResult[] : null;
        const liveResults = () => engine.getValidationReport({ profile: 'live' }).results;
        const explainedInstances = new Set<string>();
        const explainedGroups = new Set<string>();
        for (const inst of explanationState?.instances ?? []) {
            if (inst.current) explainedInstances.add(JSON.stringify([inst.shapeId, inst.path]));
        }
        for (const grp of explanationState?.groups ?? []) {
            if (grp.current) explainedGroups.add(grp.code);
        }
        const rawSourceResults = (effective.source ?? 'live') === 'submit'
            ? (own ?? submitted?.validationReport?.results ?? (submitted ? [] : null)) ?? []
            : liveResults();
        const explainedIdentities = new Set<string>();
        for (const res of rawSourceResults) {
            if (res.severity !== 'warning' || res.source === 'external') continue;
            if (
                (res.shapeId && explainedInstances.has(JSON.stringify([res.shapeId, res.path])))
                || (res.code && explainedGroups.has(res.code))
            ) {
                explainedIdentities.add(`${res.severity}|${res.path}|${(own ? res.message : engine.resolveValidationMessage(res)) ?? ''}`);
            }
        }
        const readerSource: ValidationSummarySource = {
            submitted: own ?? submitted?.validationReport?.results ?? (submitted ? [] : null),
            touched: comp ? touched : true,
            live: liveResults,
            message: (result) => (own ? result.message : engine.resolveValidationMessage(result)) ?? '',
            field: (path) => {
                const vm = engine.getFieldVM(path);
                return vm ? { label: vm.label.value, controlId: vm.id || null } : null;
            },
            chrome,
        };
        const built = readValidationSummaryRows(effective, readerSource, { showFieldErrorsByDefault: true })
            .filter((row) => severityFilter.includes(row.severity));
        return { rows: built, explainedSet: explainedIdentities };
    }, [comp, sourceProp, resultsProp, submitted, touched, engine, chrome, severityFilter, explanationState]);

    const errors = rows.filter((r) => r.severity === 'error');
    const warnings = rows.filter((r) => r.severity !== 'error');
    const unresolvedWarnings = warnings.filter((r) => !explainedSet.has(`${r.severity}|${r.path}|${r.message}`));
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
    const warningHeaderCount = unresolvedWarnings.length > 0 ? unresolvedWarnings.length : warnings.length;
    const headerText = hasErrors
        ? chrome(errors.length === 1 ? 'validationSummary.fixOne' : 'validationSummary.fixMany', { count: errors.length })
        : chrome(warningHeaderCount === 1 ? 'validationSummary.reviewOne' : 'validationSummary.reviewMany', { count: warningHeaderCount });

    const jump = (row: ValidationSummaryRow) => (event: React.MouseEvent) => {
        event.preventDefault();
        const scope = containerRef.current?.closest<HTMLElement>('.formspec-theme-scope') ?? document.body;
        if (!row.jumpPath) return;
        if (workspaceJump) workspaceJump(row.jumpPath);
        else focusFieldIn(scope, row.jumpPath);
    };

    const renderRows = (items: ValidationSummaryRow[]) => (
        <>
            {items.map((r, i) => {
                const explained = r.severity === 'warning' && explainedSet.has(`${r.severity}|${r.path}|${r.message}`);
                const severityIcon = explained ? '✓' : r.severity === 'warning' ? '!' : r.severity === 'info' ? 'i' : '✕';
                const displayText = dedupeSeverityPrefix(r.text);
                return (
                    <div
                        key={i}
                        className={`formspec-shape-${r.severity || 'error'}`}
                        data-explained={explained ? 'true' : undefined}
                    >
                        <span className="formspec-shape-icon" aria-hidden="true">{severityIcon}</span>
                        {r.jumpHref ? (
                            <a href={r.jumpHref} className="formspec-validation-summary-link" onClick={jump(r)}>
                                {displayText}
                            </a>
                        ) : (
                            <span>{displayText}</span>
                        )}
                        {explained && <span className="formspec-workspace__finding-status">Explained</span>}
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
