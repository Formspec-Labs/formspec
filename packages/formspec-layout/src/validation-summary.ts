/** @filedesc ValidationSummary rows every renderer draws: which results show, deduped, worded as the field shows them, linked to their control. */
import type { ValidationResult } from '@formspec-org/types';
import type { ChromeStringKey } from './ui-strings';

/** The ValidationSummary component's own props (component spec), as the planner carries them. */
export interface ValidationSummaryComp {
    /** `live` reads the engine's validation as it changes; `submit` reads the latest submit's findings. */
    source?: 'live' | 'submit';
    /** With `source: live`: `continuous` shows as soon as anything is touched, `submit` waits for a submit. */
    mode?: 'continuous' | 'submit';
    /** Whether field-level findings join the form-level (shape) ones. Each renderer has its own default. */
    showFieldErrors?: boolean;
    /** Whether each field row links to its field. */
    jumpLinks?: boolean;
    /** Whether one finding repeated for a field shows once. Default true. */
    dedupe?: boolean;
}

/**
 * What a summary reads from the form it sits in. Each renderer supplies this from its own engine, signals
 * and DOM; nothing here is DOM, so the same rows come out of the web component, its adapters and React.
 */
export interface ValidationSummarySource {
    /** Findings of the latest submit; null before the first submit. */
    submitted: ValidationResult[] | null;
    /** Whether the respondent has touched anything — what opens a `continuous` summary before a submit. */
    touched: boolean;
    /** The live validation report's findings. */
    live(): ValidationResult[];
    /** The message the field itself shows for a finding (the engine's Locale validation-message cascade). */
    message(result: ValidationResult): string;
    /**
     * The field a path names, in the words the field shows: its live label (Locale-resolved, `{{}}`
     * interpolated) and its control's id — the id a fragment link lands on. Null when no field has the path.
     */
    field(path: string): { label: string; controlId: string | null } | null;
    /** Whether a jump to this field can land now — a renderer's own probe. Absent, a field that exists can. */
    jumpable?(path: string): boolean;
    /** Renderer chrome (`$ui.<key>`), in the active Locale. */
    chrome(key: ChromeStringKey, params?: Record<string, string | number>): string;
}

export interface ValidationSummaryRow {
    severity: string;
    /** The path the finding names; empty for a form-level finding. */
    path: string;
    formLevel: boolean;
    /** The message the field itself shows. */
    message: string;
    /** The field's live label; null for a form-level finding. */
    label: string | null;
    /** The row as the Locale writes it (`$ui.validationSummary.row`), or the message alone for a form-level finding. */
    text: string;
    /** The field a row jumps to, when the component asks for jump links and the target can take the jump. */
    jumpPath: string | null;
    /**
     * `#<control id>` — the row is a link to a place on the page, which is what a screen reader calls it and
     * what a `<button>` cannot flow as; null when the field has no control to name.
     */
    jumpHref: string | null;
}

/** The path a finding names: its source when it has one, else its path. */
export function validationResultPath(result: ValidationResult): string {
    const raw = result.sourceId || result.path || '';
    return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * The rows a ValidationSummary shows now. Empty while the component's gate is closed (`mode: "submit"`
 * before a submit, `continuous` before a submit or a touch). `showFieldErrorsByDefault` is the renderer's
 * default for a component that does not say: the default look lists field findings, USWDS lists only
 * form-level ones unless asked, as its reference pattern does.
 */
export function readValidationSummaryRows(
    comp: ValidationSummaryComp,
    source: ValidationSummarySource,
    options: { showFieldErrorsByDefault: boolean },
): ValidationSummaryRow[] {
    let results: ValidationResult[];
    if ((comp.source ?? 'live') === 'submit') {
        results = source.submitted ?? [];
    } else {
        const mode = comp.mode ?? 'continuous';
        const gateOpen = source.submitted !== null || (mode !== 'submit' && source.touched);
        if (!gateOpen) return [];
        results = mode === 'submit' ? source.submitted ?? [] : source.live();
    }

    const showFieldErrors = options.showFieldErrorsByDefault
        ? comp.showFieldErrors !== false
        : comp.showFieldErrors === true;
    const jumpLinks = comp.jumpLinks === true;
    const seen = new Set<string>();
    const rows: ValidationSummaryRow[] = [];
    for (const result of results) {
        if (!showFieldErrors && result.source !== 'shape' && result.constraintKind !== 'shape') continue;
        const rawPath = validationResultPath(result);
        const formLevel = rawPath === '' || rawPath === '#';
        const path = formLevel ? '' : rawPath;
        const severity = result.severity || 'error';
        const message = source.message(result) || 'Validation error';
        if (comp.dedupe !== false) {
            const key = `${severity}|${path}|${message}`;
            if (seen.has(key)) continue;
            seen.add(key);
        }
        const field = formLevel ? null : source.field(path);
        const label = field?.label ?? (formLevel ? null : path.replace(/\[\d+\]/g, ''));
        const canJump = jumpLinks && !formLevel && (source.jumpable ? source.jumpable(path) : field !== null);
        rows.push({
            severity,
            path,
            formLevel,
            message,
            label,
            text: label === null ? message : source.chrome('validationSummary.row', { label, message }),
            jumpPath: canJump ? path : null,
            jumpHref: canJump && field?.controlId ? `#${field.controlId}` : null,
        });
    }
    return rows;
}
