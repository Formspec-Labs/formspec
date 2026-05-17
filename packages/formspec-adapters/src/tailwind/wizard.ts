/** @filedesc Tailwind adapter for page-mode wizard rendering (formPresentation.pageMode: "wizard").
 *
 * This file styles the wizard UI synthesized by emit-node.ts when a Stack root
 * has Page children and formPresentation.pageMode is "wizard". The "Wizard"
 * adapter key is a rendering concept — the Wizard schema component type was
 * removed; all page navigation is now driven by formPresentation. */
import type { WizardBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { TW } from './shared';
import {
    createWizardNav,
    createWizardPanelShell,
    initWizardRoot,
    stepTitle,
} from '../shared/wizard-chrome.js';

export const renderWizard: AdapterRenderFn<WizardBehavior> = (
    behavior, parent, actx
) => {
    const root = initWizardRoot(behavior, parent, actx);
    if (behavior.totalSteps() === 0) return;

    let stepIndicator: HTMLElement | undefined;
    let stepElements: HTMLElement[] | undefined;

    if (behavior.showProgress) {
        stepIndicator = document.createElement('nav');
        stepIndicator.className = 'mb-8';
        stepIndicator.setAttribute('aria-label', 'progress');

        const stepList = document.createElement('ol');
        stepList.className = 'flex items-center';

        stepElements = [];
        for (let i = 0; i < behavior.totalSteps(); i++) {
            const li = document.createElement('li');
            li.className = i < behavior.totalSteps() - 1
                ? 'relative flex-1 pr-8'
                : 'relative';

            const stepContent = document.createElement('div');
            stepContent.className = 'flex items-center';

            const circle = document.createElement('span');
            circle.className = 'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium';
            if (i === 0) {
                circle.style.backgroundColor = 'var(--formspec-tw-accent)';
                circle.style.color = 'var(--formspec-tw-accent-fg)';
            } else {
                circle.style.borderWidth = '2px';
                circle.style.borderStyle = 'solid';
                circle.style.borderColor = 'var(--formspec-tw-border)';
                circle.style.color = 'var(--formspec-tw-muted)';
            }
            circle.textContent = String(i + 1);
            stepContent.appendChild(circle);

            const stepLabel = document.createElement('span');
            stepLabel.className = 'ml-2 text-sm font-medium text-[var(--formspec-tw-text)]';
            stepLabel.textContent = stepTitle(behavior.steps, i);
            stepContent.appendChild(stepLabel);

            li.appendChild(stepContent);

            if (i < behavior.totalSteps() - 1) {
                const connector = document.createElement('div');
                connector.className = 'absolute right-0 top-4 h-0.5 w-full bg-[var(--formspec-tw-border)]';
                connector.style.left = '2rem';
                connector.style.right = '0';
                li.appendChild(connector);
            }

            stepList.appendChild(li);
            stepElements.push(li);
        }

        stepIndicator.appendChild(stepList);
        root.appendChild(stepIndicator);
    }

    const panels: HTMLElement[] = [];
    for (let i = 0; i < behavior.totalSteps(); i++) {
        const panel = createWizardPanelShell({
            behavior,
            index: i,
            ariaLabel: stepTitle(behavior.steps, i),
        });
        behavior.renderStep(i, panel);
        root.appendChild(panel);
        panels.push(panel);
    }

    const { nav, prevButton, nextButton, skipButton } = createWizardNav(behavior, {
        nav: 'formspec-wizard-nav flex justify-between mt-6',
        prev: TW.buttonOutline,
        next: TW.button,
        skip: TW.buttonUnstyled,
    });
    root.appendChild(nav);

    const updateIndicator = (activeIdx: number) => {
        if (!stepElements || activeIdx < 0) return;

        for (let i = 0; i < stepElements.length; i++) {
            const circle = stepElements[i].querySelector('span')!;
            circle.className = 'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium';
            circle.style.backgroundColor = '';
            circle.style.color = '';
            circle.style.borderWidth = '';
            circle.style.borderStyle = '';
            circle.style.borderColor = '';
            if (i === activeIdx) {
                circle.style.backgroundColor = 'var(--formspec-tw-accent)';
                circle.style.color = 'var(--formspec-tw-accent-fg)';
            } else if (i < activeIdx) {
                circle.style.backgroundColor = 'var(--formspec-tw-success)';
                circle.style.color = 'var(--formspec-tw-accent-fg)';
            } else {
                circle.style.borderWidth = '2px';
                circle.style.borderStyle = 'solid';
                circle.style.borderColor = 'var(--formspec-tw-border)';
                circle.style.color = 'var(--formspec-tw-muted)';
            }
        }
    };

    const dispose = behavior.bind({
        root,
        panels,
        stepIndicators: stepElements,
        stepContent: root,
        prevButton,
        nextButton,
        skipButton,
        onStepChange: (stepIndex) => updateIndicator(stepIndex),
    });
    actx.onDispose(dispose);
};
