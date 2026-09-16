/** @filedesc Wizard behavior hook — manages multi-step navigation state. */
import { computed, signal } from '@preact/signals-core';
import { effect } from '@preact/signals-core';
import type { WizardBehavior, WizardRefs, BehaviorContext } from './types';
import { uiText } from '../adapters/ui-text.js';
import { touchFieldsInContainer } from '../submit/index.js';

export function useWizard(ctx: BehaviorContext, comp: any): WizardBehavior {
    const children: any[] = comp.children || [];
    const currentStep = signal(0);

    const setStep = (nextStep: number) => {
        const bounded = Math.max(0, Math.min(children.length - 1, Math.trunc(nextStep)));
        currentStep.value = bounded;
    };

    const steps = children.map((child: any, i: number) => ({
        id: child.id || `step-${i}`,
        title: (child?.props?.title as string | undefined) ?? '',
    }));

    /**
     * The authored title, else the renderer's own numbering — one site for every adapter. The authored
     * title wins: a Locale that translates `$ui.wizard.stepTitle` renames the steps nobody titled, never
     * the ones the Component Document names.
     */
    const stepTitle = (index: number) =>
        computed(
            () => steps[index]?.title || uiText(ctx.engine, 'wizard.stepTitle', { index: index + 1 }).value,
        );
    const activeStepTitle = computed(() => stepTitle(currentStep.value).value);

    const wizardId = comp.id;
    const compOverrides = {
        cssClass: comp.cssClass,
        style: comp.style,
        accessibility: comp.accessibility,
    };
    /** Opt-in: set `sidenav: true` on the Wizard node or `formPresentation.sidenav` on the component doc. */
    const showSideNav = !!comp.sidenav;
    const showProgress = comp.showProgress !== false;
    const allowSkip = !!comp.allowSkip;

    // Track rendered panels for soft validation on Next
    let renderedPanels: HTMLElement[] = [];

    return {
        id: wizardId,
        compOverrides,
        steps,
        stepTitle,
        activeStepTitle,
        headingLevel: `h${ctx.headingLevel}`,
        showSideNav,
        showProgress,
        allowSkip,

        activeStep(): number {
            return currentStep.value;
        },

        totalSteps(): number {
            return children.length;
        },

        canGoNext(): boolean {
            return currentStep.value < children.length - 1;
        },

        canGoPrev(): boolean {
            return currentStep.value > 0;
        },

        goNext(): void {
            if (currentStep.value < children.length - 1) {
                // Soft validation: touch fields in current panel
                const currentPanel = renderedPanels[currentStep.value];
                if (currentPanel) {
                    touchFieldsInContainer(currentPanel, ctx.touchedFields, ctx.touchedVersion);
                }
                setStep(currentStep.value + 1);
            }
        },

        goPrev(): void {
            if (currentStep.value > 0) {
                setStep(currentStep.value - 1);
            }
        },

        goToStep(index: number): void {
            setStep(index);
        },

        renderStep(index: number, parent: HTMLElement): void {
            ctx.renderComponent(children[index], parent, ctx.prefix);
            renderedPanels[index] = parent;
        },

        bind(refs: WizardRefs): () => void {
            const disposers: Array<() => void> = [];

            // Single effect for all step-driven reactivity: panels, nav buttons,
            // sidenav items, progress indicators, skip button, page-change event.
            disposers.push(effect(() => {
                const step = currentStep.value;
                const total = children.length;

                // Panel show/hide
                refs.panels.forEach((p, idx) => {
                    p.classList.toggle('formspec-hidden', idx !== step);
                });

                // Nav button state (match React: Previous stays visible, disabled on first step)
                if (refs.prevButton) {
                    refs.prevButton.disabled = step === 0;
                    refs.prevButton.setAttribute('aria-disabled', step === 0 ? 'true' : 'false');
                }
                if (refs.nextButton) {
                    refs.nextButton.disabled = total === 0;
                    const last = step === total - 1;
                    // One site for every adapter (default/USWDS/tailwind share this behavior): Locale
                    // §3.1.10 $ui.wizard.next/.submit, re-read on every step AND locale change.
                    refs.nextButton.textContent = uiText(ctx.engine, last ? 'wizard.submit' : 'wizard.next').value;
                    refs.nextButton.setAttribute(
                        'aria-label',
                        uiText(ctx.engine, last ? 'wizard.submitForm' : 'wizard.nextStep').value,
                    );
                    refs.nextButton.classList.toggle('formspec-wizard-submit', last);
                }

                // Skip button: hidden on last step
                if (refs.skipButton) {
                    refs.skipButton.classList.toggle('formspec-hidden', step === total - 1);
                }

                // Sidenav items: active/completed classes, aria-current, step circles
                if (refs.sidenavItems) {
                    for (let i = 0; i < refs.sidenavItems.length; i++) {
                        const si = refs.sidenavItems[i];
                        si.item.classList.toggle('formspec-wizard-sidenav-item--active', i === step);
                        si.item.classList.toggle('formspec-wizard-sidenav-item--completed', i < step);
                        si.button.setAttribute('aria-current', i === step ? 'step' : 'false');
                        si.circle.textContent = i < step ? '\u2713' : String(i + 1);
                    }
                }

                // Progress indicators: active/completed classes
                if (refs.progressItems) {
                    for (let i = 0; i < refs.progressItems.length; i++) {
                        const pi = refs.progressItems[i];
                        pi.indicator.classList.toggle('formspec-wizard-step--active', i === step);
                        pi.indicator.classList.toggle('formspec-wizard-step--completed', i < step);
                        if (pi.label) {
                            pi.label.classList.toggle('formspec-wizard-step-label--active', i === step);
                        }
                    }
                }

                const last = step === total - 1;
                const title = stepTitle(step).value;
                const params = { index: step + 1, total, title };

                if (refs.stepIndicator) {
                    refs.stepIndicator.textContent = uiText(
                        ctx.engine,
                        last ? 'wizard.finalStepStatus' : 'wizard.stepStatus',
                        params,
                    ).value;
                }
                if (refs.announcer) {
                    refs.announcer.textContent = uiText(
                        ctx.engine,
                        last ? 'wizard.finalStepAnnouncement' : 'wizard.stepAnnouncement',
                        params,
                    ).value;
                }

                if (refs.onStepChange) {
                    refs.onStepChange(step, total);
                }

                // Dispatch page-change event
                refs.root.dispatchEvent(new CustomEvent('formspec-page-change', {
                    detail: {
                        index: step,
                        total: total,
                        title: (children[step] as any)?.props?.title || '',
                    },
                    bubbles: true,
                    composed: true,
                }));
            }));

            // formspec-wizard-set-step custom event
            const onSetStep = (event: Event) => {
                const customEvent = event as CustomEvent<{ index?: unknown }>;
                const requestedIndex = Number(customEvent.detail?.index);
                if (!Number.isFinite(requestedIndex)) return;
                setStep(requestedIndex);
                event.stopPropagation();
            };
            refs.root.addEventListener('formspec-wizard-set-step', onSetStep as EventListener);
            disposers.push(() => {
                refs.root.removeEventListener('formspec-wizard-set-step', onSetStep as EventListener);
            });

            // Next button: submit on last step, soft validate + advance otherwise
            if (refs.nextButton) {
                refs.nextButton.addEventListener('click', () => {
                    const isLastStep = currentStep.value === children.length - 1;
                    if (isLastStep) {
                        ctx.submit({ profile: 'on-submit', emitEvent: true });
                        return;
                    }
                    // Soft validation then advance
                    const currentPanel = renderedPanels[currentStep.value];
                    if (currentPanel) {
                        touchFieldsInContainer(currentPanel, ctx.touchedFields, ctx.touchedVersion);
                    }
                    setStep(currentStep.value + 1);
                });
            }

            // Prev button
            if (refs.prevButton) {
                refs.prevButton.addEventListener('click', () => {
                    if (currentStep.value > 0) setStep(currentStep.value - 1);
                });
            }

            return () => disposers.forEach(d => d());
        },
    };
}
