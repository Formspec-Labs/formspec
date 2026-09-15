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
    // USWDS groups related fields in a fieldset named by its legend, inside a form group — the same shape
    // a question takes, so a section separates from the preceding field by USWDS's own margins. Untitled,
    // a group is only a scope: a fieldset with no legend has no accessible name, so it stays a wrapper.
    const el = document.createElement('div');
    let content: HTMLElement = el;
    if (behavior.titleText) {
        el.className = 'usa-form-group';
        content = document.createElement('fieldset');
        content.className = 'usa-fieldset';
        el.appendChild(content);

        const legend = document.createElement('legend');
        // A section's legend is USWDS's large legend; a nested group takes the plain one — the size a
        // question's own legend uses. USWDS has no middle size, so depth beyond that changes nothing.
        // A hidden title keeps naming the fieldset and leaves the page: `usa-sr-only`, never `display:none`.
        legend.className = behavior.titleHidden
            ? 'usa-legend usa-sr-only'
            : SECTION_HEADING_LEVELS.has(behavior.headingLevel)
                ? 'usa-legend usa-legend--large'
                : 'usa-legend';
        watchText(actx, behavior.titleText, (text) => { legend.textContent = text; });
        content.appendChild(legend);

        if (behavior.hintText) {
            // USWDS puts a fieldset's instructions directly under its legend, as a question's hint.
            const hint = document.createElement('span');
            hint.className = 'usa-hint';
            watchText(actx, behavior.hintText, (text) => { hint.textContent = text; });
            content.appendChild(hint);
        }
    }
    applyNodePresentation(el, behavior.comp, actx);
    parent.appendChild(el);

    behavior.renderChildren(content);
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
    // `formspec-repeat-add` is structural: the layout sheet sizes the button to its label instead of the column.
    addBtn.className = 'usa-button usa-button--outline formspec-repeat-add';
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
