/** @filedesc Bind logic for Select combobox mode (searchable and/or multiple). */
import { optionMatchesComboboxQuery } from '@formspec-org/engine';
import { effect } from '@preact/signals-core';
import type { FieldViewModel } from '@formspec-org/engine';
import type { BehaviorContext, FieldRefs, ResolvedPresentationBlock } from './types';
import { bindSharedFieldEffects } from './shared';

export interface SelectComboboxBindOpts {
    fieldPath: string;
    dataType: string;
    multiple: boolean;
    searchable: boolean;
    clearable: boolean;
    placeholder: string;
    vm: FieldViewModel | undefined;
    labelText: string;
    presentation: ResolvedPresentationBlock;
    getOptions: () => ReadonlyArray<{ value: string; label: string; keywords?: string[] }>;
}

export function bindSelectCombobox(
    ctx: BehaviorContext,
    opts: SelectComboboxBindOpts,
    refs: FieldRefs,
): () => void {
    const {
        fieldPath,
        dataType,
        multiple,
        searchable,
        clearable,
        placeholder,
        vm,
        labelText,
        presentation,
        getOptions,
    } = opts;

    refs.skipSharedReadonlyControl = true;
    const disposers = bindSharedFieldEffects(ctx, fieldPath, vm, labelText, refs, presentation);

    const root = refs.control;
    const input = root.querySelector('.formspec-combobox-input') as HTMLInputElement;
    const list = root.querySelector('.formspec-combobox-list') as HTMLUListElement;
    const clearBtn = root.querySelector('.formspec-combobox-clear') as HTMLButtonElement;
    const chips = root.querySelector('.formspec-combobox-chips') as HTMLDivElement;

    let open = false;
    let query = '';
    let highlightedIndex = -1;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;

    const clearBlurTimer = () => {
        if (blurTimer !== undefined) {
            clearTimeout(blurTimer);
            blurTimer = undefined;
        }
    };

    const isEngineReadonly = () =>
        vm ? vm.readonly.value : (ctx.engine.readonlySignals[fieldPath]?.value ?? false);

    function selectedArray(val: unknown): string[] {
        if (!multiple) return [];
        if (Array.isArray(val)) return val.map(String);
        if (val == null || val === '') return [];
        return [String(val)];
    }

    function getFiltered(): { value: string; label: string; keywords?: string[] }[] {
        const opts = [...getOptions()];
        if (!searchable || !query.trim()) return opts;
        return opts.filter((o) => optionMatchesComboboxQuery(o, query));
    }

    function syncInputDisplay() {
        const sig = ctx.engine.signals[fieldPath];
        const val = sig?.value;
        const ro = isEngineReadonly();

        if (multiple) {
            chips.replaceChildren();
            const sel = selectedArray(val);
            for (const v of sel) {
                const lab = getOptions().find((o) => o.value === v)?.label ?? v;
                const chip = document.createElement('span');
                chip.className = 'formspec-combobox-chip';
                chip.appendChild(document.createTextNode(lab));
                const rm = document.createElement('button');
                rm.type = 'button';
                rm.className = 'formspec-combobox-chip-remove';
                rm.setAttribute('aria-label', `Remove ${lab}`);
                rm.textContent = '\u00d7';
                rm.addEventListener('mousedown', (e) => e.preventDefault());
                rm.addEventListener('click', () => {
                    if (isEngineReadonly()) return;
                    ctx.engine.setValue(
                        fieldPath,
                        sel.filter((x) => x !== v),
                    );
                });
                chip.appendChild(rm);
                chips.appendChild(chip);
            }
        }

        let closedDisplay = '';
        if (multiple) {
            const sel = selectedArray(val);
            if (sel.length === 0) closedDisplay = placeholder;
            else if (sel.length === 1) {
                closedDisplay =
                    getOptions().find((o) => o.value === sel[0])?.label ?? '1 selected';
            } else closedDisplay = `${sel.length} selected`;
        } else {
            if (val == null || val === '') closedDisplay = placeholder;
            else {
                const s = String(val);
                closedDisplay = getOptions().find((o) => o.value === s)?.label ?? s;
            }
        }

        const hasSingleSelection =
            !multiple && val != null && val !== '' && String(val).length > 0;
        const displayReadOnly =
            ro ||
            (multiple && (!open || !searchable)) ||
            (!multiple && !open && hasSingleSelection);

        if (open && searchable) {
            input.value = query;
        } else {
            input.value = closedDisplay;
        }
        input.readOnly = displayReadOnly;
        input.disabled = ro;
        input.placeholder = searchable ? placeholder : '';

        const showClear =
            clearable &&
            !ro &&
            (multiple ? selectedArray(val).length > 0 : val != null && val !== '');
        clearBtn.style.display = showClear ? '' : 'none';
    }

    function renderOptions() {
        const filtered = getFiltered();
        list.replaceChildren();
        const sigVal = ctx.engine.signals[fieldPath]?.value;
        const selMulti = selectedArray(sigVal);

        filtered.forEach((opt, index) => {
            const li = document.createElement('li');
            li.className = 'formspec-combobox-option';
            li.id = `${input.id}-option-${index}`;
            li.setAttribute('role', 'option');
            const isChosen = multiple
                ? selMulti.includes(opt.value)
                : String(sigVal ?? '') === opt.value;
            if (multiple) {
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.tabIndex = -1;
                cb.disabled = true;
                cb.checked = isChosen;
                cb.setAttribute('aria-hidden', 'true');
                li.appendChild(cb);
            }
            li.appendChild(document.createTextNode(opt.label));
            const isHi = index === highlightedIndex;
            if (isChosen) li.classList.add('formspec-option--selected');
            if (isHi) li.classList.add('formspec-option--highlighted');
            li.setAttribute('aria-selected', multiple ? String(isChosen) : String(isHi));
            li.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (isEngineReadonly()) return;
                const live = ctx.engine.signals[fieldPath]?.value;
                const cur = selectedArray(live);
                if (multiple) {
                    const chosen = cur.includes(opt.value);
                    const next = chosen
                        ? cur.filter((x) => x !== opt.value)
                        : [...cur, opt.value];
                    ctx.engine.setValue(fieldPath, next);
                } else {
                    let v: string | number | null = opt.value;
                    if (['integer', 'decimal', 'number'].includes(dataType)) {
                        v = opt.value === '' ? null : Number(opt.value);
                    }
                    ctx.engine.setValue(fieldPath, v);
                    closeList();
                }
            });
            list.appendChild(li);
        });
    }

    function syncHighlight() {
        const filtered = getFiltered();
        if (highlightedIndex < 0 || highlightedIndex >= filtered.length) {
            input.removeAttribute('aria-activedescendant');
        } else {
            input.setAttribute(
                'aria-activedescendant',
                `${input.id}-option-${highlightedIndex}`,
            );
        }
        const items = list.querySelectorAll('li.formspec-combobox-option');
        const sigVal = ctx.engine.signals[fieldPath]?.value;
        const selM = selectedArray(sigVal);
        items.forEach((el, i) => {
            const fid = filtered[i];
            if (!fid) return;
            const hi = i === highlightedIndex;
            const chosen = multiple
                ? selM.includes(fid.value)
                : String(sigVal ?? '') === fid.value;
            el.classList.toggle('formspec-option--highlighted', hi);
            el.setAttribute('aria-selected', multiple ? String(chosen) : String(hi));
        });
    }

    function closeList() {
        open = false;
        query = '';
        highlightedIndex = -1;
        list.style.display = 'none';
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        syncInputDisplay();
    }

    disposers.push(
        effect(() => {
            ctx.engine.signals[fieldPath]?.value;
            vm?.readonly.value;
            syncInputDisplay();
            if (open) {
                renderOptions();
                syncHighlight();
            }
        }),
    );

    input.addEventListener('focus', () => {
        clearBlurTimer();
        open = true;
        if (searchable) query = '';
        list.style.display = '';
        input.setAttribute('aria-expanded', 'true');
        highlightedIndex = -1;
        renderOptions();
        syncHighlight();
        syncInputDisplay();
    });

    input.addEventListener('blur', () => {
        blurTimer = setTimeout(closeList, 120);
    });

    input.addEventListener('input', () => {
        if (!searchable || !open) return;
        query = input.value;
        highlightedIndex = 0;
        renderOptions();
        syncHighlight();
    });

    input.addEventListener('keydown', (e) => {
        const filtered = getFiltered();
        if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            open = true;
            if (searchable) query = '';
            list.style.display = '';
            input.setAttribute('aria-expanded', 'true');
            highlightedIndex = filtered.length > 0 ? 0 : -1;
            renderOptions();
            syncHighlight();
            syncInputDisplay();
            return;
        }
        if (!open) return;
        const n = filtered.length;
        if (n === 0) return;
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                highlightedIndex = (highlightedIndex + 1) % n;
                renderOptions();
                syncHighlight();
                break;
            case 'ArrowUp':
                e.preventDefault();
                highlightedIndex =
                    highlightedIndex <= 0 ? n - 1 : highlightedIndex - 1;
                renderOptions();
                syncHighlight();
                break;
            case 'Enter':
                if (highlightedIndex >= 0 && highlightedIndex < n) {
                    e.preventDefault();
                    if (isEngineReadonly()) return;
                    const opt = filtered[highlightedIndex];
                    const sigVal = ctx.engine.signals[fieldPath]?.value;
                    const selM = selectedArray(sigVal);
                    if (multiple) {
                        const chosen = selM.includes(opt.value);
                        const next = chosen
                            ? selM.filter((x) => x !== opt.value)
                            : [...selM, opt.value];
                        ctx.engine.setValue(fieldPath, next);
                    } else {
                        let v: string | number | null = opt.value;
                        if (['integer', 'decimal', 'number'].includes(dataType)) {
                            v = opt.value === '' ? null : Number(opt.value);
                        }
                        ctx.engine.setValue(fieldPath, v);
                        closeList();
                    }
                    renderOptions();
                    syncInputDisplay();
                }
                break;
            case ' ':
                if (multiple && highlightedIndex >= 0 && highlightedIndex < n) {
                    e.preventDefault();
                    const opt = filtered[highlightedIndex];
                    const sigVal = ctx.engine.signals[fieldPath]?.value;
                    const selM = selectedArray(sigVal);
                    const chosen = selM.includes(opt.value);
                    const next = chosen
                        ? selM.filter((x) => x !== opt.value)
                        : [...selM, opt.value];
                    ctx.engine.setValue(fieldPath, next);
                    renderOptions();
                    syncInputDisplay();
                    syncHighlight();
                }
                break;
            case 'Escape':
                e.preventDefault();
                closeList();
                break;
            default:
                break;
        }
    });

    clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
    clearBtn.addEventListener('click', () => {
        if (isEngineReadonly()) return;
        ctx.engine.setValue(fieldPath, multiple ? [] : null);
        closeList();
    });

    syncInputDisplay();

    return () => {
        clearBlurTimer();
        disposers.forEach((d) => d());
    };
}
