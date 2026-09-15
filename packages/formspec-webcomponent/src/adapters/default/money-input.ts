/** @filedesc Default adapter for MoneyInput — renders a compound amount + currency input. */
import type { MoneyInputBehavior } from '../../behaviors/types';
import type { AdapterRenderFn } from '../types';
import { createFieldDOM, finalizeFieldDOM, applyControlSlotClass } from './shared';
import { widthStopClass } from '../width-stops';

export const renderMoneyInput: AdapterRenderFn<MoneyInputBehavior> = (
    behavior, parent, actx
) => {
    const fieldDOM = createFieldDOM(behavior, actx);

    const container = document.createElement('div');
    container.className = 'formspec-money' + widthStopClass('formspec-input', behavior.width);

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.pattern = '[0-9]*\\.?[0-9]*';
    amountInput.className = 'formspec-input formspec-money-amount';
    amountInput.placeholder = behavior.placeholder || 'Amount';
    amountInput.name = `${behavior.fieldPath}__amount`;
    amountInput.id = behavior.id;
    if (behavior.step != null) amountInput.step = String(behavior.step);
    if (behavior.min != null) amountInput.min = String(behavior.min);
    if (behavior.max != null) amountInput.max = String(behavior.max);

    if (behavior.resolvedCurrency) {
        const currencyId = `${behavior.id}-currency`;
        const badge = document.createElement('span');
        badge.className = 'formspec-money-currency';
        badge.id = currencyId;
        badge.textContent = behavior.resolvedCurrency;
        badge.setAttribute('aria-label', `Currency: ${behavior.resolvedCurrency}`);
        container.appendChild(badge);
        // Link currency badge to amount input via data-describedby-base for bind() to pick up
        amountInput.setAttribute('data-describedby-base', currencyId);
    } else {
        const currencyInput = document.createElement('input');
        currencyInput.type = 'text';
        currencyInput.className = 'formspec-input formspec-money-currency-input';
        currencyInput.placeholder = 'Currency';
        currencyInput.name = `${behavior.fieldPath}__currency`;
        currencyInput.setAttribute('aria-label', 'Currency code');
        container.appendChild(currencyInput);
    }

    container.appendChild(amountInput);

    fieldDOM.root.appendChild(container);
    applyControlSlotClass(container, behavior, actx);
    finalizeFieldDOM(fieldDOM, behavior, actx);
    parent.appendChild(fieldDOM.root);

    const dispose = behavior.bind({
        root: fieldDOM.root,
        label: fieldDOM.label,
        control: container,
        hint: fieldDOM.hint,
        error: fieldDOM.error,
    });
    actx.onDispose(dispose);
};
