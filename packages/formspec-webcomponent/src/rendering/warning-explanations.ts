/** @filedesc Show warning answers beside their fields and grouped blank-answer panels on review. */
import { effect } from '@preact/signals-core';
import type { IFormEngine } from '@formspec-org/engine/render';
import { readWarningAcknowledgementGroups, type WarningAcknowledgementGroupView } from '@formspec-org/layout';

type Instance = ReturnType<IFormEngine['getExplanationState']>['instances'][number];

function warningEditor(engine: IFormEngine, warning: Instance) {
    const root = document.createElement('fieldset');
    root.className = 'formspec-warning-explanation';
    const legend = document.createElement('legend');
    const label = document.createElement('label');
    const prompt = document.createTextNode('');
    const input = document.createElement('textarea');
    input.value = warning.text ?? '';
    label.append(prompt, input);
    const button = document.createElement('button');
    button.type = 'button';
    root.append(legend, label, button);
    let current = warning;
    function updateButton() {
        const saved = current.current && input.value === (current.text ?? '');
        const explain = current.mode === 'explain';
        button.disabled = saved || (explain && !input.value);
        button.textContent = saved ? (explain ? 'Explanation entered' : 'Confirmed') : (explain ? 'Use explanation' : 'Confirm');
    }
    input.addEventListener('input', updateButton);
    button.addEventListener('click', () =>
        engine.setExplanation(current.shapeId, current.path, input.value ? { text: input.value } : {}));
    return {
        root,
        update(next: Instance) {
            if (next.basis !== current.basis || next.text !== current.text) input.value = next.text ?? '';
            current = next;
            const explain = next.mode === 'explain';
            input.setAttribute('aria-required', String(explain));
            legend.textContent = engine.resolveLocaleString(`$shape.${next.shapeId}.message`, next.message, next.path);
            prompt.data = engine.resolveLocaleString(`$shape.${next.shapeId}.explanationPrompt`,
                explain ? 'Explain this warning.' : 'Confirm this warning. You may add a note.', next.path);
            updateButton();
        },
    };
}

function warningAcknowledgementPanel(
    container: HTMLElement,
    engine: IFormEngine,
    group: WarningAcknowledgementGroupView,
    focusField?: (path: string) => void,
) {
    const root = document.createElement('fieldset');
    root.className = 'formspec-warning-explanation formspec-warning-acknowledgement';
    root.dataset.explanationCode = group.code;
    const legend = document.createElement('legend');
    const list = document.createElement('ul');
    const addedNote = document.createElement('p');
    addedNote.className = 'formspec-warning-acknowledgement-added';
    const removedNote = document.createElement('p');
    removedNote.className = 'formspec-warning-acknowledgement-removed';
    const button = document.createElement('button');
    button.type = 'button';
    let currentCode = group.code;
    let currentBasis = group.basis;
    button.addEventListener('click', () => {
        if (currentBasis !== undefined) engine.acknowledge(currentCode, { expectedBasis: currentBasis });
        else engine.acknowledge(currentCode);
    });
    root.append(legend, list, addedNote, removedNote, button);

    function jumpTo(path: string) {
        if (focusField) {
            focusField(path);
            return;
        }
        const fieldEl = container.querySelector<HTMLElement>(`[data-name="${path}"]`);
        const input = fieldEl?.querySelector<HTMLElement>('input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([disabled])');
        input?.focus();
    }

    return {
        root,
        update(next: WarningAcknowledgementGroupView) {
            currentCode = next.code;
            currentBasis = next.basis;
            root.dataset.explanationCode = next.code;
            legend.textContent = next.legend;
            list.replaceChildren(
                ...next.items.map(item => {
                    const li = document.createElement('li');
                    if (item.jumpHref && item.jumpPath) {
                        const link = document.createElement('a');
                        link.href = item.jumpHref;
                        link.textContent = item.label;
                        link.addEventListener('click', event => {
                            event.preventDefault();
                            jumpTo(item.jumpPath!);
                        });
                        li.append(link);
                    } else {
                        const span = document.createElement('span');
                        span.textContent = item.label;
                        li.append(span);
                    }
                    return li;
                }),
            );
            if (next.addedText) {
                addedNote.hidden = false;
                addedNote.textContent = next.addedText;
            } else {
                addedNote.hidden = true;
                addedNote.textContent = '';
            }
            if (next.removedText) {
                removedNote.hidden = false;
                removedNote.textContent = next.removedText;
            } else {
                removedNote.hidden = true;
                removedNote.textContent = '';
            }
            button.disabled = next.current;
            button.textContent = next.buttonLabel;
        },
    };
}

export function bindWarningExplanations(
    container: HTMLElement,
    engine: IFormEngine,
    submitted: () => boolean,
    touched: (path?: string) => boolean,
    focusField?: (path: string) => void,
): () => void {
    const editors = new Map<string, ReturnType<typeof warningEditor>>();
    const groupPanels = new Map<string, ReturnType<typeof warningAcknowledgementPanel>>();
    const stop = effect(() => {
        const afterSubmit = submitted();
        const seen = new Set<string>();
        const seenGroups = new Set<string>();
        if (afterSubmit || (touched() && Object.values(engine.shapeResults).some(s => s.value.some(r => r.severity === 'warning')))) {
            engine.localeSignal.value;
            const state = engine.getExplanationState();
            for (const finding of state.instances) {
                if (!afterSubmit && (!touched(finding.path)
                    || !engine.shapeResults[finding.shapeId]?.value.some(r => r.path === finding.path && r.severity === 'warning'))) continue;
                const field = container.querySelector<HTMLElement>(`[data-name="${finding.path}"]`);
                if (!field && engine.getFieldVM(finding.path)) continue;
                const parent = field ?? container;
                const id = JSON.stringify([finding.shapeId, finding.path]);
                seen.add(id);
                const editor = editors.get(id) ?? warningEditor(engine, finding);
                editor.update(finding);
                if (editor.root.parentElement !== parent) parent.append(editor.root);
                editors.set(id, editor);
            }
            if (afterSubmit) {
                const groups = readWarningAcknowledgementGroups(state, {
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
                for (const group of groups) {
                    seenGroups.add(group.code);
                    const panel = groupPanels.get(group.code)
                        ?? warningAcknowledgementPanel(container, engine, group, focusField);
                    panel.update(group);
                    if (panel.root.parentElement !== container) container.append(panel.root);
                    groupPanels.set(group.code, panel);
                }
            }
        }
        for (const [id, editor] of editors) {
            if (!seen.has(id)) {
                editor.root.remove();
                editors.delete(id);
            }
        }
        for (const [code, panel] of groupPanels) {
            if (!seenGroups.has(code)) {
                panel.root.remove();
                groupPanels.delete(code);
            }
        }
    });
    return () => {
        stop();
        for (const editor of editors.values()) editor.root.remove();
        for (const panel of groupPanels.values()) panel.root.remove();
    };
}
