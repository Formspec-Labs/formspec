'use client';

/** @filedesc Recursive LayoutNode renderer — dispatches to field or layout components. */
import { Workspace } from './workspace';
import React, {
    useMemo,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';
import { signal as createSignal } from '@preact/signals-core';
import {
    invokeResponseAction,
    type ResponseActionInvocationContext,
    type ResponseActionInvocationPorts,
    type ResponseActionInvocationResult,
} from '@formspec-org/engine';
import type { LayoutNode } from '@formspec-org/layout';
import type { ResponseActionInvokerResult, SubmitResult } from './context';
import { useFormspecContext } from './context';
import { useChromeText } from './use-chrome-text';
import { actionResultMessage, useActionFeedbackOutlet, type ActionFeedback } from './action-feedback.js';
import { useSignal } from './use-signal';
import { useField } from './use-field';
import { useForm } from './use-form';
import { useWhen } from './use-when';
import { focusFirstInvalidField } from './use-focus-field';
import type { FieldComponentProps, LayoutComponentProps } from './component-map';
import { WarningExplanations } from './warning-explanations';
import { DefaultField } from './defaults/fields/default-field';
import { DefaultLayout } from './defaults/layout/default-layout';
import { Wizard } from './defaults/layout/wizard';
import { Tabs } from './defaults/layout/tabs';
import { DisplayNode } from './node-renderer-display.js';
import { RepeatGroup, RepeatAccordion } from './node-renderer-repeat.js';
import { useLocalizedNode } from './use-localized-node';
import {
    generationNeedAnchors,
    needTraceAttrs,
    projectionMetadataAttrs,
} from './projection-metadata.js';

const BUILTIN_LAYOUT: Record<string, React.ComponentType<LayoutComponentProps>> = {
    Wizard,
    Tabs,
};

const FALLBACK_MAP: Record<string, string> = {
    MoneyInput: 'NumberInput',
    Slider: 'NumberInput',
    Rating: 'NumberInput',
    Signature: 'FileUpload',
    Badge: 'Text',
    ProgressBar: 'Text',
    Summary: 'Text',
    Panel: 'Card',
    Modal: 'Collapsible',
    Popover: 'Collapsible',
    DataTable: 'Card',
    Tabs: 'Stack',
    Wizard: 'Stack',
};

/** Render a single LayoutNode, recursing into children. */
export function FormspecNode({ node: plannedNode }: { node: LayoutNode }) {
    const { layoutPlan, workspacePages } = useFormspecContext();
    const node = useLocalizedNode(plannedNode);
    const renderChild = useCallback((child: LayoutNode) => <FormspecNode node={child} />, []);

    if (plannedNode === layoutPlan && workspacePages) return <Workspace root={node} pages={workspacePages} />;

    if (node.isRepeatTemplate && node.repeatPath) {
        return <RepeatGroup node={node} renderChild={renderChild} />;
    }

    if (node.component === 'Accordion' && typeof node.props?.bind === 'string') {
        return <RepeatAccordion node={node} renderChild={renderChild} />;
    }

    const modalAutoSkipsWhenGuard = node.component === 'Modal' && node.props?.trigger === 'auto';
    if (node.when && !modalAutoSkipsWhenGuard) {
        return <WhenGuard node={node} />;
    }

    if (node.category === 'field' && node.bindPath) {
        return <FieldNode node={node} />;
    }

    if (node.category === 'display') {
        return <DisplayNode node={node} />;
    }

    if (node.component === 'DataTable') {
        return <DisplayNode node={node} />;
    }

    if (node.component === 'ActionButton') {
        return <ActionButtonNode node={node} />;
    }

    return <LayoutNodeRenderer node={node} />;
}

function resolveActionButtonLabel(
    value: unknown, fallback: string, resolveLocaleString: (key: string, fallback: string) => string,
): string {
    if (value && typeof value === 'object') {
        const label = value as { literal?: unknown; ref?: unknown };
        if (typeof label.literal === 'string') return label.literal;
        // Locale §4.1: a reference without an authored default resolves to empty.
        if (typeof label.ref === 'string') return resolveLocaleString(label.ref, '');
    }
    return typeof value === 'string' ? value : fallback;
}

function actionRefFor(node: LayoutNode): string {
    const value = node.props?.actionRef;
    return typeof value === 'string' ? value : '';
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
    return !!value && typeof (value as Promise<T>).then === 'function';
}

function normalizeInvokerResult<TDetail>(
    result: ResponseActionInvokerResult<TDetail>,
): ResponseActionInvocationResult<TDetail> {
    return 'invocation' in result ? result.invocation : result;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function ActionButtonNode({ node }: { node: LayoutNode }) {
    const chrome = useChromeText();
    const {
        engine,
        onSubmit,
        recordSubmit,
        onHostEvent,
        onActionFinding,
        onActionResult,
        onControlActionResult,
        responseActionInvoker,
        evaluateActionPrecondition,
        evaluateActionEffectExpression,
        dispatchActionEffect,
        resolveActionIdempotencyKey,
        responseActionsDocument,
        resolveActionRef,
        semanticControlScope,
        currentSemanticResponseBinding,
    } = useFormspecContext();
    const form = useForm();
    const actionRef = actionRefFor(node);
    const resolution = resolveActionRef(actionRef, node.id);
    const finding = resolution.finding;
    const findingKey = finding
        ? `${finding.code}:${finding.kind}:${finding.nodeId ?? ''}:${finding.target}:${finding.reason ?? ''}`
        : '';
    // An explicitly authored Component label wins. Auto-injected controls have
    // no Component label, so use the resolved Response Action label before the
    // renderer's generic fallback. This keeps product copy in structured data.
    const label = resolveActionButtonLabel(
        node.props?.label ?? resolution.action?.label,
        chrome('action.submit'),
        (key, fallback) => engine.resolveLocaleString(key, fallback),
    );
    const actionNeedAnchors = useMemo(() => generationNeedAnchors(resolution.action), [resolution.action]);
    const needAttrs = needTraceAttrs([...(node.needAnchors ?? []), ...actionNeedAnchors]);
    const localStatusId = useId();
    const outlet = useActionFeedbackOutlet();
    const statusId = outlet?.id ?? localStatusId;
    const controlRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const lastButtonRef = useRef<HTMLButtonElement>(null);
    const setButtonRef = useCallback((source: HTMLButtonElement | null) => {
        const previous = buttonRef.current;
        if (previous && previous !== source) outlet?.store.focusSourceWillDetach(previous);
        buttonRef.current = source;
        if (source) {
            outlet?.store.focusSourceDidAttach(source, lastButtonRef.current);
            lastButtonRef.current = source;
        }
    }, [outlet?.store]);
    const inFlightRef = useRef<Promise<ResponseActionInvocationResult<SubmitResult>> | null>(null);
    const [feedback, setFeedback] = useState<ActionFeedback>({ phase: 'idle' });

    useEffect(() => {
        if (finding) {
            onActionFinding?.(finding);
        }
    }, [findingKey, onActionFinding]);

    const invoke = useCallback(async (
        invocationContext?: ResponseActionInvocationContext,
    ): Promise<ResponseActionInvocationResult<SubmitResult>> => {
        let submittedDetail: SubmitResult | null = null;
        const ports: ResponseActionInvocationPorts<SubmitResult> = {
            submit: ({ profile, validationTuple }) => {
                const result = form.submit({
                    profile,
                    validationTuple,
                    ...(semanticControlScope
                        ? { id: semanticControlScope.responseId }
                        : {}),
                });
                submittedDetail = result;
                recordSubmit(result);
                // Move focus to the first invalid field in this provider's form, as the webcomponent submit does.
                const report = result.validationReport;
                const scope = controlRef.current?.closest<HTMLElement>('.formspec-theme-scope');
                if (scope && report && !report.valid) focusFirstInvalidField(scope, report.results);
                return result;
            },
            dispatchHostEvent: (eventName, detail, action) => {
                onHostEvent?.(eventName, detail, action);
                if (eventName === 'formspec-submit' && submittedDetail) {
                    onSubmit?.(submittedDetail);
                }
            },
            ...(evaluateActionPrecondition ? { evaluatePrecondition: evaluateActionPrecondition } : {}),
            ...(evaluateActionEffectExpression ? { evaluateEffectExpression: evaluateActionEffectExpression } : {}),
            ...(dispatchActionEffect ? { dispatchEffect: dispatchActionEffect } : {}),
            ...(resolveActionIdempotencyKey ? { resolveIdempotencyKey: resolveActionIdempotencyKey } : {}),
        };
        const finish = (result: ResponseActionInvocationResult<SubmitResult>) => {
            if (result.detail && result.detail !== submittedDetail) {
                submittedDetail = result.detail;
                recordSubmit(result.detail);
                const report = result.detail.validationReport;
                const scope = controlRef.current?.closest<HTMLElement>('.formspec-theme-scope');
                if (scope && result.status === 'blocked' && report && !report.valid) {
                    focusFirstInvalidField(scope, report.results);
                }
            }
            onActionResult?.(result);
            onControlActionResult?.(result, { nodeId: node.id });
            if (result.finding) {
                onActionFinding?.(result.finding);
            }
            return result;
        };

        if (responseActionInvoker && responseActionsDocument) {
            const result = responseActionInvoker({
                document: responseActionsDocument,
                actionRef,
                nodeId: node.id,
                ports,
                ...(invocationContext ? { invocationContext } : {}),
            });
            if (isPromiseLike(result)) {
                try {
                    return finish(normalizeInvokerResult(await result));
                } catch (error) {
                    return finish({
                        status: 'failed',
                        ...(invocationContext?.invocationId
                            ? { invocationId: invocationContext.invocationId }
                            : {}),
                        ...(invocationContext?.actionArtifact
                            ? {
                                actionOwner: {
                                    ...invocationContext.actionArtifact,
                                    subjectKind: 'response-action',
                                    subjectRef: actionRef,
                                } as const,
                            }
                            : {}),
                        resolution,
                        validationTuple: null,
                        detail: null,
                        effectTrace: [],
                        failureReason: errorMessage(error),
                    });
                }
            }
            return finish(normalizeInvokerResult(result));
        }

        return finish(invokeResponseAction(
            responseActionsDocument,
            actionRef,
            ports,
            node.id,
            invocationContext,
        ));
    }, [
        actionRef,
        dispatchActionEffect,
        evaluateActionPrecondition,
        evaluateActionEffectExpression,
        form,
        node.id,
        onActionFinding,
        onActionResult,
        onHostEvent,
        onSubmit,
        recordSubmit,
        responseActionInvoker,
        resolveActionIdempotencyKey,
        responseActionsDocument,
        semanticControlScope,
    ]);

    const activate = useCallback((
        invocationContext?: ResponseActionInvocationContext,
    ): Promise<ResponseActionInvocationResult<SubmitResult>> => {
        if (inFlightRef.current) {
            return inFlightRef.current;
        }

        const intent = resolution.action?.intent;
        const ticket = outlet?.store.start(outlet.id, intent, [...(node.needAnchors ?? []), ...actionNeedAnchors],
            buttonRef.current);
        setFeedback({ phase: 'pending' });
        const invocation = invoke(invocationContext);
        const tracked = invocation.then(
            (result) => {
                outlet?.store.settle(ticket, result.status);
                setFeedback({ phase: 'settled', status: result.status, intent });
                return result;
            },
            (error: unknown) => {
                outlet?.store.settle(ticket, 'failed');
                setFeedback({
                    phase: 'settled',
                    status: 'failed',
                    intent,
                });
                throw error;
            },
        );
        inFlightRef.current = tracked;
        void tracked.then(
            () => {
                if (inFlightRef.current === tracked) {
                    inFlightRef.current = null;
                }
            },
            () => {
                if (inFlightRef.current === tracked) {
                    inFlightRef.current = null;
                }
            },
        );
        return tracked;
    }, [invoke, resolution.action?.intent, outlet, node.needAnchors, actionNeedAnchors]);

    useEffect(() => {
        if (
            !semanticControlScope?.responseActionsArtifact
            || !resolution.resolved
        ) {
            return;
        }
        const control = {
            ...semanticControlScope.responseActionsArtifact,
            subjectKind: 'response-action' as const,
            subjectRef: actionRef,
        };
        return semanticControlScope.registry.register({
            capability: 'activate-control',
            renderInstanceId: semanticControlScope.renderInstanceId,
            responseId: semanticControlScope.responseId,
            control,
            disabled: () => !resolution.resolved || inFlightRef.current !== null,
            activate: async (invocationContext) => {
                const invocation = await activate(invocationContext);
                const responseBinding = currentSemanticResponseBinding();
                if (!responseBinding) {
                    throw new Error('semantic Response binding is unavailable');
                }
                return { invocation, responseBinding };
            },
        });
    }, [
        actionRef,
        activate,
        currentSemanticResponseBinding,
        resolution.resolved,
        semanticControlScope,
    ]);

    const handleClick = useCallback(() => {
        void activate().catch(() => {
            // The live status reports unexpected adapter failures. Semantic
            // callers still receive the rejected Promise from activate().
        });
    }, [activate]);

    // The in-flight guard keeps pending activation inert without losing keyboard focus.
    const pending = feedback.phase === 'pending';

    const actionIntent = resolution.action?.intent;

    // Actions inside a form must never trigger a second, native submission.
    return (
        <div
            ref={controlRef}
            className="formspec-action-control"
            data-action-intent={actionIntent}
            style={node.style}
            hidden={node.props?.hidden === true}
            {...needAttrs}
        >
            <button
                ref={setButtonRef}
                type="button"
                data-action-ref={actionRef}
                data-action-intent={actionIntent}
                className={node.cssClasses?.join(' ') || 'formspec-action formspec-submit'}
                disabled={!resolution.resolved}
                aria-disabled={!resolution.resolved || pending}
                aria-busy={pending}
                aria-describedby={statusId}
                onClick={handleClick}
                {...projectionMetadataAttrs(node)}
                {...needAttrs}
            >
                {label}
            </button>
            {!outlet && <div
                id={statusId}
                className="formspec-action-status"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                {...needAttrs}
            >
                {actionResultMessage(chrome, feedback)}
            </div>}
        </div>
    );
}

function WhenGuard({ node }: { node: LayoutNode }) {
    const visible = useWhen(node.when!, node.whenPrefix);

    const innerNode = useMemo(
        () => ({ ...node, when: undefined, whenPrefix: undefined }),
        [node],
    );

    if (!visible) return null;

    return <FormspecNode node={innerNode} />;
}

function FieldNode({ node }: { node: LayoutNode }) {
    const { components } = useFormspecContext();
    const field = useField(node.bindPath!);

    if (!field.visible && field.disabledDisplay !== 'protected') return null;

    const componentName = node.component;
    const exact = components.fields?.[componentName];
    const fallbackName = !exact ? FALLBACK_MAP[componentName] : undefined;
    const Component: React.ComponentType<FieldComponentProps> =
        exact ??
        (fallbackName ? components.fields?.[fallbackName] : undefined) ??
        DefaultField;

    return <>
        <Component field={field} node={node} />
        {field.visible && <WarningExplanations path={field.path}/>}
    </>;
}

function LayoutNodeRenderer({ node }: { node: LayoutNode }) {
    if (node.bindPath) {
        return <RelevanceGatedLayout node={node} />;
    }
    return <LayoutNodeInner node={node} />;
}

const ALWAYS_RELEVANT = createSignal(true);

function RelevanceGatedLayout({ node }: { node: LayoutNode }) {
    const { engine } = useFormspecContext();
    const relevanceSignal = engine.relevantSignals[node.bindPath!] ?? ALWAYS_RELEVANT;
    const isRelevant = useSignal(relevanceSignal);
    if (!isRelevant) return null;
    return <LayoutNodeInner node={node} />;
}

/** Group runs of 2+ adjacent ActionButton siblings into a horizontal action bar while leaving single actions untouched. */
export function renderActionGroupedChildren(
    children: readonly LayoutNode[],
    options?: { beforeTrailingActions?: React.ReactNode },
): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let trailingStart = children.length;
    if (options?.beforeTrailingActions) {
        while (trailingStart > 0 && children[trailingStart - 1]!.component === 'ActionButton') {
            trailingStart -= 1;
        }
    }
    let insertedBeforeActions = false;
    for (let i = 0; i < children.length; ) {
        if (options?.beforeTrailingActions && !insertedBeforeActions && i === trailingStart && trailingStart < children.length) {
            out.push(<React.Fragment key="root-warning-explanations">{options.beforeTrailingActions}</React.Fragment>);
            insertedBeforeActions = true;
        }
        if (children[i]!.component !== 'ActionButton') {
            const child = children[i]!;
            out.push(<FormspecNode key={child.id} node={child} />);
            i += 1;
            continue;
        }
        let end = i + 1;
        while (end < children.length && children[end]!.component === 'ActionButton') {
            end += 1;
        }
        const run = children.slice(i, end);
        if (run.length >= 2) {
            out.push(
                <div key={`action-bar:${run.map((child) => child.id).join(',')}`} className="formspec-action-bar">
                    {run.map((child) => (
                        <FormspecNode key={child.id} node={child} />
                    ))}
                </div>,
            );
        } else {
            out.push(<FormspecNode key={run[0]!.id} node={run[0]!} />);
        }
        i = end;
    }
    return out;
}

/** True when a root layout tree renders root WarningExplanations above its own Submit controls. */
export function layoutOwnsRootWarningExplanations(
    layoutPlan: LayoutNode | null,
    workspacePages: unknown,
): boolean {
    if (!layoutPlan) return false;
    if (workspacePages) return true;
    if (layoutPlan.component === 'Wizard') return true;
    if (layoutPlan.component === 'Stack') {
        if (layoutPlan.pageMode === 'wizard' && layoutPlan.children.some((c) => c.component === 'Section')) {
            return true;
        }
        if (layoutPlan.children.length > 0 && layoutPlan.children[layoutPlan.children.length - 1]!.component === 'ActionButton') {
            return true;
        }
    }
    return false;
}

function LayoutNodeInner({ node }: { node: LayoutNode }) {
    const { components, formPresentation, layoutPlan, workspacePages } = useFormspecContext();

    if (node.component === 'Stack' && node.children.length > 0) {
        const pageMode = node.pageMode;
        const hasPages = node.children.some((c) => c.component === 'Section');
        if (hasPages && (pageMode === 'wizard' || pageMode === 'tabs')) {
            const orphans = node.children.filter((c) => c.component !== 'Section');
            const pages = node.children.filter((c) => c.component === 'Section');
            const fp = formPresentation ?? {};

            if (pageMode === 'wizard' && pages.length > 0) {
                const wizardNode: LayoutNode = {
                    id: `${node.id}-page-mode-wizard`,
                    component: 'Wizard',
                    category: 'layout',
                    props: {
                        id: node.props.id,
                        showProgress: fp.showProgress !== false,
                        allowSkip: !!fp.allowSkip,
                        sidenav: fp.sidenav,
                    },
                    cssClasses: node.cssClasses ?? [],
                    style: node.style,
                    accessibility: node.accessibility,
                    componentGraphIdentity: node.componentGraphIdentity,
                    uiGraphRoutePolicy: node.uiGraphRoutePolicy,
                    children: pages,
                };
                return (
                    <>
                        {renderActionGroupedChildren(orphans)}
                        <LayoutNodeInner node={wizardNode} />
                    </>
                );
            }

            if (pageMode === 'tabs' && pages.length > 0) {
                const tabsNode: LayoutNode = {
                    id: `${node.id}-page-mode-tabs`,
                    component: 'Tabs',
                    category: 'layout',
                    props: {
                        id: node.props.id,
                        placement: (fp.tabPosition as string | undefined) || 'top',
                        defaultTab: (fp.defaultTab as number | undefined) ?? 0,
                    },
                    cssClasses: node.cssClasses ?? [],
                    style: node.style,
                    accessibility: node.accessibility,
                    componentGraphIdentity: node.componentGraphIdentity,
                    uiGraphRoutePolicy: node.uiGraphRoutePolicy,
                    children: pages,
                };
                return (
                    <>
                        <LayoutNodeInner node={tabsNode} />
                        {renderActionGroupedChildren(orphans)}
                    </>
                );
            }
        }
    }

    const componentName = node.component;
    const exact = components.layout?.[componentName];
    const builtin = !exact ? BUILTIN_LAYOUT[componentName] : undefined;
    const fallbackName = (!exact && !builtin) ? FALLBACK_MAP[componentName] : undefined;
    const Component: React.ComponentType<LayoutComponentProps> =
        exact ??
        builtin ??
        (fallbackName ? (components.layout?.[fallbackName] ?? BUILTIN_LAYOUT[fallbackName]) : undefined) ??
        DefaultLayout;

    const groupActions = componentName === 'Stack' || componentName === 'Section' || componentName === 'Card' || componentName === 'Panel';
    const placeRootWarningsAboveActions =
        !workspacePages
        && layoutPlan !== null
        && node.id === layoutPlan.id
        && componentName === 'Stack'
        && node.children.length > 0
        && node.children[node.children.length - 1]!.component === 'ActionButton';

    return (
        <Component node={node}>
            {groupActions
                ? renderActionGroupedChildren(
                    node.children,
                    placeRootWarningsAboveActions ? { beforeTrailingActions: <WarningExplanations /> } : undefined,
                )
                : node.children.map((child) => (
                    <FormspecNode key={child.id} node={child} />
                ))}
        </Component>
    );
}

export { DisplayNode } from './node-renderer-display.js';
export { RepeatGroup, RepeatAccordion, rewriteBindPaths } from './node-renderer-repeat.js';
