/** @filedesc Default DOM for the RepeatCards presentation — one `.formspec-card` per instance, Add below the list. */
import type { AdapterRenderFn } from '../types';
import type { RepeatGroupLayoutBehavior } from '../layout-behaviors';
import { watchText } from '../watch-text';

/**
 * A repeatable group as one card per instance (theme §4.2 `RepeatCards`): the row heading titles the card,
 * Remove sits in the card's footer, and Add follows the list. Same behavior as the default repeat chrome —
 * same rows, same locks, same announcements — so the two renders differ only in shape.
 */
export const renderRepeatCards: AdapterRenderFn<RepeatGroupLayoutBehavior> = (behavior, parent, actx) => {
    const container = document.createElement('div');
    container.className = 'formspec-repeat formspec-repeat-cards';
    container.dataset.bind = behavior.bindKey;
    parent.appendChild(container);

    if (behavior.titleText) {
        const heading = document.createElement(behavior.headingLevel);
        // A hidden title stays in the accessible markup and leaves the page (theme §5.2), same as a group's.
        heading.className = behavior.titleHidden
            ? 'formspec-group-title formspec-sr-only'
            : 'formspec-group-title';
        watchText(actx, behavior.titleText, (text) => { heading.textContent = text; });
        container.appendChild(heading);
    }

    const list = document.createElement('div');
    list.className = 'formspec-repeat-list';
    container.appendChild(list);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'formspec-repeat-add formspec-focus-ring';
    addBtn.addEventListener('click', () => behavior.addInstance());
    watchText(actx, behavior.addLabel, (text) => { addBtn.textContent = text; });

    const announcer = document.createElement('div');
    announcer.className = 'formspec-sr-only';
    announcer.setAttribute('aria-live', 'polite');

    behavior.renderRows((rows) => {
        list.replaceChildren();
        for (let idx = 0; idx < rows.count; idx++) {
            const card = document.createElement('div');
            card.className = 'formspec-card';
            card.setAttribute('role', 'group');
            list.appendChild(card);

            const heading = document.createElement(behavior.headingLevel);
            heading.className = 'formspec-card-title';
            card.appendChild(heading);

            const body = document.createElement('div');
            body.className = 'formspec-card-body';
            card.appendChild(body);

            const removeBtn = rows.canRemove ? document.createElement('button') : null;
            if (removeBtn) {
                const footer = document.createElement('div');
                footer.className = 'formspec-card-footer';
                removeBtn.type = 'button';
                removeBtn.className = 'formspec-repeat-remove formspec-button-danger formspec-focus-ring';
                const removeIdx = idx;
                removeBtn.addEventListener('click', () => behavior.removeInstance(removeIdx));
                footer.appendChild(removeBtn);
                card.appendChild(footer);
            }

            const text = rows.rowText(idx);
            rows.watch(() => {
                card.setAttribute('aria-label', text.ariaLabel.value);
                heading.textContent = text.label.value;
                // An empty row label drops the heading from the page and the a11y tree; `aria-label`
                // above still names the card (Locale §3.1.1).
                heading.hidden = text.label.value === '';
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
};
