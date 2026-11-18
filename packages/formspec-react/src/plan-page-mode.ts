/** @filedesc Materialize React's page modes from the same section sequence as Assist. */
import type { FormDefinition } from '@formspec-org/types';
import { resolvePageSequence, workspaceSections, type LayoutNode, type PageSequenceEntry, type PlanContext } from '@formspec-org/layout';

export interface WorkspacePage extends PageSequenceEntry {
    content: LayoutNode;
}

function stack(id: string, children: LayoutNode[]): LayoutNode {
    return { id, component: 'Stack', category: 'layout', props: {}, cssClasses: [], children };
}

function withoutTitle(node: LayoutNode): LayoutNode {
    const { title: _title, ...props } = node.props;
    return { ...node, props };
}

function pageTitle(page: PageSequenceEntry, authored: LayoutNode | undefined): string | undefined {
    return typeof authored?.props.title === 'string' ? authored.props.title : page.title;
}

function isSharedControl(node: LayoutNode): boolean {
    return node.component === 'ActionButton' || node.component === 'ValidationSummary';
}

export function planPageMode(definition: FormDefinition, ctx: PlanContext, mode: 'wizard' | 'tabs' | 'workspace') {
    const explicitRoot = ctx.componentDocument?.tree?.component;
    if (mode !== 'workspace' && (explicitRoot === 'Tabs' || explicitRoot === 'Wizard')) return undefined;

    const sequence = resolvePageSequence(definition, {
        component: ctx.componentDocument, theme: ctx.theme, context: ctx,
    });
    if (mode === 'workspace') {
        const controls = sequence.flatMap(page => page.nodes.filter(isSharedControl));
        const workspace = workspaceSections(sequence).map(section => {
            const authored = section.id === undefined ? undefined
                : section.nodes.find(node => node.component === 'Section' && section.id === node.props.id);
            const children = section.nodes.filter(node => !isSharedControl(node)).map(node =>
                (node === authored || node.component === 'Stack' && !node.isRepeatTemplate
                    && section.titleBind !== undefined && section.titleBind === node.bindPath)
                    ? withoutTitle(node) : node);
            const content = section.container
                ? { ...section.container, id: ctx.nextId('workspace-page'), children }
                : stack(ctx.nextId('workspace-page'), children);
            return { ...section, title: pageTitle(section, authored), content };
        });
        return { root: stack(ctx.nextId('workspace'), [...workspace.map(page => page.content), ...controls]), workspace };
    }

    // With no page authority, leave a flat form alone.
    if (!sequence.some(page => page.titleBind || page.nodes.some(node => node.component === 'Section'))) return undefined;
    const container = sequence[0]?.container;
    const root = container?.component === 'Stack' ? { ...container } : stack(ctx.nextId('root'), []);
    root.pageMode = mode;
    root.children = sequence.flatMap((page, index) => {
        const controls = page.nodes.filter(isSharedControl);
        // A Studio-generated component may append instructions beside shared actions.
        if (page.id === undefined && controls.length && page.nodes.every(node => node.category === 'display' && !node.bindPath || isSharedControl(node))) {
            return page.nodes;
        }
        const authored = page.nodes.length === 1 && page.nodes[0].component === 'Section' ? page.nodes[0] : undefined;
        const props = {
            ...authored?.props,
            title: pageTitle(page, authored) ?? `Page ${index + 1}`,
            titleBind: page.titleBind,
            titleLocaleKey: page.titleLocaleKey,
        };
        if (authored && (!container || container.component === 'Stack')) return [{ ...authored, props }];
        const nodes = page.nodes.filter(node => !isSharedControl(node)).map(node =>
            node === authored || page.titleBind && node.bindPath === page.titleBind && node.component === 'Stack' && !node.isRepeatTemplate
                ? withoutTitle(node) : node);
        return [...controls, {
            id: ctx.nextId('page'), component: 'Section', category: 'layout' as const, cssClasses: [],
            props, children: container && container.component !== 'Stack' ? [{ ...container, children: nodes }] : nodes,
        }];
    });
    return { root, workspace: undefined };
}
