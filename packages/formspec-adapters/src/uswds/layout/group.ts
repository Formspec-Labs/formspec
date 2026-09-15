/** @filedesc USWDS bound groups and repeatable groups — `usa-fieldset`/`usa-legend`, `usa-button` affordances. */
import {
    watchText,
    type AdapterContext,
    type GroupLayoutBehavior,
    type RepeatGroupLayoutBehavior,
    type RepeatGroupRefs,
} from '@formspec-org/webcomponent';

/**
 * Heading depths that read as a form section rather than a question group. The renderer starts groups at
 * `h3`; the shallower tags are covered so a change of starting depth cannot silently flatten every legend.
 */
const SECTION_HEADING_LEVELS = new Set(['h1', 'h2', 'h3']);

/**
 * A group's legend: a section reads as USWDS's large legend, a nested group as the plain one (the size a
 * question's own legend uses — USWDS has no middle size), and a hidden title keeps naming the fieldset and
 * leaves the page (`usa-sr-only`, never `display:none`). `formspec-group-title` names the role
 * structurally, as the default adapter's group title does, so an adapter variant can style a group's
 * title without also catching a question's legend, which shares every other USWDS class.
 */
function createGroupLegend(titleHidden: boolean, headingLevel: string): HTMLLegendElement {
    const legend = document.createElement('legend');
    legend.className = titleHidden
        ? 'usa-legend formspec-group-title usa-sr-only'
        : SECTION_HEADING_LEVELS.has(headingLevel)
            ? 'usa-legend formspec-group-title usa-legend--large'
            : 'usa-legend formspec-group-title';
    // The heading depth this legend stands for (the default adapter renders a real h3–h6). USWDS types
    // only two legend sizes, so a variant that wants a third — NJ's bold sub-heads at one depth, plain
    // question legends below it — keys on this.
    legend.dataset.headingLevel = headingLevel;
    return legend;
}

/** Classes and inline presentation the theme cascade resolved onto the planner node. */
function applyNodePresentation(el: HTMLElement, comp: any, actx: AdapterContext): void {
    if (comp.cssClasses?.length > 0) actx.applyClassValue(el, comp.cssClasses);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
}

/** The title fields every group behavior shares; a repeat has no hint. */
type GroupTitle = Pick<GroupLayoutBehavior, 'titleText' | 'titleHidden' | 'headingLevel'> & {
    hintText?: GroupLayoutBehavior['hintText'];
};

/**
 * Turns a group's bound root into USWDS's shape for grouped questions and returns where its content goes.
 * A titled group is a fieldset named by its legend, with the instructions under it as a question's hint,
 * inside a `usa-form-group` root — the shape a question takes, so the group takes a question's gap above.
 * A hidden title keeps that gap and still names the fieldset; the rules layer drops the gap of the block
 * right after it, so the two never stack. Untitled, a group is only a scope — a fieldset with no legend has
 * no accessible name — so its content goes straight into the root.
 */
function buildGroupShell(root: HTMLElement, title: GroupTitle, actx: AdapterContext): HTMLElement {
    if (!title.titleText) return root;
    root.classList.add('usa-form-group');

    const fieldset = document.createElement('fieldset');
    fieldset.className = 'usa-fieldset';
    root.appendChild(fieldset);

    const legend = createGroupLegend(title.titleHidden, title.headingLevel);
    watchText(actx, title.titleText, (text) => { legend.textContent = text; });
    fieldset.appendChild(legend);

    if (title.hintText) {
        const hint = document.createElement('span');
        hint.className = 'usa-hint';
        watchText(actx, title.hintText, (text) => { hint.textContent = text; });
        fieldset.appendChild(hint);
    }
    return fieldset;
}

export function renderUSWDSGroup(
    behavior: GroupLayoutBehavior,
    parent: HTMLElement,
    actx: AdapterContext,
): void {
    const el = document.createElement('div');
    const content = buildGroupShell(el, behavior, actx);
    applyNodePresentation(el, behavior.comp, actx);
    parent.appendChild(el);

    behavior.renderChildren(content);
    actx.onDispose(behavior.bind({ root: el }));
}

/**
 * A repeatable group's frame, shared by the fieldset and card renders: the bound root shaped as a titled
 * group, the row list and Add inside it, and the polite announcer after it. Only the rows differ.
 */
export function buildRepeatFrame(
    behavior: RepeatGroupLayoutBehavior,
    parent: HTMLElement,
    actx: AdapterContext,
    addButtonClass: string,
): Required<RepeatGroupRefs> {
    const root = document.createElement('div');
    root.className = 'formspec-stack';
    root.dataset.bind = behavior.bindKey;
    applyNodePresentation(root, behavior.comp, actx);
    parent.appendChild(root);
    const content = buildGroupShell(root, behavior, actx);

    const list = document.createElement('div');
    list.className = 'formspec-stack';
    content.appendChild(list);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    // `formspec-repeat-add` is structural: the layout sheet sizes the button to its label instead of the column.
    addButton.className = `${addButtonClass} formspec-repeat-add`;
    addButton.addEventListener('click', () => behavior.addInstance());
    watchText(actx, behavior.addLabel, (text) => { addButton.textContent = text; });
    content.appendChild(addButton);

    const announcer = document.createElement('div');
    announcer.className = 'formspec-sr-only';
    announcer.setAttribute('aria-live', 'polite');
    root.appendChild(announcer);

    return { root, list, addButton, announcer };
}

export function renderUSWDSRepeatGroup(
    behavior: RepeatGroupLayoutBehavior,
    parent: HTMLElement,
    actx: AdapterContext,
): void {
    const refs = buildRepeatFrame(behavior, parent, actx, 'usa-button usa-button--outline');
    const { list } = refs;

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

    actx.onDispose(behavior.bind(refs));
}
