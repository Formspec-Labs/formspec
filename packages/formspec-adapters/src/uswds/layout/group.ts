/** @filedesc USWDS bound groups and repeatable groups — `usa-fieldset`/`usa-legend`, `usa-button` affordances. */
import {
    watchText,
    type AdapterContext,
    type GroupLayoutBehavior,
    type RepeatGroupLayoutBehavior,
} from '@formspec-org/webcomponent';

/**
 * Heading depths that read as a form section rather than a question group. The renderer starts groups at
 * `h3`; the shallower tags are covered so a change of starting depth cannot silently flatten every legend.
 */
const SECTION_HEADING_LEVELS = new Set(['h1', 'h2', 'h3']);

/** Classes and inline presentation the theme cascade resolved onto the planner node. */
function applyNodePresentation(el: HTMLElement, comp: any, actx: AdapterContext): void {
    if (comp.cssClasses?.length > 0) actx.applyClassValue(el, comp.cssClasses);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
}

export function renderUSWDSGroup(
    behavior: GroupLayoutBehavior,
    parent: HTMLElement,
    actx: AdapterContext,
): void {
    // USWDS groups related fields in a fieldset named by its legend. Untitled, a group is only a scope:
    // a fieldset with no legend has no accessible name, so it stays a plain wrapper.
    const el = document.createElement(behavior.titleText ? 'fieldset' : 'div');
    if (behavior.titleText) {
        el.className = 'usa-fieldset';
        const legend = document.createElement('legend');
        // A section's legend is USWDS's large legend; a nested group takes the plain one — the size a
        // question's own legend uses. USWDS has no middle size, so depth beyond that changes nothing.
        legend.className = SECTION_HEADING_LEVELS.has(behavior.headingLevel)
            ? 'usa-legend usa-legend--large'
            : 'usa-legend';
        watchText(actx, behavior.titleText, (text) => { legend.textContent = text; });
        el.appendChild(legend);
    }
    applyNodePresentation(el, behavior.comp, actx);
    parent.appendChild(el);

    behavior.renderChildren(el);
    actx.onDispose(behavior.bind({ root: el }));
}

export function renderUSWDSRepeatGroup(
    behavior: RepeatGroupLayoutBehavior,
    parent: HTMLElement,
    actx: AdapterContext,
): void {
    const container = document.createElement('div');
    container.className = 'formspec-stack';
    container.dataset.bind = behavior.bindKey;
    applyNodePresentation(container, behavior.comp, actx);
    parent.appendChild(container);

    const list = document.createElement('div');
    list.className = 'formspec-stack';
    container.appendChild(list);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'usa-button usa-button--outline';
    addBtn.addEventListener('click', () => behavior.addInstance());
    watchText(actx, behavior.addLabel, (text) => { addBtn.textContent = text; });

    const announcer = document.createElement('div');
    announcer.className = 'formspec-sr-only';
    announcer.setAttribute('aria-live', 'polite');

    behavior.renderRows((rows) => {
        list.replaceChildren();
        for (let idx = 0; idx < rows.count; idx++) {
            // Each row is its own fieldset: the legend names it, so it needs no aria-label on top.
            const row = document.createElement('fieldset');
            row.className = 'usa-fieldset';
            list.appendChild(row);

            const legend = document.createElement('legend');
            legend.className = 'usa-legend';
            row.appendChild(legend);

            const removeBtn = rows.canRemove ? document.createElement('button') : null;
            if (removeBtn) {
                removeBtn.type = 'button';
                removeBtn.className = 'usa-button usa-button--unstyled';
                const removeIdx = idx;
                removeBtn.addEventListener('click', () => behavior.removeInstance(removeIdx));
                row.appendChild(removeBtn);
            }

            const text = rows.rowText(idx);
            rows.watch(() => {
                legend.textContent = text.label.value;
                if (removeBtn) {
                    removeBtn.textContent = text.removeLabel.value;
                    removeBtn.setAttribute('aria-label', text.removeAriaLabel.value);
                }
            });

            rows.renderRow(idx, row);
        }
    });

    container.appendChild(addBtn);
    container.appendChild(announcer);
    actx.onDispose(behavior.bind({ root: container, list, addButton: addBtn, announcer }));
}
