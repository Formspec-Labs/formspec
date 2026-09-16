/** @filedesc USWDS v3 adapter for MoneyInput — usa-input-group (fixed currency) or grid row (editable code + amount). */
import { uiText, watchText, widthStopClass, type MoneyInputBehavior, type AdapterRenderFn } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { applyUSWDSValidationState, createUSWDSFieldDOM } from './shared';

import { createInputSkeleton } from '../shared/input-factory.js';

export const renderMoneyInput: AdapterRenderFn<MoneyInputBehavior> = (
    behavior, parent, actx
) => {
    const { root, label, hint, error } = createUSWDSFieldDOM(behavior);

    let container: HTMLElement;
    let amountInput: HTMLInputElement;

    if (behavior.resolvedCurrency) {
        const skeleton = createInputSkeleton(behavior, {
            type: 'number',
            inputClass: 'usa-input formspec-money-amount',
            groupClass: 'usa-input-group' + widthStopClass('usa-input', behavior.width),
            prefixClass: 'usa-input-prefix',
            prefix: behavior.resolvedCurrency,
        });
        skeleton.actualInput.name = `${behavior.fieldPath}__amount`;
        container = skeleton.control;
        amountInput = skeleton.actualInput as HTMLInputElement;
    } else {
        amountInput = document.createElement('input') as HTMLInputElement;
        amountInput.className = 'usa-input formspec-money-amount';
        amountInput.id = behavior.id;
        amountInput.name = `${behavior.fieldPath}__amount`;
        amountInput.type = 'number';
        if (behavior.placeholder) amountInput.placeholder = behavior.placeholder;
        if (behavior.step != null) amountInput.step = String(behavior.step);
        if (behavior.min != null) amountInput.min = String(behavior.min);
        if (behavior.max != null) amountInput.max = String(behavior.max);

        const currencyInput = document.createElement('input') as HTMLInputElement;
        currencyInput.className = 'usa-input usa-input--2xs formspec-money-currency-input';
        currencyInput.type = 'text';
        currencyInput.placeholder = 'USD';
        currencyInput.id = `${behavior.id}-currency`;
        currencyInput.name = `${behavior.fieldPath}__currency`;
        // Named "<label> <$ui.money.currency>", both live, so a locale switch renames it too.
        label.id ||= `${behavior.id}-label`;
        const currencyName = el('span', { hidden: '', id: `${behavior.id}-currency-label` }); // named by reference, not read as content
        watchText(actx, uiText(actx.engine, 'money.currency'), (text) => { currencyName.textContent = text; });
        currencyInput.setAttribute('aria-labelledby', `${label.id} ${currencyName.id}`);
        currencyInput.maxLength = 3;

        const row = el('div', { class: 'grid-row grid-gap-1' });
        const curCell = el('div', { class: 'grid-col-12 tablet:grid-col-3' });
        const amtCell = el('div', { class: 'grid-col-12 tablet:grid-col-9' });
        curCell.append(currencyName, currencyInput);
        amtCell.appendChild(amountInput);
        row.appendChild(curCell);
        row.appendChild(amtCell);
        container = row;
    }

    root.appendChild(container);

    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control: container, hint, error,
        // The shared state helper already carries the error to the amount input's group when one wraps it.
        onValidationChange: (hasError) => applyUSWDSValidationState(root, label, hasError, amountInput),
    });
    actx.onDispose(dispose);
};
