/** @filedesc Layout node IDs, classification, token/CSS helpers, and plan context prep. */

import type { LayoutNode, NodeIdGenerator, PlanContext } from './types.js';
import { resolveToken } from './tokens.js';

// ── Component category classification ────────────────────────────────

const LAYOUT_COMPONENTS = new Set([
    'Section', 'Stack', 'Grid', 'Tabs', 'Accordion',
]);

const CONTAINER_COMPONENTS = new Set([
    'Card', 'Collapsible', 'ConditionalGroup', 'Panel', 'Modal', 'Popover',
]);

const INPUT_COMPONENTS = new Set([
    'TextInput', 'NumberInput', 'Select', 'Toggle',
    'DatePicker', 'RadioGroup', 'CheckboxGroup', 'Slider', 'Rating',
    'FileUpload', 'Signature', 'MoneyInput',
]);

const DISPLAY_COMPONENTS = new Set([
    'Heading', 'Text', 'Divider', 'Alert', 'Badge',
    'ProgressBar', 'Summary', 'ValidationSummary',
]);

const INTERACTIVE_COMPONENTS = new Set([
    'ActionButton', 'DataTable',
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

const ACTION_MUST_BE_SIBLING_ROOTS = new Set(['Accordion', 'Tabs']);

export function ensureActionButton(
    root: LayoutNode,
    nextId: NodeIdGenerator = createNodeIdGenerator(),
    options: { pageMode?: string } = {},
): void {
    if (planContains(root, 'Wizard') || planContains(root, 'ActionButton')) return;

    const actionNode: LayoutNode = {
        id: nextId('submit'),
        component: 'ActionButton',
        category: 'interactive',
        props: { actionRef: 'submit' },
        cssClasses: [],
        children: [],
    };

    if (ACTION_MUST_BE_SIBLING_ROOTS.has(root.component)) {
        const inner: LayoutNode = { ...root };
        root.id = nextId('root-stack');
        root.component = 'Stack';
        root.category = 'layout';
        root.props = {};
        root.cssClasses = [];
        root.children = [inner, actionNode];
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

    if (options.pageMode === 'wizard' && root.children.some(c => c.component === 'Section')) {
        return;
    }

    root.children.push(actionNode);
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

export function resolveGridTracks(val: unknown, ctx: PlanContext): unknown {
    if (typeof val === 'string') {
        return resolveTokenInContext(val, ctx);
    }
    if (Array.isArray(val)) {
        return val.map(track => typeof track === 'string' ? resolveTokenInContext(track, ctx) : track);
    }
    return val;
}

function positiveInteger(val: unknown): number | undefined {
    if (typeof val !== 'number' || !Number.isFinite(val)) return undefined;
    const n = Math.floor(val);
    return n > 0 ? n : undefined;
}

export function gridPlacementStyleFromLayout(layout: unknown): Record<string, string> | undefined {
    if (!layout || typeof layout !== 'object') return undefined;
    const grid = (layout as { grid?: unknown }).grid;
    if (!grid || typeof grid !== 'object') return undefined;

    const placement = grid as {
        span?: unknown;
        start?: unknown;
        rowSpan?: unknown;
        rowStart?: unknown;
    };
    const span = positiveInteger(placement.span);
    const start = positiveInteger(placement.start);
    const rowSpan = positiveInteger(placement.rowSpan);
    const rowStart = positiveInteger(placement.rowStart);
    const style: Record<string, string> = {};

    if (span && start) {
        style.gridColumn = `${start} / span ${span}`;
    } else if (span) {
        style.gridColumn = `span ${span}`;
    } else if (start) {
        style.gridColumn = String(start);
    }

    if (rowSpan && rowStart) {
        style.gridRow = `${rowStart} / span ${rowSpan}`;
    } else if (rowSpan) {
        style.gridRow = `span ${rowSpan}`;
    } else if (rowStart) {
        style.gridRow = String(rowStart);
    }

    return Object.keys(style).length > 0 ? style : undefined;
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
