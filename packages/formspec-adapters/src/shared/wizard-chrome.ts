/** @filedesc Shared wizard shell wiring — root, panels, nav, skip (design-system classes stay in adapters). */
import type { AdapterContext, WizardBehavior } from '@formspec-org/webcomponent';

export function stepTitle(
    steps: WizardBehavior['steps'],
    index: number,
): string {
    return steps[index]?.title || `Step ${index + 1}`;
}

/** Create `formspec-wizard` root, apply component overrides, append to parent. */
export function initWizardRoot(
    behavior: Pick<WizardBehavior, 'id' | 'compOverrides'>,
    parent: HTMLElement,
    actx: Pick<AdapterContext, 'applyCssClass' | 'applyAccessibility' | 'applyStyle'>,
): HTMLElement {
    const root = document.createElement('div');
    if (behavior.id) root.id = behavior.id;
    root.className = 'formspec-wizard';
    if (behavior.compOverrides.cssClass) actx.applyCssClass(root, behavior.compOverrides);
    if (behavior.compOverrides.accessibility) actx.applyAccessibility(root, behavior.compOverrides);
    if (behavior.compOverrides.style) actx.applyStyle(root, behavior.compOverrides.style);
    parent.appendChild(root);
    return root;
}

export interface WizardPanelShellOptions {
    behavior: Pick<WizardBehavior, 'id' | 'steps'>;
    index: number;
    /** Panel `aria-labelledby` target id (USWDS step-indicator panels). */
    labelledById?: string;
    /** Panel `aria-label` when labelledById is omitted (Tailwind). */
    ariaLabel?: string;
    decoratePanel?: (panel: HTMLElement, index: number) => void;
}

/** Standard wizard step panel shell: region, initial visibility, optional a11y hooks. */
export function createWizardPanelShell(options: WizardPanelShellOptions): HTMLElement {
    const { behavior, index, labelledById, ariaLabel, decoratePanel } = options;
    const panel = document.createElement('div');
    panel.className = 'formspec-wizard-panel';
    panel.setAttribute('role', 'region');
    panel.tabIndex = -1;
    if (labelledById) {
        panel.setAttribute('aria-labelledby', labelledById);
    } else if (ariaLabel) {
        panel.setAttribute('aria-label', ariaLabel);
    } else {
        panel.setAttribute('aria-label', stepTitle(behavior.steps, index));
    }
    if (index !== 0) panel.classList.add('formspec-hidden');
    decoratePanel?.(panel, index);
    return panel;
}

export interface WizardNavClasses {
    nav: string;
    prev: string;
    next: string;
    skip?: string;
}

export interface WizardNavResult {
    nav: HTMLElement;
    prevButton: HTMLButtonElement;
    nextButton: HTMLButtonElement;
    skipButton?: HTMLButtonElement;
}

/** Prev / optional skip / next button row shared by USWDS and Tailwind wizards. */
export function createWizardNav(
    behavior: Pick<WizardBehavior, 'allowSkip' | 'canGoNext' | 'activeStep' | 'goToStep'>,
    classes: WizardNavClasses,
    buttonText: { prev?: string; next?: string; skip?: string } = {},
): WizardNavResult {
    const nav = document.createElement('div');
    nav.className = classes.nav;

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = classes.prev;
    prevBtn.textContent = buttonText.prev ?? 'Previous';
    nav.appendChild(prevBtn);

    let skipBtn: HTMLButtonElement | undefined;
    if (behavior.allowSkip) {
        skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = classes.skip ?? 'formspec-wizard-skip';
        skipBtn.textContent = buttonText.skip ?? 'Skip';
        wireWizardSkip(skipBtn, behavior);
        nav.appendChild(skipBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = classes.next;
    nextBtn.textContent = buttonText.next ?? 'Next';
    nav.appendChild(nextBtn);

    return { nav, prevButton: prevBtn, nextButton: nextBtn, skipButton: skipBtn };
}

export function wireWizardSkip(
    skipBtn: HTMLButtonElement,
    behavior: Pick<WizardBehavior, 'canGoNext' | 'activeStep' | 'goToStep'>,
): void {
    skipBtn.addEventListener('click', () => {
        if (behavior.canGoNext()) behavior.goToStep(behavior.activeStep() + 1);
    });
}

/** Polite live region for step announcements (USWDS; optional elsewhere). */
export function createWizardAnnouncer(className: string): HTMLElement {
    const announcer = document.createElement('div');
    announcer.className = className;
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('role', 'status');
    return announcer;
}
