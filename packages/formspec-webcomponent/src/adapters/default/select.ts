/** @filedesc Default adapter for Select — native dropdown or combobox (searchable / multiple). */
import type { SelectBehavior } from '../../behaviors/types';
import type { AdapterContext, AdapterRenderFn } from '../types';
import type { FieldDOM } from './shared';
import { createFieldDOM, finalizeFieldDOM, applyControlSlotClass, watchFieldValueChanges, formspecWidthClass } from './shared';

/** Distinct value for the native select "clear" row (must stay in sync with `select.ts` behavior change handler). */
export const SelectClearSentinel = '__formspec_clear__';

function mountCombobox(fieldDOM: FieldDOM, behavior: SelectBehavior, actx: AdapterContext): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'formspec-combobox formspec-select-searchable';
    if (behavior.multiple) wrap.setAttribute('data-multiple', 'true');

    const chips = document.createElement('div');
    chips.className = 'formspec-combobox-chips';
    chips.setAttribute('aria-label', 'Selected values');

    const popover = document.createElement('div');
    popover.className = 'formspec-combobox-popover';

    const row = document.createElement('div');
    row.className = 'formspec-combobox-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'formspec-input formspec-combobox-input';
    input.id = behavior.id;
    input.name = behavior.fieldPath;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', behavior.searchable ? 'list' : 'none');
    const listboxId = `${behavior.id}-listbox`;
    input.setAttribute('aria-controls', listboxId);
    input.setAttribute('aria-expanded', 'false');

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'formspec-combobox-clear';
    clearBtn.setAttribute('aria-label', 'Clear selection');
    clearBtn.innerHTML = '<span aria-hidden="true">\u00d7</span>';

    const chevron = document.createElement('span');
    chevron.className = 'formspec-combobox-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '\u25be';

    row.append(input, clearBtn, chevron);

    const list = document.createElement('ul');
    list.id = listboxId;
    list.setAttribute('role', 'listbox');
    list.className = 'formspec-combobox-list';
    list.style.display = 'none';
    if (behavior.multiple) list.setAttribute('aria-multiselectable', 'true');

    popover.append(row, list);
    wrap.append(chips, popover);

    fieldDOM.root.appendChild(wrap);
    applyControlSlotClass(wrap, behavior, actx);
    return wrap;
}

export const renderSelect: AdapterRenderFn<SelectBehavior> = (
    behavior, parent, actx
) => {
    const fieldDOM = createFieldDOM(behavior, actx);
    const combobox = !!(behavior.searchable || behavior.multiple);

    if (combobox) {
        const wrap = mountCombobox(fieldDOM, behavior, actx);
        finalizeFieldDOM(fieldDOM, behavior, actx);
        parent.appendChild(fieldDOM.root);
        const dispose = behavior.bind({
            root: fieldDOM.root,
            label: fieldDOM.label,
            control: wrap,
            hint: fieldDOM.hint,
            error: fieldDOM.error,
        });
        actx.onDispose(dispose);
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'formspec-select-wrapper';

    const select = document.createElement('select');
    select.className = 'formspec-input formspec-select-native' + formspecWidthClass(behavior.width);
    select.name = behavior.fieldPath;
    select.id = behavior.id;

    {
        const placeholderOpt = document.createElement('option');
        placeholderOpt.value = '';
        placeholderOpt.textContent = behavior.placeholder || 'Select\u2026';
        placeholderOpt.disabled = true;
        placeholderOpt.selected = true;
        placeholderOpt.hidden = true;
        select.appendChild(placeholderOpt);
    }

    if (behavior.clearable) {
        const clearOpt = document.createElement('option');
        clearOpt.value = SelectClearSentinel;
        clearOpt.textContent = '\u2014 Clear \u2014';
        select.appendChild(clearOpt);
    }

    const options = behavior.options();
    for (const opt of options) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
    }

    wrapper.appendChild(select);

    if (behavior.clearable) {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'formspec-select-clear';
        clearBtn.setAttribute('aria-label', 'Clear selection');
        clearBtn.innerHTML = '<span aria-hidden="true">\u00d7</span>';
        clearBtn.style.display = 'none';
        clearBtn.addEventListener('click', () => {
            behavior.setValue(null);
            behavior.touch();
        });
        wrapper.appendChild(clearBtn);

        const updateClearBtn = () => {
            const hasValue = behavior.vm
                ? !!behavior.vm.value.value
                : select.value !== '' && select.value !== SelectClearSentinel;
            clearBtn.style.display = hasValue ? 'flex' : 'none';
        };
        actx.onDispose(watchFieldValueChanges(behavior, select, updateClearBtn));
        updateClearBtn();
    }

    fieldDOM.root.appendChild(wrapper);
    applyControlSlotClass(select, behavior, actx);
    finalizeFieldDOM(fieldDOM, behavior, actx);
    parent.appendChild(fieldDOM.root);

    const dispose = behavior.bind({
        root: fieldDOM.root,
        label: fieldDOM.label,
        control: select,
        hint: fieldDOM.hint,
        error: fieldDOM.error,
        rebuildOptions: (_container, newOptions) => {
            const keepCount = 1 + (behavior.clearable ? 1 : 0);
            while (select.options.length > keepCount) select.remove(select.options.length - 1);
            const controls = new Map<string, HTMLInputElement>();
            for (const opt of newOptions) {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                select.appendChild(option);
            }
            return controls;
        },
    });
    actx.onDispose(dispose);
};
