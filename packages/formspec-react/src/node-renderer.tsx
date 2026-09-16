'use client';

/** @filedesc Recursive LayoutNode renderer — dispatches to field or layout components. */
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
import type { ChromeStringKey, LayoutNode } from '@formspec-org/layout';
import type { ResponseActionInvokerResult, SubmitResult } from './context';
import { useFormspecContext } from './context';
import { useChromeText, type ChromeText } from './use-chrome-text';
import { useSignal } from './use-signal';
import { useField } from './use-field';
import { useForm } from './use-form';
import { useWhen } from './use-when';
import { focusFirstInvalidField } from './use-focus-field';
import type { FieldComponentProps, LayoutComponentProps } from './component-map';
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
    const node = useLocalizedNode(plannedNode);
    const renderChild = useCallback((child: LayoutNode) => <FormspecNode node={child} />, []);

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

function resolveActionButtonLabel(value: unknown, fallback: string): string {
    if (value && typeof value === 'object') {
        const label = value as { literal?: unknown; ref?: unknown };
        if (typeof label.literal === 'string') return label.literal;
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

type ActionFeedback =
    | { phase: 'idle'; message: '' }
    | { phase: 'pending'; message: string }
    | { phase: 'settled'; message: string };

/** One chrome key per invocation status — the word the renderer says, authorable like every other. */
const ACTION_STATUS_KEYS = {
    completed: 'action.completed',
    blocked: 'action.blocked',
    failed: 'action.failed',
    deferred: 'action.deferred',
    unresolved: 'action.unresolved',
} as const satisfies Record<ResponseActionInvocationResult<unknown>['status'], ChromeStringKey>;

function actionResultMessage(
    chrome: ChromeText,
    result: Pick<ResponseActionInvocationResult<unknown>, 'status' | 'failureReason'>,
): string {
    const status = chrome(ACTION_STATUS_KEYS[result.status]);
    const reason = result.failureReason?.trim();
    // The sentence is a template too: a locale decides its own punctuation and word order.
    return reason
        ? chrome('action.statusReason', { status, reason })
        : chrome('action.status', { status });
}

function ActionButtonNode({ node }: { node: LayoutNode }) {
    const chrome = useChromeText();
    const {
        onSubmit,
        recordSubmit,
        onHostEvent,
        onActionFinding,
        onActionResult,
        responseActionInvoker,
        evaluateActionPrecondition,
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
    );
    const actionNeedAnchors = generationNeedAnchors(resolution.action);
    const needAttrs = needTraceAttrs([...(node.needAnchors ?? []), ...actionNeedAnchors]);
    const statusId = useId();
    const controlRef = useRef<HTMLDivElement>(null);
    const inFlightRef = useRef<Promise<ResponseActionInvocationResult<SubmitResult>> | null>(null);
    const [feedback, setFeedback] = useState<ActionFeedback>({ phase: 'idle', message: '' });

    useEffect(() => {
        if (finding) {
            onActionFinding?.(finding);
        }
    }, [findingKey, onActionFinding]);

    const invoke = useCallback(async (
        invocationContext?: ResponseActionInvocationContext,
    ): Promise<ResponseActionInvocationResult<SubmitResult>> => {
        const ports: ResponseActionInvocationPorts<SubmitResult> = {
            submit: ({ profile, validationTuple }) => {
                const result = form.submit({
                    profile,
                    validationTuple,
                    ...(semanticControlScope
                        ? { id: semanticControlScope.responseId }
                        : {}),
                });
                recordSubmit(result);
                // Move focus to the first invalid field in this provider's form, as the webcomponent submit does.
                const report = result.validationReport;
                const scope = controlRef.current?.closest<HTMLElement>('.formspec-theme-scope');
                if (scope && report && !report.valid) focusFirstInvalidField(scope, report.results);
                return result;
            },
            dispatchHostEvent: (eventName, detail, action) => {
                onHostEvent?.(eventName, detail, action);
                if (eventName === 'formspec-submit') {
                    onSubmit?.(detail);
                }
            },
            ...(evaluateActionPrecondition ? { evaluatePrecondition: evaluateActionPrecondition } : {}),
            ...(dispatchActionEffect ? { dispatchEffect: dispatchActionEffect } : {}),
            ...(resolveActionIdempotencyKey ? { resolveIdempotencyKey: resolveActionIdempotencyKey } : {}),
        };
        const finish = (result: ResponseActionInvocationResult<SubmitResult>) => {
            onActionResult?.(result);
            if (result.finding) {
                onActionFinding?.(result.finding);
            }
            return result;
        };

        if (responseActionInvoker) {
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

        setFeedback({ phase: 'pending', message: chrome('action.inProgress') });
        const invocation = invoke(invocationContext);
        const tracked = invocation.then(
            (result) => {
                setFeedback({ phase: 'settled', message: actionResultMessage(chrome, result) });
                return result;
            },
            (error: unknown) => {
                setFeedback({
                    phase: 'settled',
                    message: actionResultMessage(chrome, {
                        status: 'failed',
                        failureReason: errorMessage(error),
                    }),
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
    }, [chrome, invoke]);

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

    const pending = feedback.phase === 'pending';

    return (
        <div ref={controlRef} className="formspec-action-control" {...needAttrs}>
            <button
                // type="button" mirrors the webcomponent's ActionButton renderer
                // (packages/formspec-webcomponent/src/components/interactive.ts):
                // §10 is silent on the HTML type, but if an ActionButton lives
                // inside a parent <form> and the click handler throws,
                // type="submit" cascades to native form submission and bypasses
                // Response Actions entirely. type="button" eliminates the
                // foot-gun and keeps cross-renderer parity.
                type="button"
                className={node.cssClasses?.join(' ') || 'formspec-action formspec-submit'}
                disabled={!resolution.resolved || pending}
                aria-busy={pending}
                aria-describedby={statusId}
                onClick={handleClick}
                {...projectionMetadataAttrs(node)}
                {...needAttrs}
            >
                {label}
            </button>
            <div
                id={statusId}
                className="formspec-action-status"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                {...needAttrs}
            >
                {feedback.message}
            </div>
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

    return <Component field={field} node={node} />;
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

function LayoutNodeInner({ node }: { node: LayoutNode }) {
    const { components, formPresentation } = useFormspecContext();

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
                        {orphans.map((child) => (
                            <FormspecNode key={child.id} node={child} />
                        ))}
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
                        tabLabels: pages.map(
                            (p) =>
                                (p.props?.title as string | undefined)
                                || (p.props?.label as string | undefined)
                                || (p.fieldItem?.label as string | undefined),
                        ),
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
                        {orphans.map((child) => (
                            <FormspecNode key={child.id} node={child} />
                        ))}
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

    return (
        <Component node={node}>
            {node.children.map((child) => (
                <FormspecNode key={child.id} node={child} />
            ))}
        </Component>
    );
}

export { DisplayNode } from './node-renderer-display.js';
export { RepeatGroup, RepeatAccordion, rewriteBindPaths } from './node-renderer-repeat.js';
