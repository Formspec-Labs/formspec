/** @filedesc Counts the live evaluated instances and findings once for form progress consumers. */
import { validationResultIdentity, type EvaluatedFormState, type ValidationResult } from '@formspec-org/types';
import { placementCovers, placementKey, type PageSequenceEntry } from './page-sequence.js';
import { readValidationSummaryRows, type ValidationSummaryRow, type ValidationSummarySource } from './validation-summary.js';

export interface ProgressCounts {
    total: number;
    filled: number;
    prefilled: number;
    missing: number;
    missingReadonly: number;
    /** Null when validation was unavailable for this snapshot. */
    toFix: number | null;
    toCheck: number | null;
    valid: number | null;
    required: number;
    requiredFilled: number;
}

export interface ProgressFinding {
    identity: string;
    sectionId?: string;
    /** Whether this finding has no place in the rendered form. */
    formLevel: boolean;
    result: ValidationResult;
}

export interface FormProgressSummary {
    form: ProgressCounts & { ready: boolean | null };
    sections: Array<{ id?: string; counts: ProgressCounts; filled: boolean }>;
    findings: ProgressFinding[];
}

type Ownership = Map<string, Array<{ placement: string; section: number }>>;

function addPlacements(owners: Ownership, paths: readonly string[], section: number): void {
    for (const placement of paths) {
        const key = placementKey(placement);
        const entries = owners.get(key);
        const entry = { placement, section };
        if (entries) entries.push(entry);
        else owners.set(key, [entry]);
    }
}

function owner(owners: Ownership, path: string): number | undefined {
    return owners.get(placementKey(path))?.find(({ placement }) => placementCovers(placement, path))?.section;
}

function freshCounts(reportAvailable: boolean): ProgressCounts {
    return {
        total: 0, filled: 0, prefilled: 0, missing: 0, missingReadonly: 0, toFix: reportAvailable ? 0 : null,
        toCheck: reportAvailable ? 0 : null, valid: reportAvailable ? 0 : null, required: 0,
        requiredFilled: 0,
    };
}

function groupOwner(owners: Ownership, path: string): number | undefined {
    let candidate = path;
    while (candidate) {
        const direct = owner(owners, candidate);
        if (direct !== undefined) return direct;
        const parent = candidate.replace(/(?:\[\d+\]|\.?[^.[\]]+)$/, '');
        if (parent === candidate) return undefined;
        candidate = parent;
    }
    return undefined;
}

function countField(
    counts: ProgressCounts, field: EvaluatedFormState['fields'][number], hasError: boolean,
): void {
    if (field.required) {
        counts.required++;
        if (field.empty) {
            counts.missing++;
            if (field.readonly) counts.missingReadonly++;
        } else {
            counts.requiredFilled++;
        }
    }
    if (field.readonly) {
        if (!field.empty) counts.prefilled++;
        return;
    }
    counts.total++;
    if (!field.empty) counts.filled++;
    if (!hasError && counts.valid !== null) counts.valid++;
}

/** Core §5.3.1 reports both the original warning and the action needed to resolve it. */
function progressResults(results: readonly ValidationResult[]): readonly ValidationResult[] {
    const instances = new Set<string>();
    const groups = new Set<string>();
    for (const result of results) {
        if (result.constraintKind !== 'explanation' || result.severity !== 'error') continue;
        if (result.shapeId) {
            instances.add(JSON.stringify([result.shapeId, result.path]));
        } else if (result.context && 'code' in result.context && typeof result.context.code === 'string') {
            groups.add(result.context.code);
        }
    }
    if (!instances.size && !groups.size) return results;
    return results.filter(result => {
        if (result.severity !== 'warning' || result.constraintKind !== 'shape' || result.source === 'external') return true;
        if (result.code && groups.has(result.code)) return false;
        return !instances.has(JSON.stringify([result.shapeId, result.path]));
    });
}

export function summarizeFormProgress(
    sectionPlan: readonly PageSequenceEntry[], state: EvaluatedFormState,
): FormProgressSummary {
    const fieldOwners: Ownership = new Map();
    const groupOwners: Ownership = new Map();
    const hasReport = state.report !== null;
    const form = freshCounts(hasReport);
    const sections = sectionPlan.map(({ id, fields, groups }, index) => {
        addPlacements(fieldOwners, fields, index);
        addPlacements(groupOwners, groups, index);
        return { id, counts: freshCounts(hasReport), filled: false };
    });

    const relevant = new Map(state.fields.filter(field => field.relevant).map(field => [field.path, field]));
    const errorPaths = new Set<string>();
    const findings: ProgressFinding[] = [];
    const seen = new Set<string>();
    for (const result of progressResults(state.report?.results ?? [])) {
        const { path, severity } = result;
        if (severity === 'error') errorPaths.add(path);
        const field = relevant.get(path);
        const fieldSection = field ? owner(fieldOwners, path) : undefined;
        const section = fieldSection ?? groupOwner(groupOwners, path);
        const identity = validationResultIdentity(result);
        if (seen.has(identity)) continue;
        seen.add(identity);
        findings.push({ identity, sectionId: section === undefined ? undefined : sections[section].id,
            formLevel: section === undefined, result });
        if (severity !== 'error' && severity !== 'warning') continue;
        if (severity === 'error' && result.constraintKind === 'required' && field?.required && field.empty) continue;
        const counter = severity === 'error' ? 'toFix' : 'toCheck';
        form[counter] = (form[counter] ?? 0) + 1;
        if (section !== undefined) {
            const counts = sections[section].counts;
            counts[counter] = (counts[counter] ?? 0) + 1;
        }
    }

    for (const [path, field] of relevant) {
        const hasError = errorPaths.has(path);
        countField(form, field, hasError);
        const section = owner(fieldOwners, path);
        if (section !== undefined) countField(sections[section].counts, field, hasError);
    }
    const ready = form.missing > 0 ? false : (state.report === null ? null : state.report.valid);
    for (const section of sections) {
        section.filled = section.counts.filled === section.counts.total;
    }

    return { form: { ...form, ready }, sections, findings };
}

export function pageProgressIssue(counts: ProgressCounts): 'required' | 'unavailable' | 'invalid' | 'empty' | 'blocked-readonly' | undefined {
    if (counts.missing > counts.missingReadonly) return 'required';
    if (counts.toFix === null) return 'unavailable';
    if (counts.toFix) return 'invalid';
    if (counts.filled < counts.total) return 'empty';
    if (counts.missingReadonly) return 'blocked-readonly';
    return undefined;
}

export interface ProgressFindingRow extends ValidationSummaryRow {
    sectionId?: string;
    code?: string;
    /** The concrete report path, including for findings without a rendered owner. */
    resultPath: string;
}

export function readFormProgressFindingRows(
    summary: FormProgressSummary,
    source: Pick<ValidationSummarySource, 'message' | 'field' | 'jumpable' | 'chrome'>,
): ProgressFindingRow[] {
    const byIdentity = new Map(summary.findings.map(finding => [finding.identity, finding]));
    const rows = readValidationSummaryRows(
        { source: 'live', showFieldErrors: true, jumpLinks: true, dedupe: false },
        { ...source, submitted: null, touched: true, live: () => summary.findings.map(finding => finding.result) },
        {
            showFieldErrorsByDefault: true,
            path: result => byIdentity.get(validationResultIdentity(result))?.formLevel ? '' : result.path,
        },
    );
    return rows.map(row => {
        const { sectionId, result } = byIdentity.get(row.identity)!;
        return { ...row, sectionId, code: result.code, resultPath: result.path };
    });
}
