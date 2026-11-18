/** @filedesc Materialize React's page modes from the same section sequence as Assist. */
import type { FormDefinition } from '@formspec-org/types';
import { resolvePageSequence, type LayoutNode, type PageSequenceEntry, type PlanContext } from '@formspec-org/layout';

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

function isSharedControl(node: LayoutNode): boolean {
    return node.component === 'ActionButton' || node.component === 'ValidationSummary';
}

function findAuthoredSection(page: PageSequenceEntry): LayoutNode | undefined {
    return page.nodes.find(node => node.component === 'Section' && node.props.id === page.id);
}

function pageContent(page: PageSequenceEntry): LayoutNode[] {
    const nodes = page.nodes.filter(node => !isSharedControl(node));
    if (!page.titleBind && !page.titleHeadingId) return nodes;

    function stripTitle(node: LayoutNode): LayoutNode[] {
        if (node.id === page.titleHeadingId) return [];
        if (node.component === 'Stack' && !node.isRepeatTemplate && page.titleBind && page.titleBind === node.bindPath) {
            return [withoutTitle(node)];
        }
        const children = node.children.flatMap(stripTitle);
        if (children.length === node.children.length && children.every((child, index) => child === node.children[index])) {
            return [node];
        }
        return [{ ...node, children }];
    }
    return nodes.flatMap(stripTitle);
}

export function planPageMode(definition: FormDefinition, ctx: PlanContext, mode: 'wizard' | 'tabs' | 'workspace') {
    const explicitRoot = ctx.componentDocument?.tree?.component;
    if (mode !== 'workspace' && (explicitRoot === 'Tabs' || explicitRoot === 'Wizard')) return undefined;

    const sequence = resolvePageSequence(definition, {
        component: ctx.componentDocument, theme: ctx.theme, context: ctx,
    });
    const shared = sequence.flatMap(page => page.sharedNodes ?? []);
    if (mode === 'workspace') {
        const controls = sequence.flatMap(page => page.nodes.filter(isSharedControl));
        const workspace = sequence.map(section => {
            const authored = section.id === undefined ? undefined : findAuthoredSection(section);
            const children = pageContent(section).map(node => node === authored ? withoutTitle(node) : node);
            const content = section.container
                ? { ...section.container, id: ctx.nextId('workspace-page'), children }
                : stack(ctx.nextId('workspace-page'), children);
            return { ...section, content };
        });
        return { root: stack(ctx.nextId('workspace'), [...workspace.map(page => page.content), ...controls, ...shared]), workspace };
    }

    // With no page authority, leave a flat form alone.
    if (!sequence.some(page => page.id || findAuthoredSection(page))) return undefined;
    const container = sequence[0]?.container;
    const root = container?.component === 'Stack' ? { ...container } : stack(ctx.nextId('root'), []);
    root.pageMode = mode;
    root.children = sequence.flatMap((page, index) => {
        const controls = page.nodes.filter(isSharedControl);
        const authored = findAuthoredSection(page);
        const content = pageContent(page);
        // A Section's condition and scope apply only to its authored descendants.
        const separate = authored && content.length > 1 && (authored.when || authored.scopeChange
            || authored.isRepeatTemplate || authored.props.hidden || authored.style?.display === 'none');
        const section = (separate ? undefined : authored) ?? {
            id: ctx.nextId('page'), component: 'Section', category: 'layout' as const, cssClasses: [], props: {},
        };
        const props = {
            ...section.props,
            title: page.title,
            titleBind: page.titleBind,
            titleLocaleKey: page.titleLocaleKey,
            ...(!page.title && { titleIndex: index + 1 }),
        };
        const nodes = content.flatMap(node => {
            if (node !== authored) return [node];
            return separate ? [withoutTitle(node)] : node.children;
        });
        const children = container && container.component !== 'Stack' ? [{ ...container, children: nodes }] : nodes;
        return [...controls, { ...section, props, children }];
    });
    // Keep trailing instructions next to the shared actions, outside the active page.
    root.children.push(...shared);
    return { root, workspace: undefined };
}
