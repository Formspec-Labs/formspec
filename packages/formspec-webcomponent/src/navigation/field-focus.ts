/** @filedesc Field focus and reveal logic for wizard panels, tabs, and collapsibles. */
import type { NavigationHost } from './index.js';
import { normalizeFieldPath } from './paths.js';

/** Field root for a resolved instance path (0-based indexes, as in `ValidationResult.path` and `data-name`). */
export function findFieldElement(host: NavigationHost, path: string): HTMLElement | null {
    if (!path || path === '#') return null;

    const escapedPath = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(path) : path;
    // `data-name` on the field root is the cross-adapter field identity (default, USWDS, Tailwind,
    // React); design-system roots (usa-form-group, fieldsets) do not carry `formspec-field`.
    const fieldEl = host.querySelector(`[data-name="${escapedPath}"]`) as HTMLElement | null;
    if (fieldEl) return fieldEl;

    const found = Array.from(host.querySelectorAll('[data-name]')).find((el) => {
        const name = el.getAttribute('data-name');
        return name?.startsWith(`${path}.`) || name?.startsWith(`${path}[`);
    }) as HTMLElement | undefined;
    return found ?? null;
}

export function revealTabsForField(_host: NavigationHost, fieldEl: HTMLElement): void {
    let tabPanel = fieldEl.closest('.formspec-tab-panel') as HTMLElement | null;
    while (tabPanel) {
        const tabsRoot = tabPanel.closest('.formspec-tabs');
        if (tabsRoot instanceof HTMLElement) {
            const panelContainer = tabPanel.parentElement;
            const panels = panelContainer
                ? Array.from(panelContainer.children).filter((child) => child.classList.contains('formspec-tab-panel'))
                : [];
            const panelIndex = panels.indexOf(tabPanel);
            if (panelIndex >= 0) {
                tabsRoot.dispatchEvent(new CustomEvent('formspec-tabs-set-active', {
                    detail: { index: panelIndex },
                    bubbles: false,
                }));
            }
        }
        tabPanel = tabPanel.parentElement?.closest('.formspec-tab-panel') as HTMLElement | null;
    }
}

export function focusField(host: NavigationHost, path: string): boolean {
    const normalizedPath = normalizeFieldPath(path);
    let fieldEl = findFieldElement(host, normalizedPath);
    if (!fieldEl) return false;

    const wizardPanel = fieldEl.closest('.formspec-wizard-panel');
    const wizardRoot = wizardPanel?.closest('.formspec-wizard');
    if (wizardPanel instanceof HTMLElement && wizardRoot instanceof HTMLElement) {
        const panelList = Array.from(wizardRoot.querySelectorAll('.formspec-wizard-panel'))
            .filter((panel) => panel.closest('.formspec-wizard') === wizardRoot);
        const panelIndex = panelList.indexOf(wizardPanel);
        if (panelIndex >= 0) {
            wizardRoot.dispatchEvent(new CustomEvent('formspec-wizard-set-step', {
                detail: { index: panelIndex },
                bubbles: false,
            }));
            fieldEl = findFieldElement(host, normalizedPath);
            if (!fieldEl) return false;
        }
    }

    revealTabsForField(host, fieldEl);
    fieldEl = findFieldElement(host, normalizedPath);
    if (!fieldEl) return false;

    let collapsible = fieldEl.closest('details.formspec-collapsible') as HTMLDetailsElement | null;
    while (collapsible) {
        collapsible.open = true;
        collapsible = collapsible.parentElement?.closest('details.formspec-collapsible') as HTMLDetailsElement | null;
    }

    const inputEl = fieldEl.querySelector('input, select, textarea, button, [tabindex]');
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    fieldEl.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
    if (inputEl instanceof HTMLElement) {
        inputEl.focus({ preventScroll: true });
    }
    return true;
}
