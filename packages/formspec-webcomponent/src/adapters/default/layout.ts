/** @filedesc Default DOM for layout components — used by default adapter and as reference for design-system adapters. */
import { effect } from '@preact/signals-core';
import {
    positionPopupNearTrigger,
    clearPopupFixedPosition,
    type PopupPlacement,
} from '@formspec-org/layout';
import type { AdapterContext } from '../types';
import { focusFirstIn } from '../../dom-utils';
import { renderDividerDOM } from '../divider';
import { watchText } from '../watch-text';
import type {
    LocalizedText,
    SectionLayoutBehavior,
    StackLayoutBehavior,
    GridLayoutBehavior,
    DividerLayoutBehavior,
    CollapsibleLayoutBehavior,
    PanelLayoutBehavior,
    AccordionLayoutBehavior,
    ModalLayoutBehavior,
    PopoverLayoutBehavior,
} from '../layout-behaviors';

function parseModalPlacement(comp: any): PopupPlacement | undefined {
    const p = comp.placement as string | undefined;
    if (p === 'top' || p === 'right' || p === 'bottom' || p === 'left') return p;
    return undefined;
}

export function applySurfaceProps(el: HTMLElement, comp: any, resolveToken: (value: unknown) => unknown): void {
    if (comp.padding != null) el.style.padding = String(resolveToken(comp.padding));
    if (comp.background != null) el.style.background = String(resolveToken(comp.background));
    if (comp.border != null) el.style.border = String(resolveToken(comp.border));
    if (comp.radius != null) el.style.borderRadius = String(resolveToken(comp.radius));
    if (comp.elevation != null) el.dataset.elevation = String(resolveToken(comp.elevation));
}

function stackJustifyContent(value: unknown): string | undefined {
    switch (value) {
        case 'between':
            return 'space-between';
        case 'around':
            return 'space-around';
        case 'evenly':
            return 'space-evenly';
        case 'start':
        case 'center':
        case 'end':
            return String(value);
        default:
            return undefined;
    }
}

/** Internal helper to render standard layout title/description headers, the title at the layout's depth. */
function renderLayoutHeader(
    el: HTMLElement,
    titleText: LocalizedText | null,
    descriptionText: LocalizedText | null,
    actx: AdapterContext,
    headingLevel: number,
): void {
    if (titleText) {
        const h = document.createElement(`h${headingLevel}`);
        h.className = 'formspec-layout-title';
        watchText(actx, titleText, (text) => { h.textContent = text; });
        el.appendChild(h);
    }
    if (descriptionText) {
        const p = document.createElement('p');
        p.className = 'formspec-layout-description';
        watchText(actx, descriptionText, (text) => { p.textContent = text; });
        el.appendChild(p);
    }
}

export function renderSection(behavior: SectionLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleText, headingLevel, descriptionText } = behavior;
    const el = document.createElement('section');
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-section';
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    applySurfaceProps(el, comp, host.resolveToken);
    if (titleText) {
        const h = document.createElement(headingLevel);
        watchText(actx, titleText, (text) => { h.textContent = text; });
        el.appendChild(h);
    }
    if (descriptionText) {
        const desc = document.createElement('p');
        desc.className = 'formspec-section-description';
        watchText(actx, descriptionText, (text) => { desc.textContent = text; });
        el.appendChild(desc);
    }
    parent.appendChild(el);
    for (const child of comp.children || []) {
        host.renderComponent(child, el, host.prefix);
    }
}

export function renderStack(behavior: StackLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleText, descriptionText } = behavior;
    const el = document.createElement('div');
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-stack';
    if (comp.direction === 'horizontal') el.classList.add('formspec-stack--horizontal');
    if (comp.align) el.dataset.align = comp.align;
    const justifyContent = stackJustifyContent(comp.justify);
    if (justifyContent) el.style.justifyContent = justifyContent;
    if (comp.wrap) el.classList.add('formspec-stack--wrap');
    if (comp.gap) el.style.gap = String(host.resolveToken(comp.gap));
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    applySurfaceProps(el, comp, host.resolveToken);

    renderLayoutHeader(el, titleText, descriptionText, actx, host.headingLevel);

    parent.appendChild(el);
    for (const child of comp.children || []) {
        host.renderComponent(child, el, host.prefix);
    }
}

export function renderGrid(behavior: GridLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleText, descriptionText } = behavior;
    const el = document.createElement('div');
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-grid';
    if (comp.columns != null) {
        if (typeof comp.columns === 'number') {
            el.dataset.columns = String(comp.columns);
            el.style.gridTemplateColumns = `repeat(${comp.columns}, 1fr)`;
        } else if (Array.isArray(comp.columns)) {
            el.style.gridTemplateColumns = comp.columns
                .map((track: unknown) => typeof track === 'number' ? `${track}fr` : String(track))
                .join(' ');
        } else {
            el.style.gridTemplateColumns = comp.columns;
        }
    }
    if (comp.gap) el.style.gap = String(host.resolveToken(comp.gap));
    if (comp.rowGap) el.style.rowGap = String(host.resolveToken(comp.rowGap));
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    applySurfaceProps(el, comp, host.resolveToken);

    renderLayoutHeader(el, titleText, descriptionText, actx, host.headingLevel);

    parent.appendChild(el);
    for (const child of comp.children || []) {
        host.renderComponent(child, el, host.prefix);
    }
}

export function renderDivider(behavior: DividerLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    renderDividerDOM(behavior, parent, actx, {
        rule: 'formspec-divider',
        labeled: 'formspec-divider formspec-divider--labeled',
        line: 'formspec-divider-line',
        label: 'formspec-divider-label',
    });
}

export function renderCollapsible(behavior: CollapsibleLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleText, descriptionText } = behavior;
    const details = document.createElement('details');
    if (comp.id) details.id = comp.id;
    details.className = 'formspec-collapsible';
    if (comp.defaultOpen) details.open = true;

    const summary = document.createElement('summary');
    summary.className = 'formspec-focus-ring';
    watchText(actx, titleText, (text) => { summary.textContent = text; });
    details.appendChild(summary);

    const content = document.createElement('div');
    content.className = 'formspec-collapsible-content';

    if (descriptionText) {
        const p = document.createElement('p');
        p.className = 'formspec-collapsible-description';
        watchText(actx, descriptionText, (text) => { p.textContent = text; });
        content.appendChild(p);
    }

    details.appendChild(content);

    for (const child of comp.children || []) {
        host.renderComponent(child, content, host.prefix);
    }

    actx.applyCssClass(details, comp);
    actx.applyAccessibility(details, comp);
    actx.applyStyle(details, comp.style);
    parent.appendChild(details);
}

export function renderPanel(behavior: PanelLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleText, descriptionText } = behavior;
    const el = document.createElement('div');
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-panel';
    if (comp.placement) {
        el.dataset.placement = comp.placement;
        el.style.order = comp.placement === 'left' ? '-1' : '1';
    }
    if (comp.width) el.style.width = comp.width;

    const container = document.createElement('div');
    container.className = 'formspec-panel-container';

    if (titleText) {
        const header = document.createElement('div');
        header.className = 'formspec-panel-header';
        watchText(actx, titleText, (text) => { header.textContent = text; });
        container.appendChild(header);
    }

    const body = document.createElement('div');
    body.className = 'formspec-panel-body';

    if (descriptionText) {
        const p = document.createElement('p');
        p.className = 'formspec-panel-description';
        watchText(actx, descriptionText, (text) => { p.textContent = text; });
        body.appendChild(p);
    }

    container.appendChild(body);
    el.appendChild(container);

    for (const child of comp.children || []) {
        host.renderComponent(child, body, host.prefix);
    }

    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    applySurfaceProps(el, comp, host.resolveToken);
    parent.appendChild(el);
}

export function renderAccordion(behavior: AccordionLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, repeatCount, groupLabel, relevant, canAdd, addInstance, removeInstance } = behavior;
    const el = document.createElement('div');
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-accordion';
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);

    const bindKey = comp.bind;
    const detailsEls: HTMLDetailsElement[] = [];
    let previousCount = 0;

    if (bindKey) {
        const wrapper = document.createElement('div');
        wrapper.className = 'formspec-repeat formspec-repeat--accordion';
        wrapper.dataset.bind = bindKey;
        parent.appendChild(wrapper);
        wrapper.appendChild(el);
        el.classList.add('formspec-accordion--repeat');
        const fullName = host.prefix ? `${host.prefix}.${bindKey}` : bindKey;
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'formspec-repeat-add formspec-focus-ring';
        const liveRegion = document.createElement('div');
        liveRegion.className = 'formspec-sr-only';
        liveRegion.setAttribute('aria-live', 'polite');
        host.cleanupFns.push(effect(() => {
            addBtn.textContent = `Add ${groupLabel.value}`;
        }));
        host.cleanupFns.push(effect(() => {
            wrapper.classList.toggle('formspec-hidden', !relevant.value);
        }));
        host.cleanupFns.push(effect(() => {
            addBtn.classList.toggle('formspec-hidden', !canAdd.value);
        }));
        behavior.renderRows((rows) => {
            const { count } = rows;
            const expandedIndex = typeof comp.defaultOpen === 'number'
                ? comp.defaultOpen
                : count > 0
                    ? count - 1
                    : -1;
            el.replaceChildren();
            detailsEls.length = 0;

            for (let i = 0; i < count; i++) {
                const details = document.createElement('details');
                details.className = 'formspec-accordion-item';
                if (i === expandedIndex || (count > previousCount && i === count - 1)) {
                    details.open = true;
                }

                const summary = document.createElement('summary');
                summary.className = 'formspec-focus-ring';
                const label = behavior.sectionLabel(i);
                rows.watch(() => { summary.textContent = label.value; });
                details.appendChild(summary);

                const content = document.createElement('div');
                content.className = 'formspec-accordion-content formspec-accordion-content--repeat';
                const instancePrefix = `${fullName}[${i}]`;
                for (const child of comp.children || []) {
                    rows.renderComponent(child, content, instancePrefix);
                }
                if (rows.canRemove) {
                    const removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.className = 'formspec-repeat-remove formspec-button-danger formspec-focus-ring';
                    const idx = i;
                    rows.watch(() => {
                        removeBtn.textContent = `Remove ${groupLabel.value}`;
                        removeBtn.setAttribute('aria-label', `Remove ${groupLabel.value} ${idx + 1}`);
                    });
                    removeBtn.addEventListener('click', () => {
                        removeInstance(idx);
                        const newCount = Math.max(0, count - 1);
                        liveRegion.textContent = `${groupLabel.value} ${idx + 1} removed. ${newCount} remaining.`;
                        queueMicrotask(() => {
                            if (newCount === 0) {
                                addBtn.focus();
                                return;
                            }
                            const targetDetails = detailsEls[Math.min(idx, newCount - 1)];
                            targetDetails?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
                        });
                    });
                    content.appendChild(removeBtn);
                }
                details.appendChild(content);

                details.addEventListener('toggle', () => {
                    if (details.open && !comp.allowMultiple) {
                        detailsEls.forEach(d => { if (d !== details) d.open = false; });
                    }
                });

                el.appendChild(details);
                detailsEls.push(details);
            }

            previousCount = count;
        });
        addBtn.addEventListener('click', () => {
            if (!canAdd.value) return;
            addInstance();
            const newCount = repeatCount.value;
            liveRegion.textContent = `${groupLabel.value} ${newCount} added. ${newCount} total.`;
            queueMicrotask(() => {
                const latest = detailsEls[detailsEls.length - 1];
                latest?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
            });
        });
        wrapper.appendChild(addBtn);
        wrapper.appendChild(liveRegion);
    } else {
        parent.appendChild(el);
        const children: any[] = comp.children || [];
        for (let i = 0; i < children.length; i++) {
            const details = document.createElement('details');
            details.className = 'formspec-accordion-item';
            if (comp.defaultOpen === i) details.open = true;

            const summary = document.createElement('summary');
            summary.className = 'formspec-focus-ring';
            watchText(actx, behavior.sectionLabel(i), (text) => { summary.textContent = text; });
            details.appendChild(summary);

            const content = document.createElement('div');
            content.className = 'formspec-accordion-content';
            host.renderComponent(children[i], content, host.prefix);
            details.appendChild(content);

            details.addEventListener('toggle', () => {
                if (details.open && !comp.allowMultiple) {
                    detailsEls.forEach(d => { if (d !== details) d.open = false; });
                }
            });

            el.appendChild(details);
            detailsEls.push(details);
        }
    }
}

export function renderModal(behavior: ModalLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleText, triggerLabelText } = behavior;
    const placement = parseModalPlacement(comp);
    const dialog = document.createElement('dialog');
    if (comp.id) dialog.id = comp.id;
    dialog.className = 'formspec-modal';
    if (comp.size) dialog.dataset.size = comp.size;

    if (comp.closable !== false) {
        dialog.addEventListener('click', (e: MouseEvent) => {
            if (e.target === dialog) dialog.close();
        });
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'formspec-modal-close formspec-focus-ring';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.innerHTML = '<span aria-hidden="true">\u00d7</span>';
        closeBtn.addEventListener('click', () => dialog.close());
        dialog.appendChild(closeBtn);
    }

    if (titleText) {
        const titleId = `${comp.id || 'modal'}-title`;
        const hl = Math.min(6, Math.max(1, Number(comp.headingLevel) || 2));
        const titleEl = document.createElement(`h${hl}`);
        titleEl.className = 'formspec-modal-title';
        titleEl.id = titleId;
        watchText(actx, titleText, (text) => { titleEl.textContent = text; });
        dialog.appendChild(titleEl);
        dialog.setAttribute('aria-labelledby', titleId);
    } else if (comp.triggerLabel) {
        watchText(actx, triggerLabelText, (text) => { dialog.setAttribute('aria-label', text); });
    }

    const content = document.createElement('div');
    content.className = 'formspec-modal-content';
    dialog.appendChild(content);

    for (const child of comp.children || []) {
        host.renderComponent(child, content, host.prefix);
    }

    actx.applyCssClass(dialog, comp);
    actx.applyAccessibility(dialog, comp);
    actx.applyStyle(dialog, comp.style);

    const scheduleFocus = () => queueMicrotask(() => focusFirstIn(dialog));
    const whenPx = (comp.whenPrefix as string | undefined) ?? host.prefix;

    const triggerMode = comp.trigger || 'button';
    if (triggerMode === 'auto') {
        parent.appendChild(dialog);
        dialog.addEventListener('close', () => clearPopupFixedPosition(dialog));
        if (comp.when) {
            const exprFn = host.engine.compileExpression(comp.when, whenPx);
            host.cleanupFns.push(effect(() => {
                const shouldOpen = !!exprFn();
                if (shouldOpen && !dialog.open) {
                    clearPopupFixedPosition(dialog);
                    dialog.showModal();
                    scheduleFocus();
                } else if (!shouldOpen && dialog.open) {
                    dialog.close();
                }
            }));
        } else {
            queueMicrotask(() => {
                clearPopupFixedPosition(dialog);
                if (!dialog.open) dialog.showModal();
                scheduleFocus();
            });
        }
        return;
    }

    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'formspec-modal-trigger formspec-focus-ring';
    watchText(actx, triggerLabelText, (text) => { triggerBtn.textContent = text; });

    const repositionDialog = () => {
        if (!dialog.open) return;
        if (placement) {
            positionPopupNearTrigger(triggerBtn, dialog, placement);
        } else {
            clearPopupFixedPosition(dialog);
        }
    };

    triggerBtn.addEventListener('click', () => {
        if (!dialog.open) {
            clearPopupFixedPosition(dialog);
            dialog.showModal();
        }
        queueMicrotask(() => {
            repositionDialog();
            focusFirstIn(dialog);
        });
    });
    window.addEventListener('resize', repositionDialog);
    window.addEventListener('scroll', repositionDialog, true);
    actx.onDispose(() => {
        window.removeEventListener('resize', repositionDialog);
        window.removeEventListener('scroll', repositionDialog, true);
    });
    dialog.addEventListener('close', () => {
        clearPopupFixedPosition(dialog);
        triggerBtn.focus();
    });
    parent.appendChild(triggerBtn);
    parent.appendChild(dialog);
}

export function renderPopover(behavior: PopoverLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleResolved, triggerLabelFallback } = behavior;
    const placement: PopupPlacement = comp.placement || 'bottom';
    const wrapper = document.createElement('div');
    if (comp.id) wrapper.id = comp.id;
    wrapper.className = 'formspec-popover';

    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'formspec-popover-trigger formspec-focus-ring';
    triggerBtn.setAttribute('aria-haspopup', 'dialog');
    triggerBtn.setAttribute('aria-expanded', 'false');

    const triggerPath = comp.triggerBind
        ? (host.prefix ? `${host.prefix}.${comp.triggerBind}` : comp.triggerBind)
        : null;
    const triggerSignal = triggerPath ? host.engine.signals[triggerPath] : null;
    if (triggerSignal) {
        host.cleanupFns.push(effect(() => {
            const val = triggerSignal.value;
            triggerBtn.textContent = val === undefined || val === null || val === ''
                ? triggerLabelFallback.value
                : String(val);
        }));
    } else {
        watchText(actx, triggerLabelFallback, (text) => { triggerBtn.textContent = text; });
    }

    const content = document.createElement('div');
    content.className = 'formspec-popover-content';
    content.setAttribute('role', 'dialog');
    watchText(actx, titleResolved, (text) => { content.setAttribute('aria-label', text); });
    if (comp.placement) {
        content.dataset.placement = comp.placement;
    }

    for (const child of comp.children || []) {
        host.renderComponent(child, content, host.prefix);
    }

    const focusFirstInContent = () => focusFirstIn(content);

    const closePopover = () => {
        const contentAny = content as any;
        if (typeof contentAny.hidePopover === 'function') {
            try { contentAny.hidePopover(); } catch { /* already hidden */ }
        } else {
            content.hidden = true;
        }
        triggerBtn.setAttribute('aria-expanded', 'false');
        triggerBtn.focus();
    };

    content.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closePopover();
        }
    });

    const contentAny = content as any;
    if (typeof contentAny.showPopover === 'function') {
        contentAny.popover = 'auto';
        triggerBtn.addEventListener('click', () => {
            contentAny.togglePopover();
            const isOpen = contentAny.matches(':popover-open');
            triggerBtn.setAttribute('aria-expanded', String(isOpen));
            if (isOpen) {
                queueMicrotask(() => {
                    positionPopupNearTrigger(triggerBtn, content, placement);
                    focusFirstInContent();
                });
            }
        });
    } else {
        content.hidden = true;
        const onClickOutside = (e: MouseEvent) => {
            if (!wrapper.contains(e.target as Node)) closePopover();
        };
        triggerBtn.addEventListener('click', () => {
            content.hidden = !content.hidden;
            triggerBtn.setAttribute('aria-expanded', String(!content.hidden));
            if (!content.hidden) {
                queueMicrotask(() => {
                    positionPopupNearTrigger(triggerBtn, content, placement);
                    focusFirstInContent();
                });
                document.addEventListener('click', onClickOutside, true);
            } else {
                document.removeEventListener('click', onClickOutside, true);
            }
        });
        actx.onDispose(() => document.removeEventListener('click', onClickOutside, true));
    }

    wrapper.appendChild(triggerBtn);
    wrapper.appendChild(content);
    actx.applyCssClass(wrapper, comp);
    actx.applyAccessibility(wrapper, comp);
    actx.applyStyle(wrapper, comp.style);
    parent.appendChild(wrapper);
}
