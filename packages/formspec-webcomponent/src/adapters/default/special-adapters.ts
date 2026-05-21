/** @filedesc Default DOM for special components — ConditionalGroup and DataTable. */
import { effect } from '@preact/signals-core';
import type { AdapterContext } from '../types';
import type { DisplayComponentBehavior } from '../display-behaviors';
import type { DataTableBehavior } from '../../behaviors/types';
import { formatMoney } from '../../format';

type SelectOption = { value: string; label?: string };

function optionSetOptions(entry: unknown): SelectOption[] {
    if (Array.isArray(entry)) return entry;
    if (typeof entry !== 'object' || entry === null) return [];
    const options = (entry as { options?: unknown }).options;
    return Array.isArray(options) ? options : [];
}

export function renderDefaultConditionalGroup(
    behavior: DisplayComponentBehavior,
    parent: HTMLElement,
    actx: AdapterContext
): void {
    const { comp, host } = behavior;
    const el = document.createElement('div');
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-conditional-group';
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    parent.appendChild(el);
    if (comp.children) {
        for (const child of comp.children) {
            host.renderComponent(child, el, host.prefix);
        }
    }
}

export function renderDefaultDataTable(behavior: DataTableBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, fullName, repeatCount, addInstance, removeInstance } = behavior;
    const wrapper = document.createElement('div');
    wrapper.className = 'formspec-data-table-wrapper';
    parent.appendChild(wrapper);

    const table = document.createElement('table');
    if (comp.id) table.id = comp.id;
    table.className = 'formspec-data-table';
    actx.applyCssClass(table, comp);
    actx.applyAccessibility(table, comp);
    actx.applyStyle(table, comp.style);
    wrapper.appendChild(table);

    if (comp.title) {
        const caption = document.createElement('caption');
        caption.textContent = comp.title;
        table.appendChild(caption);
    }

    const columns = behavior.columns;
    const showRowNumbers = behavior.showRowNumbers;
    const allowAdd = behavior.allowAdd;
    const allowRemove = behavior.allowRemove;
    const editableCells = allowAdd || allowRemove;

    const groupItem = host.findItemByKey(behavior.bindKey);
    const fieldByKey = new Map<string, any>();
    if (groupItem?.type === 'group' && Array.isArray(groupItem.children)) {
        for (const child of groupItem.children) {
            if (child?.type === 'field' && child.key) {
                fieldByKey.set(child.key, child);
            }
        }
    }

    const defaultCurrency = host.engine.definition?.formPresentation?.defaultCurrency || 'USD';

    const coerceInputValue = (raw: string, dataType: string | undefined, fieldDef?: any, col?: any): any => {
        const trimmed = raw.trim();
        if (trimmed === '') return null;
        let val: any;
        if (dataType === 'integer') {
            const parsed = Number.parseInt(trimmed, 10);
            val = Number.isFinite(parsed) ? parsed : null;
        } else if (dataType === 'decimal' || dataType === 'money') {
            const parsed = Number.parseFloat(trimmed);
            val = Number.isFinite(parsed) ? parsed : null;
        } else {
            val = raw;
        }

        if (typeof val === 'number' && col) {
            if (col.min !== undefined && val < col.min) val = col.min;
            if (col.max !== undefined && val > col.max) val = col.max;
        }

        if (dataType === 'money' && val !== null) {
            const currency = fieldDef?.currency || defaultCurrency;
            return { amount: val, currency };
        }
        return val;
    };

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    if (showRowNumbers) {
        const th = document.createElement('th');
        th.textContent = '#';
        th.setAttribute('scope', 'col');
        headerRow.appendChild(th);
    }
    for (let ci = 0; ci < columns.length; ci++) {
        const col = columns[ci];
        const th = document.createElement('th');
        th.textContent = col.header;
        th.setAttribute('scope', 'col');
        th.id = `${comp.id || 'dt'}-col-${ci}`;
        headerRow.appendChild(th);
    }
    if (allowRemove) {
        const th = document.createElement('th');
        th.setAttribute('scope', 'col');
        const sr = document.createElement('span');
        sr.className = 'formspec-sr-only';
        sr.textContent = 'Actions';
        th.appendChild(sr);
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    let cellEffectDisposers: Array<() => void> = [];

    const clearCellEffects = () => {
        for (const dispose of cellEffectDisposers) {
            dispose();
        }
        cellEffectDisposers = [];
    };

    host.cleanupFns.push(() => clearCellEffects());

    host.cleanupFns.push(
        effect(() => {
            const count = repeatCount.value;
            clearCellEffects();
            tbody.innerHTML = '';
            for (let i = 0; i < count; i++) {
                const tr = document.createElement('tr');
                if (showRowNumbers) {
                    const td = document.createElement('td');
                    td.textContent = String(i + 1);
                    td.className = 'formspec-row-number';
                    tr.appendChild(td);
                }
                for (const col of columns) {
                    const td = document.createElement('td');
                    const sigPath = `${fullName}[${i}].${col.bind}`;
                    const sig = host.engine.signals[sigPath];
                    const dataType = fieldByKey.get(col.bind)?.dataType as string | undefined;

                    if (sig && editableCells) {
                        const fieldDef = fieldByKey.get(col.bind);
                        const prefix = fieldDef?.prefix;
                        const suffix = fieldDef?.suffix;
                        const isChoice = fieldDef?.dataType === 'choice' && (fieldDef.optionSet || fieldDef.options);

                        let inputEl: HTMLInputElement | HTMLSelectElement;

                        if (isChoice) {
                            const select = document.createElement('select');
                            select.className = 'formspec-datatable-input';
                            select.name = sigPath;
                            const emptyOpt = document.createElement('option');
                            emptyOpt.value = '';
                            emptyOpt.textContent = '';
                            select.appendChild(emptyOpt);
                            let options: SelectOption[] = [];
                            if (fieldDef.optionSet) {
                                const def = host.engine.definition;
                                const optionSets = def?.optionSets as Record<string, unknown> | undefined;
                                const entry = optionSets?.[fieldDef.optionSet];
                                options = optionSetOptions(entry);
                            } else if (Array.isArray(fieldDef.options)) {
                                options = fieldDef.options;
                            }
                            for (const opt of options) {
                                const optEl = document.createElement('option');
                                optEl.value = opt.value;
                                optEl.textContent = opt.label || opt.value;
                                select.appendChild(optEl);
                            }
                            select.addEventListener('change', () => {
                                host.engine.setValue(sigPath, select.value || null);
                            });
                            inputEl = select;
                        } else {
                            const input = document.createElement('input');
                            input.className = 'formspec-datatable-input';
                            input.name = sigPath;
                            input.type =
                                dataType === 'integer' || dataType === 'decimal' || dataType === 'money' ? 'number' : 'text';
                            if (input.type === 'number') {
                                const step = col.step ?? (dataType === 'integer' ? 1 : null);
                                input.step = step != null ? String(step) : dataType === 'integer' ? '1' : 'any';
                                if (col.min != null) input.min = String(col.min);
                                if (col.max != null) input.max = String(col.max);
                            }
                            input.addEventListener('input', () => {
                                const nextValue = coerceInputValue(input.value, dataType, fieldDef, col);
                                host.engine.setValue(sigPath, nextValue);
                                if (dataType === 'integer' || dataType === 'decimal' || dataType === 'money') {
                                    const displayVal =
                                        nextValue && typeof nextValue === 'object' && 'amount' in nextValue
                                            ? nextValue.amount
                                            : nextValue;
                                    const sVal = displayVal === null ? '' : String(displayVal);
                                    if (sVal !== input.value) {
                                        input.value = sVal;
                                    }
                                }
                            });
                            inputEl = input;
                        }

                        inputEl.setAttribute('aria-label', `${col.header}, Row ${i + 1}`);

                        if (prefix || suffix) {
                            const wrap = document.createElement('div');
                            wrap.className = 'formspec-datatable-cell-wrapper';
                            if (prefix) {
                                const pre = document.createElement('span');
                                pre.className = 'formspec-datatable-prefix';
                                pre.textContent = prefix;
                                wrap.appendChild(pre);
                            }
                            wrap.appendChild(inputEl);
                            if (suffix) {
                                const suf = document.createElement('span');
                                suf.className = 'formspec-datatable-prefix';
                                suf.textContent = suffix;
                                wrap.appendChild(suf);
                            }
                            td.appendChild(wrap);
                        } else {
                            td.appendChild(inputEl);
                        }

                        const readonlySig = host.engine.readonlySignals[sigPath];
                        const syncInput = effect(() => {
                            const value = sig.value;
                            const readonly = readonlySig?.value ?? false;
                            if (document.activeElement !== inputEl) {
                                if (value !== null && value !== undefined && typeof value === 'object' && 'amount' in value) {
                                    (inputEl as HTMLInputElement).value =
                                        value.amount !== null ? String(value.amount) : '';
                                } else {
                                    inputEl.value =
                                        value === null || value === undefined || (typeof value === 'number' && isNaN(value))
                                            ? ''
                                            : String(value);
                                }
                            }
                            inputEl.disabled = readonly;
                        });
                        cellEffectDisposers.push(syncInput);
                    } else if (sig) {
                        const valueEl = document.createElement('span');
                        td.appendChild(valueEl);
                        const syncText = effect(() => {
                            const v = sig.value;
                            if (v !== null && v !== undefined && typeof v === 'object' && 'amount' in v) {
                                valueEl.textContent = formatMoney(v as any);
                            } else {
                                valueEl.textContent = v === null || v === undefined ? '' : String(v);
                            }
                        });
                        cellEffectDisposers.push(syncText);
                    } else {
                        td.textContent = '';
                    }
                    tr.appendChild(td);
                }
                if (allowRemove) {
                    const td = document.createElement('td');
                    const removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.className = 'formspec-datatable-remove formspec-button-danger formspec-focus-ring';
                    removeBtn.textContent = 'Remove';
                    removeBtn.setAttribute('aria-label', `Remove row ${i + 1}`);
                    const idx = i;
                    removeBtn.addEventListener('click', () => {
                        removeInstance(idx);
                    });
                    td.appendChild(removeBtn);
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }
        })
    );

    if (allowAdd) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'formspec-datatable-add formspec-focus-ring';
        addBtn.textContent = 'Add Row';
        addBtn.addEventListener('click', () => {
            addInstance();
        });
        wrapper.appendChild(addBtn);
    }

    const dispose = behavior.bind({ root: wrapper, table, tbody });
    actx.onDispose(dispose);
}
