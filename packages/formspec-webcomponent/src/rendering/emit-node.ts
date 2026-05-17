/** @filedesc Walks a LayoutNode tree and emits DOM via component plugin dispatch. */
import { effect } from '@preact/signals-core';
import { globalRegistry } from '../registry';
import type { RenderContext } from '../types';
import type { BehaviorContext } from '../behaviors/types';
import type { AdapterContext } from '../adapters/types';
import type { ComponentDescriptor, RenderHost } from '../hub-types.js';
import {
    PresentationBlock,
    ItemDescriptor,
    mergeFormPresentationForPlanning,
    type LayoutNode,
} from '@formspec-org/layout';
import type { ValidationResult } from '@formspec-org/types';
import { useWizard } from '../behaviors/wizard';
import { useTabs } from '../behaviors/tabs';

export type { RenderHost } from '../hub-types.js';

/**
 * Walk a LayoutNode tree from the planner and emit DOM.
 */
export function emitNode(host: RenderHost, node: LayoutNode, parent: HTMLElement, prefix: string, headingLevel = 3): void {
    let target = parent;

    const modalAutoSkipsWhenWrapper =
        node.component === 'Modal' && node.props?.trigger === 'auto';

    if (node.when && !modalAutoSkipsWhenWrapper) {
        const wrapper = document.createElement('div');
        wrapper.className = 'formspec-when';
        target.appendChild(wrapper);
        let fallbackEl: HTMLElement | null = null;
        if (node.fallback) {
            fallbackEl = document.createElement('p');
            fallbackEl.className = 'formspec-conditional-fallback';
            fallbackEl.textContent = node.fallback;
            target.appendChild(fallbackEl);
        }
        const exprFn = host.engine.compileExpression(node.when, prefix);
        host.cleanupFns.push(effect(() => {
            const visible = !!exprFn();
            wrapper.classList.toggle('formspec-hidden', !visible);
            if (fallbackEl) fallbackEl.classList.toggle('formspec-hidden', visible);
        }));
        target = wrapper;
    }

    if (node.isRepeatTemplate && node.props.bind) {
        const bindKey = node.props.bind as string;
        const fullRepeatPath = prefix ? `${prefix}.${bindKey}` : bindKey;
        const container = document.createElement('div');
        container.className = 'formspec-repeat';
        container.dataset.bind = bindKey;
        target.appendChild(container);
        const list = document.createElement('div');
        list.className = 'formspec-repeat-list';
        container.appendChild(list);
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'formspec-repeat-add formspec-focus-ring';
        const item = host.findItemByKey(bindKey);
        const groupLabel = item?.label || bindKey;
        addBtn.textContent = `Add ${groupLabel}`;
        const liveRegion = document.createElement('div');
        liveRegion.className = 'formspec-sr-only';
        liveRegion.setAttribute('aria-live', 'polite');
        const findRepeatInstanceFocusTarget = (instance: Element | null): HTMLElement | null =>
            instance?.querySelector<HTMLElement>(
                'input:not([type="hidden"]), select, textarea, [contenteditable="true"], button:not(.formspec-repeat-remove)',
            ) ?? instance?.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])') ?? null;
        let innerCleanupFns: Array<() => void> = [];

        const disposeInner = () => {
            for (const cleanup of innerCleanupFns.splice(0)) {
                cleanup();
            }
        };

        host.cleanupFns.push(effect(() => {
            const count = host.engine.repeats[fullRepeatPath]?.value || 0;
            disposeInner();
            list.replaceChildren();

            const nextInnerCleanupFns: Array<() => void> = [];
            const repeatHost = { ...host, cleanupFns: nextInnerCleanupFns };
            for (let idx = 0; idx < count; idx++) {
                const instanceWrapper = document.createElement('div');
                instanceWrapper.className = 'formspec-repeat-instance';
                instanceWrapper.setAttribute('role', 'group');
                instanceWrapper.setAttribute('aria-label', `${groupLabel} ${idx + 1} of ${count}`);
                list.appendChild(instanceWrapper);

                const instanceHeader = document.createElement('div');
                instanceHeader.className = 'formspec-repeat-instance-header';
                const instanceLabel = document.createElement('p');
                instanceLabel.className = 'formspec-repeat-instance-label';
                instanceLabel.textContent = `${groupLabel} ${idx + 1}`;
                instanceHeader.appendChild(instanceLabel);
                instanceWrapper.appendChild(instanceHeader);

                const instancePrefix = `${fullRepeatPath}[${idx}]`;
                for (const child of node.children) {
                    emitNode(repeatHost, child, instanceWrapper, instancePrefix, headingLevel);
                }

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'formspec-repeat-remove formspec-button-danger formspec-focus-ring';
                removeBtn.textContent = `Remove ${item?.label || bindKey}`;
                removeBtn.setAttribute('aria-label', `Remove ${groupLabel} ${idx + 1}`);
                const removeIdx = idx;
                removeBtn.addEventListener('click', () => {
                    host.engine.removeRepeatInstance(fullRepeatPath, removeIdx);
                    const newCount = Math.max(0, count - 1);
                    liveRegion.textContent = `${groupLabel} ${removeIdx + 1} removed. ${newCount} remaining.`;
                    queueMicrotask(() => {
                        if (newCount === 0) {
                            addBtn.focus();
                            return;
                        }
                        const instances = container.querySelectorAll<HTMLElement>('.formspec-repeat-instance');
                        const targetInstance = instances[Math.min(removeIdx, newCount - 1)];
                        findRepeatInstanceFocusTarget(targetInstance)?.focus();
                    });
                });
                instanceHeader.appendChild(removeBtn);
            }

            innerCleanupFns = nextInnerCleanupFns;
        }));
        host.cleanupFns.push(() => {
            disposeInner();
        });
        addBtn.addEventListener('click', () => {
            host.engine.addRepeatInstance(fullRepeatPath);
            const newCount = (host.engine.repeats[fullRepeatPath]?.value || 0);
            liveRegion.textContent = `${groupLabel} ${newCount} added. ${newCount} total.`;
            queueMicrotask(() => {
                const instances = container.querySelectorAll<HTMLElement>('.formspec-repeat-instance');
                const last = instances[instances.length - 1];
                findRepeatInstanceFocusTarget(last)?.focus();
            });
        });
        container.appendChild(addBtn);
        container.appendChild(liveRegion);
        return;
    }

    if (node.scopeChange && !node.isRepeatTemplate && node.props.bind) {
        const bindKey = node.props.bind as string;
        const nextPrefix = prefix ? `${prefix}.${bindKey}` : bindKey;
        const el = document.createElement('div');
        el.className = 'formspec-group';
        if (node.props.title) {
            const heading = document.createElement(`h${Math.min(headingLevel, 6)}`);
            heading.className = 'formspec-group-title';
            heading.textContent = node.props.title as string;
            el.appendChild(heading);
        }
        const groupFullPath = nextPrefix;
        if (host.engine.relevantSignals[groupFullPath]) {
            host.cleanupFns.push(effect(() => {
                const isRelevant = host.engine.relevantSignals[groupFullPath].value;
                el.classList.toggle('formspec-hidden', !isRelevant);
            }));
        }
        target.appendChild(el);

        for (const child of node.children) {
            emitNode(host, child, el, nextPrefix, Math.min(headingLevel + 1, 6));
        }
        return;
    }

    const comp: ComponentDescriptor = {
        component: node.component,
        ...node.props,
    };
    if (node.when) {
        comp.when = node.when;
        if (node.whenPrefix !== undefined) comp.whenPrefix = node.whenPrefix;
    }
    if (node.style) comp.style = node.style;
    if (node.cssClasses.length > 0) comp.cssClass = node.cssClasses;
    if (node.accessibility) comp.accessibility = node.accessibility;
    comp.children = node.children;
    // Planner-only fields (theme cascade for definition fallback) live on the
    // LayoutNode alongside `props`. Props win when both are set (component doc).
    if (node.labelPosition !== undefined && comp.labelPosition === undefined) {
        comp.labelPosition = node.labelPosition;
    }
    if (node.presentation !== undefined && comp.presentation === undefined) {
        comp.presentation = node.presentation;
    }
    if (node.fieldItem !== undefined && comp.fieldItem === undefined) {
        comp.fieldItem = node.fieldItem;
    }
    if (node.bindPath !== undefined && comp.bindPath === undefined) {
        comp.bindPath = node.bindPath;
    }

    renderActualComponent(host, comp, target, prefix);
}

/**
 * Render a component, handling LayoutNode objects by delegating to emitNode.
 */
export function renderComponent(host: RenderHost, comp: LayoutNode | ComponentDescriptor, parent: HTMLElement, prefix = ''): void {
    if (comp && typeof comp === 'object' && 'category' in comp && 'id' in comp) {
        emitNode(host, comp as LayoutNode, parent, prefix);
        return;
    }
    console.warn('renderComponent called with non-LayoutNode comp — this should not happen after planner integration', comp);
}

/**
 * Look up a component plugin and invoke its render function with a full RenderContext.
 */
export function renderActualComponent(host: RenderHost, comp: ComponentDescriptor, parent: HTMLElement, prefix = ''): void {
    const componentType = comp.component;
    const plugin = globalRegistry.get(componentType);

    const ctx: RenderContext = {
        engine: host.engine,
        componentDocument: host._componentDocument,
        themeDocument: host._themeDocument,
        prefix,
        submit: (opts) => host.submit(opts),
        resolveValidationTarget: (r) => host.resolveValidationTarget(r),
        focusField: (p: string) => host.focusField(p),
        submitPendingSignal: host._submitPendingSignal,
        latestSubmitDetailSignal: host._latestSubmitDetailSignal,
        setSubmitPending: (pending: boolean) => host.setSubmitPending(pending),
        isSubmitPending: () => host.isSubmitPending(),
        renderComponent: (comp, parent, pfx) => renderComponent(host, comp, parent, pfx),
        resolveToken: (val) => host.resolveToken(val),
        applyStyle: (el, style) => host.applyStyle(el, style),
        applyCssClass: (el, comp) => host.applyCssClass(el, comp),
        applyAccessibility: (el, comp) => host.applyAccessibility(el, comp),
        resolveItemPresentation: (itemDesc: ItemDescriptor) => host.resolveItemPresentation(itemDesc),
        cleanupFns: host.cleanupFns,
        findItemByKey: (key: string) => host.findItemByKey(key),
        activeBreakpoint: host.activeBreakpoint,
        touchedFields: host.touchedFields,
        touchedVersion: host.touchedVersion,
        behaviorContext: {
            engine: host.engine,
            definition: host._definition,
            prefix,
            cleanupFns: host.cleanupFns,
            touchedFields: host.touchedFields,
            touchedVersion: host.touchedVersion,
            latestSubmitDetailSignal: host._latestSubmitDetailSignal,
            resolveToken: (v) => host.resolveToken(v),
            resolveItemPresentation: (item: ItemDescriptor) => host.resolveItemPresentation(item),
            resolveWidgetClassSlots: (p: PresentationBlock) => host.resolveWidgetClassSlots(p),
            findItemByKey: (key: string) => host.findItemByKey(key),
            renderComponent: (comp, parent, pfx) => renderComponent(host, comp, parent, pfx),
            submit: (opts) => host.submit(opts),
            registryEntries: host._registryEntries,
            rerender: () => host.render(),
            getFieldVM: (fieldPath: string) => host.engine.getFieldVM(fieldPath),
        },
        adapterContext: {
            onDispose: (fn: () => void) => host.cleanupFns.push(fn),
            applyCssClass: (el, comp) => host.applyCssClass(el, comp),
            applyStyle: (el, style) => host.applyStyle(el, style),
            applyAccessibility: (el, comp) => host.applyAccessibility(el, comp),
            applyClassValue: (el: HTMLElement, classValue: unknown) => host.applyClassValue(el, classValue),
        },
    };

    // pageMode-driven rendering: a Stack root with Page children triggers the
    // wizard or tabs behavior/adapter pipeline instead of plain Stack rendering.
    if (componentType === 'Stack' && isPageModeWizard(host, comp)) {
        renderPageModeWizard(host, comp, parent, ctx);
        return;
    }
    if (componentType === 'Stack' && isPageModeTabs(host, comp)) {
        renderPageModeTabs(host, comp, parent, ctx);
        return;
    }

    if (plugin) {
        plugin.render(comp as LayoutNode, parent, ctx);
    } else {
        console.warn(`Unknown component type: ${componentType} (custom components should be expanded by planner)`);
    }
}

/** Merged definition + component document formPresentation (pageMode, showProgress, …). */
function effectiveFormPresentation(host: RenderHost): Record<string, unknown> {
    return (
        mergeFormPresentationForPlanning(
            host._definition?.formPresentation,
            host._componentDocument?.formPresentation,
        ) ?? {}
    );
}

/**
 * Detect whether a Stack comp should render as a wizard based on pageMode.
 * True when children are Pages and formPresentation.pageMode === 'wizard'.
 */
function isPageModeWizard(host: RenderHost, comp: ComponentDescriptor): boolean {
    const pageMode = effectiveFormPresentation(host).pageMode;
    if (pageMode !== 'wizard') return false;
    const children = comp.children;
    if (!Array.isArray(children) || children.length === 0) return false;
    return children.some((c) => typeof c === 'object' && c !== null && (c as ComponentDescriptor).component === 'Page');
}

/**
 * Detect whether a Stack comp should render as tabs based on pageMode.
 * True when children are Pages and formPresentation.pageMode === 'tabs'.
 */
function isPageModeTabs(host: RenderHost, comp: ComponentDescriptor): boolean {
    const pageMode = effectiveFormPresentation(host).pageMode;
    if (pageMode !== 'tabs') return false;
    const children = comp.children;
    if (!Array.isArray(children) || children.length === 0) return false;
    return children.some((c) => typeof c === 'object' && c !== null && (c as ComponentDescriptor).component === 'Page');
}

/**
 * Render a Stack as a wizard when pageMode === 'wizard'.
 * Renders orphan (non-Page) children normally, then synthesizes a wizard-like
 * comp from the Page children and routes through the wizard behavior/adapter.
 */
function renderPageModeWizard(host: RenderHost, comp: ComponentDescriptor, parent: HTMLElement, ctx: RenderContext): void {
    const allChildren = (Array.isArray(comp.children) ? comp.children : []) as ComponentDescriptor[];
    const orphans = allChildren.filter((c) => c.component !== 'Page');
    const pageChildren = allChildren.filter((c) => c.component === 'Page');

    // Render orphan children (non-Page nodes) as plain layout
    for (const orphan of orphans) {
        ctx.renderComponent(orphan, parent, ctx.prefix);
    }

    const formPres = effectiveFormPresentation(host);
    const wizardComp = {
        component: 'Wizard',
        children: pageChildren,
        showProgress: formPres.showProgress !== false,
        allowSkip: !!formPres.allowSkip,
        sidenav: formPres.sidenav,
        cssClass: comp.cssClass,
        style: comp.style,
        accessibility: comp.accessibility,
        id: comp.id,
    };

    const behavior = useWizard(ctx.behaviorContext, wizardComp);
    const adapterFn = globalRegistry.resolveAdapterFn('Wizard');
    if (adapterFn) adapterFn(behavior, parent, ctx.adapterContext);
}

/**
 * Render a Stack as tabs when pageMode === 'tabs'.
 * Renders orphan (non-Page) children normally, then synthesizes a tabs-like
 * comp from the Page children and routes through the tabs behavior/adapter.
 */
function renderPageModeTabs(host: RenderHost, comp: ComponentDescriptor, parent: HTMLElement, ctx: RenderContext): void {
    const allChildren = (Array.isArray(comp.children) ? comp.children : []) as ComponentDescriptor[];
    const orphans = allChildren.filter((c) => c.component !== 'Page');
    const pageChildren = allChildren.filter((c) => c.component === 'Page');

    // Render orphan children (non-Page nodes) as plain layout
    for (const orphan of orphans) {
        ctx.renderComponent(orphan, parent, ctx.prefix);
    }

    const formPres = effectiveFormPresentation(host);
    const tabsComp = {
        component: 'Tabs',
        children: pageChildren,
        tabLabels: pageChildren.map((p) => String(p.title ?? (p.props as { title?: string } | undefined)?.title ?? '')),
        position: formPres.tabPosition || 'top',
        defaultTab: formPres.defaultTab ?? 0,
        cssClass: comp.cssClass,
        style: comp.style,
        accessibility: comp.accessibility,
        id: comp.id,
    };

    const behavior = useTabs(ctx.behaviorContext, tabsComp);
    const adapterFn = globalRegistry.resolveAdapterFn('Tabs');
    if (adapterFn) adapterFn(behavior, parent, ctx.adapterContext);
}
