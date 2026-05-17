/** @filedesc Layout node IDs, classification, token/CSS helpers, and plan context prep. */

import type { LayoutNode, NodeIdGenerator, PlanContext } from './types.js';
import { resolveToken } from './tokens.js';

// ── Component category classification ────────────────────────────────

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

export function classifyComponent(type: string): LayoutNode['category'] {
    if (LAYOUT_COMPONENTS.has(type)) return 'layout';
    if (CONTAINER_COMPONENTS.has(type)) return 'container';
    if (INPUT_COMPONENTS.has(type)) return 'field';
    if (DISPLAY_COMPONENTS.has(type)) return 'display';
    if (INTERACTIVE_COMPONENTS.has(type)) return 'interactive';
    return 'layout';
}

// ── ID generation ────────────────────────────────────────────────────

export function createNodeIdGenerator(start = 0): NodeIdGenerator {
    let counter = start;
    return (prefix: string) => `${prefix}-${++counter}`;
}

/** Attach a per-plan ID generator when callers omit `nextId`. */
export function preparePlanContext(
    ctx: Omit<PlanContext, 'nextId'> & Partial<Pick<PlanContext, 'nextId'>>,
): PlanContext {
    if (ctx.nextId) {
        return ctx as PlanContext;
    }
    return { ...ctx, nextId: createNodeIdGenerator() };
}

// ── Plan tree queries ─────────────────────────────────────────────────

export function planContains(node: LayoutNode, component: string): boolean {
    if (node.component === component) return true;
    return node.children.some(child => planContains(child, component));
}

const SUBMIT_MUST_BE_SIBLING_ROOTS = new Set(['Accordion']);

export function ensureSubmitButton(
    root: LayoutNode,
    nextId: NodeIdGenerator = createNodeIdGenerator(),
): void {
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

// ── Token resolution helpers ─────────────────────────────────────────

export function resolveTokenInContext(val: unknown, ctx: PlanContext): unknown {
    return resolveToken(val, ctx.componentDocument?.tokens, ctx.theme?.tokens);
}

export function resolveStyleTokens(
    style: Record<string, string | number> | undefined,
    ctx: PlanContext,
): Record<string, string | number> | undefined {
    if (!style) return undefined;
    const resolved: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(style)) {
        resolved[k] = resolveTokenInContext(v, ctx) as string | number;
    }
    return resolved;
}

export function normalizeCssClass(val: string | string[] | undefined): string[] {
    if (!val) return [];
    if (Array.isArray(val)) return val.flatMap(c => c.split(/\s+/).filter(Boolean));
    return val.split(/\s+/).filter(Boolean);
}

export function resolveCssClasses(comp: { cssClass?: string | string[] }, ctx: PlanContext): string[] {
    const raw = normalizeCssClass(comp.cssClass);
    return raw.map(c => String(resolveTokenInContext(c, ctx)));
}

const STRUCTURAL_KEYS = new Set([
    'component', 'children', 'when', 'responsive',
    'style', 'cssClass', 'accessibility', 'params',
]);

export function extractProps(comp: Record<string, unknown>): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    for (const key of Object.keys(comp)) {
        if (!STRUCTURAL_KEYS.has(key)) {
            props[key] = comp[key];
        }
    }
    return props;
}
