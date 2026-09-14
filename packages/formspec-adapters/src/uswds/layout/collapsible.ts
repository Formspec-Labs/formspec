/** @filedesc USWDS Collapsible — single-panel `usa-accordion` pattern with manual `aria-expanded` / `hidden` (no USWDS JS). */
import { watchText, type AdapterContext, type CollapsibleLayoutBehavior } from '@formspec-org/webcomponent';

export function renderUSWDSCollapsible(
    behavior: CollapsibleLayoutBehavior,
    parent: HTMLElement,
    actx: AdapterContext
): void {
    const { comp, host, titleText } = behavior;
    const baseId = comp.id || `collapsible-${Math.random().toString(36).slice(2, 9)}`;
    const contentId = `${baseId}-content`;

    const root = document.createElement('div');
    if (comp.id) root.id = comp.id;
    root.className = 'usa-accordion formspec-collapsible';

    const heading = document.createElement('h4');
    heading.className = 'usa-accordion__heading';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'usa-accordion__button formspec-focus-ring';
    button.setAttribute('aria-controls', contentId);
    const initiallyOpen = !!comp.defaultOpen;
    button.setAttribute('aria-expanded', initiallyOpen ? 'true' : 'false');
    watchText(actx, titleText, (text) => { button.textContent = text; });

    const content = document.createElement('div');
    content.id = contentId;
    content.className = 'usa-accordion__content usa-prose formspec-collapsible-content';
    if (!initiallyOpen) content.hidden = true;

    for (const child of comp.children || []) {
        host.renderComponent(child, content, host.prefix);
    }

    button.addEventListener('click', () => {
        const open = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', open ? 'false' : 'true');
        content.hidden = open;
    });

    heading.appendChild(button);
    root.appendChild(heading);
    root.appendChild(content);

    actx.applyCssClass(root, comp);
    actx.applyAccessibility(root, comp);
    actx.applyStyle(root, comp.style);
    parent.appendChild(root);
}
