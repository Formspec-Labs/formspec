/** @filedesc ValidationSummary rows every adapter draws: which results show, deduped, in the words the field shows. */
import type { ValidationResult } from '@formspec-org/types';
import type { DisplayHostSlice } from './display-host';

export interface ValidationSummaryRow {
    severity: string;
    /** The message the field itself shows for this result (the engine's Locale validation-message cascade). */
    message: string;
    /** `Label: message`, or the message alone for a form-level result. */
    labeled: string;
    /** The field a row links to, when the component asks for jump links and the target can take focus. */
    jumpPath: string | null;
}

/**
 * The rows a ValidationSummary shows now, reading the signals that change them — call it inside the render
 * effect. Empty while the component's gate is closed (`mode: "submit"` before a submit, `continuous` before a
 * submit or a wizard step). `showFieldErrors` defaults per adapter: the default render lists field results,
 * USWDS's lists only form-level ones unless asked, as its reference pattern does.
 */
export function readValidationSummaryRows(
    host: DisplayHostSlice,
    comp: any,
    showFieldErrorsByDefault: boolean,
): ValidationSummaryRow[] {
    const detail = host.latestSubmitDetailSignal.value;
    const submitted = (): ValidationResult[] => {
        const fromReport = detail?.validationReport?.results;
        const fromResponse = detail?.response?.validationResults;
        return Array.isArray(fromReport) ? fromReport : Array.isArray(fromResponse) ? fromResponse : [];
    };

    let results: ValidationResult[];
    if ((comp.source || 'live') === 'submit') {
        results = submitted();
    } else {
        const mode = comp.mode || 'continuous';
        const gateOpen = detail !== null || (mode !== 'submit' && host.touchedVersion.value > 0);
        if (!gateOpen) return [];
        if (mode === 'submit') {
            results = submitted();
        } else {
            host.engine.structureVersion.value;
            results = host.engine.getValidationReport({ profile: 'live' }).results;
        }
    }

    const showFieldErrors = showFieldErrorsByDefault ? comp.showFieldErrors !== false : comp.showFieldErrors === true;
    const jumpLinks = comp.jumpLinks === true;
    const seen = new Set<string>();
    const rows: ValidationSummaryRow[] = [];
    for (const result of results) {
        if (!showFieldErrors && result.source !== 'shape' && result.constraintKind !== 'shape') continue;
        const target = host.resolveValidationTarget(result);
        const severity = result.severity || 'error';
        const message = host.engine.resolveValidationMessage(result) || 'Validation error';
        if (comp.dedupe !== false) {
            const key = `${severity}|${target.path || result.path || ''}|${message}`;
            if (seen.has(key)) continue;
            seen.add(key);
        }
        rows.push({
            severity,
            message,
            labeled: target.formLevel ? message : `${target.label}: ${message}`,
            jumpPath: jumpLinks && target.jumpable ? target.path : null,
        });
    }
    return rows;
}
