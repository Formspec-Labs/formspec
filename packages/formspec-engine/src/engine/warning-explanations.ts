/** @filedesc Draft warning answers and review groups built from the Rust Submit findings. */
import type { Explanation, GroupedAcknowledgement, InstanceExplanation } from '@formspec-org/types';
import type { EvalResult } from '../diff.js';
import { cloneValue, deepEqual } from '../json-values.js';

type Pending<T> = Omit<T, 'author' | 'recorded'> & { author?: never; recorded?: never };

/** A new answer acquires its author and timestamp when the server saves the draft. */
export type DraftExplanation = Explanation | Pending<InstanceExplanation> | Pending<GroupedAcknowledgement>;
export type ExplanationKey = { shapeId: string; path: string } | { code: string; partyRef?: string };
export type ExplanationFinding = {
    shapeId: string;
    path: string;
    code: string;
    inputs: Record<string, string>;
} & ({ mode: 'confirm' | 'explain'; basis: string } | { mode: 'acknowledge'; groupBasis: string });

export function isStamped(entry: DraftExplanation): entry is Explanation {
    return entry.author !== undefined && entry.recorded !== undefined;
}

export function stripExplanationStamp(entry: DraftExplanation): DraftExplanation {
    const copy = cloneValue(entry) as Record<string, unknown>;
    delete copy.author;
    delete copy.recorded;
    return copy as DraftExplanation;
}

export function matchesEntry(entry: DraftExplanation, key: ExplanationKey): boolean {
    return 'shapeId' in key
        ? 'shapeId' in entry && entry.shapeId === key.shapeId && entry.path === key.path
        : 'group' in entry && entry.code === key.code && entry.partyRef === key.partyRef;
}

export function sameAnswer(entry: DraftExplanation, other: DraftExplanation): boolean {
    if (!matchesEntry(entry, other) || other.basis !== entry.basis) return false;
    if ('group' in entry) return 'group' in other && deepEqual(other.paths, entry.paths);
    return 'shapeId' in other && other.text === entry.text;
}

export function warningReview(resultFacts: EvalResult, entries: DraftExplanation[]) {
    const findings = resultFacts.explanationFindings ?? [];
    const byCode = new Map<string, Set<string>>();
    const basisByCode = new Map<string, string>();
    const shapeIdsByCode = new Map<string, Set<string>>();
    const identity = (id: string, path: string) => JSON.stringify([id, path]);
    const instanceText = new Map<string, string | undefined>();
    const storedPaths = new Map<string, Set<string>>();
    for (const entry of entries) {
        if ('group' in entry) {
            const paths = storedPaths.get(entry.code) ?? new Set<string>();
            for (const path of entry.paths) paths.add(path);
            storedPaths.set(entry.code, paths);
        } else instanceText.set(identity(entry.shapeId, entry.path), entry.text);
    }
    const errors = new Set<string>();
    const groupErrors = new Set<string>();
    const messages = new Map<string, string>();
    for (const result of resultFacts.validations) {
        if (result.constraintKind === 'explanation' && result.severity === 'error') {
            if (result.shapeId) errors.add(identity(result.shapeId, result.path));
            else {
                const code = (result.context as { code?: string } | undefined)?.code;
                if (code) groupErrors.add(code);
            }
        } else if (result.constraintKind === 'shape' && result.shapeId && typeof result.message === 'string') {
            messages.set(identity(result.shapeId, result.path), result.message);
        }
    }
    const instances = findings.flatMap(finding => {
        if (finding.mode === 'acknowledge') {
            const paths = byCode.get(finding.code) ?? new Set<string>();
            paths.add(finding.path);
            byCode.set(finding.code, paths);
            basisByCode.set(finding.code, finding.groupBasis);
            const shapeIds = shapeIdsByCode.get(finding.code) ?? new Set<string>();
            shapeIds.add(finding.shapeId);
            shapeIdsByCode.set(finding.code, shapeIds);
            return [];
        }
        const key = identity(finding.shapeId, finding.path);
        return [{ ...finding, current: !errors.has(key), text: instanceText.get(key), message: messages.get(key) ?? '' }];
    });
    const groups = [...byCode].map(([code, currentPaths]) => {
        const stored = storedPaths.get(code) ?? new Set<string>();
        // ResolvedItemPath and the root marker have an ASCII alphabet.
        const paths = [...currentPaths].sort();
        const shapeIds = [...(shapeIdsByCode.get(code) ?? [])].sort();
        return {
            code, basis: basisByCode.get(code) ?? '', shapeIds, paths, current: !groupErrors.has(code),
            added: paths.filter(path => !stored.has(path)),
            removed: [...stored].filter(path => !currentPaths.has(path)).sort(),
        };
    });
    const candidateEntries = resultFacts.candidateExplanations ?? [];
    const pendingStamps = candidateEntries.some(entry => !isStamped(entry));
    return cloneValue({ findings, groups, instances, entries, candidateEntries, pendingStamps });
}
export type ExplanationState = ReturnType<typeof warningReview>;
