'use client';

/** @filedesc Wizard layout component — multi-step form navigation with soft validation. */
import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { describeWizardStep, placementCovers, type LayoutNode } from '@formspec-org/layout';
import type { LayoutComponentProps } from '../../component-map';
import { useFormspecContext } from '../../context';
import { useChromeText } from '../../use-chrome-text';
import { focusFieldIn, focusFirstInvalidField } from '../../use-focus-field';
import { plannedTitle } from '../../use-localized-node';
import { invokeResponseAction, preactReactiveRuntime, type IFormEngine, type ResponseActionInvocationContext, type ResponseActionInvocationPorts } from '@formspec-org/engine';
import type { FormspecContextValue, ResponseActionInvocationResult, SubmitResult } from '../../context';
import { projectionMetadataAttrs } from '../../projection-metadata.js';
import { routeLandmarkAttrs } from '../../route-landmark.js';
import { WarningExplanations } from '../../warning-explanations';

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

function readSubmissionFingerprint(engine: IFormEngine): string {
    return JSON.stringify([
        engine.getDraftSnapshot?.() ?? null,
        (engine.getExplanationEntries?.() ?? []).map((entry) => {
            const copy = { ...entry } as Record<string, unknown>;
            delete copy.author;
            delete copy.recorded;
            return copy;
        }),
    ]);
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
    const {
        touchField,
        touchAllFields,
        recordSubmit,
        registerFieldJump,
        workspaceNavigation,
        engine,
        onSubmit,
        onHostEvent,
        onActionFinding,
        onActionResult,
        responseActionsDocument,
        responseActionInvoker,
        evaluateActionPrecondition,
        evaluateActionEffectExpression,
        dispatchActionEffect,
        resolveActionIdempotencyKey,
        resolveActionRef,
        semanticControlScope,
        currentSemanticResponseBinding,
    } = useFormspecContext();
    const chrome = useChromeText();

    const stepNodes = node.children; // LayoutNode[] — one per step
    const stepChildren = React.Children.toArray(children); // ReactNode[] — rendered steps
    const totalSteps = stepChildren.length;

    const initialStep = workspaceNavigation?.activeSection
        ? Math.max(0, stepNodes.findIndex(step => (step.props?.id ?? step.id) === workspaceNavigation.activeSection))
        : 0;
    const [currentStep, setCurrentStep] = useState(initialStep);
    const [sidenavCollapsed, setSidenavCollapsed] = useState(false);
    const [pendingSaveNotice, setPendingSaveNotice] = useState('');
    const stepPanelRef = useRef<HTMLDivElement>(null);
    const announcerRef = useRef<HTMLDivElement>(null);
    const pendingJumpPathRef = useRef<string | null>(null);
    const previousStepRef = useRef(initialStep);
    const mountedRef = useRef(true);
    const activeSubmissionRef = useRef<{ id: number; isCurrent: () => boolean } | null>(null);
    const latestAttemptRef = useRef(0);
    const editGenerationRef = useRef(0);
    const liveIdentityRef = useRef({
        engine,
        responseId: semanticControlScope?.responseId,
        renderInstanceId: semanticControlScope?.renderInstanceId,
    });
    if (
        liveIdentityRef.current.engine !== engine
        || liveIdentityRef.current.responseId !== semanticControlScope?.responseId
        || liveIdentityRef.current.renderInstanceId !== semanticControlScope?.renderInstanceId
    ) {
        liveIdentityRef.current = {
            engine,
            responseId: semanticControlScope?.responseId,
            renderInstanceId: semanticControlScope?.renderInstanceId,
        };
        editGenerationRef.current += 1;
    }

    useLayoutEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        let lastFingerprint = readSubmissionFingerprint(engine);
        return preactReactiveRuntime.effect(() => {
            engine.getEvaluatedFormState?.({ profile: 'off' });
            const nextFingerprint = readSubmissionFingerprint(engine);
            if (nextFingerprint !== lastFingerprint) {
                lastFingerprint = nextFingerprint;
                editGenerationRef.current += 1;
            }
        });
    }, [engine]);

    const showProgress = node.props?.showProgress !== false;
    const allowSkip = !!node.props?.allowSkip;
    const showSideNav = !!(node.props?.sidenav as boolean | undefined);

    // A step's planned title (its group's live label, its chrome key), else its authored title. `useChromeText`
    // above subscribes to the locale signal, so a switch re-renders every title; a group label that
    // interpolates is read at that moment, not tracked.
    const stepTitle = (idx: number): string => {
        const step = stepNodes[idx];
        const title = step && describeWizardStep(step, idx);
        return plannedTitle(engine, step?.props)
            || (title?.titleLocaleKey && engine.resolveLocaleString(title.titleLocaleKey, title.title ?? ''))
            || title?.title
            || chrome('wizard.stepTitle', { index: idx + 1 });
    };

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

    const stepSectionId = useCallback((idx: number): string | undefined => {
        const step = stepNodes[idx];
        const raw = step?.props?.id ?? step?.id;
        return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
    }, [stepNodes]);

    const goTo = useCallback((next: number, notifyRoute = false) => {
        const bounded = Math.max(0, Math.min(totalSteps - 1, next));
        setCurrentStep(bounded);
        if (notifyRoute) {
            const sectionId = stepSectionId(bounded);
            if (sectionId) workspaceNavigation?.onActiveSectionChange?.(sectionId);
        }
    }, [totalSteps, stepSectionId, workspaceNavigation]);

    const handleNext = useCallback(() => {
        touchCurrentStep();
        if (currentStepHasErrors()) return; // stay on step — errors are now visible
        if (currentStep < totalSteps - 1) {
            goTo(currentStep + 1, true);
        }
    }, [touchCurrentStep, currentStepHasErrors, currentStep, totalSteps, goTo]);

    const handlePrev = useCallback(() => {
        if (currentStep > 0) goTo(currentStep - 1, true);
    }, [currentStep, goTo]);

    const handleSkip = useCallback(() => {
        if (currentStep < totalSteps - 1) goTo(currentStep + 1, true);
    }, [currentStep, totalSteps, goTo]);

    useLayoutEffect(() => {
        if (!workspaceNavigation?.activeSection) return;
        const targetIdx = stepNodes.findIndex(step => (step.props?.id ?? step.id) === workspaceNavigation.activeSection);
        if (targetIdx >= 0 && targetIdx !== currentStep) {
            setCurrentStep(targetIdx);
        }
    }, [workspaceNavigation?.activeSection, stepNodes]);

    const jumpToWizardField = useCallback((path: string, options?: { notifyRoute?: boolean }): boolean => {
        const stepIdx = stepNodes.findIndex(step =>
            collectBindPaths(step).some(bind => placementCovers(bind, path)),
        );
        if (stepIdx < 0) return false;
        touchField(path);
        if (stepIdx === currentStep) {
            const scope = stepPanelRef.current ?? document.body;
            return focusFieldIn(scope, path);
        }
        pendingJumpPathRef.current = path;
        goTo(stepIdx, options?.notifyRoute !== false);
        return true;
    }, [stepNodes, currentStep, touchField, goTo]);

    const focusInvalidResult = useCallback((results: ReadonlyArray<{ path?: string; severity?: string }>): void => {
        const scope = stepPanelRef.current?.closest<HTMLElement>('.formspec-theme-scope');
        if (scope && focusFirstInvalidField(scope, results)) return;
        const errorPaths = results
            .filter((r): r is { path: string; severity: string } => r.severity === 'error' && Boolean(r.path))
            .map((r) => r.path);
        if (errorPaths.length === 0) return;
        for (const step of stepNodes) {
            for (const bind of collectBindPaths(step)) {
                const match = errorPaths.find((path) => placementCovers(bind, path));
                if (match && jumpToWizardField(match)) return;
            }
        }
        for (const path of errorPaths) {
            if (jumpToWizardField(path)) return;
        }
    }, [stepNodes, jumpToWizardField]);

    useLayoutEffect(() => {
        if (!registerFieldJump) return;
        registerFieldJump(jumpToWizardField);
        return () => registerFieldJump(null);
    }, [registerFieldJump, jumpToWizardField]);

    // Focus jumped field (or first element in new step) after step change, without stomping route-requested focusField across StrictMode mounts.
    useEffect(() => {
        const stepChanged = previousStepRef.current !== currentStep;
        previousStepRef.current = currentStep;
        const jumpPath = pendingJumpPathRef.current;
        if (jumpPath) {
            pendingJumpPathRef.current = null;
            if (stepPanelRef.current && focusFieldIn(stepPanelRef.current, jumpPath)) {
                return;
            }
        }
        if (!stepChanged && workspaceNavigation?.focusField) {
            if (stepPanelRef.current && focusFieldIn(stepPanelRef.current, workspaceNavigation.focusField)) {
                return;
            }
        }
        focusFirstIn(stepPanelRef.current);
    }, [currentStep]);

    const title = stepTitle(currentStep);
    const isFirst = currentStep === 0;
    const isLast = currentStep === totalSteps - 1;
    const finalStepHasSubmitAction = hasResolvedSubmitAction(
        stepNodes[totalSteps - 1],
        resolveActionRef,
    );
    const showsFallbackSubmit = isLast && !finalStepHasSubmitAction;
    const fallbackSubmitAction = showsFallbackSubmit
        ? responseActionsDocument?.actions?.find((action) => action.intent === 'submit')
        : undefined;
    const fallbackSubmitResolution = fallbackSubmitAction
        ? resolveActionRef(fallbackSubmitAction.id)
        : undefined;

    const runWizardSubmit = (
        invocationContext?: ResponseActionInvocationContext,
    ): Promise<ResponseActionInvocationResult<SubmitResult> | null> => {
        if (activeSubmissionRef.current?.isCurrent()) return Promise.resolve(null);
        const responseIdMeta = semanticControlScope ? { id: semanticControlScope.responseId } : {};
        const actionOwnerFor = (actionId: string) =>
            invocationContext?.actionArtifact
                ? {
                    actionOwner: {
                        ...invocationContext.actionArtifact,
                        subjectKind: 'response-action' as const,
                        subjectRef: actionId,
                    },
                }
                : {};
        const submitAction = responseActionsDocument?.actions?.find(
            (action) => action.intent === 'submit',
        );
        touchCurrentStep();
        if (!submitAction && currentStepHasErrors()) {
            return Promise.resolve(null);
        }
        touchAllFields();
        const pendingNotice = 'Save pending warning answers before final submission.';
        const draftEntries = engine.getExplanationEntries?.() ?? [];
        const hasUnstampedDraft = draftEntries.some(
            (entry) => !('author' in entry) || entry.author === undefined
                || !('recorded' in entry) || entry.recorded === undefined,
        );
        const failedActionResult = (
            actionId: string,
            error: unknown,
        ): ResponseActionInvocationResult<SubmitResult> => ({
            status: 'failed',
            ...(invocationContext?.invocationId ? { invocationId: invocationContext.invocationId } : {}),
            ...actionOwnerFor(actionId),
            resolution: resolveActionRef(actionId),
            validationTuple: null,
            detail: null,
            effectTrace: [],
            failureReason: error instanceof Error ? error.message : String(error),
        });
        const beginAttempt = () => {
            const attemptId = ++latestAttemptRef.current;
            const editGenAtStart = editGenerationRef.current;
            const identityAtStart = { ...liveIdentityRef.current };
            const fingerprintAtStart = readSubmissionFingerprint(engine);
            const isCurrent = () =>
                mountedRef.current
                && latestAttemptRef.current === attemptId
                && editGenerationRef.current === editGenAtStart
                && liveIdentityRef.current.engine === identityAtStart.engine
                && liveIdentityRef.current.responseId === identityAtStart.responseId
                && liveIdentityRef.current.renderInstanceId === identityAtStart.renderInstanceId
                && readSubmissionFingerprint(engine) === fingerprintAtStart;
            activeSubmissionRef.current = { id: attemptId, isCurrent };
            const clearActive = () => {
                if (activeSubmissionRef.current?.id === attemptId) {
                    activeSubmissionRef.current = null;
                }
            };
            return { isCurrent, clearActive };
        };
        const createGuardedPorts = (
            isCurrent: () => boolean,
            capture: NonNullable<ResponseActionInvocationPorts<SubmitResult>['submit']>,
            onDispatchedHostEvent?: (eventName: string) => void,
        ): ResponseActionInvocationPorts<SubmitResult> => ({
            submit: (opts) => {
                if (!isCurrent()) return null;
                return capture(opts);
            },
            dispatchHostEvent: (eventName, detail, action) => {
                if (!isCurrent()) {
                    throw new Error('Form changed or unmounted before host event dispatch.');
                }
                onHostEvent?.(eventName, detail, action);
                onDispatchedHostEvent?.(eventName);
            },
            ...(evaluateActionPrecondition
                ? {
                    evaluatePrecondition: (precondition, action) => {
                        if (!isCurrent()) {
                            return { passed: false, reason: 'Form changed or unmounted.' };
                        }
                        return evaluateActionPrecondition(precondition, action);
                    },
                }
                : {}),
            ...(evaluateActionEffectExpression
                ? {
                    evaluateEffectExpression: (expression, detail, action, context) => {
                        if (!isCurrent()) {
                            throw new Error('Form changed or unmounted before effect expression evaluation.');
                        }
                        return evaluateActionEffectExpression(expression, detail, action, context);
                    },
                }
                : {}),
            ...(dispatchActionEffect
                ? {
                    dispatchEffect: (effect, detail, action, context) => {
                        if (!isCurrent()) {
                            throw new Error('Form changed or unmounted before effect dispatch.');
                        }
                        return dispatchActionEffect(effect, detail, action, context);
                    },
                }
                : {}),
            ...(resolveActionIdempotencyKey
                ? {
                    resolveIdempotencyKey: (effect, action, context) => {
                        if (!isCurrent()) {
                            throw new Error('Form changed or unmounted before idempotency key resolution.');
                        }
                        return resolveActionIdempotencyKey(effect, action, context);
                    },
                }
                : {}),
        });
        const captureStandaloneSubmit = () => {
            if (!hasUnstampedDraft) {
                setPendingSaveNotice('');
                const snapshot = engine.getResponseSnapshot({ ...responseIdMeta, profile: 'on-submit' });
                recordSubmit(snapshot);
                if (onSubmit) onSubmit(snapshot);
                return;
            }
            const captured = engine.captureSubmitSnapshot
                ? engine.captureSubmitSnapshot({ ...responseIdMeta, profile: 'on-submit' })
                : { snapshot: engine.getResponseSnapshot({ ...responseIdMeta, profile: 'off' }, 'on-submit'), pendingExplanationStamps: true };
            setPendingSaveNotice(captured.pendingExplanationStamps ? pendingNotice : '');
            recordSubmit(captured.snapshot);
            if (onSubmit) onSubmit(captured.snapshot);
        };

        if (submitAction && responseActionsDocument) {
            const { isCurrent, clearActive } = beginAttempt();
            setPendingSaveNotice('');
            let submittedDetail: SubmitResult | null = null;
            let dispatchedFormspecSubmit = false;
            const submitPorts = createGuardedPorts(
                isCurrent,
                (opts) => {
                    const snap = engine.getResponseSnapshot(
                        {
                            ...responseIdMeta,
                            profile: opts.validationTuple.persistence === 'complete-response' ? 'on-submit' : 'off',
                        },
                        opts.profile,
                    );
                    submittedDetail = snap;
                    recordSubmit(snap);
                    const report = snap.validationReport;
                    if (opts.validationTuple.blocking === 'block-on-error' && report && !report.valid) {
                        focusInvalidResult(report.results);
                    }
                    return snap;
                },
                (eventName) => {
                    if (eventName === 'formspec-submit') dispatchedFormspecSubmit = true;
                },
            );
            let invoked: ReturnType<NonNullable<typeof responseActionInvoker>> | ResponseActionInvocationResult<SubmitResult>;
            try {
                invoked = responseActionInvoker
                    ? responseActionInvoker({
                        document: responseActionsDocument,
                        actionRef: submitAction.id,
                        ...(invocationContext ? { invocationContext } : {}),
                        ports: submitPorts,
                    })
                    : invokeResponseAction(
                        responseActionsDocument,
                        submitAction.id,
                        submitPorts,
                        undefined,
                        invocationContext,
                    );
            } catch (error) {
                clearActive();
                const failed = failedActionResult(submitAction.id, error);
                if (isCurrent()) {
                    onActionResult?.(failed);
                    if (isCurrent() && failed.finding) onActionFinding?.(failed.finding);
                    if (isCurrent()) {
                        setPendingSaveNotice(failed.failureReason || (hasUnstampedDraft ? pendingNotice : 'Submission could not be prepared.'));
                    }
                }
                return Promise.resolve(failed);
            }
            return Promise.resolve(invoked).then((res) => {
                clearActive();
                if (!isCurrent()) return null;
                const invocation = 'invocation' in res ? res.invocation : res;
                onActionResult?.(invocation);
                if (!isCurrent()) return invocation;
                if (invocation.finding) {
                    onActionFinding?.(invocation.finding);
                    if (!isCurrent()) return invocation;
                }
                if (invocation.status === 'completed' && dispatchedFormspecSubmit && (submittedDetail || invocation.detail)) {
                    onSubmit?.(submittedDetail ?? invocation.detail!);
                } else if (!invocation.detail && invocation.status === 'failed') {
                    setPendingSaveNotice(invocation.failureReason || (hasUnstampedDraft ? pendingNotice : 'Submission could not be prepared.'));
                }
                return invocation;
            }, (error) => {
                clearActive();
                const failed = failedActionResult(submitAction.id, error);
                if (!isCurrent()) return failed;
                onActionResult?.(failed);
                if (isCurrent() && failed.finding) onActionFinding?.(failed.finding);
                if (isCurrent()) {
                    setPendingSaveNotice(failed.failureReason || (hasUnstampedDraft ? pendingNotice : 'Submission could not be prepared.'));
                }
                return failed;
            });
        }

        const autosaveAction = responseActionInvoker && responseActionsDocument?.actions?.find(
            (action) => action.intent === 'autosave',
        );
        if (autosaveAction && responseActionInvoker && hasUnstampedDraft) {
            const { isCurrent, clearActive } = beginAttempt();
            setPendingSaveNotice('');
            let invoked: ReturnType<typeof responseActionInvoker>;
            try {
                invoked = responseActionInvoker({
                    document: responseActionsDocument!,
                    actionRef: autosaveAction.id,
                    ...(invocationContext ? { invocationContext } : {}),
                    ports: createGuardedPorts(isCurrent, (opts) =>
                        engine.getResponseSnapshot({ ...responseIdMeta, profile: 'off' }, opts.profile),
                    ),
                });
            } catch (error) {
                clearActive();
                const failed = failedActionResult(autosaveAction.id, error);
                if (isCurrent()) {
                    onActionResult?.(failed);
                    if (isCurrent() && failed.finding) onActionFinding?.(failed.finding);
                    if (isCurrent()) setPendingSaveNotice(failed.failureReason || pendingNotice);
                }
                return Promise.resolve(failed);
            }
            return Promise.resolve(invoked).then((res) => {
                clearActive();
                if (!isCurrent()) return null;
                const invocation = 'invocation' in res ? res.invocation : res;
                onActionResult?.(invocation);
                if (!isCurrent()) return invocation;
                if (invocation.finding) {
                    onActionFinding?.(invocation.finding);
                    if (!isCurrent()) return invocation;
                }
                if (invocation.status !== 'completed' && invocation.status !== 'deferred') {
                    setPendingSaveNotice(invocation.failureReason || pendingNotice);
                    return invocation;
                }
                let captured: { snapshot: SubmitResult; pendingExplanationStamps: boolean };
                try {
                    captured = engine.captureSubmitSnapshot
                        ? engine.captureSubmitSnapshot({ ...responseIdMeta, profile: 'on-submit' })
                        : { snapshot: engine.getResponseSnapshot({ ...responseIdMeta, profile: 'off' }, 'on-submit'), pendingExplanationStamps: true };
                } catch (error) {
                    const failed = failedActionResult(autosaveAction.id, error);
                    if (isCurrent()) {
                        onActionResult?.(failed);
                        if (isCurrent() && failed.finding) onActionFinding?.(failed.finding);
                        if (isCurrent()) setPendingSaveNotice(failed.failureReason || 'Submission could not be prepared.');
                    }
                    return failed;
                }
                if (!isCurrent()) return invocation;
                setPendingSaveNotice(captured.pendingExplanationStamps ? pendingNotice : '');
                recordSubmit(captured.snapshot);
                if (onSubmit) onSubmit(captured.snapshot);
                return invocation;
            }, (error) => {
                clearActive();
                const failed = failedActionResult(autosaveAction.id, error);
                if (!isCurrent()) return failed;
                onActionResult?.(failed);
                if (isCurrent() && failed.finding) onActionFinding?.(failed.finding);
                if (isCurrent()) setPendingSaveNotice(failed.failureReason || pendingNotice);
                return failed;
            });
        }

        captureStandaloneSubmit();
        return Promise.resolve(null);
    };

    const runWizardSubmitRef = useRef(runWizardSubmit);
    runWizardSubmitRef.current = runWizardSubmit;

    useEffect(() => {
        if (
            !showsFallbackSubmit
            || !fallbackSubmitAction
            || !fallbackSubmitResolution?.resolved
            || !semanticControlScope?.responseActionsArtifact
        ) {
            return;
        }
        const control = {
            ...semanticControlScope.responseActionsArtifact,
            subjectKind: 'response-action' as const,
            subjectRef: fallbackSubmitAction.id,
        };
        return semanticControlScope.registry.register({
            capability: 'activate-control',
            renderInstanceId: semanticControlScope.renderInstanceId,
            responseId: semanticControlScope.responseId,
            control,
            disabled: () => !fallbackSubmitResolution.resolved || Boolean(activeSubmissionRef.current?.isCurrent()),
            activate: async (invocationContext) => {
                const invocation = await runWizardSubmitRef.current(invocationContext);
                const responseBinding = currentSemanticResponseBinding();
                if (!responseBinding) {
                    throw new Error('semantic Response binding is unavailable');
                }
                return {
                    invocation: invocation ?? {
                        status: 'failed',
                        ...(invocationContext?.invocationId ? { invocationId: invocationContext.invocationId } : {}),
                        resolution: resolveActionRef(fallbackSubmitAction.id),
                        validationTuple: null,
                        detail: null,
                        effectTrace: [],
                        failureReason: 'Wizard submit action did not run.',
                    },
                    responseBinding,
                };
            },
        });
    }, [
        showsFallbackSubmit,
        fallbackSubmitAction?.id,
        fallbackSubmitResolution?.resolved,
        semanticControlScope,
        currentSemanticResponseBinding,
        resolveActionRef,
    ]);

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
                data-step-index={currentStep}
                data-step-count={totalSteps}
                role="region"
                aria-label={title}
                ref={stepPanelRef}
            >
                {stepChildren[currentStep]}
            </div>
            <WarningExplanations />
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
                        onClick={() => { void runWizardSubmit(); }}
                    >
                        {chrome('wizard.submit')}
                    </button>
                )}
            </div>
            {pendingSaveNotice && (
                <p className="formspec-wizard-pending-save" role="status">{pendingSaveNotice}</p>
            )}
        </>
    );

    const rootProps = {
        id: node.props.id as string | undefined,
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
                                onClick={() => goTo(i, true)}
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
