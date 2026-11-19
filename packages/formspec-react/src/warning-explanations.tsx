'use client';

/** @filedesc Field, group, and form warning controls bound to the engine's live and Submit findings. */
import React, { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { computed, type ReadonlySignal } from '@preact/signals-core';
import type { IFormEngine } from '@formspec-org/engine/render';
import {
    dedupeSeverityPrefix,
    readWarningAcknowledgementGroups,
    type LayoutNode,
    type WarningAcknowledgementGroupView,
} from '@formspec-org/layout';
import { useFormspecContext, type FormspecContextValue } from './context';
import { focusFieldIn } from './use-focus-field';
import { useSignal } from './use-signal';
import { WorkspaceFieldJump } from './workspace';

type Instance = ReturnType<IFormEngine['getExplanationState']>['instances'][number];

const byProvider = new WeakMap<FormspecContextValue, ReadonlySignal<Map<string, Instance[]>>>();
const none: Instance[] = [];

function stripRepeatIndices(path: string): string {
    return path.replace(/\[\d+\]/g, '');
}

function collectRenderedGroupTargets(
    node: LayoutNode | null | undefined,
    exactGroups: Set<string>,
    repeatGroups: Set<string>,
): void {
    if (!node) return;
    if (node.isRepeatTemplate && node.repeatPath) {
        repeatGroups.add(stripRepeatIndices(node.repeatPath));
    } else if (node.bindPath && node.category !== 'field' && node.props?.title) {
        exactGroups.add(stripRepeatIndices(node.bindPath));
    }
    for (const child of node.children ?? []) {
        collectRenderedGroupTargets(child, exactGroups, repeatGroups);
    }
}

function hasRenderedGroupTarget(context: FormspecContextValue, warningPath: string): boolean {
    if (!warningPath || warningPath === '#') return false;
    const exactGroups = new Set<string>();
    const repeatGroups = new Set<string>();
    collectRenderedGroupTargets(context.layoutPlan, exactGroups, repeatGroups);
    for (const page of context.workspacePages ?? []) {
        if (page.titleBind) exactGroups.add(stripRepeatIndices(page.titleBind));
    }
    const normalized = stripRepeatIndices(warningPath);
    return exactGroups.has(normalized) || repeatGroups.has(normalized);
}

function submitMayHaveWarnings(submit: FormspecContextValue['latestSubmit']['value'], engine: IFormEngine): boolean {
    if (submit === null) return false;
    const results = submit.validationReport?.results;
    if (!Array.isArray(results)) return true;
    if (results.some(r => r.severity === 'warning' || r.constraintKind === 'explanation')) return true;
    return (engine.getExplanationEntries?.().length ?? 0) > 0;
}

function visibleWarnings(context: FormspecContextValue) {
    const cached = byProvider.get(context);
    if (cached) return cached;
    const { engine, latestSubmit } = context;
    const groups = computed(() => {
        const result = new Map<string, Instance[]>();
        const submit = latestSubmit.value;
        const submitted = submit !== null;
        const live = engine.shapeResults ?? {};
        const hasLiveWarning = Object.values(live).some(s => s.value.some(r => r.severity === 'warning'));
        if (!hasLiveWarning && !submitMayHaveWarnings(submit, engine)) return result;
        const state = typeof engine.getExplanationState === 'function' ? engine.getExplanationState() : null;
        for (const warning of state?.instances ?? []) {
            const hasFieldTarget = Boolean(engine.getFieldVM?.(warning.path));
            const path = (hasFieldTarget || hasRenderedGroupTarget(context, warning.path)) ? warning.path : '';
            if (!submitted && !live[warning.shapeId]?.value.some(r => r.severity === 'warning' && r.path === warning.path)) continue;
            const list = result.get(path);
            if (list) list.push(warning);
            else result.set(path, [warning]);
        }
        return result;
    });
    byProvider.set(context, groups);
    return groups;
}

/** A missing path places root and unattached group findings above the form's submit controls. */
export function WarningExplanations({ path = '' }: { path?: string }) {
    const context = useFormspecContext();
    const { engine, latestSubmit } = context;
    const submitted = useSignal(latestSubmit) !== null;
    useSignal(engine.localeSignal);
    const warnings = useSignal(useMemo(() => computed(() => visibleWarnings(context).value.get(path) ?? none), [context, path]));
    const groups = useSignal(useMemo(() => computed(() => {
        const submit = latestSubmit.value;
        if (path !== '' || !submitMayHaveWarnings(submit, engine)) return [] as WarningAcknowledgementGroupView[];
        engine.localeSignal.value;
        const state = engine.getExplanationState();
        return readWarningAcknowledgementGroups(state, {
            field: (targetPath) => {
                const vm = engine.getFieldVM?.(targetPath);
                const label = (vm && 'label' in vm && vm.label ? vm.label.value : undefined)
                    ?? engine.getItemLabelSignal?.(targetPath)?.value;
                if (!vm && label === undefined) return null;
                const controlId = vm && 'id' in vm && typeof vm.id === 'string' && vm.id ? vm.id : null;
                return { label: label ?? targetPath, controlId };
            },
            rootLabel: () => engine.getDefinition?.()?.title || 'Form',
            resolveText: (key, fallback) => engine.resolveLocaleString(key, fallback),
            lookupUi: (key) => engine.lookupLocaleString?.(`$ui.${key}`) ?? null,
        });
    }), [context, engine, latestSubmit, path]));
    if (warnings.length === 0 && (!submitted || path !== '' || groups.length === 0)) return null;
    return <>
        {warnings.map(warning => <WarningAnswer key={JSON.stringify([warning.shapeId, warning.path, warning.basis])}
            engine={engine} warning={warning} />)}
        {submitted && path === '' && groups.map(group => <WarningAcknowledgement
            key={group.code} engine={engine} group={group} jumpToField={context.jumpToField} />)}
    </>;
}

function WarningAcknowledgement({
    engine,
    group,
    jumpToField,
}: {
    engine: IFormEngine;
    group: WarningAcknowledgementGroupView;
    jumpToField?: (path: string) => boolean;
}) {
    const regionRef = useRef<HTMLDivElement>(null);
    const headingId = useId();
    const workspaceJump = useContext(WorkspaceFieldJump);
    const jump = (jumpPath: string | null) => (event: React.MouseEvent) => {
        event.preventDefault();
        if (!jumpPath) return;
        const scope = regionRef.current?.closest<HTMLElement>('.formspec-theme-scope') ?? document.body;
        if (workspaceJump) workspaceJump(jumpPath);
        else if (!jumpToField?.(jumpPath)) focusFieldIn(scope, jumpPath);
    };
    const title = dedupeSeverityPrefix(group.legend);
    return (
        <div
            ref={regionRef}
            role="region"
            aria-labelledby={headingId}
            className="formspec-warning-explanation formspec-warning-acknowledgement"
            data-explanation-code={group.code}
            data-state={group.current ? 'saved' : 'open'}
        >
            <div id={headingId} className="formspec-warning-explanation-header">
                {title}
            </div>
            <div className="formspec-warning-explanation-body">
                <ul className="formspec-warning-acknowledgement-list">
                    {group.items.map(item => <li key={item.path}>
                        {item.jumpHref
                            ? <a href={item.jumpHref} onClick={jump(item.jumpPath)}>{item.label}</a>
                            : <span>{item.label}</span>}
                    </li>)}
                </ul>
                {group.addedText && <p className="formspec-warning-acknowledgement-added">{group.addedText}</p>}
                {group.removedText && <p className="formspec-warning-acknowledgement-removed">{group.removedText}</p>}
                <div className="formspec-warning-explanation-actions">
                    <button
                        type="button"
                        className="formspec-warning-explanation-action formspec-button-secondary formspec-focus-ring"
                        data-state={group.current ? 'saved' : 'pending'}
                        disabled={group.current}
                        onClick={() => {
                            if (group.basis !== undefined) engine.acknowledge(group.code, { expectedBasis: group.basis });
                            else engine.acknowledge(group.code);
                        }}
                    >
                        {group.buttonLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

function WarningAnswer({ engine, warning }: { engine: IFormEngine; warning: Instance }) {
    const { shapeId, path, mode, current, message } = warning;
    const [text, setText] = useState(warning.text ?? '');
    const headingId = useId();
    useEffect(() => {
        setText(warning.text ?? '');
    }, [warning.basis, warning.text]);
    useSignal(engine.localeSignal);
    const explain = mode === 'explain';
    const prompt = engine.resolveLocaleString(`$shape.${shapeId}.explanationPrompt`,
        explain ? 'Explain this warning.' : 'Confirm this warning. You may add a note.', path);
    const resolvedMessage = dedupeSeverityPrefix(
        engine.resolveLocaleString(`$shape.${shapeId}.message`, message, path),
    );
    const trimmed = text.trim();
    const saved = current && text === (warning.text ?? '');
    return (
        <div
            role="region"
            aria-labelledby={headingId}
            className="formspec-warning-explanation"
            data-shape-id={shapeId}
            data-state={saved ? 'saved' : 'open'}
        >
            <div id={headingId} className="formspec-warning-explanation-header">
                {resolvedMessage}
            </div>
            <div className="formspec-warning-explanation-body">
                <label className="formspec-warning-explanation-prompt">
                    {prompt}
                    <textarea value={text} aria-required={explain} onChange={event => setText(event.target.value)} />
                </label>
                <div className="formspec-warning-explanation-actions">
                    <button
                        type="button"
                        className="formspec-warning-explanation-action formspec-button-secondary formspec-focus-ring"
                        data-state={saved ? 'saved' : 'pending'}
                        disabled={saved || (explain && !trimmed)}
                        onClick={() => engine.setExplanation(shapeId, path, trimmed ? { text } : {})}
                    >
                        {saved ? (explain ? 'Explanation entered' : 'Confirmed') : (explain ? 'Use explanation' : 'Confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
}
