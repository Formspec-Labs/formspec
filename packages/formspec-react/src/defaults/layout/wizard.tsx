'use client';

/** @filedesc Wizard layout component — multi-step form navigation with soft validation. */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { LayoutNode } from '@formspec-org/layout';
import type { LayoutComponentProps } from '../../component-map';
import { useFormspecContext } from '../../context';
import { useChromeText } from '../../use-chrome-text';
import type { FormspecContextValue } from '../../context';
import { projectionMetadataAttrs } from '../../projection-metadata.js';
import { routeLandmarkAttrs } from '../../route-landmark.js';

// ---- helpers ----------------------------------------------------------------

/** Collect all bindPaths in a LayoutNode subtree (fields and groups). */
function collectBindPaths(node: LayoutNode): string[] {
    const paths: string[] = [];
    if (node.bindPath) paths.push(node.bindPath);
    for (const child of node.children) {
        paths.push(...collectBindPaths(child));
    }
    return paths;
}

/** Focus the first focusable element inside a container. */
function focusFirstIn(container: HTMLElement | null): void {
    if (!container) return;
    const el = container.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    el?.focus();
}

function hasResolvedSubmitAction(
    node: LayoutNode | undefined,
    resolveActionRef: FormspecContextValue['resolveActionRef'],
): boolean {
    if (!node) return false;
    if (node.component === 'ActionButton') {
        const actionRef = node.props?.actionRef;
        if (typeof actionRef === 'string') {
            const resolution = resolveActionRef(actionRef, node.id);
            if (resolution.resolved && resolution.action?.intent === 'submit') {
                return true;
            }
        }
    }
    return node.children.some(child => hasResolvedSubmitAction(child, resolveActionRef));
}

function cx(...parts: Array<string | false | undefined>): string {
    return parts.filter(Boolean).join(' ');
}

// ---- component --------------------------------------------------------------

/**
 * Wizard layout — renders one step at a time with Previous / Next / Submit
 * navigation, optional progress bar, and soft validation on Next.
 *
 * Set `node.props.sidenav` (or `formPresentation.sidenav` on the component
 * document) to show a collapsible step rail; top progress is then hidden
 * (same as the web component).
 */
export function Wizard({ node, children }: LayoutComponentProps): React.JSX.Element {
    const { touchField, engine, onSubmit, resolveActionRef } = useFormspecContext();
    const chrome = useChromeText();

    const stepNodes = node.children; // LayoutNode[] — one per step
    const stepChildren = React.Children.toArray(children); // ReactNode[] — rendered steps
    const totalSteps = stepChildren.length;

    const [currentStep, setCurrentStep] = useState(0);
    const [sidenavCollapsed, setSidenavCollapsed] = useState(false);
    const stepPanelRef = useRef<HTMLDivElement>(null);
    const announcerRef = useRef<HTMLDivElement>(null);

    const showProgress = node.props?.showProgress !== false;
    const allowSkip = !!node.props?.allowSkip;
    const showSideNav = !!(node.props?.sidenav as boolean | undefined);

    const stepTitle = (idx: number): string =>
        (stepNodes[idx]?.props?.title as string | undefined) ||
        (stepNodes[idx]?.fieldItem?.label as string | undefined) ||
        chrome('wizard.stepTitle', { index: idx + 1 });

    // Soft-touch all fields in the current step to reveal validation errors.
    // Does NOT block navigation — just makes errors visible.
    const touchCurrentStep = useCallback(() => {
        const stepNode = stepNodes[currentStep];
        if (!stepNode) return;
        const paths = collectBindPaths(stepNode);
        for (const path of paths) {
            touchField(path);
        }
    }, [currentStep, stepNodes, touchField]);

    /** Returns true if the current step has any validation errors. */
    const currentStepHasErrors = useCallback((): boolean => {
        const stepNode = stepNodes[currentStep];
        if (!stepNode) return false;
        const paths = collectBindPaths(stepNode);
        for (const path of paths) {
            const vm = engine.getFieldVM(path);
            if (vm && vm.errors.value.some((e) => e.severity === 'error')) return true;
        }
        return false;
    }, [currentStep, stepNodes, engine]);

    const goTo = useCallback((next: number) => {
        const bounded = Math.max(0, Math.min(totalSteps - 1, next));
        setCurrentStep(bounded);
    }, [totalSteps]);

    const handleNext = useCallback(() => {
        touchCurrentStep();
        if (currentStepHasErrors()) return; // stay on step — errors are now visible
        if (currentStep < totalSteps - 1) {
            goTo(currentStep + 1);
        }
    }, [touchCurrentStep, currentStepHasErrors, currentStep, totalSteps, goTo]);

    const handlePrev = useCallback(() => {
        if (currentStep > 0) goTo(currentStep - 1);
    }, [currentStep, goTo]);

    const handleSkip = useCallback(() => {
        if (currentStep < totalSteps - 1) goTo(currentStep + 1);
    }, [currentStep, totalSteps, goTo]);

    // Focus first element in new step and update announcer after step change.
    useEffect(() => {
        focusFirstIn(stepPanelRef.current);
    }, [currentStep]);

    const title = stepTitle(currentStep);
    const isFirst = currentStep === 0;
    const isLast = currentStep === totalSteps - 1;
    const finalStepHasSubmitAction = hasResolvedSubmitAction(
        stepNodes[totalSteps - 1],
        resolveActionRef,
    );

    const progressRow =
        showProgress && totalSteps > 1 ? (
            <div
                className={cx('formspec-wizard-steps', showSideNav && 'formspec-hidden')}
                aria-hidden="true"
            >
                {stepNodes.map((_, idx) => (
                    <div key={stepNodes[idx]?.id ?? idx} className="formspec-wizard-step-wrapper">
                        <span
                            className={cx(
                                'formspec-wizard-step',
                                idx === currentStep && 'formspec-wizard-step--active',
                                idx < currentStep && 'formspec-wizard-step--completed',
                            )}
                        >
                            {idx < currentStep ? '\u2713' : idx + 1}
                        </span>
                        <span
                            className={cx(
                                'formspec-wizard-step-label',
                                idx === currentStep && 'formspec-wizard-step-label--active',
                            )}
                        >
                            {stepTitle(idx)}
                        </span>
                    </div>
                ))}
            </div>
        ) : null;

    const stepBody = (
        <>
            {progressRow}
            <div className="formspec-wizard-step-indicator" ref={announcerRef}>
                {chrome(isLast ? 'wizard.finalStepStatus' : 'wizard.stepStatus', {
                    index: currentStep + 1,
                    total: totalSteps,
                    title,
                })}
            </div>
            <div
                className="formspec-wizard-panel"
                role="region"
                aria-label={title}
                ref={stepPanelRef}
            >
                {stepChildren[currentStep]}
            </div>
            <div className="formspec-wizard-nav">
                <button
                    type="button"
                    className="formspec-wizard-prev formspec-button-secondary formspec-focus-ring"
                    aria-label={chrome('wizard.previousStep')}
                    disabled={isFirst}
                    aria-disabled={isFirst}
                    onClick={handlePrev}
                >
                    {chrome('wizard.previous')}
                </button>

                {allowSkip && !isLast && (
                    <button
                        type="button"
                        className="formspec-wizard-skip formspec-button-secondary formspec-focus-ring"
                        aria-label={chrome('wizard.skipStep')}
                        onClick={handleSkip}
                    >
                        {chrome('wizard.skip')}
                    </button>
                )}

                {!isLast ? (
                    <button
                        type="button"
                        className="formspec-wizard-next formspec-button-primary formspec-focus-ring"
                        aria-label={chrome('wizard.nextStep')}
                        onClick={handleNext}
                    >
                        {chrome('wizard.next')}
                    </button>
                ) : finalStepHasSubmitAction ? null : (
                    <button
                        type="button"
                        className="formspec-wizard-submit formspec-button-primary formspec-focus-ring"
                        aria-label={chrome('wizard.submitForm')}
                        onClick={() => {
                            touchCurrentStep();
                            if (currentStepHasErrors()) return;
                            if (onSubmit) {
                                const response = engine.getResponse({ profile: 'on-submit' });
                                const validationReport = engine.getValidationReport({ profile: 'on-submit' });
                                onSubmit({ response, validationReport });
                            }
                        }}
                    >
                        {chrome('wizard.submit')}
                    </button>
                )}
            </div>
        </>
    );

    const rootProps = {
        className: cx('formspec-wizard', showSideNav && 'formspec-wizard--with-sidenav'),
        role: 'group' as const,
        'aria-label': `Wizard: Step ${currentStep + 1} of ${totalSteps}`,
        ...routeLandmarkAttrs(node),
        ...projectionMetadataAttrs(node),
    };

    if (!showSideNav) {
        return <div {...rootProps}>{stepBody}</div>;
    }

    return (
        <div {...rootProps}>
            <nav
                className={cx(
                    'formspec-wizard-sidenav',
                    sidenavCollapsed && 'formspec-wizard-sidenav--collapsed',
                )}
                aria-label={chrome('wizard.steps')}
            >
                <button
                    type="button"
                    className="formspec-wizard-sidenav-toggle formspec-focus-ring"
                    aria-label={chrome(sidenavCollapsed ? 'wizard.expandNavigation' : 'wizard.collapseNavigation')}
                    title={sidenavCollapsed ? 'Expand' : 'Collapse'}
                    onClick={() => setSidenavCollapsed((c) => !c)}
                >
                    <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                    >
                        {sidenavCollapsed ? (
                            <polyline points="9 18 15 12 9 6" />
                        ) : (
                            <polyline points="15 18 9 12 15 6" />
                        )}
                    </svg>
                </button>
                <ol className="formspec-wizard-sidenav-list">
                    {stepNodes.map((sn, i) => (
                        <li
                            key={sn.id ?? i}
                            className={cx(
                                'formspec-wizard-sidenav-item',
                                i === currentStep && 'formspec-wizard-sidenav-item--active',
                                i < currentStep && 'formspec-wizard-sidenav-item--completed',
                            )}
                        >
                            <button
                                type="button"
                                className="formspec-wizard-sidenav-btn formspec-focus-ring"
                                aria-current={i === currentStep ? 'step' : 'false'}
                                onClick={() => goTo(i)}
                            >
                                <span className="formspec-wizard-sidenav-step">
                                    {i < currentStep ? '\u2713' : String(i + 1)}
                                </span>
                                <span className="formspec-wizard-sidenav-label">{stepTitle(i)}</span>
                            </button>
                        </li>
                    ))}
                </ol>
            </nav>
            <div className="formspec-wizard-content">{stepBody}</div>
        </div>
    );
}
