/** @filedesc Shared view model for grouped blank-answer warning acknowledgements. */
import { UI_STRINGS, fillUiParams, type ChromeStringKey } from './ui-strings.js';

export interface WarningAcknowledgementGroupInput {
    code: string;
    basis?: string;
    shapeIds?: readonly string[];
    paths: readonly string[];
    current: boolean;
    added: readonly string[];
    removed: readonly string[];
}

export interface WarningAcknowledgementStateInput {
    groups?: readonly WarningAcknowledgementGroupInput[];
    entries?: readonly unknown[];
}

export interface WarningAcknowledgementSource {
    /** Return the live field/group label and control id for a path, or null if absent. */
    field(path: string): { label: string; controlId: string | null } | null;
    /** Label used when a grouped acknowledgement covers the root `#` path. */
    rootLabel(): string;
    /** Resolve a scoped Locale string key (e.g. `$shape.<id>.explanationPrompt`) with FEL interpolation. */
    resolveText(key: string, fallback: string): string;
    /** Raw Locale lookup for `$ui.<ChromeStringKey>` templates without FEL interpolation. */
    lookupUi?(key: ChromeStringKey): string | null | undefined;
    /** Optional renderer jumpability check; defaults to `field(path) !== null`. */
    jumpable?(path: string): boolean;
    /** Optional custom link target (e.g. a Surface form route/section URL) for a field path. */
    hrefForPath?(path: string): string | null;
}

export interface WarningAcknowledgementItem {
    path: string;
    label: string;
    jumpPath: string | null;
    jumpHref: string | null;
}

export interface WarningAcknowledgementGroupView {
    code: string;
    basis?: string;
    legend: string;
    items: WarningAcknowledgementItem[];
    hasChanges: boolean;
    added: WarningAcknowledgementItem[];
    removed: Array<{ path: string; label: string }>;
    addedText: string | null;
    removedText: string | null;
    current: boolean;
    buttonLabel: string;
}

function hasStoredGroupEntry(entries: readonly unknown[] | undefined, code: string): boolean {
    if (!entries) return false;
    return entries.some(
        (entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            'group' in entry &&
            (entry as { group?: unknown; code?: unknown }).group === true &&
            (entry as { code?: unknown }).code === code,
    );
}

function describePath(path: string, source: WarningAcknowledgementSource): WarningAcknowledgementItem {
    if (path === '#') {
        return { path, label: source.rootLabel(), jumpPath: null, jumpHref: null };
    }
    const field = source.field(path);
    const label = field?.label || path;
    const canJump = source.jumpable ? source.jumpable(path) : field !== null;
    const customHref = canJump && source.hrefForPath ? source.hrefForPath(path) : null;
    return {
        path,
        label,
        jumpPath: canJump ? path : null,
        jumpHref: canJump ? (customHref ?? (field?.controlId ? `#${field.controlId}` : null)) : null,
    };
}

function unansweredQuestions(count: number): string {
    return count === 1 ? '1 unanswered question' : `${count} unanswered questions`;
}

/** A group's heading: the first authored `explanationPrompt` among its Shapes, else how many questions it covers. */
export function warningAcknowledgementLegend(
    group: Pick<WarningAcknowledgementGroupInput, 'shapeIds' | 'paths'>,
    resolveText: WarningAcknowledgementSource['resolveText'],
): string {
    for (const shapeId of group.shapeIds ?? []) {
        const resolved = resolveText(`$shape.${shapeId}.explanationPrompt`, '');
        if (resolved) return resolved;
    }
    return unansweredQuestions(group.paths.length);
}

/**
 * Build the renderer-agnostic grouped acknowledgement panels for the current Submit state.
 */
export function readWarningAcknowledgementGroups(
    state: WarningAcknowledgementStateInput,
    source: WarningAcknowledgementSource,
): WarningAcknowledgementGroupView[] {
    const groups = state.groups ?? [];
    if (groups.length === 0) return [];
    const rowTemplate = source.lookupUi?.('validationSummary.row') ?? UI_STRINGS['validationSummary.row'];
    return groups.map((group) => {
        const noun = unansweredQuestions(group.paths.length);
        const legend = warningAcknowledgementLegend(group, source.resolveText);
        const items = group.paths.map((path) => describePath(path, source));
        const hasChanges = !group.current && hasStoredGroupEntry(state.entries, group.code);
        const added = hasChanges ? group.added.map((path) => describePath(path, source)) : [];
        const removed = hasChanges
            ? group.removed.map((path) => {
                const info = describePath(path, source);
                return { path, label: info.label };
            })
            : [];
        const addedText = added.length > 0
            ? fillUiParams(rowTemplate, {
                label: 'Newly unanswered',
                message: added.map((item) => item.label).join(', '),
            })
            : null;
        const removedText = removed.length > 0
            ? fillUiParams(rowTemplate, {
                label: 'Now answered',
                message: removed.map((item) => item.label).join(', '),
            })
            : null;
        const buttonLabel = group.current ? `Accepted ${noun}` : `Accept ${noun}`;
        return {
            code: group.code,
            ...(group.basis !== undefined ? { basis: group.basis } : {}),
            legend,
            items,
            hasChanges,
            added,
            removed,
            addedText,
            removedText,
            current: group.current,
            buttonLabel,
        };
    });
}
