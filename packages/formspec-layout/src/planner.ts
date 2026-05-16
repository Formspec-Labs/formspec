/**
 * Layout planner — produces a JSON-serializable LayoutNode tree from a
 * component document tree or a definition items array.
 *
 * The planner is pure: it reads from a PlanContext snapshot and emits
 * LayoutNode trees with no side effects, signals, or DOM references.
 *
 * @module
 */

import type { LayoutNode, PlanContext } from './types.js';
import type { PresentationBlock, ItemDescriptor, Tier1Hints } from './theme-resolver.js';
import { resolvePresentation, resolveWidget } from './theme-resolver.js';
import { resolveResponsiveProps } from './responsive.js';
import { resolveToken } from './tokens.js';
import { interpolateParams } from './params.js';
import { getDefaultComponent } from './defaults.js';
import { widgetTokenToComponent } from '@formspec-org/types';

// ── Component category classification ────────────────────────────────

// Component category sets — aligned with Component Spec §4 categories.
const LAYOUT_COMPONENTS = new Set([
    'Page', 'Stack', 'Grid', 'Columns', 'Tabs', 'Accordion',
]);

const CONTAINER_COMPONENTS = new Set([
    'Card', 'Collapsible', 'ConditionalGroup', 'Panel', 'Modal', 'Popover',
]);

const INPUT_COMPONENTS = new Set([
    'TextInput', 'NumberInput', 'Select', 'Toggle', 'Checkbox',
    'DatePicker', 'RadioGroup', 'CheckboxGroup', 'Slider', 'Rating',
    'FileUpload', 'Signature', 'MoneyInput',
]);

const DISPLAY_COMPONENTS = new Set([
    'Heading', 'Text', 'Divider', 'Spacer', 'Alert', 'Badge',
    'ProgressBar', 'Summary', 'ValidationSummary',
]);

const INTERACTIVE_COMPONENTS = new Set([
    'SubmitButton', 'DataTable',
]);

function classifyComponent(type: string): LayoutNode['category'] {
    if (LAYOUT_COMPONENTS.has(type)) return 'layout';
    if (CONTAINER_COMPONENTS.has(type)) return 'container';
    if (INPUT_COMPONENTS.has(type)) return 'field';
    if (DISPLAY_COMPONENTS.has(type)) return 'display';
    if (INTERACTIVE_COMPONENTS.has(type)) return 'interactive';
    // Unknown components default to layout (custom components are usually structural)
    return 'layout';
}

// ── Plan tree queries ─────────────────────────────────────────────────

/** Returns true if any node in the tree has the given component type. */
export function planContains(node: LayoutNode, component: string): boolean {
    if (node.component === component) return true;
    return node.children.some(child => planContains(child, component));
}

/** Root components whose `children` are intrinsic sections/panels, not arbitrary layout siblings. */
const SUBMIT_MUST_BE_SIBLING_ROOTS = new Set(['Accordion']);

/** Append a SubmitButton node to a plan root if one doesn't already exist
 *  and the plan isn't owned by a Wizard (which provides its own submit).
 *  Also skips when the root has direct Page children — pageMode wizard/tabs
 *  synthesizes its own submit via the wizard behavior's Next→Submit button.
 *  For Accordion (and similar), children are sections — wrap in Stack so submit is not a section. */
export function ensureSubmitButton(root: LayoutNode): void {
    if (planContains(root, 'Wizard') || planContains(root, 'SubmitButton')) return;
    if (root.children.some(c => c.component === 'Page')) return;

    const submitNode: LayoutNode = {
        id: nextId('submit'),
        component: 'SubmitButton',
        category: 'interactive',
        props: {},
        cssClasses: [],
        children: [],
    };

    if (SUBMIT_MUST_BE_SIBLING_ROOTS.has(root.component)) {
        const inner: LayoutNode = { ...root };
        root.id = nextId('root-stack');
        root.component = 'Stack';
        root.category = 'layout';
        root.props = {};
        root.cssClasses = [];
        root.children = [inner, submitNode];
        delete root.style;
        delete root.accessibility;
        delete root.bindPath;
        delete root.fieldItem;
        delete root.presentation;
        delete root.labelPosition;
        delete root.when;
        delete root.whenPrefix;
        delete root.fallback;
        delete root.repeatGroup;
        delete root.repeatPath;
        delete root.isRepeatTemplate;
        delete root.scopeChange;
        return;
    }

    root.children.push(submitNode);
}

// ── ID generation ────────────────────────────────────────────────────

let nodeIdCounter = 0;

/** Reset the ID counter (for testing). */
export function resetNodeIdCounter(): void {
    nodeIdCounter = 0;
}

function nextId(prefix: string): string {
    return `${prefix}-${++nodeIdCounter}`;
}

// ── Token resolution helpers ─────────────────────────────────────────

function resolveTokenInContext(val: any, ctx: PlanContext): any {
    return resolveToken(val, ctx.componentDocument?.tokens, ctx.theme?.tokens);
}

function resolveStyleTokens(
    style: Record<string, string | number> | undefined,
    ctx: PlanContext,
): Record<string, string | number> | undefined {
    if (!style) return undefined;
    const resolved: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(style)) {
        resolved[k] = resolveTokenInContext(v, ctx);
    }
    return resolved;
}

function normalizeCssClass(val: string | string[] | undefined): string[] {
    if (!val) return [];
    if (Array.isArray(val)) return val.flatMap(c => c.split(/\s+/).filter(Boolean));
    return val.split(/\s+/).filter(Boolean);
}

function resolveCssClasses(comp: any, ctx: PlanContext): string[] {
    const raw = normalizeCssClass(comp.cssClass);
    return raw.map(c => String(resolveTokenInContext(c, ctx)));
}

// ── Prop extraction ──────────────────────────────────────────────────

/** Extract all component-specific props (everything except structural keys).
 * Note: 'bind' is intentionally NOT in this set — it's preserved in props
 * so renderers can access the original bind key for path construction. */
const STRUCTURAL_KEYS = new Set([
    'component', 'children', 'when', 'responsive',
    'style', 'cssClass', 'accessibility', 'params',
]);

function extractProps(comp: any): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    for (const key of Object.keys(comp)) {
        if (!STRUCTURAL_KEYS.has(key)) {
            props[key] = comp[key];
        }
    }
    return props;
}

// ── Main planner ─────────────────────────────────────────────────────

/**
 * Plan a component tree node into a LayoutNode tree.
 *
 * Walks the component document tree, resolves responsive props, resolves
 * tokens, expands custom components, and emits a JSON-serializable
 * LayoutNode tree. Conditional rendering (`when`) and repeat groups are
 * emitted as markers for the renderer to handle reactively.
 *
 * @param tree   - A component tree node from the component document.
 * @param ctx    - The planning context snapshot.
 * @param prefix - Bind path prefix for the current scope.
 * @param customComponentStack - Recursion guard for custom component expansion.
 * @returns A LayoutNode tree.
 */
export function planComponentTree(
    tree: any,
    ctx: PlanContext,
    prefix = '',
    customComponentStack?: Set<string>,
    applyThemePages = prefix === '',
): LayoutNode {
    if (!customComponentStack) customComponentStack = new Set();

    // Layer precedence is explicit: authored component Page nodes win over
    // theme.pages. Theme pages only synthesize page structure when the
    // component tree does not already own top-level pages.
    if (applyThemePages && !prefix && ctx.theme?.pages?.length && !componentTreeOwnsPages(tree)) {
        const themed = planThemePagesFromComponentTree(tree, ctx, customComponentStack);
        if (themed) {
            return applyGeneratedPageMode(themed, themed.component, ctx);
        }
    }

    // Apply responsive overrides (mobile-first cumulative cascade per §9.3)
    const comp = resolveResponsiveProps(tree, ctx.activeBreakpoint ?? null, ctx.componentDocument?.breakpoints);
    const componentType = comp.component as string;

    // Check for custom component expansion
    const customComponents = ctx.componentDocument?.components;
    if (customComponents?.[componentType]) {
        if (customComponentStack.has(componentType)) {
            // Recursion detected — emit a placeholder
            return {
                id: nextId('err'),
                component: 'Text',
                category: 'display',
                props: { text: `[Recursive component: ${componentType}]` },
                cssClasses: [],
                children: [],
            };
        }

        const customDef = customComponents[componentType];
        const template = JSON.parse(JSON.stringify(customDef.tree));
        interpolateParams(template, comp.params || comp);

        customComponentStack.add(componentType);
        const result = planComponentTree(template, ctx, prefix, customComponentStack, false);
        customComponentStack.delete(componentType);
        return result;
    }

    // Resolve bind path
    const bindKey = comp.bind as string | undefined;
    const fullBindPath = bindKey
        ? (prefix ? `${prefix}.${bindKey}` : bindKey)
        : undefined;

    // Check if this is a repeat group
    const item = fullBindPath ? ctx.findItem(fullBindPath) : null;
    const isRepeatGroup = item?.type === 'group' && item?.repeatable === true
        && componentType !== 'DataTable' && componentType !== 'Accordion';

    // Build the node
    const props = extractProps(comp);

    // Default maxLines for text dataType fields rendered as TextInput
    if (componentType === 'TextInput' && item?.dataType === 'text' && props.maxLines == null) {
        props.maxLines = 3;
    }

    // Resolve token values in known prop positions
    if (props.gap !== undefined) props.gap = resolveTokenInContext(props.gap, ctx);
    if (props.size !== undefined) props.size = resolveTokenInContext(props.size, ctx);

    const node: LayoutNode = {
        id: nextId(componentType.toLowerCase()),
        component: componentType,
        category: classifyComponent(componentType),
        props,
        style: resolveStyleTokens(comp.style, ctx),
        cssClasses: resolveCssClasses(comp, ctx),
        children: [],
    };

    // Accessibility
    if (comp.accessibility) {
        node.accessibility = { ...comp.accessibility };
    }

    // Bind path
    if (fullBindPath) {
        node.bindPath = fullBindPath;
    }

    // Field item snapshot
    if (item && item.type === 'field') {
        node.fieldItem = {
            key: item.key ?? bindKey,
            label: item.label ?? bindKey,
            hint: item.hint,
            dataType: item.dataType,
            extensions: item.extensions,
        };

        // Resolve theme presentation for this field
        const itemDesc: ItemDescriptor = {
            key: bindKey!,
            type: 'field',
            dataType: item.dataType,
        };
        const tier1: Tier1Hints = {
            formPresentation: ctx.formPresentation,
            itemPresentation: item.presentation,
        };
        const presentation = resolvePresentation(ctx.theme, itemDesc, tier1);
        node.presentation = presentation;
        node.labelPosition = presentation.labelPosition ?? 'top';

        // Merge presentation CSS classes
        const presClasses = normalizeCssClass(presentation.cssClass);
        if (presClasses.length > 0) {
            const union = new Set([...node.cssClasses, ...presClasses]);
            node.cssClasses = [...union];
        }
    }

    // Display item — propagate label text and remove reactive bind (display items have no signals)
    if (item && item.type === 'display') {
        if (props.text == null) {
            props.text = item.label ?? '';
        }
        delete props.bind;
    }

    // Conditional rendering
    if (comp.when) {
        node.when = comp.when;
        node.whenPrefix = prefix;
        if (comp.fallback) {
            node.fallback = comp.fallback;
        }
    }

    // Repeat group
    if (isRepeatGroup && fullBindPath) {
        node.repeatGroup = bindKey;
        node.repeatPath = fullBindPath;
        node.isRepeatTemplate = true;
    }

    // Mark scope change for group nodes so the emitter extends the prefix.
    // DataTable and Accordion manage their own group binding internally,
    // so they must NOT be treated as scope-change nodes.
    const SELF_MANAGED_GROUP_COMPONENTS = new Set(['DataTable', 'Accordion']);
    if (fullBindPath && item?.type === 'group' && !SELF_MANAGED_GROUP_COMPONENTS.has(componentType)) {
        node.scopeChange = true;
    }

    // Plan children
    const childPrefix = isRepeatGroup && fullBindPath
        ? `${fullBindPath}[0]` // Template uses index 0 as placeholder
        : (fullBindPath && item?.type === 'group' ? fullBindPath : prefix);

    if (Array.isArray(comp.children)) {
        for (const child of comp.children) {
            node.children.push(
                planComponentTree(child, ctx, childPrefix, customComponentStack, false),
            );
        }
    }

    if (applyThemePages) {
        return applyGeneratedPageMode(node, componentType, ctx);
    }

    return node;
}

function componentTreeOwnsPages(tree: any): boolean {
    if (!tree || !Array.isArray(tree.children)) {
        return false;
    }
    return tree.children.some((child: any) => child?.component === 'Page');
}

/**
 * Plan definition items into LayoutNode trees (fallback when no component
 * document is provided).
 *
 * Walks the definition items array, runs the theme cascade for each item,
 * selects default widgets, and emits LayoutNode trees.
 *
 * @param items  - The definition items array.
 * @param ctx    - The planning context snapshot.
 * @param prefix - Bind path prefix for the current scope.
 * @returns An array of LayoutNode trees, one per top-level item.
 */
export function planDefinitionFallback(
    items: any[],
    ctx: PlanContext,
    prefix = '',
    applyThemePages = prefix === '',
): LayoutNode[] {
    if (applyThemePages && !prefix && ctx.theme?.pages?.length) {
        const themed = planThemePagesFromDefinitionItems(items, ctx);
        if (themed.length > 0) {
            return themed;
        }
    }

    const nodes: LayoutNode[] = [];

    for (const item of items) {
        nodes.push(planDefinitionItem(item, ctx, prefix));
    }

    return !prefix ? applyDefinitionPageMode(nodes, ctx) : nodes;
}

function applyDefinitionPageMode(nodes: LayoutNode[], ctx: PlanContext): LayoutNode[] {
    const pageMode = ctx.formPresentation?.pageMode;
    if (pageMode !== 'wizard' && pageMode !== 'tabs') {
        return nodes;
    }

    const { orphans, pages } = buildDefinitionPages(nodes, ctx.items);
    if (pages.length === 0) {
        return nodes;
    }

    return emitPageModePages(orphans, pages);
}

function planDefinitionItem(item: any, ctx: PlanContext, prefix = ''): LayoutNode {
    const key = item.key || item.name;
    const fullPath = prefix ? `${prefix}.${key}` : key;

    const itemDesc: ItemDescriptor = {
        key,
        type: item.type,
        dataType: item.dataType,
    };
    const tier1: Tier1Hints = {
        formPresentation: ctx.formPresentation,
        itemPresentation: item.presentation,
    };
    const presentation = resolvePresentation(ctx.theme, itemDesc, tier1);

    if (item.type === 'group') {
        const isRepeat = item.repeatable === true;

        const groupNode: LayoutNode = {
            id: nextId('group'),
            component: 'Stack',
            category: 'layout',
            props: { title: item.label || key, bind: key },
            cssClasses: normalizeCssClass(presentation.cssClass),
            children: [],
            bindPath: fullPath,
            scopeChange: true,
        };

        if (isRepeat) {
            groupNode.repeatGroup = key;
            groupNode.repeatPath = fullPath;
            groupNode.isRepeatTemplate = true;
        }

        const childPrefix = isRepeat ? `${fullPath}[0]` : fullPath;
        if (Array.isArray(item.children)) {
            groupNode.children = planDefinitionFallback(item.children, ctx, childPrefix, false);
        }

        return groupNode;
    }

    if (item.type === 'field') {
        const isAvailable = ctx.isComponentAvailable ?? (() => true);
        const themeWidget = resolveWidget(presentation, isAvailable);
        const tier1Widget = widgetTokenToComponent(item.presentation?.widgetHint);
        const widget = themeWidget || tier1Widget || getDefaultComponent(item);

        // Forward definition-level presentation props (min, max, showStepper, currency, etc.)
        // into node.props so renderers can read them uniformly.
        const { widgetHint: _, cssClass: _c, labelPosition: _l, ...presentationProps } = item.presentation ?? {};
        const fieldProps: Record<string, unknown> = { bind: key, ...presentationProps };
        // Default maxLines for text dataType fields rendered as TextInput
        if (widget === 'TextInput' && item.dataType === 'text' && !fieldProps.maxLines) {
            fieldProps.maxLines = 3;
        }

        return {
            id: nextId('field'),
            component: widget,
            category: 'field',
            props: fieldProps,
            cssClasses: normalizeCssClass(presentation.cssClass),
            children: [],
            bindPath: fullPath,
            fieldItem: {
                key,
                label: item.label ?? key,
                hint: item.hint,
                dataType: item.dataType,
                options: item.options,
                optionSet: item.optionSet,
                extensions: item.extensions,
            },
            presentation,
            labelPosition: presentation.labelPosition ?? 'top',
        };
    }

    const displayWidget = widgetTokenToComponent(item.presentation?.widgetHint) ?? 'Text';
    const { widgetHint: _wh, cssClass: _dc, labelPosition: _dl, ...displayPresentationProps } = item.presentation ?? {};
    const displayNode: LayoutNode = {
        id: nextId('display'),
        component: displayWidget,
        category: 'display',
        props: { text: item.label || '', ...displayPresentationProps },
        cssClasses: normalizeCssClass(presentation.cssClass),
        children: [],
    };

    if (item.relevant) {
        displayNode.when = item.relevant;
        displayNode.whenPrefix = prefix;
    }

    return displayNode;
}

function planThemePagesFromDefinitionItems(items: any[], ctx: PlanContext): LayoutNode[] {
    const pageNodes = buildThemePageNodes((regionPath) => {
        const item = findItemAtPath(items, regionPath);
        if (!item) return null;
        const parentPath = getParentPath(regionPath);
        return planDefinitionItem(item, ctx, parentPath);
    }, items, ctx);

    if (pageNodes.length === 0) {
        return [];
    }

    const assignedTopLevelKeys = collectAssignedTopLevelKeys(items, ctx.theme.pages);
    const unassigned = items
        .filter((item) => !assignedTopLevelKeys.has(item.key))
        .map((item) => planDefinitionItem(item, ctx, ''));

    // When pageMode is set, emit pages as direct nodes (renderer handles navigation).
    const pageMode = ctx.formPresentation?.pageMode;
    if ((pageMode === 'wizard' || pageMode === 'tabs') && pageNodes.length > 0) {
        const pages = pageNodes.map((pn) => ({
            id: typeof pn.props?.id === 'string' ? pn.props.id : undefined,
            title: String(pn.props?.title || ''),
            children: pn.children,
        }));
        return emitPageModePages(unassigned, pages);
    }

    return [...pageNodes, ...unassigned];
}

function planThemePagesFromComponentTree(
    tree: any,
    ctx: PlanContext,
    customComponentStack: Set<string>,
): LayoutNode | null {
    const baseCtx = withoutThemePages(ctx);
    const root = planComponentTree(tree, baseCtx, '', customComponentStack, false);
    const pageNodes = buildThemePageNodes((regionPath) => {
        const componentNode = findComponentNodeByPath(ctx.items, tree, regionPath);
        if (!componentNode) {
            return null;
        }
        return planComponentTree(componentNode, baseCtx, '', customComponentStack, false);
    }, ctx.items, ctx);

    if (pageNodes.length === 0) {
        return null;
    }

    const assignedTopLevelKeys = collectAssignedTopLevelKeys(ctx.items, ctx.theme.pages);
    const unassigned = ctx.items
        .filter((item) => !assignedTopLevelKeys.has(item.key))
        .map((item) => {
            const componentNode = findComponentNodeByPath(ctx.items, tree, item.key);
            return componentNode
                ? planComponentTree(componentNode, baseCtx, '', customComponentStack, false)
                : planDefinitionItem(item, baseCtx, '');
        });

    return {
        ...root,
        children: [...pageNodes, ...unassigned],
    };
}

function buildThemePageNodes(
    planRegionNode: (regionPath: string) => LayoutNode | null,
    items: any[],
    ctx: PlanContext,
): LayoutNode[] {
    const pages = Array.isArray(ctx.theme?.pages) ? ctx.theme.pages : [];
    const nodes: LayoutNode[] = [];

    for (const page of pages) {
        const regionNodes: LayoutNode[] = [];
        for (const region of Array.isArray(page.regions) ? page.regions : []) {
            const regionPath = findItemPathByKey(items, region.key);
            if (!regionPath) continue;
            const plannedNode = planRegionNode(regionPath);
            if (!plannedNode) continue;

            // Theme page regions render at prefix="" (outside their parent group
            // scope), so ensure bind is the full path for signal lookups.
            if (regionPath.includes('.') && plannedNode.props?.bind) {
                plannedNode.props.bind = regionPath;
                if (plannedNode.bindPath && plannedNode.bindPath !== regionPath) {
                    plannedNode.bindPath = regionPath;
                }
            }

            const wrapped = wrapRegionNode(plannedNode, region, ctx.activeBreakpoint ?? null);
            if (wrapped) {
                regionNodes.push(wrapped);
            }
        }

        // Skip theme pages where no regions resolved — prevents empty grids
        // from replacing the component tree's own layout.
        if (regionNodes.length === 0) continue;

        nodes.push({
            id: nextId('page'),
            component: 'Page',
            category: 'layout',
            props: {
                id: page.id,
                title: page.title,
                ...(page.description ? { description: page.description } : {}),
            },
            cssClasses: [],
            children: [
                {
                    id: nextId('grid'),
                    component: 'Grid',
                    category: 'layout',
                    props: { columns: 12 },
                    cssClasses: [],
                    children: regionNodes,
                },
            ],
        });
    }

    return nodes;
}

function wrapRegionNode(
    node: LayoutNode,
    region: any,
    activeBreakpoint: string | null,
): LayoutNode | null {
    const resolved = resolveRegionPlacement(region, activeBreakpoint);
    if (resolved.hidden) {
        return null;
    }

    const style: Record<string, string> = {
        gridColumn: resolved.start !== undefined
            ? `${resolved.start} / span ${resolved.span}`
            : `span ${resolved.span}`,
    };

    return {
        id: nextId('region'),
        component: 'Stack',
        category: 'layout',
        props: {},
        style,
        cssClasses: [],
        children: [node],
    };
}

type PlannedPage = {
    id?: string;
    title: string;
    children: LayoutNode[];
};

/**
 * Emit orphan nodes followed by Page nodes. The renderer applies navigation
 * behavior (wizard steps, tabs) based on `formPresentation.pageMode` — the
 * planner no longer creates Wizard/Tabs wrapper nodes.
 */
function emitPageModePages(
    orphans: LayoutNode[],
    pages: PlannedPage[],
): LayoutNode[] {
    if (pages.length === 0) {
        return orphans;
    }

    const pageNodes = pages.map((page, index) => ({
        id: nextId('page'),
        component: 'Page',
        category: 'layout' as const,
        props: {
            ...(page.id ? { id: page.id } : {}),
            title: page.title || `Page ${index + 1}`,
        },
        cssClasses: [],
        children: page.children,
    }));

    return [...orphans, ...pageNodes];
}

function applyGeneratedPageMode(
    rootNode: LayoutNode,
    componentType: string,
    ctx: PlanContext,
): LayoutNode {
    const pageMode = ctx.formPresentation?.pageMode;
    if (pageMode !== 'wizard' && pageMode !== 'tabs') {
        return rootNode;
    }

    if (!isStudioGeneratedComponentDoc(ctx.componentDocument)) {
        return rootNode;
    }

    if (componentType !== 'Stack' && componentType !== 'Root') {
        return rootNode;
    }

    if (!Array.isArray(rootNode.children) || rootNode.children.length === 0) {
        return rootNode;
    }

    if (rootNode.children.some((child) => child.component === 'Page')) {
        // Children are already Page nodes — keep them in place, orphans first.
        const orphans = rootNode.children.filter((node) => node.component !== 'Page');
        const pages = rootNode.children.filter((node) => node.component === 'Page');
        return {
            ...rootNode,
            children: [...orphans, ...pages],
        };
    }

    const topLevelNodes = rootNode.children.slice(0, ctx.items.length);
    const preservedExtras = rootNode.children.slice(ctx.items.length);
    const orphanChildren: LayoutNode[] = [];
    const pages: PlannedPage[] = [];
    const pageByName = new Map<string, PlannedPage>();
    let lastPage: PlannedPage | null = null;
    let sawExplicitPage = false;

    for (let index = 0; index < ctx.items.length; index += 1) {
        const item = ctx.items[index];
        const node = topLevelNodes[index];
        if (!node) continue;

        if (item?.type === 'group') {
            const pageName = getItemPageName(item);
            if (pageName) {
                sawExplicitPage = true;
                const page = pageByName.get(pageName) ?? { title: pageName, children: [] };
                if (!pageByName.has(pageName)) {
                    pageByName.set(pageName, page);
                    pages.push(page);
                }
                page.children.push(stripTitleFromGroupNode(node));
                lastPage = page;
            } else if (lastPage && sawExplicitPage) {
                lastPage.children.push(stripTitleFromGroupNode(node));
            } else {
                const title = String(item.label || node.props.title || node.props.bind || item.key || `Page ${pages.length + 1}`);
                pages.push({
                    title,
                    children: [stripTitleFromGroupNode(node)],
                });
                lastPage = pages[pages.length - 1];
            }
        } else {
            orphanChildren.push(node);
        }
    }

    if (pages.length === 0) {
        return rootNode;
    }

    return {
        ...rootNode,
        children: [...emitPageModePages(orphanChildren, pages), ...preservedExtras],
    };
}

/**
 * Returns true when the component document was auto-generated by Studio (or is
 * absent/empty).  The standalone planner also relies on this: when there is no
 * pre-existing component document, the planner treats the layout as fully
 * generated and applies page-mode materialization freely.
 */
function isStudioGeneratedComponentDoc(doc: any): boolean {
    if (!doc || typeof doc !== 'object') return false;
    return doc['x-studio-generated'] === true || doc.$formspecComponent == null;
}

function buildDefinitionPages(nodes: LayoutNode[], items: any[]): { orphans: LayoutNode[]; pages: PlannedPage[] } {
    const pageByName = new Map<string, PlannedPage>();
    const pages: PlannedPage[] = [];
    const orphans: LayoutNode[] = [];
    let lastPage: PlannedPage | null = null;
    let sawExplicitPage = false;

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const node = nodes[index];
        if (!node) continue;

        if (item?.type !== 'group') {
            orphans.push(node);
            continue;
        }

        const pageName = getItemPageName(item);
        if (pageName) {
            sawExplicitPage = true;
            const page = pageByName.get(pageName) ?? { title: pageName, children: [] };
            if (!pageByName.has(pageName)) {
                pageByName.set(pageName, page);
                pages.push(page);
            }
            page.children.push(stripTitleFromGroupNode(node));
            lastPage = page;
        } else if (lastPage && sawExplicitPage) {
            lastPage.children.push(stripTitleFromGroupNode(node));
        } else {
            const title = String(item.label || node.props.title || node.props.bind || item.key || `Page ${pages.length + 1}`);
            pages.push({
                title,
                children: [stripTitleFromGroupNode(node)],
            });
            lastPage = pages[pages.length - 1];
        }
    }

    for (let index = items.length; index < nodes.length; index += 1) {
        orphans.push(nodes[index]);
    }

    return { orphans, pages };
}

function getItemPageName(item: any): string | null {
    const page = item?.presentation?.layout?.page;
    return typeof page === 'string' && page.trim().length > 0 ? page.trim() : null;
}

function stripTitleFromGroupNode(node: LayoutNode): LayoutNode {
    if (node.component !== 'Stack') {
        return node;
    }

    const { title: _title, ...restProps } = node.props;
    return {
        ...node,
        props: restProps,
    };
}

function resolveRegionPlacement(region: any, activeBreakpoint: string | null): { span: number; start?: number; hidden: boolean } {
    const override = activeBreakpoint && region?.responsive ? region.responsive[activeBreakpoint] : null;
    const span = typeof override?.span === 'number'
        ? override.span
        : typeof region?.span === 'number'
            ? region.span
            : 12;
    const start = typeof override?.start === 'number'
        ? override.start
        : typeof region?.start === 'number'
            ? region.start
            : undefined;
    const hidden = override?.hidden === true;

    return { span, start, hidden };
}

function collectAssignedTopLevelKeys(items: any[], pages: any[]): Set<string> {
    const assigned = new Set<string>();

    for (const page of Array.isArray(pages) ? pages : []) {
        for (const region of Array.isArray(page.regions) ? page.regions : []) {
            const path = findItemPathByKey(items, region.key);
            if (!path) continue;

            // Extract the top-level segment. When a region references a nested
            // item (e.g. "applicantInfo.orgName"), the top-level parent group
            // ("applicantInfo") is considered assigned — prevents duplicate
            // rendering of the parent group's entire subtree.
            const topKey = path.includes('.') ? path.split('.')[0] : path;
            assigned.add(topKey);
        }
    }

    return assigned;
}

function withoutThemePages(ctx: PlanContext): PlanContext {
    if (!ctx.theme?.pages) {
        return ctx;
    }

    const theme = { ...ctx.theme };
    delete theme.pages;
    return { ...ctx, theme };
}

function findItemPathByKey(items: any[], key: string, prefix = ''): string | null {
    if (key.includes('.')) {
        return findItemAtPath(items, key) ? key : null;
    }
    for (const item of items) {
        const itemKey = item?.key || item?.name;
        if (!itemKey) continue;
        const fullPath = prefix ? `${prefix}.${itemKey}` : itemKey;
        if (itemKey === key) {
            return fullPath;
        }
        if (Array.isArray(item.children)) {
            const nested = findItemPathByKey(item.children, key, fullPath);
            if (nested) return nested;
        }
    }
    return null;
}

function findItemAtPath(items: any[], path: string): any | null {
    const segments = path.split('.').filter(Boolean);
    let current = items;

    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const found = current.find((item: any) => item?.key === segment || item?.name === segment);
        if (!found) return null;
        if (index === segments.length - 1) {
            return found;
        }
        current = Array.isArray(found.children) ? found.children : [];
    }

    return null;
}

function getParentPath(path: string): string {
    const segments = path.split('.').filter(Boolean);
    return segments.slice(0, -1).join('.');
}

function findComponentNodeByPath(_items: any[], rootNode: any, path: string): any | null {
    return findNodeByBindPath(rootNode, path, '');
}

function findNodeByBindPath(node: any, targetPath: string, currentPrefix: string): any | null {
    const bindKey = node.bind as string | undefined;
    const fullPath = bindKey
        ? (currentPrefix ? `${currentPrefix}.${bindKey}` : bindKey)
        : currentPrefix;

    if (fullPath === targetPath && bindKey) {
        return node;
    }

    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            const found = findNodeByBindPath(child, targetPath, fullPath);
            if (found) return found;
        }
    }

    return null;
}
