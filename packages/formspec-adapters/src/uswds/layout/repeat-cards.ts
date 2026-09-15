/** @filedesc USWDS RepeatCards presentation — one `usa-card` per repeat instance, Add below the list. */
import {
    watchText,
    type AdapterContext,
    type RepeatGroupLayoutBehavior,
} from '@formspec-org/webcomponent';

/**
 * A repeatable group as USWDS cards (theme §4.2 `RepeatCards`): each instance is a `usa-card` headed by the
 * row label, with Remove as an outline button in the card footer and Add — the page's primary move — as a
 * filled `usa-button` below the list.
 *
 * Same behavior object as the fieldset render, so rows, Add/Remove locks, announcements and focus
 * restoration are identical; only the shape differs.
 */
export function renderUSWDSRepeatCards(
    behavior: RepeatGroupLayoutBehavior,
    parent: HTMLElement,
    actx: AdapterContext,
): void {
    const container = document.createElement('div');
    container.className = 'formspec-stack';
    container.dataset.bind = behavior.bindKey;
    const comp = behavior.comp;
    if (comp.cssClasses?.length > 0) actx.applyClassValue(container, comp.cssClasses);
    actx.applyAccessibility(container, comp);
    actx.applyStyle(container, comp.style);
    parent.appendChild(container);

    const list = document.createElement('div');
    list.className = 'formspec-stack';
    container.appendChild(list);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    // `formspec-repeat-add` is structural: the layout sheet sizes the button to its label instead of the column.
    addBtn.className = 'usa-button formspec-repeat-add';
    addBtn.addEventListener('click', () => behavior.addInstance());
    watchText(actx, behavior.addLabel, (text) => { addBtn.textContent = text; });

    const announcer = document.createElement('div');
    announcer.className = 'formspec-sr-only';
    announcer.setAttribute('aria-live', 'polite');

    behavior.renderRows((rows) => {
        list.replaceChildren();
        for (let idx = 0; idx < rows.count; idx++) {
            // The card is the row boundary a fieldset gives the default render, so it carries the name.
            const card = document.createElement('div');
            card.className = 'usa-card';
            card.setAttribute('role', 'group');
            list.appendChild(card);

            const cardContainer = document.createElement('div');
            cardContainer.className = 'usa-card__container';
            card.appendChild(cardContainer);

            const header = document.createElement('div');
            header.className = 'usa-card__header';
            const heading = document.createElement(behavior.headingLevel);
            heading.className = 'usa-card__heading';
            header.appendChild(heading);
            cardContainer.appendChild(header);

            const body = document.createElement('div');
            body.className = 'usa-card__body';
            cardContainer.appendChild(body);

            const removeBtn = rows.canRemove ? document.createElement('button') : null;
            if (removeBtn) {
                const footer = document.createElement('div');
                footer.className = 'usa-card__footer';
                removeBtn.type = 'button';
                removeBtn.className = 'usa-button usa-button--outline';
                const removeIdx = idx;
                removeBtn.addEventListener('click', () => behavior.removeInstance(removeIdx));
                footer.appendChild(removeBtn);
                cardContainer.appendChild(footer);
            }

            const text = rows.rowText(idx);
            rows.watch(() => {
                card.setAttribute('aria-label', text.ariaLabel.value);
                heading.textContent = text.label.value;
                // An empty row label drops the heading and its header band; `aria-label` still names the
                // card, so the row boundary survives for assistive technology (Locale §3.1.1).
                header.hidden = text.label.value === '';
                if (removeBtn) {
                    removeBtn.textContent = text.removeLabel.value;
                    removeBtn.setAttribute('aria-label', text.removeAriaLabel.value);
                }
            });

            rows.renderRow(idx, body);
        }
    });

    container.appendChild(addBtn);
    container.appendChild(announcer);
    actx.onDispose(behavior.bind({ root: container, list, addButton: addBtn, announcer }));
}
