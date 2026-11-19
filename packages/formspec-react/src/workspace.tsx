'use client';

/** @filedesc Section navigation, question search and live findings for Core workspace mode. */
import React, { createContext, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { computed } from '@preact/signals-core';
import {
    placementCovers, placementKey, readFormProgressFindingRows, summarizeFormProgress,
    type LayoutNode,
} from '@formspec-org/layout';
import type { IFormEngine } from '@formspec-org/engine';
import { useFormspecContext } from './context';
import { FormspecNode, renderActionGroupedChildren } from './node-renderer';
import type { WorkspacePage } from '@formspec-org/layout';
import { useChromeText } from './use-chrome-text';
import { useFocusField } from './use-focus-field';
import { useSignal } from './use-signal';
import { HeadingLevelContext, useHeadingLevel } from './heading-level';
import { plannedTitle } from './use-localized-node';

export const WorkspaceFieldJump = createContext<((path: string) => void) | null>(null);

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

export function Workspace({ root, pages }: { root: LayoutNode; pages: WorkspacePage[] }) {
    const { engine, workspaceNavigation, touchField, registerFieldJump } = useFormspecContext();
    const chrome = useChromeText();
    const formTitle = useSignal(useMemo(() => engine.getFormVM(), [engine]).title);
    const [localSection, setLocalSection] = useState<string>();
    const controlled = workspaceNavigation && 'activeSection' in workspaceNavigation;
    const selected = controlled ? workspaceNavigation.activeSection : localSection;
    const [query, setQuery] = useState('');
    const [notice, setNotice] = useState('');
    const [jump, setJump] = useState<{ path: string; section: WorkspacePage }>();
    const heading = useRef<HTMLHeadingElement>(null);
    const { focusField, containerRef } = useFocusField();
    const level = useHeadingLevel();
    const Heading = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    const searchId = useId();
    const searchLabelId = useId();
    const searchResultsId = useId();
    const searchStatusId = useId();
    const findingsHeading = useId();

    const navigationActive = workspaceNavigation?.sectionNavigationActive !== false;
    const activeIndex = Math.max(0, pages.findIndex(page => page.id === selected));
    const active = pages[activeIndex];
    useLayoutEffect(() => {
        if (controlled) setLocalSection(active?.id);
    }, [controlled, active?.id]);
    const activeContent = useMemo(() => active && <FormspecNode key={active.content.id} node={active.content} />, [active]);
    const titles = useSignal(useMemo(() => computed(() => {
        engine.localeSignal.value;
        return pages.map((page, index) => plannedTitle(engine, page)
            || page.title || (page.id ? chrome('wizard.stepTitle', { index: index + 1 }) : formTitle || chrome('wizard.steps')));
    }), [engine, pages, chrome, formTitle]));
    useSectionTitle(active?.id ? titles[activeIndex] : undefined,
        workspaceNavigation?.onSectionTitleChange, workspaceNavigation?.updateDocumentTitle);

    const snapshot = useSignal(useMemo(() => computed(() => engine.getEvaluatedFormState()), [engine]));
    const progress = useMemo(() => summarizeFormProgress(pages, snapshot), [pages, snapshot]);
    const placements = useMemo(() => indexPlacements(pages), [pages]);
    const resolvePage = useCallback((path: string) =>
        placements.get(placementKey(path))?.find(placement => placementCovers(placement.path, path))?.section, [placements]);
    // Answer edits refresh the snapshot. Search only needs to revisit membership when relevant paths change.
    const relevantPaths = useMemo(() => snapshot.fields.filter(field => field.relevant).map(field => field.path).join('\n'), [snapshot]);
    const relevant = useMemo(() => new Set(relevantPaths ? relevantPaths.split('\n') : []), [relevantPaths]);
    const hasContainerLabel = (path: string) =>
        Boolean(engine.getItemLabelSignal(path)?.value ?? engine.getItemLabelSignal(path.replace(/\[\d+\]/g, ''))?.value);
    const field = (path: string) => {
        const vm = engine.getFieldVM(path);
        if (vm) return { label: vm.label.value.trimEnd().replace(/:+$/, ''), controlId: vm.id || null };
        const groupLabel = engine.getItemLabelSignal(path)?.value
            ?? engine.getItemLabelSignal(path.replace(/\[\d+\]/g, ''))?.value;
        return groupLabel ? { label: groupLabel.trimEnd().replace(/:+$/, ''), controlId: null } : null;
    };
    const findings = readFormProgressFindingRows(progress, {
        field, chrome, message: result => engine.resolveValidationMessage(result) ?? '',
        jumpable: path => (relevant.has(path) || hasContainerLabel(path)) && resolvePage(path) !== undefined,
    });
    const term = query.trim();
    const matches = useSignal(useMemo(() => computed(() => {
        if (!term) return [];
        engine.localeSignal.value;
        engine.structureVersion.value;
        const locale = engine.getActiveLocale() || undefined;
        const normalize = (text: string) => text.toLocaleLowerCase(locale).normalize('NFD').replace(/\p{M}/gu, '');
        const normalizedTerm = normalize(term);
        if (!normalizedTerm) return [];
        return Array.from(relevant).flatMap(path => {
            const page = resolvePage(path);
            const question = page && engine.getFieldVM(path);
            if (!question) return [];
            const context = repeatContext(engine, path, chrome);
            const label = [question.label.value, context].filter(Boolean).join(' — ');
            const title = titles[pages.indexOf(page)];
            return normalize(`${label} ${title}`).includes(normalizedTerm) ? [{ path, label, title }] : [];
        });
    }), [term, engine, relevant, resolvePage, chrome, titles, pages]));

    function select(page: WorkspacePage, notifyRoute = true) {
        if (page.id === undefined) return;
        if (!controlled) setLocalSection(page.id);
        if (notifyRoute) workspaceNavigation?.onActiveSectionChange?.(page.id);
    }

    function navigate(page: WorkspacePage) {
        setJump(undefined);
        setNotice('');
        select(page, true);
    }

    function jumpTo(path: string, notifyRoute = true) {
        const section = resolvePage(path);
        if (!section) {
            setNotice(chrome('workspace.targetUnavailable'));
            heading.current?.focus();
            return;
        }
        setNotice('');
        setJump({ path, section });
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
        if (changed || pending) heading.current?.focus();
        if (!pending) return;

        if (!engine.getFieldVM(jump.path) && hasContainerLabel(jump.path)) {
            const groupTarget = containerRef.current?.querySelector(`[data-name="${jump.path}"]`);
            if (groupTarget instanceof HTMLElement) {
                groupTarget.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }
            heading.current?.focus();
            setJump(undefined);
            return;
        }
        touchField(jump.path);
        const field = () => containerRef.current?.querySelector(`[data-name="${jump.path}"]`);
        const waitingForTab = field()?.closest('[role="tabpanel"][hidden]');
        const finish = () => {
            const target = field();
            const focused = focusField(jump.path);
            const visible = target && !target.closest('[hidden], .formspec-hidden');
            const disabled = target?.ownerDocument.activeElement?.closest('[aria-disabled="true"]');
            if (!visible || !focused || disabled) {
                heading.current?.focus();
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
    }, [active?.id, navigationActive, jump, focusField, touchField, chrome, containerRef]);

    const content = new Set(pages.map(page => page.content));
    const namedPages = pages.filter(page => page.id);
    const largestSection = progress.sections.reduce((max, section) => Math.max(max, section.counts.total), 0);
    const sectionLink = (page: WorkspacePage, label: string) => {
        const href = page.id && workspaceNavigation?.hrefForSection?.(page.id);
        const current = page === active ? 'location' : undefined;
        const activate = () => navigate(page);
        return href ? (
            <a href={href} aria-current={current} data-formspec-section={page.id} onClick={event => {
                if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                event.preventDefault();
                activate();
            }}>{label}</a>
        ) : <button type="button" aria-current={current} data-formspec-section={page.id} onClick={activate}>{label}</button>;
    };
    const trailingShared = root.children.filter(node => !content.has(node) && node.component !== 'ValidationSummary');

    return (
        <div className="formspec-workspace-container">
          <WorkspaceFieldJump.Provider value={jumpTo}>
            <div className="formspec-workspace" ref={containerRef}>
                <div className="formspec-workspace__navigation">
                    {namedPages.length > 1 && (
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
                                            {total > 0 && (
                                                <div className="formspec-workspace__section-meta" aria-hidden="true">
                                                    <span className="formspec-workspace__section-bar-track">
                                                        <span className="formspec-workspace__section-bar" style={{ inlineSize: `${100 * barScale}%` }}>
                                                            <span className="formspec-workspace__section-bar-fill" style={{ inlineSize: `${fillPct}%` }} />
                                                        </span>
                                                    </span>
                                                    <span className="formspec-workspace__section-counts">
                                                        <span className="formspec-workspace__section-fraction">{filled}/{total}</span>
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
                    )}
                    <label id={searchLabelId} htmlFor={searchId}>{chrome('workspace.search')}</label>
                    <input id={searchId} type="search" value={query} onInput={event => setQuery(event.currentTarget.value)}
                        aria-controls={searchResultsId} aria-describedby={searchStatusId} />
                    <p id={searchStatusId} role="status" aria-atomic="true">
                        {term && (matches.length ? chrome('workspace.matchCount', { count: matches.length }) : chrome('workspace.noMatches'))}
                    </p>
                    <ul id={searchResultsId} aria-labelledby={searchLabelId} hidden={matches.length === 0}>
                        {matches.map(({ path, label, title }) => <li key={path}>
                            <button type="button" onClick={() => jumpTo(path)}>{label}<small>{title}</small></button>
                        </li>)}
                    </ul>
                </div>
                <div className="formspec-workspace__content" data-formspec-section={active?.id ?? ''}>
                    <Heading ref={heading} tabIndex={-1}>{titles[activeIndex] ?? formTitle}</Heading>
                    <p role="status">{notice}</p>
                    {root.children.filter(node => !content.has(node) && node.component === 'ValidationSummary').map(node => <FormspecNode key={node.id} node={node} />)}
                    <HeadingLevelContext.Provider value={level + 1}>
                        {activeContent}
                    </HeadingLevelContext.Provider>
                    {pages.length > 1 && <div className="formspec-workspace__previous-next">
                        <button type="button" disabled={activeIndex === 0} onClick={() => navigate(pages[activeIndex - 1])}>{chrome('wizard.previous')}</button>
                        <button type="button" disabled={activeIndex === pages.length - 1} onClick={() => navigate(pages[activeIndex + 1])}>{chrome('wizard.next')}</button>
                    </div>}
                    {renderActionGroupedChildren(trailingShared)}
                </div>
                <aside className="formspec-workspace__findings" aria-labelledby={findingsHeading}>
                    <Heading id={findingsHeading}>{chrome('workspace.findings')}</Heading>
                    <p>{chrome('workspace.filled', { filled: progress.form.filled, total: progress.form.total })}</p>
                    {snapshot.report === null && <p>{chrome('workspace.validationUnavailable')}</p>}
                    {findings.length > 0 && <ul>{findings.map(row => {
                        const page = row.sectionId && pages.find(page => page.id === row.sectionId);
                        const message = chrome(row.severity === 'error' ? 'workspace.error'
                            : row.severity === 'warning' ? 'workspace.warning' : 'workspace.info', { message: row.text });
                        const scope = row.formLevel ? 'form' : (row.sectionId === active?.id ? 'current' : 'other');
                        return <li key={row.identity} className={`formspec-shape-${row.severity}`} data-severity={row.severity} data-finding-scope={scope}>
                            {row.jumpPath ? <button type="button" onClick={() => jumpTo(row.jumpPath!)}>{message}</button>
                                : page ? <button type="button" onClick={() => {
                                    if (page === active && navigationActive) heading.current?.focus();
                                    else navigate(page);
                                }}>{message}</button>
                                : message}
                        </li>;
                    })}</ul>}
                </aside>
            </div>
          </WorkspaceFieldJump.Provider>
        </div>
    );
}
