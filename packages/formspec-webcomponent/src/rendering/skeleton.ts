/** @filedesc Pre-engine skeleton — the planned tree drawn as placeholders, so the real render moves nothing. */
import type { LayoutNode } from '@formspec-org/layout';
import { Path } from '@formspec-org/types';
import { globalRegistry } from '../registry';
import type { AdapterContext } from '../adapters/types';
import type { SkeletonBehavior } from '../adapters/layout-behaviors';

/**
 * Nominal control heights, in rem, for the widgets whose real control is not one input row.
 * Everything else is a single USWDS/default control row.
 */
const CONTROL_HEIGHT_REM: Record<string, number> = {
    TextInput: 2.5,
    NumberInput: 2.5,
    Select: 2.5,
    DatePicker: 2.5,
    MoneyInput: 2.5,
    Slider: 2.5,
    Rating: 2.5,
    FileUpload: 5,
    Signature: 8,
    RadioGroup: 4.5,
    CheckboxGroup: 4.5,
    Toggle: 2,
    DataTable: 8,
};

const DEFAULT_CONTROL_HEIGHT_REM = 2.5;

/** A path is conditional when its Bind carries a `relevant` expression, wildcards and indices aside. */
function conditionalMatcher(conditionalPaths: ReadonlySet<string>) {
    return (bindPath: string | undefined): boolean => {
        if (!bindPath || conditionalPaths.size === 0) return false;
        return conditionalPaths.has(Path.parse(bindPath).stripIndices());
    };
}

/** A node that shows as a heading line rather than a control. */
function isTitleNode(node: LayoutNode): boolean {
    return node.category === 'display'
        || ((node.category === 'layout' || node.component === 'Section') && !!node.props?.title);
}

/**
 * Draw `node` and its children as placeholders. Returns the number of field placeholders emitted,
 * so callers can assert the skeleton matches the plan.
 */
export function renderSkeleton(
    node: LayoutNode,
    parent: HTMLElement,
    adapterName: string,
    actx: AdapterContext,
    conditionalPaths: ReadonlySet<string> = new Set(),
): number {
    const draw = globalRegistry.resolveAdapterFn('Skeleton', adapterName);
    if (!draw) return 0;

    const emit = (behavior: SkeletonBehavior, into: HTMLElement) => draw(behavior, into, actx);
    const isConditional = conditionalMatcher(conditionalPaths);

    let fields = 0;
    const walk = (current: LayoutNode, into: HTMLElement): void => {
        // Relevance is the engine's answer. Reserving space for a branch that turns out hidden shifts the
        // page more than reserving nothing, so anything conditional stays out of the skeleton.
        if (current.when || isConditional(current.bindPath)) return;
        if (current.category === 'field') {
            emit({ kind: 'field', height: CONTROL_HEIGHT_REM[current.component] ?? DEFAULT_CONTROL_HEIGHT_REM }, into);
            fields += 1;
            return;
        }
        if (isTitleNode(current)) emit({ kind: 'title', height: 0 }, into);
        for (const child of current.children ?? []) walk(child as LayoutNode, into);
    };

    walk(node, parent);
    return fields;
}
