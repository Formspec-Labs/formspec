/** @filedesc USWDS-styled divider — horizontal rule or flex row with label (tokens via formspec-uswds-divider SCSS). */
import type { AdapterContext, DividerLayoutBehavior } from '@formspec-org/webcomponent';

export function renderUSWDSDivider(behavior: DividerLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, labelText } = behavior;
    if (labelText) {
        const wrapper = document.createElement('div');
        if (comp.id) wrapper.id = comp.id;
        wrapper.className = 'formspec-uswds-divider formspec-uswds-divider--labeled';

        const lineBefore = document.createElement('hr');
        lineBefore.className = 'formspec-uswds-divider__line';

        const labelEl = document.createElement('span');
        labelEl.className = 'usa-hint';
        behavior.watchLabel((text) => { labelEl.textContent = text; });

        const lineAfter = document.createElement('hr');
        lineAfter.className = 'formspec-uswds-divider__line';

        wrapper.appendChild(lineBefore);
        wrapper.appendChild(labelEl);
        wrapper.appendChild(lineAfter);
        actx.applyCssClass(wrapper, comp);
        actx.applyAccessibility(wrapper, comp);
        actx.applyStyle(wrapper, comp.style);
        parent.appendChild(wrapper);
    } else {
        const hr = document.createElement('hr');
        if (comp.id) hr.id = comp.id;
        hr.className = 'formspec-uswds-divider';
        actx.applyCssClass(hr, comp);
        actx.applyAccessibility(hr, comp);
        actx.applyStyle(hr, comp.style);
        parent.appendChild(hr);
    }
}
