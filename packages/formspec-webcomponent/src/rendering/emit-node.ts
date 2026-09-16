/** @filedesc Walks a LayoutNode tree and emits DOM via component plugin dispatch. */
import { effect } from '@preact/signals-core';
import { Path } from '@formspec-org/types';
import { globalRegistry } from '../registry';
import type { RenderContext } from '../types';
import type { BehaviorContext } from '../behaviors/types';
import type { AdapterContext } from '../adapters/types';
import type { ComponentDescriptor, RenderHost } from '../hub-types.js';
import {
    PresentationBlock,
    ItemDescriptor,
    mergeFormPresentationForPlanning,
    resolveRouteLandmark,
    type LayoutNode,
} from '@formspec-org/layout';
import type { ValidationResult } from '@formspec-org/types';
import { useWizard } from '../behaviors/wizard';
import { useTabs } from '../behaviors/tabs';
import { buildGroupBehavior, buildRepeatGroupBehavior, type EmitChild } from './group-behaviors';
import { headsChildren } from './heading-depth';

export type { RenderHost } from '../hub-types.js';

function applyComponentGraphIdentity(el: HTMLElement, identity: LayoutNode['componentGraphIdentity']): void {
    if (!identity) return;
    el.dataset.formspecComponentHandle = identity.component.handle;
    if (identity.component.url) el.dataset.formspecComponentUrl = identity.component.url;
    if (identity.component.version) el.dataset.formspecComponentVersion = identity.component.version;
    el.dataset.formspecSurfaceUrl = identity.surface.url;
    if (identity.surface.version) el.dataset.formspecSurfaceVersion = identity.surface.version;
    el.dataset.formspecRoute = identity.route;
    el.dataset.formspecNodePath = identity.nodePath;
    if (identity.id) el.dataset.formspecComponentNodeId = identity.id;
    if (identity.nodeId) el.dataset.formspecComponentNodeStructuralId = identity.nodeId;
}

const NON_LAYOUT_ROUTE_LANDMARK_COMPONENTS = new Set(['Modal', 'Dialog', 'Popover']);

function routeLandmarkElementAttrs(
    component: string,
    policy: LayoutNode['uiGraphRoutePolicy'],
): { role?: string; ariaLabel?: string } {
    if (!policy || NON_LAYOUT_ROUTE_LANDMARK_COMPONENTS.has(component)) {
        return {};
    }
    const resolved = resolveRouteLandmark(policy);
    return {
        ...(resolved.role ? { role: resolved.role } : {}),
        ...(resolved.ariaLabel ? { ariaLabel: resolved.ariaLabel } : {}),
    };
}

function applyUiGraphRoutePolicy(
    el: HTMLElement,
    component: string,
    policy: LayoutNode['uiGraphRoutePolicy'],
): void {
    if (!policy) return;
    el.dataset.formspecUiPolicySchema = policy.schemaId;
    el.dataset.formspecUiPolicySource = policy.source;
    el.dataset.formspecUiPolicySurfaceUrl = policy.targetSurface.url;
    if (policy.targetSurface.version) el.dataset.formspecUiPolicySurfaceVersion = policy.targetSurface.version;
    el.dataset.formspecUiPolicyRoute = policy.routeId;
    if (policy.a11y?.landmark) el.dataset.formspecUiPolicyA11yLandmark = policy.a11y.landmark;
    if (policy.a11y?.landmarkLabel) {
        el.dataset.formspecUiPolicyA11yLandmarkLabel = policy.a11y.landmarkLabel;
    }
    if (policy.a11y?.landmarkSuppressed) {
        el.dataset.formspecUiPolicyA11yLandmarkSuppressed = 'true';
    }
    if (policy.a11y?.keyboardNavigation !== undefined) {
        el.dataset.formspecUiPolicyKeyboardNavigation = String(policy.a11y.keyboardNavigation);
    }
    const landmarkAttrs = routeLandmarkElementAttrs(component, policy);
    if (landmarkAttrs.role) el.setAttribute('role', landmarkAttrs.role);
    if (landmarkAttrs.ariaLabel) el.setAttribute('aria-label', landmarkAttrs.ariaLabel);
    if (policy.responsive?.minColumns !== undefined) {
        el.dataset.formspecUiPolicyResponsiveMinColumns = String(policy.responsive.minColumns);
    }
    if (policy.responsive?.collapseOrder) {
        el.dataset.formspecUiPolicyResponsiveCollapseOrder = JSON.stringify(policy.responsive.collapseOrder);
    }
}

function applyProjectionMetadata(
    el: HTMLElement,
    metadata: Pick<LayoutNode, 'component' | 'componentGraphIdentity' | 'uiGraphRoutePolicy'>,
): void {
    applyComponentGraphIdentity(el, metadata.componentGraphIdentity);
    applyUiGraphRoutePolicy(el, metadata.component, metadata.uiGraphRoutePolicy);
}

/** The styling appliers an adapter may use. One shape, whether the caller is a plugin or `emitNode` itself. */
function adapterContextFor(host: RenderHost, cleanupFns: Array<() => void>): AdapterContext {
    return {
        onDispose: (fn: () => void) => cleanupFns.push(fn),
        engine: host.engine,
        applyCssClass: (el, comp) => host.applyCssClass(el, comp),
        applyStyle: (el, style) => host.applyStyle(el, style),
        applyAccessibility: (el, comp) => host.applyAccessibility(el, comp),
        applyClassValue: (el: HTMLElement, classValue: unknown) => host.applyClassValue(el, classValue),
    };
}

/**
 * Which render draws a repeatable group's chrome: the theme's repeat presentation (theme §4.2
 * `RepeatCards`) when the active adapter has one, else the group's default repeat chrome. Both take the
 * same behavior, so the fallback is a different shape around the same rows — never a dropped group.
 */
export function repeatAdapterType(node: LayoutNode, adapterName: string): string {
    const presentation = node.repeatPresentation;
    return presentation && globalRegistry.resolveAdapterFn(presentation, adapterName)
        ? presentation
        : 'RepeatGroup';
}

/** The renderer owns tree recursion; group behaviors only ask for a child in a given scope. */
const emitChild = (host: RenderHost): EmitChild =>
    (child, parent, prefix, headingLevel, scope) => emitNode(host, child, parent, prefix, headingLevel, scope);

/** Hand a planner node's chrome to the resolved adapter, then stamp the renderer's projection metadata on it. */
function emitThroughAdapter<B>(
    host: RenderHost,
    node: LayoutNode,
    target: HTMLElement,
    cleanupFns: Array<() => void>,
    componentType: string,
    behavior: B,
): void {
    const render = globalRegistry.resolveAdapterFn(componentType, host.resolvedAdapterName);
    if (!render) {
        console.warn(`No adapter renders ${componentType}`);
        return;
    }
    const firstNewChildIndex = target.childElementCount;
    render(behavior, target, adapterContextFor(host, cleanupFns));
    for (const child of Array.from(target.children).slice(firstNewChildIndex)) {
        if (child instanceof HTMLElement) applyProjectionMetadata(child, node);
    }
}

function renderActualComponentWithProjectionMetadata(
    host: RenderHost,
    comp: ComponentDescriptor,
    parent: HTMLElement,
    prefix: string,
    cleanupFns: Array<() => void>,
    headingLevel: number,
): void {
    const firstNewChildIndex = parent.childElementCount;
    renderActualComponent(host, comp, parent, prefix, cleanupFns, headingLevel);
    if (!comp.componentGraphIdentity && !comp.uiGraphRoutePolicy) return;
    const added = Array.from(parent.children).slice(firstNewChildIndex);
    for (const child of added) {
        if (child instanceof HTMLElement) {
            applyProjectionMetadata(child, comp);
        }
    }
}

/** A planner node flattened into the descriptor plugins and adapters read. */
export function nodeDescriptor(node: LayoutNode): ComponentDescriptor {
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
    if (node.pageMode) comp.pageMode = node.pageMode;
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
    if (node.componentGraphIdentity !== undefined) {
        comp.componentGraphIdentity = node.componentGraphIdentity;
    }
    if (node.uiGraphRoutePolicy !== undefined) {
        comp.uiGraphRoutePolicy = node.uiGraphRoutePolicy;
    }

    return comp;
}

/**
 * Walk a LayoutNode tree from the planner and emit DOM.
 * Effects register on `cleanupFns`: the host's list, or a repeat row pass's own list.
 */
export function emitNode(
    host: RenderHost,
    node: LayoutNode,
    parent: HTMLElement,
    prefix: string,
    headingLevel = 3,
    cleanupFns: Array<() => void> = host.cleanupFns,
): void {
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
        cleanupFns.push(effect(() => {
            const visible = !!exprFn();
            wrapper.classList.toggle('formspec-hidden', !visible);
            if (fallbackEl) fallbackEl.classList.toggle('formspec-hidden', visible);
        }));
        target = wrapper;
    }

    if (node.isRepeatTemplate && node.props.bind) {
        emitThroughAdapter(host, node, target, cleanupFns,
            repeatAdapterType(node, host.resolvedAdapterName),
            buildRepeatGroupBehavior(host, node, prefix, headingLevel, cleanupFns, emitChild(host)));
        return;
    }

    if (node.scopeChange && !node.isRepeatTemplate && node.props.bind) {
        emitThroughAdapter(host, node, target, cleanupFns, 'Group',
            buildGroupBehavior(host, node, prefix, headingLevel, cleanupFns, emitChild(host)));
        return;
    }

    const comp = nodeDescriptor(node);
    renderActualComponentWithProjectionMetadata(host, comp, target, prefix, cleanupFns, headingLevel);
}

/**
 * Render a component, handling LayoutNode objects by delegating to emitNode.
 */
export function renderComponent(
    host: RenderHost,
    comp: LayoutNode | ComponentDescriptor,
    parent: HTMLElement,
    prefix = '',
    cleanupFns: Array<() => void> = host.cleanupFns,
    headingLevel = 3,
): void {
    if (comp && typeof comp === 'object' && 'category' in comp && 'id' in comp) {
        emitNode(host, comp as LayoutNode, parent, prefix, headingLevel, cleanupFns);
        return;
    }
    console.warn('renderComponent called with non-LayoutNode comp — this should not happen after planner integration', comp);
}

/**
 * Look up a component plugin and invoke its render function with a full RenderContext.
 */
export function renderActualComponent(
    host: RenderHost,
    comp: ComponentDescriptor,
    parent: HTMLElement,
    prefix = '',
    cleanupFns: Array<() => void> = host.cleanupFns,
    headingLevel = 3,
): void {
    const componentType = comp.component;
    const plugin = globalRegistry.get(componentType);
    // Children render into this component's scope unless a repeat row pass hands them its own list, and at
    // this component's heading depth — a Grid cell or a Stack body is not a new page section — unless the
    // component heads them, as a titled group does (`buildGroupBehavior`): then they sit one deeper.
    const childHeadingLevel = headsChildren(comp) ? Math.min(headingLevel + 1, 6) : headingLevel;
    const renderChild: RenderContext['renderComponent'] = (child, childParent, pfx, scope = cleanupFns) =>
        renderComponent(host, child, childParent, pfx, scope, childHeadingLevel);

    const ctx: RenderContext = {
        engine: host.engine,
        componentDocument: host._componentDocument,
        themeDocument: host._themeDocument,
        adapterName: host.resolvedAdapterName,
        prefix,
        headingLevel: Math.min(headingLevel, 6),
        submit: (opts) => host.submit(opts),
        resolveActionRef: (actionRef, nodeId) => host.resolveActionRef(actionRef, nodeId),
        invokeAction: (actionRef, nodeId) => host.invokeAction(actionRef, nodeId),
        resolveValidationTarget: (r) => host.resolveValidationTarget(r),
        focusField: (p: string) => host.focusField(p),
        submitPendingSignal: host._submitPendingSignal,
        latestSubmitDetailSignal: host._latestSubmitDetailSignal,
        setSubmitPending: (pending: boolean) => host.setSubmitPending(pending),
        isSubmitPending: () => host.isSubmitPending(),
        renderComponent: renderChild,
        resolveToken: (val) => host.resolveToken(val),
        applyStyle: (el, style) => host.applyStyle(el, style),
        applyCssClass: (el, comp) => host.applyCssClass(el, comp),
        applyAccessibility: (el, comp) => host.applyAccessibility(el, comp),
        resolveItemPresentation: (itemDesc: ItemDescriptor) => host.resolveItemPresentation(itemDesc),
        cleanupFns,
        findItemByKey: (key: string) => host.findItemByKey(key),
        activeBreakpoint: host.activeBreakpoint,
        touchedFields: host.touchedFields,
        touchedVersion: host.touchedVersion,
        behaviorContext: {
            engine: host.engine,
            definition: host._definition,
            prefix,
            cleanupFns,
            touchedFields: host.touchedFields,
            touchedVersion: host.touchedVersion,
            latestSubmitDetailSignal: host._latestSubmitDetailSignal,
            resolveToken: (v) => host.resolveToken(v),
            resolveItemPresentation: (item: ItemDescriptor) => host.resolveItemPresentation(item),
            resolveWidgetClassSlots: (p: PresentationBlock) => host.resolveWidgetClassSlots(p),
            findItemByKey: (key: string) => host.findItemByKey(key),
            renderComponent: renderChild,
            headingLevel: Math.min(headingLevel, 6),
            submit: (opts) => host.submit(opts),
            registryEntries: host._registryEntries,
            rerender: () => host.render(),
            getFieldVM: (fieldPath: string) => host.engine.getFieldVM(fieldPath),
            fieldHelp: (fieldPath: string) => host.resolveFieldHelp(fieldPath),
            announceAssistFill: (label: string) => host.announceAssistFill(label),
            isDeclarativeToolForm: host.isDeclarativeToolForm(),
        },
        adapterContext: adapterContextFor(host, cleanupFns),
        isDeclarativeToolForm: host.isDeclarativeToolForm(),
    };

    // pageMode-driven rendering: a planner-marked Stack root with direct Section children triggers the
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
            (host._componentDocument as (typeof host._componentDocument & { formPresentation?: unknown }))?.formPresentation,
        ) ?? {}
    );
}

function tabPlacementFromPresentation(value: unknown): 'top' | 'bottom' | 'left' | 'right' {
    return value === 'bottom' || value === 'left' || value === 'right' ? value : 'top';
}

function defaultTabFromPresentation(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * Detect whether a Stack comp should render as a wizard based on pageMode.
 * True when children are direct root Sections and formPresentation.pageMode === 'wizard'.
 */
function isPageModeWizard(host: RenderHost, comp: ComponentDescriptor): boolean {
    if (comp.pageMode !== 'wizard') return false;
    const children = comp.children;
    if (!Array.isArray(children) || children.length === 0) return false;
    return children.some((c) => typeof c === 'object' && c !== null && (c as ComponentDescriptor).component === 'Section');
}

/**
 * Detect whether a Stack comp should render as tabs based on pageMode.
 * True when children are direct root Sections and formPresentation.pageMode === 'tabs'.
 */
function isPageModeTabs(host: RenderHost, comp: ComponentDescriptor): boolean {
    if (comp.pageMode !== 'tabs') return false;
    const children = comp.children;
    if (!Array.isArray(children) || children.length === 0) return false;
    return children.some((c) => typeof c === 'object' && c !== null && (c as ComponentDescriptor).component === 'Section');
}

/**
 * Render a Stack as a wizard when pageMode === 'wizard'.
 * Renders orphan (non-Section) children normally, then synthesizes a wizard-like
 * comp from the Section children and routes through the wizard behavior/adapter.
 */
function renderPageModeWizard(host: RenderHost, comp: ComponentDescriptor, parent: HTMLElement, ctx: RenderContext): void {
    const allChildren = (Array.isArray(comp.children) ? comp.children : []) as ComponentDescriptor[];
    const orphans = allChildren.filter((c) => c.component !== 'Section');
    const pageChildren = allChildren.filter((c) => c.component === 'Section');

    // Render orphan children (non-Section nodes) as plain layout
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
    const adapterFn = globalRegistry.resolveAdapterFn('Wizard', ctx.adapterName);
    if (adapterFn) adapterFn(behavior, parent, ctx.adapterContext);
}

/**
 * Render a Stack as tabs when pageMode === 'tabs'.
 * Renders orphan (non-Section) children normally, then synthesizes a tabs-like
 * comp from the Section children and routes through the tabs behavior/adapter.
 */
function renderPageModeTabs(host: RenderHost, comp: ComponentDescriptor, parent: HTMLElement, ctx: RenderContext): void {
    const allChildren = (Array.isArray(comp.children) ? comp.children : []) as ComponentDescriptor[];
    const orphans = allChildren.filter((c) => c.component !== 'Section');
    const pageChildren = allChildren.filter((c) => c.component === 'Section');

    const formPres = effectiveFormPresentation(host);
    const tabsComp = {
        component: 'Tabs',
        // No tabLabels: each page's own planned title (its group's live label, its chrome key, its authored
        // title) labels its tab through the tabs behavior, so a Locale reaches it.
        children: pageChildren,
        placement: tabPlacementFromPresentation(formPres.tabPosition),
        defaultTab: defaultTabFromPresentation(formPres.defaultTab),
        cssClass: comp.cssClass,
        style: comp.style,
        accessibility: comp.accessibility,
        id: comp.id,
    };

    const behavior = useTabs(ctx.behaviorContext, tabsComp);
    const adapterFn = globalRegistry.resolveAdapterFn('Tabs', ctx.adapterName);
    if (adapterFn) adapterFn(behavior, parent, ctx.adapterContext);

    // Keep non-page siblings, such as an injected ActionButton, after the tabs.
    for (const orphan of orphans) {
        ctx.renderComponent(orphan, parent, ctx.prefix);
    }
}
