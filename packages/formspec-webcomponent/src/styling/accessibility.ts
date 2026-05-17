/** @filedesc Applies ARIA role, description, and live-region attributes from component specs. */
import type { StylingHost } from './index';

/** Counter for generating unique IDs for accessibility description elements. */
let a11yDescIdCounter = 0;

import type { ComponentPresentationSource } from '../hub-types.js';

export function applyAccessibility(_host: StylingHost, el: HTMLElement, comp: ComponentPresentationSource): void {
    if (!comp.accessibility) return;
    const a11y = comp.accessibility;
    if (a11y.role) el.setAttribute('role', a11y.role);
    const description = a11y.description ?? a11y.ariaDescription;
    if (description) {
        el.setAttribute('aria-description', description);
        const descId = `formspec-a11y-desc-${++a11yDescIdCounter}`;
        const descEl = document.createElement('span');
        descEl.id = descId;
        descEl.className = 'formspec-sr-only';
        descEl.textContent = description;
        el.appendChild(descEl);
        const existing = el.getAttribute('aria-describedby');
        el.setAttribute('aria-describedby', existing ? `${existing} ${descId}` : descId);
    }
    if (a11y.liveRegion) el.setAttribute('aria-live', a11y.liveRegion);
}
