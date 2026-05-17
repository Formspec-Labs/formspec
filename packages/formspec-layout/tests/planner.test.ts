import { describe, it, expect, beforeEach } from 'vitest';
import { findItemAtPath } from '../src/planner-path-utils.js';
import {
    planComponentTree,
    planDefinitionFallback,
    createNodeIdGenerator,
    preparePlanContext,
    ensureSubmitButton,
    type PlanContext,
    type LayoutNode,
} from '../src/index';

function makeCtx(overrides: Partial<PlanContext> = {}): PlanContext {
    return preparePlanContext({
        items: [],
        findItem: () => null,
        ...overrides,
    });
}

function findItems(items: any[], key: string): any | null {
    for (const item of items) {
        if (item.key === key) return item;
        if (item.children) {
            const found = findItems(item.children, key);
            if (found) return found;
        }
    }
    return null;
}

function findItemByPath(items: any[], path: string): any | null {
    const segments = path.split('.');
    let current = items;
    for (let i = 0; i < segments.length; i++) {
        const found = current.find((item: any) => item.key === segments[i]);
        if (!found) return null;
        if (i === segments.length - 1) return found;
        current = found.children || [];
    }
    return null;
}

// ── planComponentTree ────────────────────────────────────────────────

describe('planComponentTree', () => {
    it('plans a simple Stack with children', () => {
        const tree = {
            component: 'Stack',
            gap: '16px',
            children: [
                { component: 'Heading', level: 2, text: 'Title' },
                { component: 'TextInput', bind: 'name' },
            ],
        };

        const items = [
            { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
        ];
        const ctx = makeCtx({
            items,
            findItem: (k) => findItems(items, k),
        });

        const node = planComponentTree(tree, ctx);

        expect(node.component).toBe('Stack');
        expect(node.category).toBe('layout');
        expect(node.props.gap).toBe('16px');
        expect(node.children).toHaveLength(2);

        expect(node.children[0].component).toBe('Heading');
        expect(node.children[0].category).toBe('display');
        expect(node.children[0].props.level).toBe(2);

        expect(node.children[1].component).toBe('TextInput');
        expect(node.children[1].category).toBe('field');
        expect(node.children[1].bindPath).toBe('name');
        expect(node.children[1].fieldItem).toEqual({
            key: 'name',
            label: 'Name',
            hint: undefined,
            dataType: 'string',
        });
    });

    it('generates unique IDs for each node', () => {
        const tree = {
            component: 'Stack',
            children: [
                { component: 'TextInput', bind: 'a' },
                { component: 'TextInput', bind: 'b' },
            ],
        };
        const ctx = makeCtx();
        const node = planComponentTree(tree, ctx);

        const ids = [node.id, node.children[0].id, node.children[1].id];
        expect(new Set(ids).size).toBe(3);
    });

    it('isolates ID sequences across separate plan invocations', () => {
        const tree = { component: 'TextInput', bind: 'a' };
        const first = planComponentTree(tree, makeCtx());
        const second = planComponentTree(tree, makeCtx());

        expect(first.id).toBe('textinput-1');
        expect(second.id).toBe('textinput-1');
        expect(first.id).toBe(second.id);
    });

    it('continues ID sequence within a shared PlanContext', () => {
        const nextId = createNodeIdGenerator();
        const ctx = makeCtx({ nextId });
        const first = planComponentTree({ component: 'Text', text: 'a' }, ctx);
        const second = planComponentTree({ component: 'Text', text: 'b' }, ctx);

        expect(first.id).toBe('text-1');
        expect(second.id).toBe('text-2');
    });

    it('resolves token values in gap and style', () => {
        const tree = {
            component: 'Stack',
            gap: '$token.space.lg',
            style: { padding: '$token.space.md' },
        };
        const ctx = makeCtx({
            componentDocument: { tokens: { 'space.lg': '32px' } },
            theme: { tokens: { 'space.md': '16px' } },
        });

        const node = planComponentTree(tree, ctx);
        expect(node.props.gap).toBe('32px');
        expect(node.style).toEqual({ padding: '16px' });
    });

    it('resolves responsive overrides', () => {
        const tree = {
            component: 'Columns',
            widths: ['3fr', '1fr'],
            responsive: { sm: { widths: ['1fr'] } },
        };
        const ctx = makeCtx({ activeBreakpoint: 'sm' });
        const node = planComponentTree(tree, ctx);
        expect(node.props.widths).toEqual(['1fr']);
    });

    it('preserves when condition as marker', () => {
        const tree = {
            component: 'Text',
            text: 'Hello',
            when: "$orgType = 'nonprofit'",
            fallback: 'N/A',
        };
        const ctx = makeCtx();
        const node = planComponentTree(tree, ctx);

        expect(node.when).toBe("$orgType = 'nonprofit'");
        expect(node.whenPrefix).toBe('');
        expect(node.fallback).toBe('N/A');
    });

    it('marks repeat groups as templates', () => {
        const tree = {
            component: 'Stack',
            bind: 'items',
            children: [
                { component: 'TextInput', bind: 'description' },
            ],
        };
        const items = [
            {
                key: 'items',
                type: 'group',
                repeatable: true,
                children: [
                    { key: 'description', type: 'field', dataType: 'string', label: 'Description' },
                ],
            },
        ];
        const ctx = makeCtx({
            items,
            findItem: (k) => findItems(items, k),
        });

        const node = planComponentTree(tree, ctx);
        expect(node.repeatGroup).toBe('items');
        expect(node.repeatPath).toBe('items');
        expect(node.isRepeatTemplate).toBe(true);
        expect(node.children[0].bindPath).toBe('items[0].description');
    });

    it('findItemAtPath resolves bracket-indexed paths (fs-i17a)', () => {
        const items = [
            {
                key: 'lineItems',
                type: 'group',
                repeatable: true,
                children: [
                    { key: 'amount', type: 'field', dataType: 'decimal', label: 'Amount' },
                ],
            },
        ];
        expect(findItemAtPath(items, 'lineItems[0].amount')?.key).toBe('amount');
        expect(findItemAtPath(items, 'lineItems.amount')?.key).toBe('amount');
    });

    it('expands custom components', () => {
        const tree = {
            component: 'ContactField',
            params: { field: 'contactName' },
        };
        const ctx = makeCtx({
            componentDocument: {
                components: {
                    ContactField: {
                        params: ['field'],
                        tree: {
                            component: 'Stack',
                            children: [
                                { component: 'TextInput', bind: '{field}' },
                            ],
                        },
                    },
                },
            },
        });

        const node = planComponentTree(tree, ctx);
        expect(node.component).toBe('Stack');
        expect(node.children[0].component).toBe('TextInput');
        expect(node.children[0].bindPath).toBe('contactName');
    });

    it('detects recursive custom component expansion', () => {
        const tree = { component: 'Loop' };
        const ctx = makeCtx({
            componentDocument: {
                components: {
                    Loop: {
                        tree: { component: 'Loop' },
                    },
                },
            },
        });

        const node = planComponentTree(tree, ctx);
        expect(node.component).toBe('Text');
        expect(node.props.text).toContain('Recursive');
    });

    it('resolves CSS classes from comp and theme cascade', () => {
        const tree = {
            component: 'TextInput',
            bind: 'email',
            cssClass: 'custom-class',
        };
        const items = [
            { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
        ];
        const ctx = makeCtx({
            items,
            findItem: (k) => findItems(items, k),
            theme: {
                selectors: [
                    { match: { type: 'field' }, apply: { cssClass: 'theme-field' } },
                ],
            },
        });

        const node = planComponentTree(tree, ctx);
        expect(node.cssClasses).toContain('custom-class');
        expect(node.cssClasses).toContain('theme-field');
    });

    it('propagates prefix for nested groups', () => {
        const tree = {
            component: 'Stack',
            bind: 'outer',
            children: [
                { component: 'TextInput', bind: 'inner' },
            ],
        };
        const items = [
            {
                key: 'outer',
                type: 'group',
                children: [
                    { key: 'inner', type: 'field', dataType: 'string', label: 'Inner' },
                ],
            },
        ];
        const ctx = makeCtx({
            items,
            findItem: (k) => findItems(items, k),
        });

        const node = planComponentTree(tree, ctx);
        expect(node.bindPath).toBe('outer');
        expect(node.children[0].bindPath).toBe('outer.inner');
    });

    it('keeps explicit component Page nodes ahead of theme.pages', () => {
        const items = [
            { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
            { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
        ];
        const tree = {
            component: 'Stack',
            children: [
                {
                    component: 'Page',
                    title: 'Component Page',
                    children: [{ component: 'TextInput', bind: 'name' }],
                },
            ],
        };
        const ctx = makeCtx({
            items,
            findItem: (k) => findItems(items, k),
            theme: {
                pages: [
                    { id: 'theme-page', title: 'Theme Page', regions: [{ key: 'email' }] },
                ],
            },
        });

        const node = planComponentTree(tree, ctx);
        expect(node.children).toHaveLength(1);
        expect(node.children[0]?.component).toBe('Page');
        expect(node.children[0]?.props.title).toBe('Component Page');
        expect(node.children[0]?.children[0]?.bindPath).toBe('name');
    });

    it('uses theme.pages when the component tree has no explicit Page nodes', () => {
        const items = [
            {
                key: 'organization',
                type: 'group',
                label: 'Organization',
                children: [
                    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                ],
            },
            { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
        ];
        const tree = {
            component: 'Stack',
            children: [
                {
                    component: 'Stack',
                    bind: 'organization',
                    children: [{ component: 'TextInput', bind: 'name' }],
                },
            ],
        };
        const ctx = makeCtx({
            items,
            findItem: (k) => findItemByPath(items, k),
            theme: {
                pages: [
                    { id: 'theme-org', title: 'Theme Organization', regions: [{ key: 'organization' }] },
                ],
            },
        });

        const node = planComponentTree(tree, ctx);
        expect(node.children[0]?.component).toBe('Page');
        expect(node.children[0]?.props.id).toBe('theme-org');
        expect(node.children[1]?.bindPath).toBe('email');
    });

    it('resolves scoped items by full path, not leaf key', () => {
        const items = [
            {
                key: 'applicant',
                type: 'group',
                children: [
                    { key: 'name', type: 'field', dataType: 'string', label: 'Applicant Name' },
                ],
            },
            {
                key: 'organization',
                type: 'group',
                children: [
                    { key: 'name', type: 'field', dataType: 'string', label: 'Org Name' },
                ],
            },
        ];

        const tree = {
            component: 'Stack',
            children: [
                {
                    component: 'Stack',
                    bind: 'organization',
                    children: [
                        { component: 'TextInput', bind: 'name' },
                    ],
                },
            ],
        };

        const ctx = makeCtx({
            items,
            findItem: (key) => findItemByPath(items, key) ?? findItems(items, key),
        });

        const node = planComponentTree(tree, ctx);
        expect(node.children[0].children[0].fieldItem?.label).toBe('Org Name');
    });

    it('resolves accessibility attributes', () => {
        const tree = {
            component: 'Stack',
            accessibility: { role: 'region', description: 'Main form' },
        };
        const ctx = makeCtx();
        const node = planComponentTree(tree, ctx);
        expect(node.accessibility).toEqual({ role: 'region', description: 'Main form' });
    });

    it('leaves pages as direct Stack children in wizard mode (no Wizard wrapper)', () => {
        // Wizard component type is deprecated. Pages are direct children of the
        // root Stack; the renderer applies navigation behavior based on pageMode.
        const items = [
            {
                key: 'basics',
                type: 'group',
                label: 'Basics',
                presentation: { layout: { page: 'Basics' } },
                children: [
                    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                ],
            },
            {
                key: 'details',
                type: 'group',
                label: 'Details',
                presentation: { layout: { page: 'Details' } },
                children: [
                    { key: 'desc', type: 'field', dataType: 'text', label: 'Description' },
                ],
            },
            {
                key: 'review',
                type: 'group',
                label: 'Review',
                presentation: { layout: { page: 'Review' } },
                children: [
                    { key: 'notes', type: 'display', label: 'Review notes' },
                ],
            },
        ];
        const tree = {
            component: 'Stack',
            children: [
                {
                    component: 'Stack',
                    bind: 'basics',
                    title: 'Basics',
                    children: [{ component: 'TextInput', bind: 'name' }],
                },
                {
                    component: 'Stack',
                    bind: 'details',
                    title: 'Details',
                    children: [{ component: 'Textarea', bind: 'desc' }],
                },
                {
                    component: 'Stack',
                    bind: 'review',
                    title: 'Review',
                    children: [{ component: 'Text', text: 'Review notes' }],
                },
            ],
        };
        const ctx = makeCtx({
            items,
            formPresentation: { pageMode: 'wizard' },
            componentDocument: { tree, 'x-studio-generated': true },
            findItem: (key) => findItemByPath(items, key) ?? findItems(items, key),
        });

        const node = planComponentTree(tree, ctx);

        // No Wizard node anywhere in the tree
        function countWizards(n: LayoutNode): number {
            let count = n.component === 'Wizard' ? 1 : 0;
            for (const child of n.children) {
                count += countWizards(child);
            }
            return count;
        }

        expect(countWizards(node)).toBe(0);

        // Root is a Stack with Page children directly
        expect(node.component).toBe('Stack');
        const pages = node.children.filter(c => c.component === 'Page');
        expect(pages).toHaveLength(3);
        expect(pages.every(c => c.component === 'Page')).toBe(true);
    });

    it('strips group title from Stack nodes inside explicit pages (wizard mode)', () => {
        // When a group is placed on an explicit page, the Page already shows
        // the title in its heading. The inner Stack should not duplicate it.
        const items = [
            {
                key: 'basics',
                type: 'group',
                label: 'Basics',
                presentation: { layout: { page: 'Basics' } },
                children: [
                    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                ],
            },
            {
                key: 'details',
                type: 'group',
                label: 'Details',
                presentation: { layout: { page: 'Details' } },
                children: [
                    { key: 'desc', type: 'field', dataType: 'text', label: 'Description' },
                ],
            },
        ];
        const tree = {
            component: 'Stack',
            children: [
                {
                    component: 'Stack',
                    bind: 'basics',
                    title: 'Basics',
                    children: [{ component: 'TextInput', bind: 'name' }],
                },
                {
                    component: 'Stack',
                    bind: 'details',
                    title: 'Details',
                    children: [{ component: 'Textarea', bind: 'desc' }],
                },
            ],
        };
        const ctx = makeCtx({
            items,
            formPresentation: { pageMode: 'wizard' },
            componentDocument: { tree, 'x-studio-generated': true },
            findItem: (key) => findItemByPath(items, key) ?? findItems(items, key),
        });

        const node = planComponentTree(tree, ctx);

        // Pages are direct children of the root Stack (no Wizard wrapper)
        const pages = node.children.filter(c => c.component === 'Page');
        expect(pages.length).toBeGreaterThan(0);
        for (const page of pages) {
            expect(page.component).toBe('Page');
            const stackInPage = page.children.find(c => c.component === 'Stack');
            expect(stackInPage).toBeDefined();
            expect(stackInPage!.props.title).toBeUndefined();
        }
    });

    it('wraps generated top-level groups in wizard mode while preserving orphan fields', () => {
        const items = [
            { key: 'intro', type: 'field', dataType: 'string', label: 'Intro' },
            {
                key: 'pageOne',
                type: 'group',
                label: 'Page One',
                children: [
                    {
                        key: 'priority',
                        type: 'field',
                        dataType: 'choice',
                        label: 'Priority',
                        options: [
                            { value: 'low', label: 'Low' },
                            { value: 'high', label: 'High' },
                        ],
                    },
                ],
            },
        ];
        const tree = {
            component: 'Stack',
            children: [
                { component: 'TextInput', bind: 'intro' },
                {
                    component: 'Stack',
                    bind: 'pageOne',
                    children: [
                        { component: 'RadioGroup', bind: 'priority' },
                    ],
                },
            ],
        };
        const ctx = makeCtx({
            items,
            formPresentation: { pageMode: 'wizard' },
            componentDocument: { tree, 'x-studio-generated': true },
            findItem: (key) => findItemByPath(items, key) ?? findItems(items, key),
        });

        const node = planComponentTree(tree, ctx);

        expect(node.component).toBe('Stack');
        expect(node.children[0].component).toBe('TextInput');
        expect(node.children[0].bindPath).toBe('intro');
        // Page is a direct child of the root Stack (no Wizard wrapper)
        expect(node.children[1].component).toBe('Page');
        expect(node.children[1].props.title).toBe('Page One');
        expect(node.children[1].children[0].component).toBe('Stack');
        expect(node.children[1].children[0].bindPath).toBe('pageOne');
        expect(node.children[1].children[0].children[0].component).toBe('RadioGroup');
        expect(node.children[1].children[0].children[0].bindPath).toBe('pageOne.priority');
    });

    it('sets scopeChange on group nodes from the component tree', () => {
        const items = [
            {
                key: 'app', type: 'group', label: 'Applicant',
                children: [
                    {
                        key: 'marital', type: 'field', dataType: 'choice', label: 'Marital Status',
                        options: [
                            { value: 'single', label: 'Single' },
                            { value: 'married', label: 'Married' },
                        ],
                        presentation: { widgetHint: 'radio' },
                    },
                ],
            },
        ];
        const tree = {
            component: 'Stack',
            nodeId: 'root',
            children: [
                {
                    component: 'Stack',
                    bind: 'app',
                    children: [
                        { component: 'RadioGroup', bind: 'marital' },
                    ],
                },
            ],
        };
        const ctx = makeCtx({
            items,
            findItem: (k) => findItemByPath(items, k),
        });
        const node = planComponentTree(tree, ctx);

        // The group node (Stack with bind='app') must have scopeChange: true
        const appNode = node.children[0];
        expect(appNode.component).toBe('Stack');
        expect(appNode.props.bind).toBe('app');
        expect(appNode.scopeChange).toBe(true);

        // The child field should have the full bind path
        const maritalNode = appNode.children[0];
        expect(maritalNode.component).toBe('RadioGroup');
        expect(maritalNode.bindPath).toBe('app.marital');
    });
});

// ── planDefinitionFallback ───────────────────────────────────────────

describe('planDefinitionFallback', () => {
    it('plans a simple field with default component', () => {
        const items = [
            { key: 'name', type: 'field', dataType: 'string', label: 'Full Name', hint: 'Enter your name' },
        ];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });

        const nodes = planDefinitionFallback(items, ctx);
        expect(nodes).toHaveLength(1);
        expect(nodes[0].component).toBe('TextInput');
        expect(nodes[0].category).toBe('field');
        expect(nodes[0].bindPath).toBe('name');
        expect(nodes[0].fieldItem).toEqual({
            key: 'name',
            label: 'Full Name',
            hint: 'Enter your name',
            dataType: 'string',
        });
    });

    it('maps dataTypes to correct default components', () => {
        const cases: Array<[string, string]> = [
            ['string', 'TextInput'],
            ['integer', 'NumberInput'],
            ['boolean', 'Toggle'],
            ['date', 'DatePicker'],
            ['choice', 'Select'],
            ['multiChoice', 'CheckboxGroup'],
            ['attachment', 'FileUpload'],
            ['money', 'NumberInput'],
        ];

        for (const [dataType, expected] of cases) {
            const items = [{ key: 'f', type: 'field', dataType, label: 'F' }];
            const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });
            const nodes = planDefinitionFallback(items, ctx);
            expect(nodes[0].component).toBe(expected);
        }
    });

    it('plans a group with children', () => {
        const items = [
            {
                key: 'contact',
                type: 'group',
                label: 'Contact',
                children: [
                    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                    { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
                ],
            },
        ];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });

        const nodes = planDefinitionFallback(items, ctx);
        expect(nodes).toHaveLength(1);
        expect(nodes[0].component).toBe('Stack');
        expect(nodes[0].bindPath).toBe('contact');
        expect(nodes[0].children).toHaveLength(2);
        expect(nodes[0].children[0].bindPath).toBe('contact.name');
        expect(nodes[0].children[1].bindPath).toBe('contact.email');
    });

    it('marks repeatable groups as templates', () => {
        const items = [
            {
                key: 'lineItems',
                type: 'group',
                repeatable: true,
                children: [
                    { key: 'desc', type: 'field', dataType: 'string', label: 'Desc' },
                ],
            },
        ];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });

        const nodes = planDefinitionFallback(items, ctx);
        expect(nodes[0].repeatGroup).toBe('lineItems');
        expect(nodes[0].isRepeatTemplate).toBe(true);
        expect(nodes[0].children[0].bindPath).toBe('lineItems[0].desc');
    });

    it('plans display items', () => {
        const items = [
            { key: 'info', type: 'display', label: 'Please read carefully.' },
        ];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });

        const nodes = planDefinitionFallback(items, ctx);
        expect(nodes).toHaveLength(1);
        expect(nodes[0].component).toBe('Text');
        expect(nodes[0].category).toBe('display');
        expect(nodes[0].props.text).toBe('Please read carefully.');
    });

    it('uses theme widget when available', () => {
        const items = [
            { key: 'age', type: 'field', dataType: 'integer', label: 'Age' },
        ];
        const ctx = makeCtx({
            items,
            findItem: (k) => findItems(items, k),
            theme: {
                selectors: [
                    { match: { dataType: 'integer' }, apply: { widget: 'Slider' } },
                ],
            },
            isComponentAvailable: () => true,
        });

        const nodes = planDefinitionFallback(items, ctx);
        expect(nodes[0].component).toBe('Slider');
    });

    it('keeps theme pages as the top-level layout during definition fallback', () => {
        const items = [
            { key: 'intro', type: 'field', dataType: 'string', label: 'Intro' },
            {
                key: 'page1',
                type: 'group',
                label: 'Applicant',
                children: [
                    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                ],
            },
            {
                key: 'page2',
                type: 'group',
                label: 'Review',
                children: [
                    { key: 'notes', type: 'display', label: 'Review your answers' },
                ],
            },
        ];
        const ctx = makeCtx({
            items,
            formPresentation: { pageMode: 'wizard' },
            theme: {
                pages: [
                    { id: 'applicant', title: 'Applicant', regions: [{ key: 'page1', span: 12 }] },
                    { id: 'review', title: 'Review', regions: [{ key: 'page2', span: 12 }] },
                ],
            },
            findItem: (key) => findItemByPath(items, key) ?? findItems(items, key),
            isComponentAvailable: () => true,
        });

        const nodes = planDefinitionFallback(items, ctx);

        // Pages are direct children (no Wizard wrapper). Unassigned items come first.
        expect(nodes).toHaveLength(3);
        const introNode = nodes.find(n => n.bindPath === 'intro');
        expect(introNode).toBeDefined();
        const pages = nodes.filter(n => n.component === 'Page');
        expect(pages).toHaveLength(2);
        expect(pages[0].props.title).toBe('Applicant');
        expect(pages[0].children[0].component).toBe('Grid');
        expect(pages[1].props.title).toBe('Review');
    });

    it('groups top-level definition pages without wrapping nested groups again', () => {
        const items = [
            { key: 'intro', type: 'field', dataType: 'string', label: 'Intro' },
            {
                key: 'applicant',
                type: 'group',
                label: 'Applicant Details',
                presentation: {
                    layout: {
                        page: 'Applicant',
                    },
                },
                children: [
                    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                    {
                        key: 'address',
                        type: 'group',
                        label: 'Address',
                        children: [
                            { key: 'city', type: 'field', dataType: 'string', label: 'City' },
                        ],
                    },
                ],
            },
            {
                key: 'attachments',
                type: 'group',
                label: 'Attachments',
                children: [
                    { key: 'summary', type: 'field', dataType: 'text', label: 'Summary' },
                ],
            },
            {
                key: 'review',
                type: 'group',
                label: 'Review',
                presentation: {
                    layout: {
                        page: 'Review',
                    },
                },
                children: [
                    { key: 'notes', type: 'display', label: 'Review your answers' },
                ],
            },
        ];
        const ctx = makeCtx({
            items,
            formPresentation: { pageMode: 'wizard' },
            findItem: (key) => findItemByPath(items, key) ?? findItems(items, key),
            isComponentAvailable: () => true,
        });

        const nodes = planDefinitionFallback(items, ctx);

        // Pages are direct children (no Wizard wrapper). Orphan intro comes first.
        expect(nodes).toHaveLength(3);
        expect(nodes[0].bindPath).toBe('intro');
        expect(nodes[1].component).toBe('Page');
        expect(nodes[1].props.title).toBe('Applicant');
        expect(nodes[1].children).toHaveLength(2);
        expect(nodes[1].children[0].bindPath).toBe('applicant');
        expect(nodes[1].children[1].bindPath).toBe('attachments');
        expect(nodes[1].children[0].children[1].component).toBe('Stack');
        expect(nodes[1].children[0].children[1].bindPath).toBe('applicant.address');
        expect(nodes[1].children[0].children[1].children[0].bindPath).toBe('applicant.address.city');
        expect(nodes[2].component).toBe('Page');
        expect(nodes[2].props.title).toBe('Review');
        expect(nodes[2].children[0].bindPath).toBe('review');
    });
});

// ── Grant-application integration ────────────────────────────────────

describe('grant-application integration', () => {
    let definition: any;
    let component: any;
    let theme: any;

    beforeEach(async () => {
        // Load real fixtures
        const fs = await import('fs');
        const path = await import('path');
        const base = path.resolve(__dirname, '../../../examples/grant-application');
        definition = JSON.parse(fs.readFileSync(path.join(base, 'definition.json'), 'utf-8'));
        component = JSON.parse(fs.readFileSync(path.join(base, 'component.json'), 'utf-8'));
        theme = JSON.parse(fs.readFileSync(path.join(base, 'theme.json'), 'utf-8'));
    });

    function makeFindItem(items: any[]) {
        return function findItem(key: string): any | null {
            const parts = key.split('.');
            let current = items;
            for (let i = 0; i < parts.length; i++) {
                const found = current.find((it: any) => it.key === parts[i]);
                if (!found) return null;
                if (i === parts.length - 1) return found;
                current = found.children || [];
            }
            return null;
        };
    }

    it('plans the full component tree', () => {
        const ctx = makeCtx({
            items: definition.items,
            formPresentation: definition.formPresentation,
            componentDocument: component,
            theme,
            activeBreakpoint: null,
            findItem: makeFindItem(definition.items),
            isComponentAvailable: () => true,
        });

        const node = planComponentTree(component.tree, ctx);

        // Root should be a Stack with Page children (no Wizard wrapper)
        expect(node.component).toBe('Stack');
        expect(node.category).toBe('layout');

        // Should have Page children directly
        expect(node.children.length).toBeGreaterThan(0);

        // First child should be a theme-defined page
        expect(node.children[0].component).toBe('Page');
        expect(node.children[0].props.title).toBe('Applicant Info');
    });

    it('expands custom components (ContactField)', () => {
        const ctx = makeCtx({
            items: definition.items,
            formPresentation: definition.formPresentation,
            componentDocument: component,
            theme,
            activeBreakpoint: null,
            findItem: makeFindItem(definition.items),
            isComponentAvailable: () => true,
        });

        const node = planComponentTree(component.tree, ctx);

        // Find a node with bindPath containing 'contactName' — the expanded ContactField
        function findNode(n: LayoutNode, pred: (n: LayoutNode) => boolean): LayoutNode | null {
            if (pred(n)) return n;
            for (const child of n.children) {
                const found = findNode(child, pred);
                if (found) return found;
            }
            return null;
        }

        const contactField = findNode(node, (n) => n.bindPath === 'applicantInfo.contactName');
        expect(contactField).not.toBeNull();
        expect(contactField!.component).toBe('TextInput');
    });

    it('all nodes are JSON-serializable', () => {
        const ctx = makeCtx({
            items: definition.items,
            formPresentation: definition.formPresentation,
            componentDocument: component,
            theme,
            activeBreakpoint: null,
            findItem: makeFindItem(definition.items),
            isComponentAvailable: () => true,
        });

        const node = planComponentTree(component.tree, ctx);
        const json = JSON.stringify(node);
        const parsed = JSON.parse(json);

        expect(parsed.component).toBe('Stack');
        expect(parsed.children.length).toBe(node.children.length);
    });

    it('plans the definition fallback path', () => {
        const ctx = makeCtx({
            items: definition.items,
            formPresentation: definition.formPresentation,
            theme,
            findItem: makeFindItem(definition.items),
            isComponentAvailable: () => true,
        });

        const nodes = planDefinitionFallback(definition.items, ctx);
        expect(nodes.length).toBeGreaterThan(0);

        // When formPresentation.pageMode is 'wizard', groups become Page children.
        // Find applicantInfo either at top level or inside a Page's children.
        function findNode(list: LayoutNode[], bindPath: string): LayoutNode | undefined {
            for (const n of list) {
                if (n.bindPath === bindPath) return n;
                if (n.children.length > 0) {
                    const found = findNode(n.children, bindPath);
                    if (found) return found;
                }
            }
            return undefined;
        }
        const applicantInfo = findNode(nodes, 'applicantInfo');
        expect(applicantInfo).toBeDefined();
        expect(applicantInfo!.children.length).toBeGreaterThan(0);
    });

    it('lays out definition fallback items into theme pages with region spans', () => {
        const items = [
            { key: 'projectName', type: 'field', dataType: 'string', label: 'Project Name' },
            { key: 'projectCode', type: 'field', dataType: 'string', label: 'Project Code' },
            { key: 'certify', type: 'field', dataType: 'boolean', label: 'Certify' },
        ];

        const ctx = makeCtx({
            items,
            theme: {
                pages: [
                    {
                        id: 'info',
                        title: 'Project Information',
                        regions: [
                            { key: 'projectName', span: 8 },
                            { key: 'projectCode', span: 4 },
                        ],
                    },
                ],
            },
            findItem: makeFindItem(items),
            isComponentAvailable: () => true,
        });

        const nodes = planDefinitionFallback(items, ctx);
        expect(nodes[0].component).toBe('Page');
        expect(nodes[0].props.title).toBe('Project Information');
        expect(nodes[0].children[0].component).toBe('Grid');
        expect(nodes[0].children[0].children[0].style).toEqual({ gridColumn: 'span 8' });
        expect(nodes[0].children[0].children[0].children[0].bindPath).toBe('projectName');
        expect(nodes[0].children[0].children[1].style).toEqual({ gridColumn: 'span 4' });
        expect(nodes[1].bindPath).toBe('certify');
    });

    it('resolves dotted region keys (e.g. "group.field") in definition fallback', () => {
        const items = [
            {
                key: 'applicantInfo',
                type: 'group',
                label: 'Applicant Info',
                children: [
                    { key: 'orgName', type: 'field', dataType: 'string', label: 'Org Name' },
                    { key: 'contactName', type: 'field', dataType: 'string', label: 'Contact' },
                    { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
                ],
            },
        ];

        const ctx = makeCtx({
            items,
            theme: {
                pages: [
                    {
                        id: 'page1',
                        title: 'Applicant',
                        regions: [
                            { key: 'applicantInfo.orgName', span: 12 },
                        ],
                    },
                ],
            },
            findItem: makeFindItem(items),
            isComponentAvailable: () => true,
        });

        const nodes = planDefinitionFallback(items, ctx);

        // The page should contain the orgName field
        expect(nodes[0].component).toBe('Page');
        expect(nodes[0].props.title).toBe('Applicant');
        const grid = nodes[0].children[0];
        expect(grid.component).toBe('Grid');
        const fieldNode = grid.children[0].children[0];
        expect(fieldNode.bindPath).toBe('applicantInfo.orgName');
        // props.bind must be the full path so signal lookups work at prefix=""
        expect(fieldNode.props.bind).toBe('applicantInfo.orgName');

        // When a nested field is referenced in a region, its top-level parent
        // group is marked as assigned — prevents duplicate rendering.
        const unassignedGroup = nodes.find(n => n.bindPath === 'applicantInfo');
        expect(unassignedGroup).toBeUndefined();
    });

    it('resolves deeply nested dotted region keys (3 levels) in definition fallback', () => {
        const items = [
            {
                key: 'section',
                type: 'group',
                label: 'Section',
                children: [
                    {
                        key: 'address',
                        type: 'group',
                        label: 'Address',
                        children: [
                            { key: 'city', type: 'field', dataType: 'string', label: 'City' },
                        ],
                    },
                ],
            },
        ];

        const ctx = makeCtx({
            items,
            theme: {
                pages: [
                    {
                        id: 'page1',
                        title: 'Location',
                        regions: [
                            { key: 'section.address.city', span: 12 },
                        ],
                    },
                ],
            },
            findItem: makeFindItem(items),
            isComponentAvailable: () => true,
        });

        const nodes = planDefinitionFallback(items, ctx);

        expect(nodes[0].component).toBe('Page');
        const grid = nodes[0].children[0];
        expect(grid.component).toBe('Grid');
        const fieldNode = grid.children[0].children[0];
        expect(fieldNode.bindPath).toBe('section.address.city');
        expect(fieldNode.props.bind).toBe('section.address.city');
    });

    it('resolves nested group as region with full bind path and scopeChange', () => {
        const items = [
            {
                key: 'section',
                type: 'group',
                label: 'Section',
                children: [
                    {
                        key: 'address',
                        type: 'group',
                        label: 'Address',
                        children: [
                            { key: 'city', type: 'field', dataType: 'string', label: 'City' },
                            { key: 'zip', type: 'field', dataType: 'string', label: 'Zip' },
                        ],
                    },
                ],
            },
        ];

        const ctx = makeCtx({
            items,
            theme: {
                pages: [
                    {
                        id: 'page1',
                        title: 'Address Details',
                        regions: [
                            { key: 'section.address', span: 12 },
                        ],
                    },
                ],
            },
            findItem: makeFindItem(items),
            isComponentAvailable: () => true,
        });

        const nodes = planDefinitionFallback(items, ctx);

        expect(nodes[0].component).toBe('Page');
        const grid = nodes[0].children[0];
        expect(grid.component).toBe('Grid');
        const groupNode = grid.children[0].children[0];
        expect(groupNode.component).toBe('Stack');
        expect(groupNode.bindPath).toBe('section.address');
        expect(groupNode.props.bind).toBe('section.address');
        expect(groupNode.scopeChange).toBe(true);
        // Children should be planned inside the group scope
        expect(groupNode.children).toHaveLength(2);
    });

    it('finds component nodes by bind in nested layouts (Columns→Stack→Input)', () => {
        const items = [
            {
                key: 'applicantInfo',
                type: 'group',
                label: 'Applicant Info',
                children: [
                    { key: 'orgName', type: 'field', dataType: 'string', label: 'Org Name' },
                    { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
                ],
            },
        ];

        // Nested layout: Columns wrapping Stacks wrapping inputs —
        // positional parallel walk would fail here
        const tree = {
            component: 'Stack',
            children: [
                {
                    component: 'Columns',
                    children: [
                        {
                            component: 'Stack',
                            children: [
                                { component: 'TextInput', bind: 'applicantInfo.orgName' },
                            ],
                        },
                        {
                            component: 'Stack',
                            children: [
                                { component: 'TextInput', bind: 'applicantInfo.email' },
                            ],
                        },
                    ],
                },
            ],
        };

        const ctx = makeCtx({
            items,
            componentDocument: { tree },
            theme: {
                pages: [
                    {
                        id: 'page1',
                        title: 'Applicant',
                        regions: [
                            { key: 'applicantInfo.orgName', span: 6 },
                            { key: 'applicantInfo.email', span: 6 },
                        ],
                    },
                ],
            },
            findItem: makeFindItem(items),
            isComponentAvailable: () => true,
        });

        const node = planComponentTree(tree, ctx);
        expect(node.children[0].component).toBe('Page');
        const grid = node.children[0].children[0];
        expect(grid.component).toBe('Grid');
        // Both fields should be found despite nested layout structure
        expect(grid.children).toHaveLength(2);
        expect(grid.children[0].children[0].bindPath).toBe('applicantInfo.orgName');
        expect(grid.children[1].children[0].bindPath).toBe('applicantInfo.email');
    });

    it('applies theme pages to component trees while preserving planned field nodes', () => {
        const items = [
            { key: 'projectName', type: 'field', dataType: 'string', label: 'Project Name' },
            { key: 'amount', type: 'field', dataType: 'money', label: 'Amount' },
        ];
        const tree = {
            component: 'Stack',
            children: [
                { component: 'TextInput', bind: 'projectName' },
                { component: 'MoneyInput', bind: 'amount' },
            ],
        };

        const ctx = makeCtx({
            items,
            componentDocument: { tree },
            theme: {
                pages: [
                    {
                        id: 'details',
                        title: 'Details',
                        regions: [
                            { key: 'projectName', span: 7 },
                            { key: 'amount', span: 5 },
                        ],
                    },
                ],
            },
            findItem: makeFindItem(items),
            isComponentAvailable: () => true,
        });

        const node = planComponentTree(tree, ctx);
        expect(node.component).toBe('Stack');
        expect(node.children[0].component).toBe('Page');
        expect(node.children[0].children[0].component).toBe('Grid');
        expect(node.children[0].children[0].children[0].style).toEqual({ gridColumn: 'span 7' });
        expect(node.children[0].children[0].children[0].children[0].component).toBe('TextInput');
        expect(node.children[0].children[0].children[1].children[0].component).toBe('MoneyInput');
    });
});

// ── ensureSubmitButton ────────────────────────────────────────────────

function makeNode(component: string, children: LayoutNode[] = []): LayoutNode {
    return {
        id: component,
        component,
        category: 'layout',
        props: {},
        cssClasses: [],
        children,
    };
}

describe('ensureSubmitButton', () => {
    it('adds a SubmitButton to a plain Stack with no submit', () => {
        const root = makeNode('Stack', [makeNode('TextInput')]);
        ensureSubmitButton(root);
        expect(root.children.at(-1)?.component).toBe('SubmitButton');
    });

    it('does not add a SubmitButton when one already exists', () => {
        const root = makeNode('Stack', [makeNode('SubmitButton')]);
        ensureSubmitButton(root);
        expect(root.children.filter(c => c.component === 'SubmitButton')).toHaveLength(1);
    });

    it('does not add a SubmitButton when the tree contains a Wizard', () => {
        const root = makeNode('Stack', [makeNode('Wizard', [makeNode('Page')])]);
        ensureSubmitButton(root);
        expect(root.children.some(c => c.component === 'SubmitButton')).toBe(false);
    });

    it('does not add a SubmitButton when the root Stack has Page children (pageMode wizard/tabs)', () => {
        const root = makeNode('Stack', [
            makeNode('Page', [makeNode('TextInput')]),
            makeNode('Page', [makeNode('Select')]),
        ]);
        ensureSubmitButton(root);
        expect(root.children.some(c => c.component === 'SubmitButton')).toBe(false);
    });

    it('wraps a root Accordion in Stack so SubmitButton is not an accordion section', () => {
        const root = makeNode('Accordion', [makeNode('Text'), makeNode('Text'), makeNode('Text')]);
        ensureSubmitButton(root);
        expect(root.component).toBe('Stack');
        expect(root.children).toHaveLength(2);
        expect(root.children[0].component).toBe('Accordion');
        expect(root.children[0].children).toHaveLength(3);
        expect(root.children[1].component).toBe('SubmitButton');
    });
});
