/** @filedesc Counts the live evaluated instances, findings and owed warning follow-ups once for progress consumers. */
import { validationResultIdentity, type EvaluatedFormState, type FormDefinition, type ValidationResult } from '@formspec-org/types';
import { placementCovers, placementKey, type PageSequenceEntry } from './page-sequence.js';
import { readValidationSummaryRows, summaryRowWording, type ValidationSummaryRow, type ValidationSummarySource } from './validation-summary.js';

export interface ProgressCounts {
    total: number;
    filled: number;
    prefilled: number;
    missing: number;
    missingReadonly: number;
    /** Null when validation was unavailable for this snapshot. */
    toFix: number | null;
    /** Unexplained warnings plus owed follow-ups. */
    toCheck: number | null;
    /** Owed warning explanations and group acknowledgements; each is also one of `toCheck`. */
    followUps: number;
    valid: number | null;
    required: number;
    requiredFilled: number;
}

/**
 * One warning answer the respondent still owes (Core §5.3.1): an instance explanation or a group
 * acknowledgement that is missing or stale. A group is answered once for the whole form, so it has no section.
 */
export type ProgressFollowUp = { sectionId?: string; formLevel: boolean } & FollowUpBody;

type FollowUpBody =
    | { kind: 'instance'; shapeId: string; path: string }
    | { kind: 'group'; code: string; paths: readonly string[] };

export interface ProgressFinding {
    identity: string;
    sectionId?: string;
    /** Whether this finding has no place in the rendered form. */
    formLevel: boolean;
    /** True when the respondent has recorded a current explanation or group acknowledgement for this warning. */
    explained?: boolean;
    /** True when this finding represents a blank required field (`constraintKind === 'required'`). */
    missingRequired?: boolean;
    /** True when this blank required finding has not yet been touched/submitted and is deferred from `toFix`. */
    untouchedRequired?: boolean;
    result: ValidationResult;
}

export interface SummarizeFormProgressOptions {
    /**
     * Paths whose blank-required errors have been surfaced (e.g. individually touched by the user,
     * or `'all'` after submit/check). When omitted, blank-required errors stay in `counts.missing`
     * and are tagged `untouchedRequired: true` instead of incrementing `toFix`.
     */
    surfacedRequiredPaths?: ReadonlySet<string> | 'all';
}

/** The engine's explanation state (`IFormEngine.getExplanationState()`): every Submit warning that asks for an answer. */
export interface ExplanationStateLike {
    instances: readonly { shapeId: string; path: string; current: boolean }[];
    /** A group covers the firings it names; another Shape's warning that shares the code is not covered. */
    groups: readonly { code: string; shapeIds: readonly string[]; paths: readonly string[]; current: boolean }[];
}

export interface FormProgressSummary {
    form: ProgressCounts & { ready: boolean | null };
    sections: Array<{ id?: string; counts: ProgressCounts; filled: boolean }>;
    /** Results counted by their own severity. Explanation errors and paired warnings are in `followUps`. */
    findings: ProgressFinding[];
    followUps: ProgressFollowUp[];
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
    const entries = owners.get(placementKey(path));
    if (!entries) return undefined;
    const exact = entries.find(({ placement }) => placementCovers(placement, path));
    if (exact !== undefined) return exact.section;
    if (path === placementKey(path) && entries.length === 1) return entries[0].section;
    return undefined;
}

function freshCounts(reportAvailable: boolean): ProgressCounts {
    return {
        total: 0, filled: 0, prefilled: 0, missing: 0, missingReadonly: 0, toFix: reportAvailable ? 0 : null,
        toCheck: reportAvailable ? 0 : null, followUps: 0, valid: reportAvailable ? 0 : null, required: 0,
        requiredFilled: 0,
    };
}

function groupOwner(owners: Ownership, path: string): number | undefined {
    let candidate = path;
    while (candidate) {
        const direct = owner(owners, candidate);
        if (direct !== undefined) return direct;
        const parent = candidate.replace(/(?:\[(?:\d+|\*)\]|\.?[^.[\]]+)$/, '');
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

/** Warning answers by [shapeId, path], and group answers by code with the firings they cover. */
interface WarningAnswers {
    instances: Set<string>;
    /** `null` when only a report error names the group and the state lacks it, so its code is all that is known. */
    groups: Map<string, { shapeIds: ReadonlySet<string>; paths: ReadonlySet<string> } | null>;
}

const instanceKey = (shapeId: string, path: string) => JSON.stringify([shapeId, path]);

/** The answer a Core §5.3.1 explanation error asks for; the Submit report carries it beside the warning. */
function explanationErrorFollowUp(result: ValidationResult): FollowUpBody | undefined {
    if (result.constraintKind !== 'explanation' || result.severity !== 'error') return undefined;
    if (result.shapeId) return { kind: 'instance', shapeId: result.shapeId, path: result.path };
    const code = result.context && 'code' in result.context ? result.context.code : undefined;
    return typeof code === 'string' ? { kind: 'group', code, paths: [] } : undefined;
}

/** Whether an answer covers this warning firing: its own instance, or a group naming its code, Shape and path. */
function answersWarning(answers: WarningAnswers, result: ValidationResult): boolean {
    if (result.severity !== 'warning' || result.constraintKind !== 'shape' || result.source === 'external') return false;
    if (result.shapeId && answers.instances.has(instanceKey(result.shapeId, result.path))) return true;
    const group = result.code === undefined ? undefined : answers.groups.get(result.code);
    if (group === undefined) return false;
    return group === null || (result.shapeId !== undefined && group.shapeIds.has(result.shapeId) && group.paths.has(result.path));
}

/**
 * Split the warning answers into owed and current. The explanation state names both in every validation
 * profile; a Submit report also names each owed one as an explanation error. Either way it is one answer.
 */
function readWarningAnswers(results: readonly ValidationResult[], explanationState: ExplanationStateLike | null) {
    const owed = new Map<string, FollowUpBody>();
    const owedAnswers: WarningAnswers = { instances: new Set(), groups: new Map() };
    const currentAnswers: WarningAnswers = { instances: new Set(), groups: new Map() };
    const stateGroups = new Map<string, { paths: readonly string[]; coverage: { shapeIds: ReadonlySet<string>; paths: ReadonlySet<string> } }>();
    for (const { shapeId, path, current } of explanationState?.instances ?? []) {
        const key = instanceKey(shapeId, path);
        (current ? currentAnswers : owedAnswers).instances.add(key);
        if (!current) owed.set(`instance:${key}`, { kind: 'instance', shapeId, path });
    }
    for (const { code, shapeIds, paths, current } of explanationState?.groups ?? []) {
        const coverage = { shapeIds: new Set(shapeIds), paths: new Set(paths) };
        stateGroups.set(code, { paths, coverage });
        (current ? currentAnswers : owedAnswers).groups.set(code, coverage);
        if (!current) owed.set(`group:${code}`, { kind: 'group', code, paths: [...paths] });
    }
    for (const result of results) {
        const followUp = explanationErrorFollowUp(result);
        if (followUp?.kind === 'instance') {
            const key = instanceKey(followUp.shapeId, followUp.path);
            if (owed.has(`instance:${key}`)) continue;
            owed.set(`instance:${key}`, followUp);
            owedAnswers.instances.add(key);
        } else if (followUp?.kind === 'group' && !owed.has(`group:${followUp.code}`)) {
            // The state may read a later clock and call the group current; its coverage still holds.
            const known = stateGroups.get(followUp.code);
            owed.set(`group:${followUp.code}`, { ...followUp, paths: [...(known?.paths ?? [])] });
            owedAnswers.groups.set(followUp.code, known?.coverage ?? null);
        }
    }
    return { owed: [...owed.values()], owedAnswers, currentAnswers };
}

/** Whether a warning Shape asks for an answer (Core §5.2.1), which only the explanation state reports outside Submit. */
export function declaresWarningFollowUps({ shapes, warningExplanation }: Pick<FormDefinition, 'shapes' | 'warningExplanation'>): boolean {
    return (shapes ?? []).some(shape =>
        shape.severity === 'warning' && (shape.explanation ?? warningExplanation ?? 'none') !== 'none');
}

/**
 * Count one evaluation for progress. `explanationState` is the engine's explanation state, or `null` where
 * no warning asks for an answer: without it an answered follow-up is counted again as its warnings.
 */
export function summarizeFormProgress(
    sectionPlan: readonly PageSequenceEntry[],
    state: EvaluatedFormState,
    explanationState: ExplanationStateLike | null,
    options?: SummarizeFormProgressOptions,
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

    const surfacedRequired = options?.surfacedRequiredPaths;
    const results = state.report?.results ?? [];
    const { owed, owedAnswers, currentAnswers } = readWarningAnswers(results, explanationState);
    const relevant = new Map(state.fields.filter(field => field.relevant).map(field => [field.path, field]));
    const errorPaths = new Set<string>();
    const findings: ProgressFinding[] = [];
    const seen = new Set<string>();
    for (const result of results) {
        // Counted once below as the follow-up the respondent owes.
        if (explanationErrorFollowUp(result) || answersWarning(owedAnswers, result)) continue;
        const { path, severity } = result;
        if (severity === 'error') errorPaths.add(path);
        const field = relevant.get(path);
        const fieldSection = owner(fieldOwners, path);
        const section = fieldSection ?? groupOwner(groupOwners, path);
        const identity = validationResultIdentity(result);
        if (seen.has(identity)) continue;
        seen.add(identity);
        const isExplained = answersWarning(currentAnswers, result);
        const isMissingRequired = severity === 'error'
            && result.constraintKind === 'required'
            && Boolean(field?.required && field.empty);
        const isUntouchedRequired = isMissingRequired && !(
            surfacedRequired === 'all' || surfacedRequired?.has(path)
        );
        findings.push({
            identity,
            sectionId: section === undefined ? undefined : sections[section].id,
            formLevel: section === undefined,
            ...(isExplained ? { explained: true } : {}),
            ...(isMissingRequired ? { missingRequired: true } : {}),
            ...(isUntouchedRequired ? { untouchedRequired: true } : {}),
            result,
        });
        if (severity !== 'error' && severity !== 'warning') continue;
        if (isExplained) continue;
        if (isUntouchedRequired) continue;
        const counter = severity === 'error' ? 'toFix' : 'toCheck';
        form[counter] = (form[counter] ?? 0) + 1;
        if (section !== undefined) {
            const counts = sections[section].counts;
            counts[counter] = (counts[counter] ?? 0) + 1;
        }
    }

    const followUps: ProgressFollowUp[] = [];
    for (const body of owed) {
        const section = body.kind === 'instance'
            ? owner(fieldOwners, body.path) ?? groupOwner(groupOwners, body.path)
            : undefined;
        const sectionId = section === undefined ? undefined : sections[section].id;
        followUps.push({ ...body, ...(sectionId === undefined ? {} : { sectionId }), formLevel: section === undefined });
        for (const counts of section === undefined ? [form] : [form, sections[section].counts]) {
            counts.followUps++;
            if (counts.toCheck !== null) counts.toCheck++;
        }
    }

    for (const [path, field] of relevant) {
        const hasError = errorPaths.has(path);
        countField(form, field, hasError);
        const section = owner(fieldOwners, path);
        if (section !== undefined) countField(sections[section].counts, field, hasError);
    }
    const ready = form.missing > 0 || form.followUps > 0 ? false : (state.report === null ? null : state.report.valid);
    for (const section of sections) {
        section.filled = section.counts.filled === section.counts.total;
    }

    return { form: { ...form, ready }, sections, findings, followUps };
}

export function pageProgressIssue(counts: ProgressCounts): 'required' | 'unavailable' | 'invalid' | 'empty' | 'blocked-readonly' | undefined {
    if (counts.missing > counts.missingReadonly) return 'required';
    if (counts.toFix === null) return 'unavailable';
    // An owed follow-up blocks Submit like an error, though it is counted to check.
    if (counts.toFix || counts.followUps) return 'invalid';
    if (counts.filled < counts.total) return 'empty';
    if (counts.missingReadonly) return 'blocked-readonly';
    return undefined;
}

export interface ProgressFindingRow extends ValidationSummaryRow {
    sectionId?: string;
    code?: string;
    explained?: boolean;
    missingRequired?: boolean;
    untouchedRequired?: boolean;
    /** The concrete report path, including for findings without a rendered owner. */
    resultPath: string;
    /** Set on the row for an owed follow-up. A host may link a group to the control that answers it. */
    followUp?: ProgressFollowUp;
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
        const { sectionId, explained, missingRequired, untouchedRequired, result } = byIdentity.get(row.identity)!;
        return {
            ...row,
            sectionId,
            code: result.code,
            ...(explained ? { explained: true } : {}),
            ...(missingRequired ? { missingRequired: true } : {}),
            ...(untouchedRequired ? { untouchedRequired: true } : {}),
            resultPath: result.path,
        };
    });
}

/** One row per owed follow-up, worded like a finding row; `message` words the warning or the group. */
export function readFormProgressFollowUpRows(
    summary: FormProgressSummary,
    source: Pick<ValidationSummarySource, 'field' | 'jumpable' | 'chrome'> & { message(followUp: ProgressFollowUp): string },
): ProgressFindingRow[] {
    return summary.followUps.map(followUp => {
        const resultPath = followUp.kind === 'instance' ? followUp.path : '#';
        const path = followUp.formLevel ? '' : resultPath;
        const message = source.message(followUp);
        return {
            identity: JSON.stringify(followUp.kind === 'instance'
                ? ['follow-up', followUp.shapeId, followUp.path] : ['follow-up', followUp.code]),
            severity: 'warning',
            path,
            formLevel: followUp.formLevel,
            message,
            ...summaryRowWording(source, path, message, true),
            ...(followUp.sectionId === undefined ? {} : { sectionId: followUp.sectionId }),
            ...(followUp.kind === 'group' ? { code: followUp.code } : {}),
            resultPath,
            followUp,
        };
    });
}
