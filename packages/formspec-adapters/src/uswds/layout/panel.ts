/** @filedesc USWDS Panel layout — `usa-card` with optional heading and body slot. */
import type { AdapterContext, PanelLayoutBehavior } from '@formspec-org/webcomponent';
import { applyUSWDSSurfaceProps } from './grid-shared';

export function renderUSWDSPanel(behavior: PanelLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleText, descriptionText } = behavior;
    const card = document.createElement('div');
    if (comp.id) card.id = comp.id;
    card.className = 'usa-card';
    if (comp.placement) {
        card.dataset.placement = comp.placement;
        card.style.order = comp.placement === 'left' ? '-1' : '1';
    }
    if (comp.width) card.style.width = comp.width;

    const container = document.createElement('div');
    container.className = 'usa-card__container';

    if (titleText) {
        const header = document.createElement('div');
        header.className = 'usa-card__header';
        const h = document.createElement('h3');
        h.className = 'usa-card__heading';
        h.textContent = titleText;
        header.appendChild(h);
        container.appendChild(header);
    }

    const body = document.createElement('div');
    body.className = 'usa-card__body';

    if (descriptionText) {
        const p = document.createElement('p');
        p.className = 'usa-hint formspec-panel-description';
        p.textContent = descriptionText;
        body.appendChild(p);
    }

    for (const child of comp.children || []) {
        host.renderComponent(child, body, host.prefix);
    }
    container.appendChild(body);
    card.appendChild(container);

    actx.applyCssClass(card, comp);
    actx.applyAccessibility(card, comp);
    actx.applyStyle(card, comp.style);
    applyUSWDSSurfaceProps(card, comp, host.resolveToken);
    parent.appendChild(card);
}
