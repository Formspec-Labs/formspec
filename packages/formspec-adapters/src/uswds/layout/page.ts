/** @filedesc USWDS Section layout — `usa-section` + `grid-container` + `usa-prose` for body content. */
import type { AdapterContext, SectionLayoutBehavior } from '@formspec-org/webcomponent';
import { applyUSWDSSurfaceProps } from './grid-shared';

export function renderUSWDSSection(behavior: SectionLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleText, headingLevel, descriptionText } = behavior;

    // Navigation containers (wizard / tabs) already provide the panel shell, heading, and spacing.
    // Rendering a full Section inside them duplicates titles and narrows the content unexpectedly.
    if (parent.classList.contains('formspec-wizard-panel') || parent.classList.contains('formspec-tab-panel')) {
        for (const child of comp.children || []) {
            host.renderComponent(child, parent, host.prefix);
        }
        return;
    }

    const section = document.createElement('section');
    if (comp.id) section.id = comp.id;
    section.className = 'usa-section formspec-section';
    actx.applyCssClass(section, comp);
    actx.applyAccessibility(section, comp);
    actx.applyStyle(section, comp.style);
    applyUSWDSSurfaceProps(section, comp, host.resolveToken);

    const container = document.createElement('div');
    container.className = 'grid-container';

    const prose = document.createElement('div');
    prose.className = 'usa-prose';

    if (titleText) {
        const h = document.createElement(headingLevel);
        h.textContent = titleText;
        prose.appendChild(h);
    }
    if (descriptionText) {
        const p = document.createElement('p');
        p.className = 'formspec-section-description';
        p.textContent = descriptionText;
        prose.appendChild(p);
    }

    for (const child of comp.children || []) {
        host.renderComponent(child, prose, host.prefix);
    }

    container.appendChild(prose);
    section.appendChild(container);
    parent.appendChild(section);
}
