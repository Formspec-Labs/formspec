/** @filedesc Default adapter for Wizard — pure DOM, no signal imports per ADR 0046 (watchText/uiText wrap the reactivity). */
import type { WizardBehavior, WizardSidenavItemRefs, WizardProgressItemRefs } from '../../behaviors/types';
import type { AdapterRenderFn } from '../types';
import { uiText } from '../ui-text.js';
import { watchText } from '../watch-text.js';

export const renderWizard: AdapterRenderFn<WizardBehavior> = (
    behavior, parent, actx
) => {
    const el = document.createElement('div');
    if (behavior.id) el.id = behavior.id;
    el.className = 'formspec-wizard';
    if (behavior.compOverrides.cssClass) actx.applyCssClass(el, behavior.compOverrides, behavior.id);
    if (behavior.compOverrides.accessibility) actx.applyAccessibility(el, behavior.compOverrides);
    if (behavior.compOverrides.style) actx.applyStyle(el, behavior.compOverrides.style);
    parent.appendChild(el);

    if (behavior.totalSteps() === 0) return;

    const showSideNav = behavior.showSideNav;
    let container: HTMLElement = el;
    let sidenavItems: WizardSidenavItemRefs[] | undefined;

    if (showSideNav) {
        el.classList.add('formspec-wizard--with-sidenav');

        // Side nav
        const sidenav = document.createElement('nav');
        sidenav.className = 'formspec-wizard-sidenav';
        watchText(actx, uiText(actx.engine, 'wizard.steps'), (text) => { sidenav.setAttribute('aria-label', text); });
        el.appendChild(sidenav);

        // Collapse/expand toggle — pure local UI state, no signals needed. Only the "Collapse navigation"
        // state is in the closed chrome vocabulary (Locale §3.1.10); "Expand navigation" has no $ui key
        // and stays an English literal, matching the given key table exactly.
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'formspec-wizard-sidenav-toggle formspec-focus-ring';
        toggleBtn.title = 'Collapse';
        toggleBtn.innerHTML = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>';
        sidenav.appendChild(toggleBtn);

        let collapsed = false;
        let collapseLabel = 'Collapse navigation';
        watchText(actx, uiText(actx.engine, 'wizard.collapseNavigation'), (text) => {
            collapseLabel = text;
            if (!collapsed) toggleBtn.setAttribute('aria-label', text);
        });
        toggleBtn.addEventListener('click', () => {
            collapsed = !collapsed;
            sidenav.classList.toggle('formspec-wizard-sidenav--collapsed', collapsed);
            toggleBtn.setAttribute('aria-label', collapsed ? 'Expand navigation' : collapseLabel);
            toggleBtn.title = collapsed ? 'Expand' : 'Collapse';
            toggleBtn.innerHTML = collapsed
                ? '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>'
                : '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>';
        });

        // Step list — built once, bind() toggles classes/text
        const stepList = document.createElement('ol');
        stepList.className = 'formspec-wizard-sidenav-list';
        sidenav.appendChild(stepList);

        sidenavItems = [];
        for (let i = 0; i < behavior.totalSteps(); i++) {
            const item = document.createElement('li');
            item.className = 'formspec-wizard-sidenav-item';
            if (i === 0) item.classList.add('formspec-wizard-sidenav-item--active');

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'formspec-wizard-sidenav-btn formspec-focus-ring';
            btn.setAttribute('aria-current', i === 0 ? 'step' : 'false');

            const circle = document.createElement('span');
            circle.className = 'formspec-wizard-sidenav-step';
            circle.textContent = String(i + 1);
            btn.appendChild(circle);

            const label = document.createElement('span');
            label.className = 'formspec-wizard-sidenav-label';
            label.textContent = behavior.steps[i]?.title || `Step ${i + 1}`;
            btn.appendChild(label);

            const idx = i;
            btn.addEventListener('click', () => behavior.goToStep(idx));

            item.appendChild(btn);
            stepList.appendChild(item);
            sidenavItems.push({ item, button: btn, circle });
        }

        // Content area
        const content = document.createElement('div');
        content.className = 'formspec-wizard-content';
        el.appendChild(content);
        container = content;
    }

    // Progress bar — built once, bind() toggles classes (hidden for single-step, like React)
    let progressItems: WizardProgressItemRefs[] | undefined;
    if (behavior.showProgress && behavior.totalSteps() > 1) {
        const progress = document.createElement('div');
        progress.className = 'formspec-wizard-steps';
        progress.setAttribute('aria-hidden', 'true');
        progress.classList.toggle('formspec-hidden', showSideNav);
        container.appendChild(progress);

        progressItems = [];
        for (let i = 0; i < behavior.totalSteps(); i++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'formspec-wizard-step-wrapper';

            const indicator = document.createElement('span');
            indicator.className = 'formspec-wizard-step';
            if (i === 0) indicator.classList.add('formspec-wizard-step--active');
            indicator.textContent = `${i + 1}`;
            wrapper.appendChild(indicator);

            const stepTitle = behavior.steps[i]?.title;
            let labelEl: HTMLElement | undefined;
            if (stepTitle) {
                labelEl = document.createElement('span');
                labelEl.className = 'formspec-wizard-step-label';
                if (i === 0) labelEl.classList.add('formspec-wizard-step-label--active');
                labelEl.textContent = stepTitle;
                wrapper.appendChild(labelEl);
            }

            progress.appendChild(wrapper);
            progressItems.push({ indicator, label: labelEl });
        }
    }

    const stepIndicator = document.createElement('div');
    stepIndicator.className = 'formspec-wizard-step-indicator';
    container.appendChild(stepIndicator);

    // Step panels
    const panels: HTMLElement[] = [];
    for (let i = 0; i < behavior.totalSteps(); i++) {
        const panel = document.createElement('div');
        panel.className = 'formspec-wizard-panel';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', behavior.steps[i]?.title || `Step ${i + 1}`);
        if (i !== 0) panel.classList.add('formspec-hidden');
        behavior.renderStep(i, panel);
        container.appendChild(panel);
        panels.push(panel);
    }

    // Navigation buttons
    const nav = document.createElement('div');
    nav.className = 'formspec-wizard-nav';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'formspec-wizard-prev formspec-button-secondary formspec-focus-ring';
    watchText(actx, uiText(actx.engine, 'wizard.previous'), (text) => { prevBtn.textContent = text; });
    watchText(actx, uiText(actx.engine, 'wizard.previousStep'), (text) => { prevBtn.setAttribute('aria-label', text); });
    prevBtn.disabled = true;
    prevBtn.setAttribute('aria-disabled', 'true');
    nav.appendChild(prevBtn);

    let skipBtn: HTMLButtonElement | undefined;
    if (behavior.allowSkip) {
        skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'formspec-wizard-skip formspec-button-secondary formspec-focus-ring';
        watchText(actx, uiText(actx.engine, 'wizard.skip'), (text) => { skipBtn!.textContent = text; });
        watchText(actx, uiText(actx.engine, 'wizard.skipStep'), (text) => { skipBtn!.setAttribute('aria-label', text); });
        skipBtn.addEventListener('click', () => {
            if (behavior.canGoNext()) behavior.goToStep(behavior.activeStep() + 1);
        });
        nav.appendChild(skipBtn);
    }

    // Next/Submit text+aria are owned by behaviors/wizard.ts's bind() (step-driven, also locale-reactive)
    // — every adapter shares that one site, so this static text is a paint-avoidance seed only.
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'formspec-wizard-next formspec-button-primary formspec-focus-ring';
    nextBtn.textContent = 'Next';
    nextBtn.setAttribute('aria-label', 'Next step');
    nav.appendChild(nextBtn);
    container.appendChild(nav);

    const announcer = document.createElement('div');
    announcer.className = 'formspec-sr-only';
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('role', 'status');
    container.appendChild(announcer);

    // Bind behavior to refs — bind() manages all reactive DOM updates
    const dispose = behavior.bind({
        root: el,
        panels,
        stepIndicator,
        announcer,
        prevButton: prevBtn,
        nextButton: nextBtn,
        stepContent: container,
        skipButton: skipBtn,
        sidenavItems,
        progressItems,
    });
    actx.onDispose(dispose);
};
