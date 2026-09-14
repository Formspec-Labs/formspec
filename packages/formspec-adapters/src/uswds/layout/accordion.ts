/** @filedesc USWDS Accordion — `usa-accordion` buttons + regions; repeat-bind mirrors default adapter behavior. */
import { effect } from '@preact/signals-core';
import type { AdapterContext, AccordionLayoutBehavior } from '@formspec-org/webcomponent';

function wireAccordionPanel(
    button: HTMLButtonElement,
    content: HTMLElement,
    panels: { button: HTMLButtonElement; content: HTMLElement }[],
    allowMultiple: boolean | undefined
): void {
    button.addEventListener('click', () => {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        if (expanded) {
            button.setAttribute('aria-expanded', 'false');
            content.hidden = true;
        } else {
            if (!allowMultiple) {
                for (const p of panels) {
                    p.button.setAttribute('aria-expanded', 'false');
                    p.content.hidden = true;
                }
            }
            button.setAttribute('aria-expanded', 'true');
            content.hidden = false;
        }
    });
}

export function renderUSWDSAccordion(
    behavior: AccordionLayoutBehavior,
    parent: HTMLElement,
    actx: AdapterContext
): void {
    const { comp, host, repeatCount, groupLabel, relevant, canAdd, canRemove, addInstance, removeInstance } = behavior;
    const el = document.createElement('div');
    if (comp.id) el.id = comp.id;
    el.className = 'usa-accordion formspec-accordion';
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);

    const bindKey = comp.bind;
    const labels: string[] = comp.labels || [];
    const panels: { button: HTMLButtonElement; content: HTMLElement }[] = [];
    let previousCount = 0;
    const idPrefix = comp.id ? `${comp.id}-` : 'acc-';

    if (bindKey) {
        // One container holds panels, Add, and the live region so relevance hides all repeat chrome together.
        const wrapper = document.createElement('div');
        wrapper.className = 'formspec-repeat formspec-repeat--accordion';
        wrapper.dataset.bind = bindKey;
        parent.appendChild(wrapper);
        wrapper.appendChild(el);
        el.classList.add('formspec-accordion--repeat');
        const fullName = host.prefix ? `${host.prefix}.${bindKey}` : bindKey;

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'usa-button usa-button--outline formspec-repeat-add formspec-focus-ring';
        addBtn.textContent = `Add ${groupLabel}`;
        const liveRegion = document.createElement('div');
        liveRegion.className = 'formspec-sr-only';
        liveRegion.setAttribute('aria-live', 'polite');
        const focusPanel = (panel: { content: HTMLElement } | undefined) =>
            panel?.content.querySelector<HTMLElement>('input, select, textarea, button')?.focus();

        host.cleanupFns.push(effect(() => {
            wrapper.classList.toggle('formspec-hidden', !relevant.value);
        }));
        host.cleanupFns.push(effect(() => {
            addBtn.classList.toggle('formspec-hidden', !canAdd.value);
        }));
        host.cleanupFns.push(
            effect(() => {
                const count = repeatCount.value;
                const showRemove = canRemove.value;
                const expandedIndex =
                    typeof comp.defaultOpen === 'number'
                        ? comp.defaultOpen
                        : count > 0
                          ? count - 1
                          : -1;
                el.replaceChildren();
                panels.length = 0;

                for (let i = 0; i < count; i++) {
                    const contentId = `${idPrefix}panel-${i}`;
                    const heading = document.createElement('h4');
                    heading.className = 'usa-accordion__heading';

                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'usa-accordion__button formspec-focus-ring';
                    button.setAttribute('aria-controls', contentId);
                    const shouldOpen = i === expandedIndex || (count > previousCount && i === count - 1);
                    button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
                    button.textContent = labels[i] || `Section ${i + 1}`;
                    heading.appendChild(button);

                    const content = document.createElement('div');
                    content.id = contentId;
                    content.className =
                        'usa-accordion__content usa-prose formspec-accordion-content formspec-accordion-content--repeat';
                    content.hidden = !shouldOpen;

                    const instancePrefix = `${fullName}[${i}]`;
                    for (const child of comp.children || []) {
                        host.renderComponent(child, content, instancePrefix);
                    }
                    if (showRemove) {
                        const removeBtn = document.createElement('button');
                        removeBtn.type = 'button';
                        removeBtn.className = 'usa-button usa-button--unstyled formspec-repeat-remove formspec-focus-ring';
                        removeBtn.textContent = `Remove ${groupLabel}`;
                        removeBtn.setAttribute('aria-label', `Remove ${groupLabel} ${i + 1}`);
                        const idx = i;
                        removeBtn.addEventListener('click', () => {
                            removeInstance(idx);
                            const newCount = Math.max(0, count - 1);
                            liveRegion.textContent = `${groupLabel} ${idx + 1} removed. ${newCount} remaining.`;
                            queueMicrotask(() => {
                                if (newCount === 0) addBtn.focus();
                                else focusPanel(panels[Math.min(idx, newCount - 1)]);
                            });
                        });
                        content.appendChild(removeBtn);
                    }

                    el.appendChild(heading);
                    el.appendChild(content);
                    panels.push({ button, content });
                    wireAccordionPanel(button, content, panels, comp.allowMultiple);
                }

                previousCount = count;
            })
        );

        addBtn.addEventListener('click', () => {
            if (!canAdd.value) return;
            addInstance();
            const newCount = repeatCount.value;
            liveRegion.textContent = `${groupLabel} ${newCount} added. ${newCount} total.`;
            queueMicrotask(() => focusPanel(panels[panels.length - 1]));
        });
        wrapper.appendChild(addBtn);
        wrapper.appendChild(liveRegion);
    } else {
        parent.appendChild(el);
        const children: any[] = comp.children || [];
        for (let i = 0; i < children.length; i++) {
            const contentId = `${idPrefix}panel-${i}`;
            const heading = document.createElement('h4');
            heading.className = 'usa-accordion__heading';

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'usa-accordion__button formspec-focus-ring';
            button.setAttribute('aria-controls', contentId);
            const shouldOpen = comp.defaultOpen === i;
            button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
            button.textContent = labels[i] || `Section ${i + 1}`;
            heading.appendChild(button);

            const content = document.createElement('div');
            content.id = contentId;
            content.className = 'usa-accordion__content usa-prose formspec-accordion-content';
            content.hidden = !shouldOpen;

            host.renderComponent(children[i], content, host.prefix);

            el.appendChild(heading);
            el.appendChild(content);
            panels.push({ button, content });
            wireAccordionPanel(button, content, panels, comp.allowMultiple);
        }
    }
}
