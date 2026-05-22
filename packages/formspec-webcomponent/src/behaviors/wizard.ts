/** @filedesc Wizard behavior hook — manages multi-step navigation state. */
import { signal } from '@preact/signals-core';
import { effect } from '@preact/signals-core';
import type { WizardBehavior, WizardRefs, BehaviorContext } from './types';
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
        title: child?.props?.title || `Step ${i + 1}`,
    }));

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
                    refs.nextButton.textContent = last ? 'Submit' : 'Next';
                    refs.nextButton.setAttribute('aria-label', last ? 'Submit form' : 'Next step');
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

                const stepTitle =
                    (children[step] as any)?.props?.title || `Step ${step + 1}`;

                if (refs.stepIndicator) {
                    refs.stepIndicator.textContent =
                        `Step ${step + 1} of ${total}: ${stepTitle}` +
                        (step === total - 1 ? ' — final step' : '');
                }
                if (refs.announcer) {
                    refs.announcer.textContent =
                        step === total - 1
                            ? `${stepTitle}. Next will submit the form.`
                            : `${stepTitle}. Step ${step + 1} of ${total}.`;
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
