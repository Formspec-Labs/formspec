'use client';

/** @filedesc Recursive LayoutNode renderer — dispatches to field or layout components. */
import React, { useMemo, useCallback, useEffect } from 'react';
import { signal as createSignal } from '@preact/signals-core';
import { invokeResponseAction } from '@formspec-org/engine';
import type { LayoutNode } from '@formspec-org/layout';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';
import { useField } from './use-field';
import { useForm } from './use-form';
import { useWhen } from './use-when';
import type { FieldComponentProps, LayoutComponentProps } from './component-map';
import { DefaultField } from './defaults/fields/default-field';
import { DefaultLayout } from './defaults/layout/default-layout';
import { Wizard } from './defaults/layout/wizard';
import { Tabs } from './defaults/layout/tabs';
import { DisplayNode } from './node-renderer-display.js';
import { RepeatGroup, RepeatAccordion } from './node-renderer-repeat.js';

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
export function FormspecNode({ node }: { node: LayoutNode }) {
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

function ActionButtonNode({ node }: { node: LayoutNode }) {
    const {
        onSubmit,
        onHostEvent,
        onActionFinding,
        onActionResult,
        evaluateActionPrecondition,
        dispatchActionEffect,
        resolveActionIdempotencyKey,
        responseActionsDocument,
        resolveActionRef,
    } = useFormspecContext();
    const form = useForm();
    const actionRef = actionRefFor(node);
    const resolution = resolveActionRef(actionRef, node.id);
    const finding = resolution.finding;
    const findingKey = finding
        ? `${finding.code}:${finding.kind}:${finding.nodeId ?? ''}:${finding.target}:${finding.reason ?? ''}`
        : '';
    const label = resolveActionButtonLabel(node.props?.label, 'Submit');

    useEffect(() => {
        if (finding) {
            onActionFinding?.(finding);
        }
    }, [findingKey, onActionFinding]);

    const handleClick = useCallback(() => {
        const result = invokeResponseAction(
            responseActionsDocument,
            actionRef,
            {
                submit: ({ profile, validationTuple }) => form.submit({ profile, validationTuple }),
                dispatchHostEvent: (eventName, detail, action) => {
                    onHostEvent?.(eventName, detail, action);
                    if (eventName === 'formspec-submit') {
                        onSubmit?.(detail);
                    }
                },
                ...(evaluateActionPrecondition ? { evaluatePrecondition: evaluateActionPrecondition } : {}),
                ...(dispatchActionEffect ? { dispatchEffect: dispatchActionEffect } : {}),
                ...(resolveActionIdempotencyKey ? { resolveIdempotencyKey: resolveActionIdempotencyKey } : {}),
            },
            node.id,
        );
        onActionResult?.(result);
        if (result.finding) {
            onActionFinding?.(result.finding);
            return;
        }
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
        resolveActionIdempotencyKey,
        responseActionsDocument,
    ]);

    return (
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
            disabled={!resolution.resolved}
            onClick={handleClick}
        >
            {label}
        </button>
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
