/** @filedesc Default DOM for bound groups and repeatable groups — `.formspec-group` and `.formspec-repeat`. */
import type { AdapterRenderFn } from '../types';
import type { GroupLayoutBehavior, RepeatGroupLayoutBehavior } from '../layout-behaviors';
import { watchText } from '../watch-text';
import { applySurfaceProps } from './layout';

export const renderGroup: AdapterRenderFn<GroupLayoutBehavior> = (behavior, parent, actx) => {
    const node = behavior.comp;
    const el = document.createElement('div');
    el.className = 'formspec-group';
    if (node.cssClasses?.length > 0) actx.applyClassValue(el, node.cssClasses);
    actx.applyAccessibility(el, node);
    actx.applyStyle(el, node.style);
    applySurfaceProps(el, node.props, behavior.host.resolveToken);

    if (behavior.titleText) {
        const heading = document.createElement(behavior.headingLevel);
        heading.className = 'formspec-group-title';
        watchText(actx, behavior.titleText, (text) => { heading.textContent = text; });
        el.appendChild(heading);
    }
    parent.appendChild(el);

    behavior.renderChildren(el);
    actx.onDispose(behavior.bind({ root: el }));
};

export const renderRepeatGroup: AdapterRenderFn<RepeatGroupLayoutBehavior> = (behavior, parent, actx) => {
    const container = document.createElement('div');
    container.className = 'formspec-repeat';
    container.dataset.bind = behavior.bindKey;
    parent.appendChild(container);

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
            const row = document.createElement('div');
            row.className = 'formspec-repeat-instance';
            row.setAttribute('role', 'group');
            list.appendChild(row);

            const header = document.createElement('div');
            header.className = 'formspec-repeat-instance-header';
            const rowLabel = document.createElement('p');
            rowLabel.className = 'formspec-repeat-instance-label';
            header.appendChild(rowLabel);
            row.appendChild(header);

            const removeBtn = rows.canRemove ? document.createElement('button') : null;
            if (removeBtn) {
                removeBtn.type = 'button';
                removeBtn.className = 'formspec-repeat-remove formspec-button-danger formspec-focus-ring';
                const removeIdx = idx;
                removeBtn.addEventListener('click', () => behavior.removeInstance(removeIdx));
                header.appendChild(removeBtn);
            }

            const text = rows.rowText(idx);
            rows.watch(() => {
                row.setAttribute('aria-label', text.ariaLabel.value);
                rowLabel.textContent = text.label.value;
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
};
