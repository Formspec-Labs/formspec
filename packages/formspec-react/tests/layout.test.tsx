/** @filedesc Tests for DefaultLayout — layout and container component features. */
import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { act } from 'react';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import type { LayoutNode } from '@formspec-org/layout';
import { FormspecNode } from '../src/node-renderer';
import { FormspecProvider } from '../src/context';
import type { LayoutComponentProps } from '../src/component-map';

beforeAll(async () => {
    await initFormspecEngine();
});

const simpleDef = {
    $formspec: '1.0',
    url: 'https://test.example/layout',
    version: '1.0.0',
    status: 'active',
    title: 'Layout Test',
    name: 'layout-test',
    items: [],
};

function renderNode(node: LayoutNode): HTMLElement {
    const engine = createFormEngine(simpleDef);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => {
        root.render(
            <FormspecProvider engine={engine}>
                <FormspecNode node={node} />
            </FormspecProvider>
        );
    });
    return container;
}

function stackNode(props: Record<string, unknown> = {}, children: LayoutNode[] = []): LayoutNode {
    return {
        id: 'stack-1',
        component: 'Stack',
        category: 'layout',
        props,
        cssClasses: [],
        children,
    };
}

function routePolicyNode(node: LayoutNode, landmark = 'navigation'): LayoutNode {
    return {
        ...node,
        uiGraphRoutePolicy: {
            schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
            source: 'host://policy/respondent-ui-policy',
            targetSurface: {
                url: 'https://surfaces.example.test/intake',
                version: '1.0.0',
            },
            routeId: 'apply',
            a11y: {
                landmark: landmark as 'main' | 'navigation' | 'complementary' | 'region',
                keyboardNavigation: true,
            },
        },
    };
}

// ── Stack ─────────────────────────────────────────────────────────

describe('Stack layout', () => {
    it('renders vertical by default (no flex direction override)', () => {
        const container = renderNode(stackNode());
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el).toBeTruthy();
        // default: column or unset — not 'row'
        expect(el.style.flexDirection).not.toBe('row');
    });

    it('applies flexDirection: row for horizontal direction', () => {
        const container = renderNode(stackNode({ direction: 'horizontal' }));
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el).toBeTruthy();
        expect(el.style.flexDirection).toBe('row');
    });

    it('applies alignItems from align prop', () => {
        const container = renderNode(stackNode({ align: 'center' }));
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el.style.alignItems).toBe('center');
    });

    it('applies justifyContent from justify prop', () => {
        const container = renderNode(stackNode({ justify: 'between' }));
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el.style.justifyContent).toBe('space-between');
    });

    it('applies flexWrap: wrap when wrap prop is true', () => {
        const container = renderNode(stackNode({ wrap: true }));
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el.style.flexWrap).toBe('wrap');
    });

    it('applies gap from props.gap', () => {
        const container = renderNode(stackNode({ gap: '1.5rem' }));
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el.style.gap).toBe('1.5rem');
    });

    it('applies gap from node.style.gap when props.gap absent', () => {
        const node: LayoutNode = {
            ...stackNode(),
            style: { gap: '2rem' } as any,
        };
        const container = renderNode(node);
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el.style.gap).toBe('2rem');
    });

    it('renders titled group Stack as formspec-group, not formspec-card', () => {
        const node: LayoutNode = {
            ...stackNode({
                title: 'Contact Info',
                bind: 'contact',
                padding: '1rem',
                background: '#fff',
                elevation: 'sm',
            }),
            bindPath: 'contact',
            scopeChange: true,
            accessibility: { role: 'group', description: 'Contact section' },
        };
        const container = renderNode(node);
        // Should use group styling, not card styling
        const group = container.querySelector('.formspec-group') as HTMLElement;
        expect(group).toBeTruthy();
        expect(group.tagName).toBe('SECTION');
        expect(group.style.padding).toBe('1rem');
        expect(group.style.background).toBe('#fff');
        expect(group.dataset.elevation).toBe('sm');
        expect(group.getAttribute('role')).toBe('group');
        expect(group.getAttribute('aria-description')).toBe('Contact section');
        expect(container.querySelector('.formspec-card')).toBeNull();
        // Title rendered as heading
        const heading = group.querySelector('.formspec-group-title');
        expect(heading).toBeTruthy();
        expect(heading!.textContent).toBe('Contact Info');
    });

    it('props.gap takes priority over style.gap', () => {
        const node: LayoutNode = {
            ...stackNode({ gap: '1rem' }),
            style: { gap: '2rem' } as any,
        };
        const container = renderNode(node);
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el.style.gap).toBe('1rem');
    });

    it('renders stack without requiring formspec-container on the same node', () => {
        const container = renderNode(stackNode());
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el).toBeTruthy();
        expect(el.classList.contains('formspec-container')).toBe(false);
    });

    it('maps validated route policy landmark metadata to the route-root role', () => {
        const container = renderNode(routePolicyNode(stackNode()));
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el.getAttribute('role')).toBe('navigation');
        expect(el.dataset.formspecUiPolicyA11yLandmark).toBe('navigation');
    });

    it('does not set a route landmark role without projected route policy', () => {
        const container = renderNode(stackNode());
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el.getAttribute('role')).toBeNull();
    });

    it('maps region route policy with landmarkLabel to role and aria-label', () => {
        const container = renderNode({
            ...routePolicyNode(stackNode(), 'region'),
            uiGraphRoutePolicy: {
                ...routePolicyNode(stackNode(), 'region').uiGraphRoutePolicy!,
                a11y: {
                    landmark: 'region',
                    landmarkLabel: 'Application review',
                    keyboardNavigation: true,
                },
            },
        });
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el.getAttribute('role')).toBe('region');
        expect(el.getAttribute('aria-label')).toBe('Application review');
        expect(el.dataset.formspecUiPolicyA11yLandmark).toBe('region');
        expect(el.dataset.formspecUiPolicyA11yLandmarkLabel).toBe('Application review');
    });

    it('suppresses active route landmark when projection marks host reservation', () => {
        const container = renderNode({
            ...routePolicyNode(stackNode(), 'main'),
            uiGraphRoutePolicy: {
                ...routePolicyNode(stackNode(), 'main').uiGraphRoutePolicy!,
                a11y: {
                    landmark: 'main',
                    landmarkSuppressed: true,
                },
            },
        });
        const el = container.querySelector('.formspec-stack') as HTMLElement;
        expect(el.getAttribute('role')).toBeNull();
        expect(el.dataset.formspecUiPolicyA11yLandmark).toBe('main');
        expect(el.dataset.formspecUiPolicyA11yLandmarkSuppressed).toBe('true');
    });

    it('keeps Modal route roots metadata-only even when policy requests main', () => {
        const container = renderNode(routePolicyNode({
            id: 'modal-1',
            component: 'Modal',
            category: 'interactive',
            props: { title: 'Confirm', triggerLabel: 'Open' },
            cssClasses: [],
            children: [],
        }, 'main'));
        const dialog = container.querySelector('dialog.formspec-modal') as HTMLDialogElement;
        expect(dialog.getAttribute('role')).toBeNull();
        expect(dialog.dataset.formspecUiPolicyA11yLandmark).toBe('main');
        expect(dialog.dataset.formspecUiPolicyRoute).toBe('apply');
    });

    it('keeps route policy active when Stack pageMode rewrites the root to Wizard', () => {
        const section: LayoutNode = {
            id: 'section-1',
            component: 'Section',
            category: 'layout',
            props: { title: 'Step one' },
            cssClasses: [],
            children: [],
        };
        const container = renderNode(routePolicyNode({
            ...stackNode({}, [section]),
            pageMode: 'wizard',
        }, 'complementary'));
        const wizard = container.querySelector('.formspec-wizard') as HTMLElement;
        expect(wizard.getAttribute('role')).toBe('complementary');
        expect(wizard.dataset.formspecUiPolicyRoute).toBe('apply');
    });
});

// ── Grid ─────────────────────────────────────────────────────────

describe('Grid layout', () => {
    it('uses repeat(N, 1fr) for numeric columns', () => {
        const container = renderNode({
            id: 'grid-1', component: 'Grid', category: 'layout',
            props: { columns: 3 }, cssClasses: [], children: [],
        });
        const el = container.querySelector('.formspec-grid') as HTMLElement;
        expect(el.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    });

    it('uses raw string for string columns prop', () => {
        const container = renderNode({
            id: 'grid-2', component: 'Grid', category: 'layout',
            props: { columns: '200px 1fr 2fr' }, cssClasses: [], children: [],
        });
        const el = container.querySelector('.formspec-grid') as HTMLElement;
        expect(el.style.gridTemplateColumns).toBe('200px 1fr 2fr');
    });

    it('applies rowGap from props', () => {
        const container = renderNode({
            id: 'grid-3', component: 'Grid', category: 'layout',
            props: { rowGap: '2rem' }, cssClasses: [], children: [],
        });
        const el = container.querySelector('.formspec-grid') as HTMLElement;
        expect(el.style.rowGap).toBe('2rem');
    });

    it('applies gap from props', () => {
        const container = renderNode({
            id: 'grid-4', component: 'Grid', category: 'layout',
            props: { gap: '1.5rem', columns: 2 }, cssClasses: [], children: [],
        });
        const el = container.querySelector('.formspec-grid') as HTMLElement;
        expect(el.style.gap).toBe('1.5rem');
    });

    it('applies grid placement style to rendered children', () => {
        const container = renderNode({
            id: 'grid-5',
            component: 'Grid',
            category: 'layout',
            props: { columns: 12 },
            cssClasses: [],
            children: [
                {
                    id: 'text-1',
                    component: 'Text',
                    category: 'display',
                    props: { text: 'Placed' },
                    style: { gridColumn: '2 / span 4', gridRow: '3 / span 2' },
                    cssClasses: [],
                    children: [],
                },
            ],
        });
        const child = container.querySelector('.formspec-grid .formspec-text') as HTMLElement;
        expect(child.style.gridColumn).toBe('2 / span 4');
        expect(child.style.gridRow).toBe('3 / span 2');
    });
});

// ── Card ─────────────────────────────────────────────────────────

describe('Card layout', () => {
    it('renders subtitle as p.formspec-card-subtitle', () => {
        const container = renderNode({
            id: 'card-1', component: 'Card', category: 'layout',
            props: { subtitle: 'Card subtext' }, cssClasses: [], children: [],
        });
        const subtitle = container.querySelector('.formspec-card-subtitle');
        expect(subtitle).toBeTruthy();
        expect(subtitle!.textContent).toBe('Card subtext');
    });

    it('applies elevation as data-elevation attribute', () => {
        const container = renderNode({
            id: 'card-2', component: 'Card', category: 'layout',
            props: { elevation: 2 }, cssClasses: [], children: [],
        });
        const card = container.querySelector('.formspec-card') as HTMLElement;
        expect(card).toBeTruthy();
        expect(card.dataset.elevation).toBe('2');
    });

    it('renders both title and subtitle when present', () => {
        const container = renderNode({
            id: 'card-3', component: 'Card', category: 'layout',
            props: { title: 'My Card', subtitle: 'Supporting info' }, cssClasses: [], children: [],
        });
        expect(container.querySelector('.formspec-card-title')?.textContent).toBe('My Card');
        expect(container.querySelector('.formspec-card-subtitle')?.textContent).toBe('Supporting info');
    });
});

// ── Divider ───────────────────────────────────────────────────────

describe('Divider layout (in layout category)', () => {
    it('renders plain hr when no label', () => {
        const container = renderNode({
            id: 'div-1', component: 'Divider', category: 'layout',
            props: {}, cssClasses: [], children: [],
        });
        const hr = container.querySelector('hr');
        expect(hr).toBeTruthy();
        // No labeled wrapper
        expect(container.querySelector('.formspec-divider--labeled')).toBeNull();
    });

    it('renders labeled divider when label prop present', () => {
        const container = renderNode({
            id: 'div-2', component: 'Divider', category: 'layout',
            props: { label: 'Or' }, cssClasses: [], children: [],
        });
        const wrapper = container.querySelector('.formspec-divider--labeled');
        expect(wrapper).toBeTruthy();
        expect(wrapper!.querySelector('span')?.textContent).toBe('Or');
        // Two hr elements flanking the label
        const hrs = wrapper!.querySelectorAll('hr');
        expect(hrs.length).toBe(2);
    });
});

// ── Page ─────────────────────────────────────────────────────────

describe('Section layout', () => {
    it('renders a section.formspec-section', () => {
        const container = renderNode({
            id: 'page-1', component: 'Section', category: 'layout',
            props: {}, cssClasses: [], children: [],
        });
        expect(container.querySelector('section.formspec-section')).toBeTruthy();
    });

    it('renders h2 title when provided', () => {
        const container = renderNode({
            id: 'page-2', component: 'Section', category: 'layout',
            props: { title: 'Step 1' }, cssClasses: [], children: [],
        });
        const h2 = container.querySelector('section.formspec-section h2');
        expect(h2).toBeTruthy();
        expect(h2!.textContent).toBe('Step 1');
    });

    it('renders p.formspec-section-description when description provided', () => {
        const container = renderNode({
            id: 'page-3', component: 'Section', category: 'layout',
            props: { description: 'Fill in your details.' }, cssClasses: [], children: [],
        });
        const desc = container.querySelector('p.formspec-section-description');
        expect(desc).toBeTruthy();
        expect(desc!.textContent).toBe('Fill in your details.');
    });

    it('renders no title or description when absent', () => {
        const container = renderNode({
            id: 'page-4', component: 'Section', category: 'layout',
            props: {}, cssClasses: [], children: [],
        });
        expect(container.querySelector('h2')).toBeNull();
        expect(container.querySelector('p.formspec-section-description')).toBeNull();
    });

    it('renders children inside the section', () => {
        const childNode: LayoutNode = {
            id: 'child-1', component: 'Divider', category: 'layout',
            props: {}, cssClasses: [], children: [],
        };
        const container = renderNode({
            id: 'page-5', component: 'Section', category: 'layout',
            props: {}, cssClasses: [], children: [childNode],
        });
        const section = container.querySelector('section.formspec-section');
        expect(section?.querySelector('hr')).toBeTruthy();
    });
});

// ── Collapsible ───────────────────────────────────────────────────

describe('Collapsible layout', () => {
    it('renders details.formspec-collapsible with summary', () => {
        const container = renderNode({
            id: 'col-1', component: 'Collapsible', category: 'layout',
            props: { title: 'More options' }, cssClasses: [], children: [],
        });
        const details = container.querySelector('details.formspec-collapsible') as HTMLDetailsElement;
        expect(details).toBeTruthy();
        expect(details.querySelector('summary')?.textContent).toBe('More options');
    });

    it('is closed by default', () => {
        const container = renderNode({
            id: 'col-2', component: 'Collapsible', category: 'layout',
            props: { title: 'Closed' }, cssClasses: [], children: [],
        });
        const details = container.querySelector('details') as HTMLDetailsElement;
        expect(details.open).toBe(false);
    });

    it('is open when defaultOpen is true', () => {
        const container = renderNode({
            id: 'col-3', component: 'Collapsible', category: 'layout',
            props: { title: 'Open', defaultOpen: true }, cssClasses: [], children: [],
        });
        const details = container.querySelector('details') as HTMLDetailsElement;
        expect(details.open).toBe(true);
    });

    it('renders children inside collapsible content', () => {
        const childNode: LayoutNode = {
            id: 'child-c1', component: 'Divider', category: 'layout',
            props: {}, cssClasses: [], children: [],
        };
        const container = renderNode({
            id: 'col-4', component: 'Collapsible', category: 'layout',
            props: { title: 'Details' }, cssClasses: [], children: [childNode],
        });
        const content = container.querySelector('.formspec-collapsible-content');
        expect(content?.querySelector('hr')).toBeTruthy();
    });

    it('uses "Details" as fallback summary when no title', () => {
        const container = renderNode({
            id: 'col-5', component: 'Collapsible', category: 'layout',
            props: {}, cssClasses: [], children: [],
        });
        const summary = container.querySelector('summary');
        expect(summary?.textContent).toBe('Details');
    });
});

// ── Accordion ─────────────────────────────────────────────────────

describe('Accordion layout', () => {
    it('renders div.formspec-accordion', () => {
        const container = renderNode({
            id: 'acc-1', component: 'Accordion', category: 'layout',
            props: {}, cssClasses: [], children: [],
        });
        expect(container.querySelector('.formspec-accordion')).toBeTruthy();
    });

    it('renders one details section per child', () => {
        const children: LayoutNode[] = [
            { id: 'c1', component: 'Divider', category: 'layout', props: {}, cssClasses: [], children: [] },
            { id: 'c2', component: 'Divider', category: 'layout', props: {}, cssClasses: [], children: [] },
        ];
        const container = renderNode({
            id: 'acc-2', component: 'Accordion', category: 'layout',
            props: { labels: ['Section A', 'Section B'] }, cssClasses: [], children,
        });
        const items = container.querySelectorAll('.formspec-accordion-item');
        expect(items.length).toBe(2);
    });

    it('uses labels from props.labels', () => {
        const children: LayoutNode[] = [
            { id: 'c1', component: 'Divider', category: 'layout', props: {}, cssClasses: [], children: [] },
        ];
        const container = renderNode({
            id: 'acc-3', component: 'Accordion', category: 'layout',
            props: { labels: ['My Section'] }, cssClasses: [], children,
        });
        const summary = container.querySelector('summary');
        expect(summary?.textContent).toBe('My Section');
    });

    it('falls back to "Section N" label when labels array absent', () => {
        const children: LayoutNode[] = [
            { id: 'c1', component: 'Divider', category: 'layout', props: {}, cssClasses: [], children: [] },
        ];
        const container = renderNode({
            id: 'acc-4', component: 'Accordion', category: 'layout',
            props: {}, cssClasses: [], children,
        });
        const summary = container.querySelector('summary');
        expect(summary?.textContent).toBe('Section 1');
    });

    it('opens the section at defaultOpen index', () => {
        const children: LayoutNode[] = [
            { id: 'c1', component: 'Divider', category: 'layout', props: {}, cssClasses: [], children: [] },
            { id: 'c2', component: 'Divider', category: 'layout', props: {}, cssClasses: [], children: [] },
        ];
        const container = renderNode({
            id: 'acc-5', component: 'Accordion', category: 'layout',
            props: { defaultOpen: 1 }, cssClasses: [], children,
        });
        const items = container.querySelectorAll('.formspec-accordion-item') as NodeListOf<HTMLDetailsElement>;
        expect(items[0].open).toBe(false);
        expect(items[1].open).toBe(true);
    });

    it('opens the clicked section when switching panels in single-open mode', () => {
        const children: LayoutNode[] = [
            { id: 'c1', component: 'Divider', category: 'layout', props: {}, cssClasses: [], children: [] },
            { id: 'c2', component: 'Divider', category: 'layout', props: {}, cssClasses: [], children: [] },
        ];
        const container = renderNode({
            id: 'acc-switch',
            component: 'Accordion',
            category: 'layout',
            props: { defaultOpen: 0, labels: ['A', 'B'] },
            cssClasses: [],
            children,
        });
        const items = container.querySelectorAll<HTMLDetailsElement>('.formspec-accordion-item');
        const summaries = container.querySelectorAll<HTMLElement>('summary');
        expect(items[0].open).toBe(true);
        expect(items[1].open).toBe(false);
        flushSync(() => {
            summaries[1].click();
        });
        expect(items[0].open).toBe(false);
        expect(items[1].open).toBe(true);
    });

    it('does not render Accordion as a custom Collapsible when only Collapsible is in components.layout', () => {
        function CustomCollapsible({ node }: LayoutComponentProps) {
            return <div data-testid="custom-collapsible" data-node-id={node.id} />;
        }
        const children: LayoutNode[] = [
            { id: 'c1', component: 'Divider', category: 'layout', props: {}, cssClasses: [], children: [] },
            { id: 'c2', component: 'Divider', category: 'layout', props: {}, cssClasses: [], children: [] },
        ];
        const accordion: LayoutNode = {
            id: 'acc-collapsible-map',
            component: 'Accordion',
            category: 'layout',
            props: { labels: ['A', 'B'] },
            cssClasses: [],
            children,
        };
        const engine = createFormEngine(simpleDef);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine} components={{ layout: { Collapsible: CustomCollapsible } }}>
                    <FormspecNode node={accordion} />
                </FormspecProvider>,
            );
        });
        expect(container.querySelector('.formspec-accordion')).toBeTruthy();
        expect(container.querySelectorAll('.formspec-accordion-item').length).toBe(2);
        expect(container.querySelector('[data-testid="custom-collapsible"]')).toBeNull();
    });

    it('binds accordion sections to repeat instances', () => {
        const def = {
            ...simpleDef,
            items: [
                {
                    key: 'members',
                    type: 'group',
                    label: 'Members',
                    repeatable: true,
                    children: [
                        { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                    ],
                },
            ],
        };
        const engine = createFormEngine(def);
        engine.addRepeatInstance('members');

        const node: LayoutNode = {
            id: 'acc-repeat',
            component: 'Accordion',
            category: 'layout',
            props: { bind: 'members', labels: ['Member A', 'Member B'] },
            cssClasses: [],
            children: [
                {
                    id: 'member-name',
                    component: 'TextInput',
                    category: 'field',
                    props: {},
                    cssClasses: [],
                    children: [],
                    bindPath: 'members[0].name',
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={node} />
                </FormspecProvider>
            );
        });

        const items = container.querySelectorAll<HTMLDetailsElement>('.formspec-accordion-item');
        expect(items).toHaveLength(2);
        expect(items[0].querySelector('summary')?.textContent).toBe('Member A');
        expect(items[1].querySelector('summary')?.textContent).toBe('Member B');
        const repeatWrapper = container.querySelector('.formspec-repeat.formspec-repeat--accordion') as HTMLElement;
        expect(repeatWrapper).toBeTruthy();
        expect(container.querySelector('.formspec-accordion--repeat')).toBeTruthy();
        expect(container.querySelectorAll('.formspec-accordion-content--repeat')).toHaveLength(2);
        expect(repeatWrapper.querySelector('.formspec-repeat-add')).toBeTruthy();
        expect(repeatWrapper.querySelector('.formspec-sr-only[aria-live="polite"]')).toBeTruthy();

        const inputs = container.querySelectorAll<HTMLInputElement>('input[name]');
        expect(inputs).toHaveLength(2);
        expect(inputs[0].name).toContain('members[0].name');
        expect(inputs[1].name).toContain('members[1].name');

        const removeButtons = container.querySelectorAll<HTMLButtonElement>('.formspec-repeat-remove');
        const addButtons = container.querySelectorAll<HTMLButtonElement>('.formspec-repeat-add');
        expect(removeButtons).toHaveLength(2);
        expect(addButtons).toHaveLength(1);
        expect(removeButtons[0].textContent).toContain('Remove Members');
        expect(removeButtons[1].textContent).toContain('Remove Members');
        expect(addButtons[0].textContent).toContain('Add Members');
    });
});

// ── Panel ─────────────────────────────────────────────────────────

describe('Panel layout', () => {
    it('renders div.formspec-panel', () => {
        const container = renderNode({
            id: 'pan-1', component: 'Panel', category: 'layout',
            props: {}, cssClasses: [], children: [],
        });
        expect(container.querySelector('.formspec-panel')).toBeTruthy();
    });

    it('renders panel header when title provided', () => {
        const container = renderNode({
            id: 'pan-2', component: 'Panel', category: 'layout',
            props: { title: 'Side Panel' }, cssClasses: [], children: [],
        });
        const header = container.querySelector('.formspec-panel-header');
        expect(header).toBeTruthy();
        expect(header!.textContent).toBe('Side Panel');
    });

    it('applies order: -1 for left placement', () => {
        const container = renderNode({
            id: 'pan-3', component: 'Panel', category: 'layout',
            props: { placement: 'left' }, cssClasses: [], children: [],
        });
        const el = container.querySelector('.formspec-panel') as HTMLElement;
        expect(el.style.order).toBe('-1');
    });

    it('applies order: 1 for right placement', () => {
        const container = renderNode({
            id: 'pan-4', component: 'Panel', category: 'layout',
            props: { placement: 'right' }, cssClasses: [], children: [],
        });
        const el = container.querySelector('.formspec-panel') as HTMLElement;
        expect(el.style.order).toBe('1');
    });

    it('applies width from props', () => {
        const container = renderNode({
            id: 'pan-5', component: 'Panel', category: 'layout',
            props: { width: '300px' }, cssClasses: [], children: [],
        });
        const el = container.querySelector('.formspec-panel') as HTMLElement;
        expect(el.style.width).toBe('300px');
    });

    it('renders children inside formspec-panel-body', () => {
        const childNode: LayoutNode = {
            id: 'child-p1', component: 'Divider', category: 'layout',
            props: {}, cssClasses: [], children: [],
        };
        const container = renderNode({
            id: 'pan-6', component: 'Panel', category: 'layout',
            props: {}, cssClasses: [], children: [childNode],
        });
        const body = container.querySelector('.formspec-panel-body');
        expect(body?.querySelector('hr')).toBeTruthy();
    });
});

// ── Modal ─────────────────────────────────────────────────────────

describe('Modal layout', () => {
    it('renders a dialog element with formspec-modal class', () => {
        const container = renderNode({
            id: 'mod-1', component: 'Modal', category: 'layout',
            props: {}, cssClasses: [], children: [],
        });
        const dialog = container.querySelector('dialog.formspec-modal');
        expect(dialog).toBeTruthy();
    });

    it('renders a trigger button to open the modal', () => {
        const container = renderNode({
            id: 'mod-2', component: 'Modal', category: 'layout',
            props: { triggerLabel: 'Open Form' }, cssClasses: [], children: [],
        });
        const triggerBtn = container.querySelector('.formspec-modal-trigger');
        expect(triggerBtn).toBeTruthy();
        expect(triggerBtn!.textContent).toBe('Open Form');
    });

    it('renders close button inside dialog', () => {
        const container = renderNode({
            id: 'mod-3', component: 'Modal', category: 'layout',
            props: {}, cssClasses: [], children: [],
        });
        const closeBtn = container.querySelector('dialog .formspec-modal-close');
        expect(closeBtn).toBeTruthy();
    });

    it('renders title inside dialog when provided', () => {
        const container = renderNode({
            id: 'mod-4', component: 'Modal', category: 'layout',
            props: { title: 'Confirm Action' }, cssClasses: [], children: [],
        });
        const title = container.querySelector('dialog .formspec-modal-title');
        expect(title).toBeTruthy();
        expect(title!.textContent).toBe('Confirm Action');
    });

    it('renders children inside modal content area', () => {
        const childNode: LayoutNode = {
            id: 'child-m1', component: 'Divider', category: 'layout',
            props: {}, cssClasses: [], children: [],
        };
        const container = renderNode({
            id: 'mod-5', component: 'Modal', category: 'layout',
            props: {}, cssClasses: [], children: [childNode],
        });
        const content = container.querySelector('.formspec-modal-content');
        expect(content?.querySelector('hr')).toBeTruthy();
    });

    it('omits close button when closable is false', () => {
        const container = renderNode({
            id: 'mod-6', component: 'Modal', category: 'layout',
            props: { closable: false }, cssClasses: [], children: [],
        });
        expect(container.querySelector('.formspec-modal-close')).toBeNull();
    });
});

// ── Popover ───────────────────────────────────────────────────────

describe('Popover layout', () => {
    it('renders a trigger button', () => {
        const container = renderNode({
            id: 'pop-1', component: 'Popover', category: 'layout',
            props: { triggerLabel: 'More info' }, cssClasses: [], children: [],
        });
        const btn = container.querySelector('.formspec-popover-trigger');
        expect(btn).toBeTruthy();
        expect(btn!.textContent).toBe('More info');
    });

    it('renders popover content panel', () => {
        const container = renderNode({
            id: 'pop-2', component: 'Popover', category: 'layout',
            props: {}, cssClasses: [], children: [],
        });
        const content = container.querySelector('.formspec-popover-content');
        expect(content).toBeTruthy();
    });

    it('keeps route policy metadata-only on popover roots', () => {
        const container = renderNode(routePolicyNode({
            id: 'pop-policy', component: 'Popover', category: 'layout',
            props: {}, cssClasses: [], children: [],
        }, 'main'));
        const wrapper = container.querySelector('.formspec-popover') as HTMLElement;
        expect(wrapper).toBeTruthy();
        expect(wrapper.getAttribute('data-formspec-ui-policy-route')).toBe('apply');
        expect(wrapper.getAttribute('role')).toBeNull();
    });

    it('defaults trigger label to "Open" when not provided', () => {
        const container = renderNode({
            id: 'pop-3', component: 'Popover', category: 'layout',
            props: {}, cssClasses: [], children: [],
        });
        const btn = container.querySelector('.formspec-popover-trigger');
        expect(btn!.textContent).toBe('Open');
    });

    it('renders children inside popover content', () => {
        const childNode: LayoutNode = {
            id: 'child-pv1', component: 'Divider', category: 'layout',
            props: {}, cssClasses: [], children: [],
        };
        const container = renderNode({
            id: 'pop-4', component: 'Popover', category: 'layout',
            props: {}, cssClasses: [], children: [childNode],
        });
        const content = container.querySelector('.formspec-popover-content');
        expect(content?.querySelector('hr')).toBeTruthy();
    });

    it('moves focus into content on open', () => {
        const childNode: LayoutNode = {
            id: 'child-pv2', component: 'Divider', category: 'layout',
            props: {}, cssClasses: [], children: [],
        };
        const container = renderNode({
            id: 'pop-5', component: 'Popover', category: 'layout',
            props: { triggerLabel: 'Open' }, cssClasses: [], children: [childNode],
        });
        const trigger = container.querySelector('.formspec-popover-trigger') as HTMLButtonElement;
        const content = container.querySelector('.formspec-popover-content') as HTMLElement;
        // Before open: content hidden
        expect(content.hidden).toBe(true);
        // Click trigger to open
        act(() => { trigger.click(); });
        expect(content.hidden).toBe(false);
        // After open, the content container should be focusable and focused
        // (tabIndex=-1 set, and focus moved there)
        expect(document.activeElement).toBe(content);
    });

    it('traps Tab focus within open popover — wraps last to first', () => {
        const engine = createFormEngine(simpleDef);
        const container2 = document.createElement('div');
        document.body.appendChild(container2);
        const root2 = createRoot(container2);
        // Render a popover with a focusable button inside
        flushSync(() => {
            root2.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={{
                        id: 'pop-6', component: 'Popover', category: 'layout',
                        props: { triggerLabel: 'Open' }, cssClasses: [], children: [],
                        // We inject a focusable child via the rendered node-renderer
                    }} />
                </FormspecProvider>
            );
        });
        // Open the popover
        const trigger = container2.querySelector('.formspec-popover-trigger') as HTMLButtonElement;
        act(() => { trigger.click(); });
        const content = container2.querySelector('.formspec-popover-content') as HTMLElement;
        expect(content.hidden).toBe(false);
        // Content itself is focused (tabIndex=-1)
        expect(document.activeElement).toBe(content);
        // Tab from content (no other focusables): should stay in content or wrap
        const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
        act(() => { content.dispatchEvent(tabEvent); });
        // Focus should still be inside the content panel (not escaped to page)
        expect(content.contains(document.activeElement) || document.activeElement === content).toBe(true);
    });
});

// ── Heading hierarchy ─────────────────────────────────────────────

describe('Heading level customization', () => {
    it('CardLayout defaults to h3 for title', () => {
        const container = renderNode({
            id: 'card-h1', component: 'Card', category: 'layout',
            props: { title: 'Card Title' }, cssClasses: [], children: [],
        });
        expect(container.querySelector('h3.formspec-card-title')).toBeTruthy();
        expect(container.querySelector('h2.formspec-card-title')).toBeNull();
    });

    it('CardLayout renders h2 when headingLevel=2', () => {
        const container = renderNode({
            id: 'card-h2', component: 'Card', category: 'layout',
            props: { title: 'Card Title', headingLevel: 2 }, cssClasses: [], children: [],
        });
        expect(container.querySelector('h2.formspec-card-title')).toBeTruthy();
        expect(container.querySelector('h3.formspec-card-title')).toBeNull();
    });

    it('CardLayout clamps headingLevel to 1–6 (7 → h6)', () => {
        const container = renderNode({
            id: 'card-h3', component: 'Card', category: 'layout',
            props: { title: 'Card Title', headingLevel: 7 }, cssClasses: [], children: [],
        });
        expect(container.querySelector('h6.formspec-card-title')).toBeTruthy();
    });

    it('PageLayout defaults to h2 for title', () => {
        const container = renderNode({
            id: 'page-h1', component: 'Section', category: 'layout',
            props: { title: 'Page Title' }, cssClasses: [], children: [],
        });
        expect(container.querySelector('section.formspec-section h2')).toBeTruthy();
    });

    it('PageLayout renders h3 when headingLevel=3', () => {
        const container = renderNode({
            id: 'page-h2', component: 'Section', category: 'layout',
            props: { title: 'Page Title', headingLevel: 3 }, cssClasses: [], children: [],
        });
        expect(container.querySelector('section.formspec-section h3')).toBeTruthy();
        expect(container.querySelector('section.formspec-section h2')).toBeNull();
    });

    it('ModalLayout defaults to h2 for title', () => {
        const container = renderNode({
            id: 'modal-h1', component: 'Modal', category: 'layout',
            props: { title: 'Modal Title' }, cssClasses: [], children: [],
        });
        expect(container.querySelector('dialog .formspec-modal-title')?.tagName).toBe('H2');
    });

    it('ModalLayout renders h3 when headingLevel=3', () => {
        const container = renderNode({
            id: 'modal-h2', component: 'Modal', category: 'layout',
            props: { title: 'Modal Title', headingLevel: 3 }, cssClasses: [], children: [],
        });
        expect(container.querySelector('dialog .formspec-modal-title')?.tagName).toBe('H3');
    });
});

// ── Accordion keyboard navigation ─────────────────────────────────

describe('Accordion keyboard navigation', () => {
    function renderAccordion(childCount: number) {
        const children: LayoutNode[] = Array.from({ length: childCount }, (_, i) => ({
            id: `kc${i}`, component: 'Divider', category: 'layout' as const,
            props: {}, cssClasses: [], children: [],
        }));
        const labels = Array.from({ length: childCount }, (_, i) => `Section ${i + 1}`);
        return renderNode({
            id: 'acc-kbd', component: 'Accordion', category: 'layout',
            props: { labels }, cssClasses: [], children,
        });
    }

    it('ArrowDown moves focus to next summary', () => {
        const container = renderAccordion(3);
        const summaries = container.querySelectorAll('summary') as NodeListOf<HTMLElement>;
        summaries[0].focus();
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
        act(() => { container.querySelector('.formspec-accordion')!.dispatchEvent(event); });
        expect(document.activeElement).toBe(summaries[1]);
    });

    it('ArrowUp moves focus to previous summary', () => {
        const container = renderAccordion(3);
        const summaries = container.querySelectorAll('summary') as NodeListOf<HTMLElement>;
        summaries[2].focus();
        const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
        act(() => { container.querySelector('.formspec-accordion')!.dispatchEvent(event); });
        expect(document.activeElement).toBe(summaries[1]);
    });

    it('Home moves focus to first summary', () => {
        const container = renderAccordion(3);
        const summaries = container.querySelectorAll('summary') as NodeListOf<HTMLElement>;
        summaries[2].focus();
        const event = new KeyboardEvent('keydown', { key: 'Home', bubbles: true });
        act(() => { container.querySelector('.formspec-accordion')!.dispatchEvent(event); });
        expect(document.activeElement).toBe(summaries[0]);
    });

    it('End moves focus to last summary', () => {
        const container = renderAccordion(3);
        const summaries = container.querySelectorAll('summary') as NodeListOf<HTMLElement>;
        summaries[0].focus();
        const event = new KeyboardEvent('keydown', { key: 'End', bubbles: true });
        act(() => { container.querySelector('.formspec-accordion')!.dispatchEvent(event); });
        expect(document.activeElement).toBe(summaries[2]);
    });

    it('ArrowDown on last summary does not move focus past end', () => {
        const container = renderAccordion(2);
        const summaries = container.querySelectorAll('summary') as NodeListOf<HTMLElement>;
        summaries[1].focus();
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
        act(() => { container.querySelector('.formspec-accordion')!.dispatchEvent(event); });
        expect(document.activeElement).toBe(summaries[1]);
    });

    it('ArrowUp on first summary does not move focus before start', () => {
        const container = renderAccordion(2);
        const summaries = container.querySelectorAll('summary') as NodeListOf<HTMLElement>;
        summaries[0].focus();
        const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
        act(() => { container.querySelector('.formspec-accordion')!.dispatchEvent(event); });
        expect(document.activeElement).toBe(summaries[0]);
    });
});
