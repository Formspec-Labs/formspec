'use client';

/** @filedesc Section navigation, question search and live findings for Core workspace mode. */
import React, { createContext, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { computed } from '@preact/signals-core';
import {
    placementCovers, placementKey, readFormProgressFindingRows, readFormProgressFollowUpRows,
    stripSeverityPrefix, summarizeFormProgress, warningAcknowledgementLegend, type LayoutNode, type ProgressFollowUp,
} from '@formspec-org/layout';
import type { IFormEngine } from '@formspec-org/engine';
import { useFormspecContext } from './context';
import { FormspecNode, renderActionGroupedChildren } from './node-renderer';
import type { WorkspacePage } from '@formspec-org/layout';
import { useChromeText } from './use-chrome-text';
import { scrollTargetIntoView, syncStickyOffsetVar, useFocusField } from './use-focus-field';
import { useSignal } from './use-signal';
import { HeadingLevelContext, useHeadingLevel } from './heading-level';
import { plannedTitle } from './use-localized-node';
import { WarningExplanations } from './warning-explanations';

export const WorkspaceFieldJump = createContext<((path: string) => void) | null>(null);

const LEADING_QUESTION_CODE = /^(?:\d+\.\d+[a-z]?(?:[.):\s]|$)|\d+[a-z]?[.):]\s|[A-Z]\.\d+[a-z]?(?:[.):\s]|$)|[A-Z]{2,}\s+\d+)/;

interface StaticItemMeta {
    label?: string;
    description?: string;
    hint?: string;
}

function collectStaticItemMeta(
    items: readonly Record<string, unknown>[] | undefined,
    prefix = '',
    out = new Map<string, StaticItemMeta>(),
): Map<string, StaticItemMeta> {
    if (!Array.isArray(items)) return out;
    for (const item of items) {
        const key = typeof item.key === 'string' ? item.key : '';
        if (!key) continue;
        const path = prefix ? `${prefix}.${key}` : key;
        const label = typeof item.label === 'string' ? item.label : undefined;
        const description = typeof item.description === 'string' ? item.description : undefined;
        const hint = typeof item.hint === 'string' ? item.hint : undefined;
        if (label || description || hint) {
            out.set(path, { label, description, hint });
        }
        if (Array.isArray(item.children)) {
            collectStaticItemMeta(item.children as readonly Record<string, unknown>[], path, out);
        }
    }
    return out;
}

function stripTrailingSegment(path: string): string {
    const parent = path.replace(/(?:\[(?:\d+|\*)\]|\.?[^.[\]]+)$/, '');
    return parent === path ? '' : parent;
}

function cleanLabel(raw: string): string {
    return raw.trimEnd().replace(/:+$/, '').trim();
}

function truncateContextLabel(label: string, maxLen = 68): string {
    if (label.length <= maxLen) return label;
    const cut = label.slice(0, maxLen - 1);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function collectAncestorGroupPaths(path: string): string[] {
    const ancestors: string[] = [];
    const seenKeys = new Set<string>();
    let candidate = stripTrailingSegment(path);
    while (candidate) {
        const normalized = placementKey(candidate);
        if (!seenKeys.has(normalized)) {
            seenKeys.add(normalized);
            ancestors.push(candidate);
        }
        candidate = stripTrailingSegment(candidate);
    }
    return ancestors;
}

function isWorkspacePageRelevant(page: WorkspacePage, engine: IFormEngine): boolean {
    const signals = engine.relevantSignals;
    if (!signals) return true;
    if (page.titleBind && signals[page.titleBind]?.value === false) return false;
    if (page.content.bindPath && signals[page.content.bindPath]?.value === false) return false;
    const children = page.content.children ?? [];
    if (children.length > 0 && children.every(child => Boolean(child.bindPath) && signals[child.bindPath!]?.value === false)) {
        return false;
    }
    return true;
}

function indexPlacements(sections: readonly WorkspacePage[]) {
    const index = new Map<string, Array<{ path: string; section: WorkspacePage }>>();
    for (const section of sections) {
        for (const path of [...section.fields, ...(section.groups ?? [])]) {
            const key = placementKey(path);
            const placements = index.get(key) ?? [];
            placements.push({ path, section });
            index.set(key, placements);
        }
    }
    return index;
}

/** A primary click without modifiers: the page follows it; any other keeps the browser's link behaviour. */
function isPlainClick(event: React.MouseEvent): boolean {
    return !event.defaultPrevented && event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function repeatContext(engine: IFormEngine, path: string, chrome: ReturnType<typeof useChromeText>) {
    return Array.from(path.matchAll(/\[(\d+)\]/g), match => {
        const group = path.slice(0, match.index);
        return chrome('repeat.row', {
            label: engine.getItemLabelSignal(group)?.value || group.split('.').pop()!,
            index: Number(match[1]) + 1,
        });
    }).join(' / ');
}

function useSectionTitle(
    title: string | undefined,
    report: ((title: string | undefined) => void) | undefined,
    updateDocumentTitle: boolean | undefined,
) {
    const baseTitle = useRef('');
    useLayoutEffect(() => {
        if (report) return () => report(undefined);
        if (!updateDocumentTitle) return;
        baseTitle.current = document.title;
        return () => { document.title = baseTitle.current; };
    }, [report, updateDocumentTitle]);
    useLayoutEffect(() => {
        if (report) report(title);
        else if (updateDocumentTitle) document.title = title ? [title, baseTitle.current].filter(Boolean).join(' – ') : baseTitle.current;
    }, [report, title, updateDocumentTitle]);
}

export function Workspace({ root, pages: allPages }: { root: LayoutNode; pages: WorkspacePage[] }) {
    const {
        engine, workspaceNavigation, touchField, touchedVersion, isTouched, latestSubmit, registerFieldJump,
        explanationState: explanationStateSignal,
    } = useFormspecContext();
    const chrome = useChromeText();
    const formTitle = useSignal(useMemo(() => engine.getFormVM(), [engine]).title);
    const pages = useSignal(useMemo(() => computed(() => {
        const filtered = allPages.filter(page => isWorkspacePageRelevant(page, engine));
        return filtered.length > 0 ? filtered : allPages;
    }), [allPages, engine]));
    const [localSection, setLocalSection] = useState<string>();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const controlled = workspaceNavigation && 'activeSection' in workspaceNavigation;
    const selected = controlled ? workspaceNavigation.activeSection : localSection;
    const [query, setQuery] = useState('');
    const [notice, setNotice] = useState('');
    // `explanation`: the Shape whose explanation control beside the field takes focus, when it is shown.
    const [jump, setJump] = useState<{ path: string; section: WorkspacePage; explanation?: string }>();
    const heading = useRef<HTMLHeadingElement>(null);
    const findingsAsideRef = useRef<HTMLElement>(null);
    const findingsHeadingRef = useRef<HTMLHeadingElement>(null);
    const { focusField, containerRef } = useFocusField();
    const level = useHeadingLevel();
    const Heading = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    const searchId = useId();
    const searchLabelId = useId();
    const searchResultsId = useId();
    const searchStatusId = useId();
    const findingsHeading = useId();
    const navBodyId = useId();

    const navigationActive = workspaceNavigation?.sectionNavigationActive !== false;
    const activeIndex = Math.max(0, pages.findIndex(page => page.id === selected));
    const active = pages[activeIndex];
    useLayoutEffect(() => {
        if (controlled) setLocalSection(active?.id);
    }, [controlled, active?.id]);
    useEffect(() => {
        const update = () => { syncStickyOffsetVar(containerRef.current); };
        update();
        if (typeof window === 'undefined') return;
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [containerRef]);

    const activeContent = useMemo(() => active && <FormspecNode key={active.content.id} node={active.content} />, [active]);
    const titles = useSignal(useMemo(() => computed(() => {
        engine.localeSignal.value;
        return pages.map((page, index) => plannedTitle(engine, page)
            || page.title || (page.id ? chrome('wizard.stepTitle', { index: index + 1 }) : formTitle || chrome('wizard.steps')));
    }), [engine, pages, chrome, formTitle]));
    useSectionTitle(active?.id ? titles[activeIndex] : undefined,
        workspaceNavigation?.onSectionTitleChange, workspaceNavigation?.updateDocumentTitle);

    const snapshot = useSignal(useMemo(() => computed(() => engine.getEvaluatedFormState()), [engine]));
    const touchedTick = useSignal(touchedVersion);
    const submitted = useSignal(latestSubmit);
    // The live report omits Submit-timing Shapes, so what the respondent owes comes from the explanation
    // state the provider reads once typing pauses (and at once for an answer or a Submit).
    const explanationState = useSignal(explanationStateSignal);
    // Answer edits refresh the snapshot. Search only needs to revisit membership when relevant paths change.
    const relevantPaths = useMemo(() => snapshot.fields.filter(field => field.relevant).map(field => field.path).join('\n'), [snapshot]);
    const relevant = useMemo(() => new Set(relevantPaths ? relevantPaths.split('\n') : []), [relevantPaths]);
    const surfacedRequiredPaths = useMemo<ReadonlySet<string> | 'all'>(() => {
        if (submitted !== null) return 'all';
        void touchedTick;
        const set = new Set<string>();
        for (const path of relevant) {
            if (isTouched(path)) set.add(path);
        }
        return set;
    }, [submitted, touchedTick, relevant, isTouched]);
    const progress = useMemo(
        () => summarizeFormProgress(pages, snapshot, explanationState, { surfacedRequiredPaths }),
        [pages, snapshot, explanationState, surfacedRequiredPaths],
    );
    const placements = useMemo(() => indexPlacements(pages), [pages]);
    const resolvePage = useCallback((path: string) => {
        const lookup = (target: string) => {
            const entries = placements.get(placementKey(target));
            if (!entries) return undefined;
            const covered = entries.find(placement => placementCovers(placement.path, target));
            if (covered) return covered.section;
            if (target === placementKey(target) && entries.length === 1) return entries[0].section;
            return undefined;
        };
        const direct = lookup(path);
        if (direct) return direct;
        let candidate = stripTrailingSegment(path);
        while (candidate) {
            const ancestorSection = lookup(candidate);
            if (ancestorSection) return ancestorSection;
            candidate = stripTrailingSegment(candidate);
        }
        return undefined;
    }, [placements]);

    const staticItemMeta = useMemo(
        () => collectStaticItemMeta(engine.getDefinition?.()?.items as readonly Record<string, unknown>[] | undefined),
        [engine],
    );
    const sectionPaths = useMemo(
        () => new Set(pages.flatMap(page => [page.titleBind, page.id].filter((x): x is string => Boolean(x)))),
        [pages],
    );
    const getGroupLabel = useCallback((path: string): string => {
        const direct = engine.getItemLabelSignal(path)?.value
            ?? engine.getItemLabelSignal(placementKey(path))?.value
            ?? staticItemMeta.get(placementKey(path))?.label;
        return direct ? cleanLabel(direct) : '';
    }, [engine, staticItemMeta]);
    const hasContainerLabel = useCallback((path: string) => Boolean(getGroupLabel(path)), [getGroupLabel]);
    const contextualizeLeafLabel = useCallback((path: string, rawLeafLabel: string): string => {
        const leafLabel = cleanLabel(rawLeafLabel);
        if (!leafLabel || LEADING_QUESTION_CODE.test(leafLabel)) return leafLabel;
        for (const ancestor of collectAncestorGroupPaths(path)) {
            const normalizedAncestor = placementKey(ancestor);
            if (sectionPaths.has(ancestor) || sectionPaths.has(normalizedAncestor)) continue;
            const parentLabel = getGroupLabel(ancestor);
            if (!parentLabel) continue;
            if (leafLabel.toLowerCase().startsWith(parentLabel.toLowerCase())) return leafLabel;
            return `${truncateContextLabel(parentLabel)} — ${leafLabel}`;
        }
        return leafLabel;
    }, [sectionPaths, getGroupLabel]);

    const field = (path: string) => {
        const vm = engine.getFieldVM(path);
        if (vm) return { label: contextualizeLeafLabel(path, vm.label.value), controlId: vm.id || null };
        const groupLabel = getGroupLabel(path);
        return groupLabel ? { label: groupLabel, controlId: null } : null;
    };
    const jumpable = (path: string) => (relevant.has(path) || hasContainerLabel(path)) && resolvePage(path) !== undefined;
    const followUpMessage = (followUp: ProgressFollowUp) => {
        const resolveText = (key: string, fallback: string) => engine.resolveLocaleString(key, fallback);
        if (followUp.kind === 'group') {
            return warningAcknowledgementLegend(
                explanationState?.groups.find(group => group.code === followUp.code) ?? followUp, resolveText);
        }
        const owed = explanationState?.instances.find(({ shapeId, path }) => shapeId === followUp.shapeId && path === followUp.path);
        return engine.resolveLocaleString(`$shape.${followUp.shapeId}.message`, owed?.message ?? '', followUp.path);
    };
    const rawFindings = [
        ...readFormProgressFindingRows(progress, {
            field, chrome, jumpable, message: result => engine.resolveValidationMessage(result) ?? '',
        }),
        ...readFormProgressFollowUpRows(progress, { field, chrome, jumpable, message: followUpMessage }),
    ];
    const { activeFindings, untouchedRequiredItems } = useMemo(() => {
        const activeRows: typeof rawFindings = [];
        const missingItems: Array<{
            key: string;
            label: string;
            jumpPath: string | null;
            sectionTitle: string | null;
            scope: 'form' | 'current' | 'other';
        }> = [];
        const missingPathsSeen = new Set<string>();

        for (const row of rawFindings) {
            if (row.untouchedRequired) {
                missingPathsSeen.add(row.resultPath);
                const pageIdx = row.sectionId ? pages.findIndex(p => p.id === row.sectionId) : -1;
                const sectionTitle = pageIdx >= 0 && pages.length > 1 ? titles[pageIdx] : null;
                missingItems.push({
                    key: row.identity,
                    label: row.label ?? row.text,
                    jumpPath: row.jumpPath,
                    sectionTitle,
                    scope: row.formLevel ? 'form' : (row.sectionId === active?.id ? 'current' : 'other'),
                });
            } else {
                activeRows.push(row);
            }
        }

        // Also surface any relevant blank required field omitted from a deferred/non-live report.
        if (surfacedRequiredPaths !== 'all') {
            for (const entry of snapshot.fields) {
                if (!entry.relevant || !entry.required || !entry.empty) continue;
                if (surfacedRequiredPaths.has(entry.path) || missingPathsSeen.has(entry.path)) continue;
                const page = resolvePage(entry.path);
                const vm = engine.getFieldVM(entry.path);
                const label = vm ? contextualizeLeafLabel(entry.path, vm.label.value) : (getGroupLabel(entry.path) || entry.path);
                const pageIdx = page ? pages.indexOf(page) : -1;
                const sectionTitle = pageIdx >= 0 && pages.length > 1 ? titles[pageIdx] : null;
                missingItems.push({
                    key: `missing:${entry.path}`,
                    label,
                    jumpPath: page ? entry.path : null,
                    sectionTitle,
                    scope: !page ? 'form' : (page.id === active?.id ? 'current' : 'other'),
                });
            }
        }

        const rank = (row: (typeof rawFindings)[number]) => {
            if (row.explained) return 4;
            if (row.severity === 'error') return row.missingRequired ? 1 : 0;
            if (row.severity === 'warning') return 2;
            return 3;
        };
        activeRows.sort((a, b) => rank(a) - rank(b));
        return { activeFindings: activeRows, untouchedRequiredItems: missingItems };
    }, [rawFindings, pages, titles, active?.id, surfacedRequiredPaths, snapshot.fields, resolvePage, engine, contextualizeLeafLabel, getGroupLabel]);

    const term = query.trim();
    const matches = useSignal(useMemo(() => computed(() => {
        if (!term) return [];
        engine.localeSignal.value;
        engine.structureVersion.value;
        const locale = engine.getActiveLocale() || undefined;
        const normalize = (text: string) => text.toLocaleLowerCase(locale).normalize('NFD').replace(/\p{M}/gu, '');
        const normalizedTerm = normalize(term);
        if (!normalizedTerm) return [];

        const results: Array<{ path: string; label: string; title: string }> = [];
        const seenPaths = new Set<string>();
        const sectionsWithLeafMatches = new Set<WorkspacePage>();
        const repeatSignals = engine.repeats ?? {};

        // 1. Index relevant leaf questions along with ancestor group titles, descriptions, and hints.
        for (const path of relevant) {
            const page = resolvePage(path);
            const question = page && engine.getFieldVM(path);
            if (!question) continue;
            const context = repeatContext(engine, path, chrome);
            const ancestors = collectAncestorGroupPaths(path);
            const allAncestorLabels: string[] = [];
            const nonRepeatGroupLabels: string[] = [];
            for (let i = ancestors.length - 1; i >= 0; i--) {
                const anc = ancestors[i];
                const normalizedAnc = placementKey(anc);
                const ancLabel = getGroupLabel(anc);
                if (!ancLabel) continue;
                allAncestorLabels.push(ancLabel);
                const isSection = sectionPaths.has(anc) || sectionPaths.has(normalizedAnc);
                const ancBase = anc.replace(/\[(?:\d+|\*)\]$/, '');
                const isRepeatAncestor = Boolean(repeatSignals[anc] || repeatSignals[ancBase] || repeatSignals[normalizedAnc]);
                if (!isSection && !isRepeatAncestor && !nonRepeatGroupLabels.includes(ancLabel)) {
                    nonRepeatGroupLabels.push(ancLabel);
                }
            }
            const label = [question.label.value, context].filter(Boolean).join(' — ');
            const pageTitle = titles[pages.indexOf(page)];
            const meta = staticItemMeta.get(placementKey(path));
            const haystack = [
                label,
                ...allAncestorLabels,
                question.description?.value ?? meta?.description ?? '',
                question.hint?.value ?? meta?.hint ?? '',
                pageTitle,
            ].filter(Boolean).join(' ');
            if (normalize(haystack).includes(normalizedTerm)) {
                seenPaths.add(path);
                sectionsWithLeafMatches.add(page);
                const subtitle = nonRepeatGroupLabels.length > 0
                    ? [pageTitle, ...nonRepeatGroupLabels.map(l => truncateContextLabel(l, 54))].filter(Boolean).join(' › ')
                    : pageTitle;
                results.push({ path, label, title: subtitle });
            }
        }

        // 2. Index group containers (including 0-row repeatable groups and section headings).
        const groupMatches: Array<{ path: string; label: string; title: string }> = [];
        const relevantSignals = engine.relevantSignals ?? {};
        for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
            const page = pages[pageIdx];
            const pageTitle = titles[pageIdx];
            for (const rawGroupPath of page.groups ?? []) {
                // For nested templates inside 0-row repeats (`a[*].b`), jump to the enclosing concrete repeat (`a`).
                const wildcardIdx = rawGroupPath.indexOf('[*]');
                const targetPath = wildcardIdx >= 0 ? rawGroupPath.slice(0, wildcardIdx) : rawGroupPath;
                if (!targetPath || seenPaths.has(targetPath)) continue;
                if (relevantSignals[targetPath]?.value === false) continue;

                const isSectionRoot = sectionPaths.has(rawGroupPath) || sectionPaths.has(targetPath);
                if (isSectionRoot && sectionsWithLeafMatches.has(page)) continue;

                const groupLabel = getGroupLabel(rawGroupPath) || getGroupLabel(targetPath);
                const meta = staticItemMeta.get(placementKey(rawGroupPath));
                const ancestorLabels = collectAncestorGroupPaths(rawGroupPath)
                    .filter(a => !sectionPaths.has(a) && !sectionPaths.has(placementKey(a)))
                    .map(a => getGroupLabel(a))
                    .filter(Boolean);
                const ownHaystack = [
                    groupLabel,
                    meta?.description ?? '',
                    meta?.hint ?? '',
                    ...ancestorLabels,
                ].filter(Boolean).join(' ');
                if (!ownHaystack || !normalize(ownHaystack).includes(normalizedTerm)) continue;

                seenPaths.add(targetPath);
                const displayLabel = groupLabel || pageTitle;
                const displaySubtitle = isSectionRoot
                    ? pageTitle
                    : [pageTitle, ...ancestorLabels.reverse().map(l => truncateContextLabel(l, 54))]
                        .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
                        .join(' › ');
                groupMatches.push({ path: targetPath, label: displayLabel, title: displaySubtitle });
            }
        }

        return [...groupMatches, ...results];
    }), [term, engine, relevant, resolvePage, chrome, titles, pages, getGroupLabel, sectionPaths, staticItemMeta]));

    function select(page: WorkspacePage, notifyRoute = true) {
        if (page.id === undefined) return;
        if (!controlled) setLocalSection(page.id);
        if (notifyRoute) workspaceNavigation?.onActiveSectionChange?.(page.id);
    }

    function navigate(page: WorkspacePage) {
        setJump(undefined);
        setNotice('');
        setMobileNavOpen(false);
        select(page, true);
    }

    function jumpTo(path: string, notifyRoute = true, explanation?: string) {
        const section = resolvePage(path);
        if (!section) {
            setNotice(chrome('workspace.targetUnavailable'));
            heading.current?.focus();
            return;
        }
        setNotice('');
        setMobileNavOpen(false);
        setJump({ path, section, ...(explanation !== undefined && { explanation }) });
        if (section !== active || workspaceNavigation?.sectionNavigationActive === false) {
            select(section, notifyRoute);
        }
    }

    useLayoutEffect(() => {
        if (!registerFieldJump) return;
        registerFieldJump((path: string, options?: { notifyRoute?: boolean }) => {
            jumpTo(path, options?.notifyRoute !== false);
            return true;
        });
        return () => registerFieldJump(null);
    });

    const previousPage = useRef({ section: active?.id, navigationActive });
    useLayoutEffect(() => {
        const previous = previousPage.current;
        previousPage.current = { section: active?.id, navigationActive };
        const changed = navigationActive && (previous.section !== active?.id || !previous.navigationActive);
        const pending = jump && jump.section.id === active?.id && (navigationActive || active?.id === undefined);
        const stickyOffset = (changed || pending) ? syncStickyOffsetVar(containerRef.current) : 0;

        if (changed && !pending && heading.current) {
            scrollTargetIntoView(heading.current, 'start', stickyOffset);
            heading.current.focus({ preventScroll: true });
        }
        if (!pending) return;

        if (!engine.getFieldVM(jump.path) && hasContainerLabel(jump.path)) {
            const groupTarget = containerRef.current?.querySelector(
                `[data-name="${jump.path}"], [data-group-path="${jump.path}"], [data-repeat-path="${jump.path}"]`,
            );
            if (groupTarget instanceof HTMLElement) {
                scrollTargetIntoView(groupTarget, 'start', stickyOffset);
                heading.current?.focus({ preventScroll: true });
            } else if (heading.current) {
                scrollTargetIntoView(heading.current, 'start', stickyOffset);
                heading.current.focus({ preventScroll: true });
            }
            setJump(undefined);
            return;
        }
        touchField(jump.path);
        const fieldEl = () => containerRef.current?.querySelector(`[data-name="${jump.path}"]`);
        const waitingForTab = fieldEl()?.closest('[role="tabpanel"][hidden]');
        const finish = () => {
            const answer = jump.explanation === undefined ? null : containerRef.current?.querySelector<HTMLElement>(
                `[data-shape-id="${jump.explanation}"][data-explanation-path="${jump.path}"] textarea`);
            if (answer && !answer.closest('[hidden], .formspec-hidden')) {
                scrollTargetIntoView(answer, 'start', stickyOffset);
                answer.focus({ preventScroll: true });
                setJump(undefined);
                return;
            }
            const target = fieldEl();
            const focused = focusField(jump.path);
            const visible = target && !target.closest('[hidden], .formspec-hidden');
            const disabled = target?.ownerDocument.activeElement?.closest('[aria-disabled="true"]');
            if (!visible || !focused || disabled) {
                if (heading.current) {
                    scrollTargetIntoView(heading.current, 'start', stickyOffset);
                    heading.current.focus({ preventScroll: true });
                }
                setNotice(chrome(visible ? 'workspace.targetReadOnly' : 'workspace.targetUnavailable'));
            }
            setJump(undefined);
        };
        if (waitingForTab) {
            focusField(jump.path);
            const frame = requestAnimationFrame(finish);
            return () => cancelAnimationFrame(frame);
        }
        finish();
    }, [active?.id, navigationActive, jump, focusField, touchField, chrome, containerRef, engine, hasContainerLabel]);

    const content = new Set(allPages.map(page => page.content));
    const namedPages = pages.filter(page => page.id);
    const hasMultipleSections = namedPages.length > 1;
    const largestSection = progress.sections.reduce((max, section) => Math.max(max, section.counts.total), 0);
    const sectionLink = (page: WorkspacePage, label: string) => {
        const href = page.id && workspaceNavigation?.hrefForSection?.(page.id);
        const current = page === active ? 'location' : undefined;
        const activate = () => navigate(page);
        return href ? (
            <a href={href} aria-current={current} data-formspec-section={page.id} onClick={event => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                activate();
            }}>{label}</a>
        ) : <button type="button" aria-current={current} data-formspec-section={page.id} onClick={activate}>{label}</button>;
    };
    const trailingShared = root.children.filter(node => !content.has(node) && node.component !== 'ValidationSummary');

    const unresolvedFix = progress.form.toFix ?? 0;
    const unresolvedCheck = progress.form.toCheck ?? 0;
    const explainedCount = activeFindings.filter(row => row.explained).length;
    const untouchedRequiredCount = untouchedRequiredItems.length;
    const activeIssueCount = unresolvedFix + unresolvedCheck;

    const searchBlock = (
        <div className="formspec-workspace__search">
            <label id={searchLabelId} htmlFor={searchId}>{chrome('workspace.search')}</label>
            <input id={searchId} type="search" value={query} onInput={event => setQuery(event.currentTarget.value)}
                aria-controls={searchResultsId} aria-describedby={searchStatusId} />
            <p id={searchStatusId} role="status" aria-atomic="true">
                {term && (matches.length ? chrome('workspace.matchCount', { count: matches.length }) : chrome('workspace.noMatches'))}
            </p>
            <ul id={searchResultsId} className="formspec-workspace__search-results" aria-labelledby={searchLabelId} hidden={matches.length === 0}>
                {matches.map(({ path, label, title }) => <li key={path}>
                    <button type="button" onClick={() => jumpTo(path)}>{label}<small>{title}</small></button>
                </li>)}
            </ul>
        </div>
    );

    const scrollToFindings = () => {
        const stickyOffset = syncStickyOffsetVar(containerRef.current);
        if (findingsAsideRef.current) {
            scrollTargetIntoView(findingsAsideRef.current, 'start', stickyOffset);
        }
        findingsHeadingRef.current?.focus({ preventScroll: true });
    };

    const hasRenderedGroupNode = (node: LayoutNode | undefined, target: string): boolean => {
        if (!node) return false;
        if (node.isRepeatTemplate && node.repeatPath === target) return true;
        if (node.bindPath === target && node.category !== 'field' && Boolean(node.props?.title)) return true;
        return (node.children ?? []).some(child => hasRenderedGroupNode(child, target));
    };
    const activeSectionWarningPath = active?.titleBind
        && !engine.getFieldVM(active.titleBind)
        && !hasRenderedGroupNode(active.content, active.titleBind)
        ? active.titleBind
        : undefined;

    return (
        <div className="formspec-workspace-container">
          <WorkspaceFieldJump.Provider value={jumpTo}>
            <div
                className="formspec-workspace"
                data-single-section={hasMultipleSections ? undefined : 'true'}
                ref={containerRef}
            >
                <div className="formspec-workspace__mobile-findings-bar" data-workspace-mobile-bar="findings">
                    <span className="formspec-workspace__mobile-findings-counts">
                        {unresolvedFix > 0 && (
                            <span className="formspec-workspace__section-badge formspec-workspace__section-badge--fix">
                                {unresolvedFix} to fix
                            </span>
                        )}
                        {untouchedRequiredCount > 0 && (
                            <span className="formspec-workspace__section-badge formspec-workspace__section-badge--required">
                                {untouchedRequiredCount} required
                            </span>
                        )}
                        {unresolvedCheck > 0 && (
                            <span className="formspec-workspace__section-badge formspec-workspace__section-badge--check">
                                {unresolvedCheck} to check
                            </span>
                        )}
                        {activeIssueCount === 0 && untouchedRequiredCount === 0 && (
                            <span>{chrome('workspace.filled', { filled: progress.form.filled, total: progress.form.total })}</span>
                        )}
                    </span>
                    <button
                        type="button"
                        className="formspec-workspace__mobile-findings-jump formspec-focus-ring"
                        onClick={scrollToFindings}
                    >
                        {chrome('workspace.findings')} ({activeIssueCount})
                    </button>
                </div>
                {hasMultipleSections && (
                    <div
                        className="formspec-workspace__navigation"
                        data-mobile-open={mobileNavOpen ? 'true' : 'false'}
                    >
                        <button
                            type="button"
                            className="formspec-workspace__nav-toggle formspec-focus-ring"
                            aria-expanded={mobileNavOpen}
                            aria-controls={navBodyId}
                            onClick={() => setMobileNavOpen(open => !open)}
                        >
                            <span>{titles[activeIndex] ?? chrome('workspace.sections')} ({activeIndex + 1}/{namedPages.length})</span>
                            <span aria-hidden="true">{mobileNavOpen ? '▴' : '▾'}</span>
                        </button>
                        <div id={navBodyId} className="formspec-workspace__nav-body">
                            {searchBlock}
                            <nav aria-label={chrome('workspace.sections')}>
                                <ul>
                                    {pages.map((page, i) => {
                                        if (!page.id) return null;
                                        const sectionCounts = progress.sections[i]?.counts;
                                        const total = sectionCounts?.total ?? 0;
                                        const filled = sectionCounts?.filled ?? 0;
                                        const toFix = sectionCounts?.toFix ?? 0;
                                        const toCheck = sectionCounts?.toCheck ?? 0;
                                        const barScale = largestSection > 0 && total > 0
                                            ? Math.max(Math.sqrt(total / largestSection), 0.16)
                                            : 0;
                                        const fillPct = total > 0 ? Math.min(100, (100 * filled) / total) : 0;
                                        return (
                                            <li
                                                key={page.id}
                                                className="formspec-workspace__section-item"
                                                data-current={page === active ? 'true' : undefined}
                                            >
                                                {sectionLink(page, titles[i])}
                                                {(total > 0 || toFix > 0 || toCheck > 0) && (
                                                    <div className="formspec-workspace__section-meta" aria-hidden="true">
                                                        {total > 0 && (
                                                            <span className="formspec-workspace__section-bar-track">
                                                                <span className="formspec-workspace__section-bar" style={{ inlineSize: `${100 * barScale}%` }}>
                                                                    <span className="formspec-workspace__section-bar-fill" style={{ inlineSize: `${fillPct}%` }} />
                                                                </span>
                                                            </span>
                                                        )}
                                                        <span className="formspec-workspace__section-counts">
                                                            {total > 0 && <span className="formspec-workspace__section-fraction">{filled}/{total}</span>}
                                                            {toFix > 0 && <span className="formspec-workspace__section-badge formspec-workspace__section-badge--fix">{toFix}</span>}
                                                            {toCheck > 0 && <span className="formspec-workspace__section-badge formspec-workspace__section-badge--check">{toCheck}</span>}
                                                        </span>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </nav>
                        </div>
                    </div>
                )}
                <div className="formspec-workspace__content" data-formspec-section={active?.id ?? ''}>
                    <Heading ref={heading} tabIndex={-1}>{titles[activeIndex] ?? formTitle}</Heading>
                    <p role="status">{notice}</p>
                    {!hasMultipleSections && relevant.size > 12 && (
                        <div className="formspec-workspace__inline-search">
                            {searchBlock}
                        </div>
                    )}
                    {root.children.filter(node => !content.has(node) && node.component === 'ValidationSummary').map(node => <FormspecNode key={node.id} node={node} />)}
                    <HeadingLevelContext.Provider value={level + 1}>
                        {activeContent}
                    </HeadingLevelContext.Provider>
                    {activeSectionWarningPath && <WarningExplanations path={activeSectionWarningPath} />}
                    <WarningExplanations />
                    {pages.length > 1 && <div className="formspec-workspace__previous-next">
                        <button type="button" disabled={activeIndex === 0} onClick={() => navigate(pages[activeIndex - 1])}>{chrome('wizard.previous')}</button>
                        <button type="button" disabled={activeIndex === pages.length - 1} onClick={() => navigate(pages[activeIndex + 1])}>{chrome('wizard.next')}</button>
                    </div>}
                    {renderActionGroupedChildren(trailingShared)}
                </div>
                <aside ref={findingsAsideRef} className="formspec-workspace__findings" aria-labelledby={findingsHeading}>
                    <Heading ref={findingsHeadingRef} id={findingsHeading} tabIndex={-1}>{chrome('workspace.findings')}</Heading>
                    <p>{chrome('workspace.filled', { filled: progress.form.filled, total: progress.form.total })}</p>
                    {(unresolvedFix > 0 || untouchedRequiredCount > 0 || unresolvedCheck > 0 || explainedCount > 0) && (
                        <div className="formspec-workspace__findings-summary">
                            {unresolvedFix > 0 && (
                                <span className="formspec-workspace__section-badge formspec-workspace__section-badge--fix">
                                    {unresolvedFix} to fix
                                </span>
                            )}
                            {untouchedRequiredCount > 0 && (
                                <span className="formspec-workspace__section-badge formspec-workspace__section-badge--required">
                                    {untouchedRequiredCount} required
                                </span>
                            )}
                            {unresolvedCheck > 0 && (
                                <span className="formspec-workspace__section-badge formspec-workspace__section-badge--check">
                                    {unresolvedCheck} to check
                                </span>
                            )}
                            {explainedCount > 0 && (
                                <span className="formspec-workspace__finding-status">
                                    {explainedCount} explained
                                </span>
                            )}
                        </div>
                    )}
                    {snapshot.report === null && <p>{chrome('workspace.validationUnavailable')}</p>}
                    {activeFindings.length > 0 && <ul>{activeFindings.map(row => {
                        const page = row.sectionId && pages.find(page => page.id === row.sectionId);
                        const cleanedText = stripSeverityPrefix(row.text) || row.text;
                        const message = chrome(row.severity === 'error' ? 'workspace.error'
                            : row.severity === 'warning' ? 'workspace.warning' : 'workspace.info', { message: cleanedText });
                        const scope = row.formLevel ? 'form' : (row.sectionId === active?.id ? 'current' : 'other');
                        const badge = row.explained
                            ? <span className="formspec-workspace__finding-status">Explained</span>
                            : null;
                        const followUp = row.followUp;
                        const acknowledgement = followUp?.kind === 'group'
                            ? workspaceNavigation?.acknowledgementLink?.(followUp.code)
                            : undefined;
                        return (
                            <li
                                key={row.identity}
                                className={`formspec-shape-${row.severity}`}
                                data-severity={row.severity}
                                data-finding-scope={scope}
                                data-explained={row.explained ? 'true' : undefined}
                                data-follow-up={followUp && (followUp.kind === 'group' ? followUp.code : followUp.shapeId)}
                            >
                                {acknowledgement ? (
                                    <a href={acknowledgement.href} onClick={event => {
                                        if (!acknowledgement.navigate || !isPlainClick(event)) return;
                                        event.preventDefault();
                                        acknowledgement.navigate();
                                    }}>
                                        {message}
                                    </a>
                                ) : row.jumpPath ? (
                                    <button type="button" onClick={() => jumpTo(row.jumpPath!, true,
                                        followUp?.kind === 'instance' ? followUp.shapeId : undefined)}>
                                        {message}
                                        {badge}
                                    </button>
                                ) : page ? (
                                    <button type="button" onClick={() => {
                                        if (page === active && navigationActive) heading.current?.focus();
                                        else navigate(page);
                                    }}>
                                        {message}
                                        {badge}
                                    </button>
                                ) : (
                                    <>
                                        {message}
                                        {badge}
                                    </>
                                )}
                            </li>
                        );
                    })}</ul>}
                    {untouchedRequiredCount > 0 && (
                        <details className="formspec-workspace__required-disclosure">
                            <summary className="formspec-workspace__required-summary">
                                {untouchedRequiredCount} required unanswered
                            </summary>
                            <ul className="formspec-workspace__required-list">
                                {untouchedRequiredItems.map(item => (
                                    <li key={item.key} data-finding-scope={item.scope} data-required-unanswered="true">
                                        {item.jumpPath ? (
                                            <button type="button" onClick={() => jumpTo(item.jumpPath!)}>
                                                {item.label}
                                                {item.sectionTitle && (
                                                    <small className="formspec-workspace__required-section">{item.sectionTitle}</small>
                                                )}
                                            </button>
                                        ) : (
                                            <span>{item.label}</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </aside>
            </div>
          </WorkspaceFieldJump.Provider>
        </div>
    );
}
