'use client';

/** @filedesc Field and form warning controls bound to the engine's current Submit findings. */
import React, { useContext, useMemo, useRef, useState } from 'react';
import { computed, type ReadonlySignal } from '@preact/signals-core';
import type { IFormEngine } from '@formspec-org/engine/render';
import { readWarningAcknowledgementGroups, type WarningAcknowledgementGroupView } from '@formspec-org/layout';
import { useFormspecContext, type FormspecContextValue } from './context';
import { focusFieldIn } from './use-focus-field';
import { useSignal } from './use-signal';
import { WorkspaceFieldJump } from './workspace';

type Instance = ReturnType<IFormEngine['getExplanationState']>['instances'][number];

const byProvider = new WeakMap<FormspecContextValue, ReadonlySignal<Map<string, Instance[]>>>();
const none: Instance[] = [];

function visibleWarnings(context: FormspecContextValue) {
    const cached = byProvider.get(context);
    if (cached) return cached;
    const { engine, latestSubmit, touchedVersion, isTouched } = context;
    const groups = computed(() => {
        const result = new Map<string, Instance[]>();
        const submitted = latestSubmit.value !== null;
        const live = engine.shapeResults;
        if (!submitted && (!touchedVersion.value || !Object.values(live).some(s => s.value.some(r => r.severity === 'warning')))) return result;
        for (const warning of engine.getExplanationState().instances) {
            const path = engine.getFieldVM(warning.path) ? warning.path : '';
            if (!submitted && ((path && !isTouched(path))
                || !live[warning.shapeId]?.value.some(r => r.severity === 'warning' && r.path === warning.path))) continue;
            const list = result.get(path);
            if (list) list.push(warning);
            else result.set(path, [warning]);
        }
        return result;
    });
    byProvider.set(context, groups);
    return groups;
}

/** A missing path places root and group findings alongside the form. */
export function WarningExplanations({ path = '' }: { path?: string }) {
    const context = useFormspecContext();
    const { engine, latestSubmit } = context;
    const submitted = useSignal(latestSubmit) !== null;
    useSignal(engine.localeSignal);
    const warnings = useSignal(useMemo(() => computed(() => visibleWarnings(context).value.get(path) ?? none), [context, path]));
    const groups = useSignal(useMemo(() => computed(() => {
        if (path !== '' || latestSubmit.value === null) return [] as WarningAcknowledgementGroupView[];
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
    return <>
        {warnings.map(warning => <WarningAnswer key={JSON.stringify([warning.shapeId, warning.path, warning.basis, warning.text])}
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
    const fieldsetRef = useRef<HTMLFieldSetElement>(null);
    const workspaceJump = useContext(WorkspaceFieldJump);
    const jump = (jumpPath: string | null) => (event: React.MouseEvent) => {
        event.preventDefault();
        if (!jumpPath) return;
        const scope = fieldsetRef.current?.closest<HTMLElement>('.formspec-theme-scope') ?? document.body;
        if (workspaceJump) workspaceJump(jumpPath);
        else if (!jumpToField?.(jumpPath)) focusFieldIn(scope, jumpPath);
    };
    return <fieldset ref={fieldsetRef} className="formspec-warning-explanation formspec-warning-acknowledgement"
        data-explanation-code={group.code}>
        <legend>{group.legend}</legend>
        <ul>
            {group.items.map(item => <li key={item.path}>
                {item.jumpHref
                    ? <a href={item.jumpHref} onClick={jump(item.jumpPath)}>{item.label}</a>
                    : <span>{item.label}</span>}
            </li>)}
        </ul>
        {group.addedText && <p className="formspec-warning-acknowledgement-added">{group.addedText}</p>}
        {group.removedText && <p className="formspec-warning-acknowledgement-removed">{group.removedText}</p>}
        <button
            type="button"
            disabled={group.current}
            onClick={() => {
                if (group.basis !== undefined) engine.acknowledge(group.code, { expectedBasis: group.basis });
                else engine.acknowledge(group.code);
            }}
        >
            {group.buttonLabel}
        </button>
    </fieldset>;
}

function WarningAnswer({ engine, warning }: { engine: IFormEngine; warning: Instance }) {
    const { shapeId, path, mode, current, message } = warning;
    const [text, setText] = useState(warning.text ?? '');
    useSignal(engine.localeSignal);
    const explain = mode === 'explain';
    const prompt = engine.resolveLocaleString(`$shape.${shapeId}.explanationPrompt`,
        explain ? 'Explain this warning.' : 'Confirm this warning. You may add a note.', path);
    const saved = current && text === (warning.text ?? '');
    return <fieldset className="formspec-warning-explanation">
        <legend>{engine.resolveLocaleString(`$shape.${shapeId}.message`, message, path)}</legend>
        <label>{prompt}
            <textarea value={text} aria-required={explain} onChange={event => setText(event.target.value)}/>
        </label>
        <button type="button" disabled={saved || (explain && !text)} onClick={() =>
            engine.setExplanation(shapeId, path, text ? { text } : {})}>
            {saved ? (explain ? 'Explanation entered' : 'Confirmed') : (explain ? 'Use explanation' : 'Confirm')}
        </button>
    </fieldset>;
}
