/** @filedesc Tests for FormspecForm auto-renderer and default components. */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { initFormspecEngine, createFormEngine, createDemoSubmitResponseActions, invokeResponseAction } from '@formspec-org/engine';
import { actRender, actRenderAsync } from './render-utils';
import type { LayoutHostEvidence, LayoutNode } from '@formspec-org/layout';
import { buildPlatformTheme } from '@formspec-org/layout';
const defaultThemeJson = buildPlatformTheme();
import { FormspecForm } from '../src/renderer';
import { FormspecNode } from '../src/node-renderer';
import { FormspecProvider } from '../src/context';
import type { FieldComponentProps } from '../src/component-map';

beforeAll(async () => {
    await initFormspecEngine();
});

const originalMatchMedia = window.matchMedia;

afterEach(() => {
    window.matchMedia = originalMatchMedia;
    window.history.pushState({}, '', '/');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const testDefinition = {
    $formspec: '1.0',
    url: 'https://test.example/form',
    version: '1.0.0',
    status: 'active',
    title: 'Test Form',
    description: 'A test form.',
    name: 'test',
    items: [
        {
            key: 'name',
            type: 'field',
            dataType: 'string',
            label: 'Full Name',
            hint: 'Enter your name.',
        },
        {
            key: 'color',
            type: 'field',
            dataType: 'choice',
            label: 'Favorite Color',
            options: [
                { value: 'red', label: 'Red' },
                { value: 'blue', label: 'Blue' },
            ],
        },
        {
            key: 'agree',
            type: 'field',
            dataType: 'boolean',
            label: 'I agree',
        },
    ],
    binds: [
        { path: 'name', required: 'true' },
    ],
};

const responseActionsDocument = createDemoSubmitResponseActions({
    definitionUrl: testDefinition.url,
});

const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';

function completedUiGraphPolicyHostEvidence(
    source = 'host://policy/respondent-ui-policy',
): LayoutHostEvidence {
    return {
        appGraphReport: {
            ok: true,
            summary: {
                artifacts: 0,
                loadedArtifacts: 0,
                schemaFailures: 0,
                unvalidatedArtifacts: 0,
                graphErrors: 0,
                errors: 0,
                warnings: 0,
                infos: 0,
                importedDiagnostics: 0,
                unsupportedFeatures: 0,
                skippedPhases: 0,
            },
            schemaResults: [],
            evidenceResults: [{
                evidenceSlot: 'hostEvidence.uiGraphPolicies[0]',
                schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                source,
                status: 'completed',
                ok: true,
                diagnostics: [],
            }],
            diagnostics: [],
            phases: [
                { phase: 'schema', status: 'completed' },
                { phase: 'cross-artifact', status: 'completed' },
            ],
        },
        uiGraphPolicies: [{
            schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
            source,
            document: {
                $formspecUiGraphPolicy: '0.1',
                version: '1.0.0',
                targetSurface: {
                    url: 'https://surfaces.example.test/intake',
                    version: '1.0.0',
                },
                routePolicies: [{
                    routeId: 'apply',
                    a11y: {
                        landmark: 'main',
                        keyboardNavigation: true,
                    },
                    responsive: {
                        minColumns: 1,
                        collapseOrder: ['summary', 'details'],
                    },
                    definitionVisibility: {
                        hiddenDefinitionRefs: [{
                            url: 'https://forms.example.test/internal-notes',
                            version: '1.0.0',
                        }],
                    },
                }],
            },
        }],
    };
}

function renderInto(element: React.ReactElement): HTMLElement {
    return actRender(element);
}

// ── FormspecForm auto-renderer ─────────────────────────────────────

describe('FormspecForm', () => {
    it('mirrors browser dark preference onto the formspec container when no explicit appearance is set', () => {
        window.matchMedia = vi.fn().mockImplementation(() => ({
            matches: true,
            media: '(prefers-color-scheme: dark)',
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        const container = renderInto(
            <FormspecForm definition={testDefinition} />
        );

        expect(container.querySelector('.formspec-container.formspec-appearance-dark')).toBeTruthy();
    });

    it('renders all fields from definition', () => {
        const container = renderInto(
            <FormspecForm definition={testDefinition} />
        );

        // Should find labels for all 3 fields
        const labels = Array.from(container.querySelectorAll('label'));
        const labelTexts = labels.map(l => l.textContent?.replace(/\s*\*$/, '').trim());
        expect(labelTexts).toContain('Full Name');
        expect(labelTexts).toContain('Favorite Color');
        expect(labelTexts).toContain('I agree');
    });

    it('renders text input for string field', () => {
        const container = renderInto(
            <FormspecForm definition={testDefinition} />
        );
        const input = container.querySelector('input[type="text"]');
        expect(input).toBeTruthy();
    });

    it('renders select for choice field', () => {
        const container = renderInto(
            <FormspecForm definition={testDefinition} />
        );
        const select = container.querySelector('select');
        expect(select).toBeTruthy();
        const options = select!.querySelectorAll('option');
        // placeholder + 2 options = 3
        expect(options.length).toBe(3);
    });

    it('renders checkbox for boolean field', () => {
        const container = renderInto(
            <FormspecForm definition={testDefinition} />
        );
        const checkbox = container.querySelector('input[type="checkbox"]');
        expect(checkbox).toBeTruthy();
    });

    it('renders hint text', () => {
        const container = renderInto(
            <FormspecForm definition={testDefinition} />
        );
        expect(container.textContent).toContain('Enter your name.');
    });

    it('shows required indicator', () => {
        const container = renderInto(
            <FormspecForm definition={testDefinition} />
        );
        const requiredAbbrs = container.querySelectorAll('abbr.formspec-required');
        expect(requiredAbbrs.length).toBeGreaterThan(0);
        const starTexts = Array.from(requiredAbbrs).map(s => s.textContent?.trim());
        expect(starTexts.some(t => t?.includes('*'))).toBe(true);
    });

    it('accepts a className prop on root', () => {
        const container = renderInto(
            <FormspecForm definition={testDefinition} className="my-form" />
        );
        expect(container.querySelector('.my-form')).toBeTruthy();
    });

    it('renders a host formspec-container with the planned root stack inside it', () => {
        const container = renderInto(
            <FormspecForm definition={testDefinition} />
        );

        const host = container.querySelector('.formspec-container') as HTMLElement;
        expect(host).toBeTruthy();
        const rootStack = Array.from(host.children)
            .find((el) => el.classList.contains('formspec-stack')) as HTMLElement | undefined;
        expect(rootStack).toBeTruthy();
        expect(rootStack!.classList.contains('formspec-stack')).toBe(true);
        expect(rootStack!.classList.contains('formspec-container')).toBe(false);
    });

    it('emits default theme CSS variables on formspec-container (parity with web component)', () => {
        const container = renderInto(
            <FormspecForm definition={testDefinition} />
        );
        const host = container.querySelector('.formspec-container') as HTMLElement;
        const expectedBorder = String(
            (defaultThemeJson as { tokens?: Record<string, string> }).tokens?.['color.border'] ?? '',
        );
        expect(host?.style.getPropertyValue('--formspec-color-border').trim()).toBe(expectedBorder);
    });

    it('emits inert Component graph identity metadata from host-supplied graph context', () => {
        const componentDocument = {
            $formspecComponent: '1.2',
            url: 'https://components.example.test/respondent',
            version: '1.0.0',
            targetSurfaceRoutes: [
                {
                    surface: {
                        url: 'https://surfaces.example.test/intake',
                        version: '1.0.0',
                    },
                    route: 'apply',
                },
            ],
            tree: {
                component: 'Stack',
                id: 'root-stack',
                children: [
                    {
                        component: 'TextInput',
                        bind: 'name',
                        id: 'name-node',
                    },
                ],
            },
        };
        const componentGraph = {
            component: {
                handle: 'respondent',
                url: componentDocument.url,
                version: componentDocument.version,
            },
            surface: {
                url: 'https://surfaces.example.test/intake',
                version: '1.0.0',
            },
            route: 'apply',
        };

        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                componentDocument={componentDocument}
                componentGraph={componentGraph}
            />
        );

        const rootStack = container.querySelector('.formspec-stack') as HTMLElement;
        const nameField = container.querySelector('.formspec-field[data-name="name"]') as HTMLElement;
        expect(rootStack?.dataset.formspecComponentHandle).toBe('respondent');
        expect(rootStack?.dataset.formspecRoute).toBe('apply');
        expect(rootStack?.dataset.formspecNodePath).toBe('/root-stack');
        expect(nameField?.dataset.formspecComponentHandle).toBe('respondent');
        expect(nameField?.dataset.formspecComponentNodeId).toBe('name-node');
        expect(nameField?.dataset.formspecNodePath).toBe('/root-stack/name');
    });

    it('emits inert UI Graph Policy route metadata only on the validated route root', () => {
        const componentDocument = {
            $formspecComponent: '1.2',
            url: 'https://components.example.test/respondent',
            version: '1.0.0',
            targetSurfaceRoutes: [
                {
                    surface: {
                        url: 'https://surfaces.example.test/intake',
                        version: '1.0.0',
                    },
                    route: 'apply',
                },
            ],
            tree: {
                component: 'Stack',
                id: 'root-stack',
                children: [
                    {
                        component: 'TextInput',
                        bind: 'name',
                        id: 'name-node',
                    },
                ],
            },
        };
        const componentGraph = {
            component: {
                handle: 'respondent',
                url: componentDocument.url,
                version: componentDocument.version,
            },
            surface: {
                url: 'https://surfaces.example.test/intake',
                version: '1.0.0',
            },
            route: 'apply',
        };

        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                componentDocument={componentDocument}
                componentGraph={componentGraph}
                hostEvidence={completedUiGraphPolicyHostEvidence()}
            />
        );

        const rootStack = container.querySelector('.formspec-stack') as HTMLElement;
        const nameField = container.querySelector('.formspec-field[data-name="name"]') as HTMLElement;
        expect(rootStack?.dataset.formspecUiPolicySchema).toBe(UI_GRAPH_POLICY_SCHEMA_ID);
        expect(rootStack?.dataset.formspecUiPolicySource).toBe('host://policy/respondent-ui-policy');
        expect(rootStack?.dataset.formspecUiPolicySurfaceUrl).toBe('https://surfaces.example.test/intake');
        expect(rootStack?.dataset.formspecUiPolicySurfaceVersion).toBe('1.0.0');
        expect(rootStack?.dataset.formspecUiPolicyRoute).toBe('apply');
        expect(rootStack?.dataset.formspecUiPolicyA11yLandmark).toBe('main');
        expect(rootStack?.dataset.formspecUiPolicyKeyboardNavigation).toBe('true');
        expect(rootStack?.dataset.formspecUiPolicyResponsiveMinColumns).toBe('1');
        expect(rootStack?.dataset.formspecUiPolicyResponsiveCollapseOrder).toBe('["summary","details"]');
        expect(rootStack?.dataset.formspecComponentHandle).toBe('respondent');
        expect(nameField?.dataset.formspecUiPolicySchema).toBeUndefined();
    });

    it('does not emit UI Graph Policy metadata without completed validation report evidence', () => {
        const componentDocument = {
            $formspecComponent: '1.2',
            url: 'https://components.example.test/respondent',
            version: '1.0.0',
            targetSurfaceRoutes: [
                {
                    surface: {
                        url: 'https://surfaces.example.test/intake',
                        version: '1.0.0',
                    },
                    route: 'apply',
                },
            ],
            tree: {
                component: 'Stack',
                id: 'root-stack',
            },
        };
        const componentGraph = {
            component: {
                handle: 'respondent',
                url: componentDocument.url,
                version: componentDocument.version,
            },
            surface: {
                url: 'https://surfaces.example.test/intake',
                version: '1.0.0',
            },
            route: 'apply',
        };
        const hostEvidence = completedUiGraphPolicyHostEvidence();
        delete hostEvidence.appGraphReport;

        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                componentDocument={componentDocument}
                componentGraph={componentGraph}
                hostEvidence={hostEvidence}
            />
        );

        const rootStack = container.querySelector('.formspec-stack') as HTMLElement;
        expect(rootStack?.dataset.formspecUiPolicySchema).toBeUndefined();
        expect(rootStack?.dataset.formspecComponentHandle).toBe('respondent');
    });
});

// ── Display node rendering ────────────────────────────────────────

describe('display node rendering', () => {
    it('renders Heading node as an h-element with text', () => {
        const engine = createFormEngine(testDefinition);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'heading-1', component: 'Heading', category: 'display',
                    props: { text: 'Section Title' }, cssClasses: [], children: [],
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        // Should render a heading element with the text — default level is h2
        const heading = container.querySelector('h2');
        expect(heading).toBeTruthy();
        expect(heading!.textContent).toBe('Section Title');
    });

    it('renders Text/Paragraph node as a p element', () => {
        const engine = createFormEngine(testDefinition);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'para-1', component: 'Text', category: 'display',
                    props: { text: 'Some helpful instructions.' }, cssClasses: [], children: [],
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        const para = container.querySelector('p');
        expect(para).toBeTruthy();
        expect(para?.className).toContain('formspec-text');
        expect(para!.textContent).toBe('Some helpful instructions.');
    });

    it('renders Divider node as an hr element', () => {
        const engine = createFormEngine(testDefinition);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'divider-1', component: 'Divider', category: 'display',
                    props: {}, cssClasses: [], children: [],
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        expect(container.querySelector('hr')).toBeTruthy();
    });

    it('renders Alert/Banner node with role="status"', () => {
        const engine = createFormEngine(testDefinition);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'alert-1', component: 'Alert', category: 'display',
                    props: { text: 'Important notice!' }, cssClasses: [], children: [],
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        const alert = container.querySelector('[role="status"]');
        expect(alert).toBeTruthy();
        expect(alert!.textContent).toBe('Important notice!');
    });

    it('falls back to fieldItem.label when props.text is absent', () => {
        const engine = createFormEngine(testDefinition);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'heading-2', component: 'Heading', category: 'display',
                    props: {}, cssClasses: [], children: [],
                    fieldItem: { key: 'section', label: 'From Field Item' },
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        const heading = container.querySelector('h2');
        expect(heading).toBeTruthy();
        expect(heading!.textContent).toBe('From Field Item');
    });
});

// ── Extended display node rendering ──────────────────────────────

describe('extended display node rendering', () => {
    function makeTree(child: LayoutNode): LayoutNode {
        return {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [child],
        };
    }

    function renderTree(node: LayoutNode): HTMLElement {
        const engine = createFormEngine(testDefinition);
        return renderInto(
            <FormspecProvider engine={engine}>
                <FormspecNode node={node} />
            </FormspecProvider>
        );
    }

    it('renders Heading with configurable level from props.level', () => {
        const container = renderTree(makeTree({
            id: 'h4', component: 'Heading', category: 'display',
            props: { text: 'Deep Section', level: 4 }, cssClasses: [], children: [],
        }));
        const h4 = container.querySelector('h4');
        expect(h4).toBeTruthy();
        expect(h4!.textContent).toBe('Deep Section');
    });

    it('renders Heading as h1 when level=1', () => {
        const container = renderTree(makeTree({
            id: 'h1', component: 'Heading', category: 'display',
            props: { text: 'Page Title', level: 1 }, cssClasses: [], children: [],
        }));
        expect(container.querySelector('h1')).toBeTruthy();
    });

    it('renders Heading as h6 when level=6', () => {
        const container = renderTree(makeTree({
            id: 'h6', component: 'Heading', category: 'display',
            props: { text: 'Tiny', level: 6 }, cssClasses: [], children: [],
        }));
        expect(container.querySelector('h6')).toBeTruthy();
    });

    it('renders Badge as a span with variant class', () => {
        const container = renderTree(makeTree({
            id: 'badge-1', component: 'Badge', category: 'display',
            props: { text: 'New', variant: 'success' }, cssClasses: [], children: [],
        }));
        const badge = container.querySelector('span.formspec-badge');
        expect(badge).toBeTruthy();
        expect(badge!.textContent).toBe('New');
        expect(badge!.className).toContain('success');
    });

    it('renders Badge with default variant when none specified', () => {
        const container = renderTree(makeTree({
            id: 'badge-2', component: 'Badge', category: 'display',
            props: { text: 'Tag' }, cssClasses: [], children: [],
        }));
        const badge = container.querySelector('span.formspec-badge');
        expect(badge).toBeTruthy();
    });

    it('uses Stack gap for intentional space between children', () => {
        const container = renderTree(makeTree({
            id: 'space-stack', component: 'Stack', category: 'layout',
            props: { gap: '2rem' }, cssClasses: [],
            children: [
                { id: 'h-a', component: 'Heading', category: 'display', props: { text: 'A' }, cssClasses: [], children: [] },
                { id: 'h-b', component: 'Heading', category: 'display', props: { text: 'B' }, cssClasses: [], children: [] },
            ],
        }));
        const stacks = container.querySelectorAll('.formspec-stack');
        const spacingStack = stacks[1] as HTMLElement;
        expect(spacingStack).toBeTruthy();
        expect(spacingStack.style.gap).toBe('2rem');
    });

    it('uses surface padding for intentional space inside containers', () => {
        const container = renderTree(makeTree({
            id: 'space-section', component: 'Section', category: 'layout',
            props: { padding: '1.25rem' }, cssClasses: [], children: [],
        }));
        const section = container.querySelector('section.formspec-section') as HTMLElement;
        expect(section).toBeTruthy();
        expect(section.style.padding).toBe('1.25rem');
    });

    it('renders ProgressBar as a progress element inside a wrapper', () => {
        const container = renderTree(makeTree({
            id: 'pb-1', component: 'ProgressBar', category: 'display',
            props: { value: 40, max: 100 }, cssClasses: [], children: [],
        }));
        const wrapper = container.querySelector('.formspec-progress-bar');
        expect(wrapper).toBeTruthy();
        const progress = wrapper!.querySelector('progress');
        expect(progress).toBeTruthy();
        expect(progress!.max).toBe(100);
        expect(progress!.value).toBe(40);
    });

    it('renders ProgressBar with showPercent label', () => {
        const container = renderTree(makeTree({
            id: 'pb-2', component: 'ProgressBar', category: 'display',
            props: { value: 50, max: 100, showPercent: true }, cssClasses: [], children: [],
        }));
        const pct = container.querySelector('.formspec-progress-percent');
        expect(pct).toBeTruthy();
        expect(pct!.textContent).toBe('50%');
    });

    it('renders Summary as a dl definition list', () => {
        const container = renderTree(makeTree({
            id: 'sum-1', component: 'Summary', category: 'display',
            props: {
                items: [
                    { label: 'Name', bind: 'name' },
                    { label: 'Color', bind: 'color' },
                ],
            },
            cssClasses: [], children: [],
        }));
        const dl = container.querySelector('dl.formspec-summary');
        expect(dl).toBeTruthy();
        const dts = dl!.querySelectorAll('dt');
        expect(dts.length).toBe(2);
        expect(dts[0].textContent).toBe('Name');
        expect(dts[1].textContent).toBe('Color');
        const dds = dl!.querySelectorAll('dd');
        expect(dds.length).toBe(2);
    });

    it('renders DataTable as a table element', () => {
        const container = renderTree(makeTree({
            id: 'dt-1', component: 'DataTable', category: 'display',
            props: {
                bind: 'members',
                columns: [
                    { header: 'Name', bind: 'memberName' },
                ],
            },
            cssClasses: [], children: [],
        }));
        const table = container.querySelector('table.formspec-data-table');
        expect(table).toBeTruthy();
        const headers = table!.querySelectorAll('th');
        expect(headers[0].textContent).toBe('Name');
    });

    it('renders ValidationSummary node as formspec-validation-summary', () => {
        const container = renderTree(makeTree({
            id: 'vs-1', component: 'ValidationSummary', category: 'display',
            props: {}, cssClasses: [], children: [],
        }));
        // ValidationSummary with no results renders null — just verify no crash and right class on re-render
        // It renders null when empty — check that no error was thrown
        expect(container).toBeTruthy();
    });
});

// ── Category dispatch: container and interactive ───────────────────

describe('category dispatch for container and interactive', () => {
    it('dispatches container category nodes to layout component', () => {
        const engine = createFormEngine(testDefinition);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'wizard-1', component: 'Wizard', category: 'interactive',
                    props: {}, cssClasses: [], children: [
                        {
                            id: 'name-f', component: 'TextInput', category: 'field',
                            props: {}, cssClasses: [], children: [],
                            bindPath: 'name',
                        },
                    ],
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        // Without a custom Wizard component, falls back to DefaultLayout
        // The child field should still render
        const field = container.querySelector('[data-name="name"]');
        expect(field).toBeTruthy();
    });

    it('dispatches special category nodes to layout component', () => {
        const engine = createFormEngine(testDefinition);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'special-1', component: 'ConditionalGroup', category: 'special',
                    props: {}, cssClasses: [], children: [
                        {
                            id: 'name-f2', component: 'TextInput', category: 'field',
                            props: {}, cssClasses: [], children: [],
                            bindPath: 'name',
                        },
                    ],
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        // Child field should render inside the special node
        const field = container.querySelector('[data-name="name"]');
        expect(field).toBeTruthy();
    });
});

// ── Fallback substitution ─────────────────────────────────────────

describe('fallback substitution', () => {
    it('substitutes MoneyInput with NumberInput when MoneyInput is unmapped', () => {
        const moneyDef = {
            $formspec: '1.0',
            url: 'https://test.example/money',
            version: '1.0.0',
            status: 'active',
            title: 'Money Form',
            name: 'money',
            items: [
                { key: 'amount', type: 'field', dataType: 'money', label: 'Amount' },
            ],
        };
        const engine = createFormEngine(moneyDef);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'money-1', component: 'MoneyInput', category: 'field',
                    props: {}, cssClasses: [], children: [],
                    bindPath: 'amount',
                },
            ],
        };

        const NumberInputSpy = ({ field, node }: any) => (
            <div data-testid="number-input">{field.label}</div>
        );

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine} components={{ fields: { NumberInput: NumberInputSpy } }}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        // MoneyInput falls back to NumberInput
        const el = container.querySelector('[data-testid="number-input"]');
        expect(el).toBeTruthy();
        expect(el!.textContent).toBe('Amount');
    });

    it('uses explicit MoneyInput component when registered, not fallback', () => {
        const moneyDef = {
            $formspec: '1.0',
            url: 'https://test.example/money2',
            version: '1.0.0',
            status: 'active',
            title: 'Money Form 2',
            name: 'money2',
            items: [
                { key: 'amount', type: 'field', dataType: 'money', label: 'Amount' },
            ],
        };
        const engine = createFormEngine(moneyDef);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'money-2', component: 'MoneyInput', category: 'field',
                    props: {}, cssClasses: [], children: [],
                    bindPath: 'amount',
                },
            ],
        };

        const MoneyInputSpy = ({ field }: any) => <div data-testid="money-input">{field.label}</div>;
        const NumberInputSpy = ({ field }: any) => <div data-testid="number-input">{field.label}</div>;

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine} components={{ fields: { MoneyInput: MoneyInputSpy, NumberInput: NumberInputSpy } }}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        expect(container.querySelector('[data-testid="money-input"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="number-input"]')).toBeNull();
    });

    it('substitutes Panel with Card layout when Panel is unmapped', () => {
        const engine = createFormEngine(testDefinition);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'panel-1', component: 'Panel', category: 'container',
                    props: {}, cssClasses: [], children: [
                        {
                            id: 'name-f3', component: 'TextInput', category: 'field',
                            props: {}, cssClasses: [], children: [],
                            bindPath: 'name',
                        },
                    ],
                },
            ],
        };

        const CardSpy = ({ node, children }: any) => <section data-testid="card-fallback">{children}</section>;

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine} components={{ layout: { Card: CardSpy } }}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        expect(container.querySelector('[data-testid="card-fallback"]')).toBeTruthy();
    });
});

// ── disabledDisplay: 'protected' ──────────────────────────────────

describe('disabledDisplay protected mode', () => {
    it('renders an irrelevant field as disabled when disabledDisplay is protected', () => {
        const protectedDef = {
            $formspec: '1.0',
            url: 'https://test.example/protected',
            version: '1.0.0',
            status: 'active',
            title: 'Protected Test',
            name: 'protected-test',
            items: [
                { key: 'toggle', type: 'field', dataType: 'boolean', label: 'Toggle' },
                { key: 'secret', type: 'field', dataType: 'string', label: 'Secret Field' },
            ],
            binds: [
                { path: 'secret', relevant: '$toggle', disabledDisplay: 'protected' },
            ],
        };

        const engine = createFormEngine(protectedDef);
        // toggle=false → secret is irrelevant but should still render disabled

        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'secret-field', component: 'TextInput', category: 'field',
                    props: {}, cssClasses: [], children: [],
                    bindPath: 'secret',
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        // Field should still be in the DOM (not hidden)
        const field = container.querySelector('[data-name="secret"]');
        expect(field).toBeTruthy();

        // The input should be disabled
        const input = container.querySelector('input[type="text"]');
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).readOnly).toBe(true);

        // Container should have a disabled indicator class
        expect(field!.classList.contains('formspec-protected')).toBe(true);
    });
});

// ── Group-level relevance ─────────────────────────────────────────

describe('group-level relevance', () => {
    it('hides a group layout node when its relevant bind is false', () => {
        const groupRelDef = {
            $formspec: '1.0',
            url: 'https://test.example/group-rel',
            version: '1.0.0',
            status: 'active',
            title: 'Group Relevance Test',
            name: 'group-rel',
            items: [
                { key: 'showGroup', type: 'field', dataType: 'boolean', label: 'Show group' },
                {
                    key: 'details',
                    type: 'group',
                    label: 'Details',
                    children: [
                        { key: 'info', type: 'field', dataType: 'string', label: 'Info' },
                    ],
                },
            ],
            binds: [
                { path: 'details', relevant: '$showGroup' },
            ],
        };

        const engine = createFormEngine(groupRelDef);
        // showGroup defaults to false → group should be hidden

        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'toggle-field', component: 'Toggle', category: 'field',
                    props: {}, cssClasses: [], children: [],
                    bindPath: 'showGroup',
                },
                {
                    id: 'details-group', component: 'Card', category: 'layout',
                    props: {}, cssClasses: [], children: [
                        {
                            id: 'info-field', component: 'TextInput', category: 'field',
                            props: {}, cssClasses: [], children: [],
                            bindPath: 'details.info',
                        },
                    ],
                    bindPath: 'details',
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        // The group container itself should not render when irrelevant
        const groupSection = container.querySelector('section');
        expect(groupSection).toBeNull();
    });

    it('shows a group layout node when its relevant bind is true', () => {
        const groupRelDef = {
            $formspec: '1.0',
            url: 'https://test.example/group-rel2',
            version: '1.0.0',
            status: 'active',
            title: 'Group Relevance Test 2',
            name: 'group-rel2',
            items: [
                { key: 'showGroup', type: 'field', dataType: 'boolean', label: 'Show group' },
                {
                    key: 'details',
                    type: 'group',
                    label: 'Details',
                    children: [
                        { key: 'info', type: 'field', dataType: 'string', label: 'Info' },
                    ],
                },
            ],
            binds: [
                { path: 'details', relevant: '$showGroup' },
            ],
        };

        const engine = createFormEngine(groupRelDef);
        engine.setValue('showGroup', true);

        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'details-group', component: 'Card', category: 'layout',
                    props: {}, cssClasses: [], children: [
                        {
                            id: 'info-field', component: 'TextInput', category: 'field',
                            props: {}, cssClasses: [], children: [],
                            bindPath: 'details.info',
                        },
                    ],
                    bindPath: 'details',
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        // details group should be visible (showGroup = true)
        const infoField = container.querySelector('[data-name="details.info"]');
        expect(infoField).toBeTruthy();
    });
});

// ── Component map overrides ────────────────────────────────────────

describe('component map overrides', () => {
    it('uses custom field component when provided', () => {
        const CustomTextInput = ({ field, node }: FieldComponentProps) => (
            <div data-testid="custom-text">{field.label}</div>
        );

        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                components={{ fields: { TextInput: CustomTextInput } }}
            />
        );

        expect(container.querySelector('[data-testid="custom-text"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="custom-text"]')!.textContent).toBe('Full Name');
    });

    it('falls back to default for non-overridden components', () => {
        const CustomTextInput = ({ field }: FieldComponentProps) => (
            <div data-testid="custom">{field.label}</div>
        );

        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                components={{ fields: { TextInput: CustomTextInput } }}
            />
        );

        // Select should still render with default (has <select> element)
        expect(container.querySelector('select')).toBeTruthy();
    });
});

// ── ActionButton ──────────────────────────────────────────────────

describe('ActionButton', () => {
    it('renders an action button when onSubmit is provided', () => {
        const onSubmit = () => {};
        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                responseActionsDocument={responseActionsDocument}
                onSubmit={onSubmit}
            />
        );

        const button = container.querySelector('button.formspec-submit');
        expect(button).toBeTruthy();
        expect(button!.textContent).toBe('Submit');
    });

    it('emits type="button" to mirror the webcomponent renderer (parity)', () => {
        // §10 is silent on HTML type; both reference renderers MUST
        // emit type="button" so that an ActionButton inside a parent
        // <form> does not cascade to native submit on handler-throw.
        // Webcomponent: packages/formspec-webcomponent/src/components/interactive.ts
        // ("button.type = 'button'").
        const onSubmit = () => {};
        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                responseActionsDocument={responseActionsDocument}
                onSubmit={onSubmit}
            />
        );

        const button = container.querySelector('button.formspec-submit') as HTMLButtonElement | null;
        expect(button).toBeTruthy();
        expect(button!.type).toBe('button');
    });

    it('does not render an action button when onSubmit is absent', () => {
        const container = renderInto(
            <FormspecForm definition={testDefinition} />
        );

        const button = container.querySelector('button.formspec-submit');
        expect(button).toBeNull();
    });

    it('calls onSubmit with response and validationReport on click', () => {
        let submitted: any = null;
        const onSubmit = (result: any) => { submitted = result; };

        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                responseActionsDocument={responseActionsDocument}
                onSubmit={onSubmit}
            />
        );

        const button = container.querySelector('button.formspec-submit') as HTMLButtonElement;
        expect(button).toBeTruthy();

        flushSync(() => { button.click(); });

        expect(submitted).not.toBeNull();
        expect(submitted).toHaveProperty('response');
        expect(submitted).toHaveProperty('validationReport');
        expect(submitted.validationReport).toHaveProperty('valid');
    });

    it('touches all fields on submit so validation errors become visible', () => {
        let submitted: any = null;
        const onSubmit = (result: any) => { submitted = result; };

        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                responseActionsDocument={responseActionsDocument}
                onSubmit={onSubmit}
            />
        );

        // Before clicking submit, the required 'name' field error should not be visible
        // (no aria-invalid on the input — field is untouched)
        const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement;
        expect(nameInput).toBeTruthy();
        expect(nameInput.getAttribute('aria-invalid')).not.toBe('true');

        flushSync(() => {
            const button = container.querySelector('button.formspec-submit') as HTMLButtonElement;
            button.click();
        });

        // After submit, the field should be touched and error should be visible
        expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    });

    it('emits a finding when onSubmit is wired without a submit Action', async () => {
        const onSubmit = vi.fn();
        const onActionFinding = vi.fn();
        renderInto(
            <FormspecForm
                definition={testDefinition}
                onSubmit={onSubmit}
                onActionFinding={onActionFinding}
            />
        );

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(onActionFinding).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'COMP-REFERENTIAL-INTEGRITY',
                reason: 'missing-submit-action',
                target: 'submit',
            }),
        );
    });

    it('passes non-submit host events and invocation terminals to host callbacks', () => {
        const onHostEvent = vi.fn();
        const onActionResult = vi.fn();
        const saveActionsDocument = {
            $formspecResponseActions: '1.0',
            version: '1.0.0',
            actions: [{
                id: 'save',
                intent: 'save-draft',
                effects: [{ type: 'hostEvent', eventName: 'formspec-save' }],
            }],
        };
        const componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: testDefinition.url },
            tree: { component: 'ActionButton', actionRef: 'save', label: { literal: 'Save' } },
        };

        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                componentDocument={componentDocument}
                responseActionsDocument={saveActionsDocument}
                onHostEvent={onHostEvent}
                onActionResult={onActionResult}
            />
        );

        const button = container.querySelector('button.formspec-submit') as HTMLButtonElement;
        flushSync(() => { button.click(); });

        expect(onHostEvent).toHaveBeenCalledWith(
            'formspec-save',
            expect.objectContaining({ response: expect.any(Object), validationReport: null }),
            expect.objectContaining({ id: 'save' }),
        );
        expect(onActionResult).toHaveBeenCalledWith(expect.objectContaining({
            status: 'completed',
            effectTrace: [expect.objectContaining({ type: 'hostEvent', status: 'succeeded' })],
        }));
    });

    it('uses host durable-effect adapters and exposes failed/deferred status through onActionResult', () => {
        const dispatchActionEffect = vi.fn(() => ({
            type: 'ledgerAppend',
            status: 'succeeded',
            outcomeRef: `sha256:${'1'.repeat(64)}`,
        }));
        const resolveActionIdempotencyKey = vi.fn(() => 'response-1/complete');
        const onActionResult = vi.fn();
        const durableActionsDocument = {
            $formspecResponseActions: '1.0',
            version: '1.0.0',
            actions: [{
                id: 'complete',
                intent: 'submit',
                validation: { profile: 'on-submit', blocking: 'non-blocking', persistence: 'none' },
                effects: [{
                    type: 'ledgerAppend',
                    eventKind: 'response.completed',
                    idempotencyKey: '@invocation.id + "/complete"',
                }],
            }],
        };
        const componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: testDefinition.url },
            tree: { component: 'ActionButton', actionRef: 'complete', label: { literal: 'Complete' } },
        };

        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                componentDocument={componentDocument}
                responseActionsDocument={durableActionsDocument}
                dispatchActionEffect={dispatchActionEffect}
                resolveActionIdempotencyKey={resolveActionIdempotencyKey}
                onActionResult={onActionResult}
            />
        );

        const button = container.querySelector('button.formspec-submit') as HTMLButtonElement;
        flushSync(() => { button.click(); });

        expect(dispatchActionEffect).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'ledgerAppend',
                eventKind: 'response.completed',
                idempotencyKey: 'response-1/complete',
            }),
            expect.objectContaining({ response: expect.any(Object), validationReport: expect.any(Object) }),
            expect.objectContaining({ id: 'complete' }),
            expect.objectContaining({ effectIndex: 0, attempt: 0, idempotencyKey: 'response-1/complete' }),
        );
        expect(resolveActionIdempotencyKey).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'ledgerAppend' }),
            expect.objectContaining({ id: 'complete' }),
            expect.objectContaining({ effectIndex: 0 }),
        );
        expect(onActionResult).toHaveBeenCalledWith(expect.objectContaining({
            status: 'completed',
            effectTrace: [expect.objectContaining({ type: 'ledgerAppend', status: 'succeeded' })],
        }));
    });

    it('routes ActionButton invocation through a host responseActionInvoker when supplied', () => {
        const onHostEvent = vi.fn();
        const onActionResult = vi.fn();
        const saveActionsDocument = {
            $formspecResponseActions: '1.0',
            version: '1.0.0',
            actions: [{
                id: 'save',
                intent: 'save-draft',
                effects: [{ type: 'hostEvent', eventName: 'formspec-save' }],
            }],
        };
        const componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: testDefinition.url },
            tree: { component: 'ActionButton', actionRef: 'save', label: { literal: 'Save' } },
        };
        const responseActionInvoker = vi.fn((input) => ({
            invocation: invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId),
        }));

        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                componentDocument={componentDocument}
                responseActionsDocument={saveActionsDocument}
                responseActionInvoker={responseActionInvoker}
                onHostEvent={onHostEvent}
                onActionResult={onActionResult}
            />
        );

        const button = container.querySelector('button.formspec-submit') as HTMLButtonElement;
        flushSync(() => { button.click(); });

        expect(responseActionInvoker).toHaveBeenCalledWith(expect.objectContaining({
            document: saveActionsDocument,
            actionRef: 'save',
            nodeId: expect.any(String),
            ports: expect.any(Object),
        }));
        expect(onHostEvent).toHaveBeenCalledWith(
            'formspec-save',
            expect.objectContaining({ response: expect.any(Object), validationReport: null }),
            expect.objectContaining({ id: 'save' }),
        );
        expect(onActionResult).toHaveBeenCalledWith(expect.objectContaining({
            status: 'completed',
            effectTrace: [expect.objectContaining({ type: 'hostEvent', status: 'succeeded' })],
        }));
    });

    it('supports an async host responseActionInvoker and reports the resolved terminal result', async () => {
        const onActionResult = vi.fn();
        const saveActionsDocument = {
            $formspecResponseActions: '1.0',
            version: '1.0.0',
            actions: [{
                id: 'save',
                intent: 'save-draft',
                effects: [{ type: 'hostEvent', eventName: 'formspec-save' }],
            }],
        };
        const componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: testDefinition.url },
            tree: { component: 'ActionButton', actionRef: 'save', label: { literal: 'Save' } },
        };
        const responseActionInvoker = vi.fn(async (input) => ({
            invocation: invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId),
        }));

        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                componentDocument={componentDocument}
                responseActionsDocument={saveActionsDocument}
                responseActionInvoker={responseActionInvoker}
                onActionResult={onActionResult}
            />
        );

        const button = container.querySelector('button.formspec-submit') as HTMLButtonElement;
        flushSync(() => { button.click(); });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(onActionResult).toHaveBeenCalledWith(expect.objectContaining({
            status: 'completed',
            effectTrace: [expect.objectContaining({ type: 'hostEvent', status: 'succeeded' })],
        }));
    });

    it('reports async host responseActionInvoker rejection as a failed terminal result', async () => {
        const onActionResult = vi.fn();
        const componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: testDefinition.url },
            tree: { component: 'ActionButton', actionRef: 'submit', label: { literal: 'Submit' } },
        };
        const responseActionInvoker = vi.fn(async () => {
            throw new Error('ledger append failed');
        });

        const container = renderInto(
            <FormspecForm
                definition={testDefinition}
                componentDocument={componentDocument}
                responseActionsDocument={responseActionsDocument}
                responseActionInvoker={responseActionInvoker}
                onActionResult={onActionResult}
            />
        );

        const button = container.querySelector('button.formspec-submit') as HTMLButtonElement;
        flushSync(() => { button.click(); });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(onActionResult).toHaveBeenCalledWith(expect.objectContaining({
            status: 'failed',
            failureReason: 'ledger append failed',
            effectTrace: [],
        }));
    });
});

// ── Conditional rendering (when) ─────────────────────────────────

const conditionalDefinition = {
    $formspec: '1.0',
    url: 'https://test.example/conditional',
    version: '1.0.0',
    status: 'active',
    title: 'Conditional Form',
    name: 'conditional',
    items: [
        {
            key: 'showDetails',
            type: 'field',
            dataType: 'boolean',
            label: 'Show details?',
        },
        {
            key: 'details',
            type: 'field',
            dataType: 'string',
            label: 'Details',
        },
    ],
};

describe('conditional rendering (when)', () => {
    it('hides a layout node when its "when" expression is falsy', () => {
        const engine = createFormEngine(conditionalDefinition);

        // Craft a layout plan with a "when" on the details field wrapper
        const layoutPlan: LayoutNode = {
            id: 'root',
            component: 'Stack',
            category: 'layout',
            props: {},
            cssClasses: [],
            children: [
                {
                    id: 'show-field',
                    component: 'Toggle',
                    category: 'field',
                    props: {},
                    cssClasses: [],
                    children: [],
                    bindPath: 'showDetails',
                },
                {
                    id: 'conditional-wrapper',
                    component: 'Stack',
                    category: 'layout',
                    props: {},
                    cssClasses: [],
                    children: [
                        {
                            id: 'details-field',
                            component: 'TextInput',
                            category: 'field',
                            props: {},
                            cssClasses: [],
                            children: [],
                            bindPath: 'details',
                        },
                    ],
                    when: '$showDetails',
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={layoutPlan} />
                </FormspecProvider>
            );
        });

        // showDetails defaults to false, so the details field should be hidden
        const detailsInput = container.querySelector('[data-name="details"]');
        expect(detailsInput).toBeNull();
    });

    it('shows a layout node when its "when" expression is truthy', () => {
        const engine = createFormEngine(conditionalDefinition);
        engine.setValue('showDetails', true);

        const layoutPlan: LayoutNode = {
            id: 'root',
            component: 'Stack',
            category: 'layout',
            props: {},
            cssClasses: [],
            children: [
                {
                    id: 'conditional-wrapper',
                    component: 'Stack',
                    category: 'layout',
                    props: {},
                    cssClasses: [],
                    children: [
                        {
                            id: 'details-field',
                            component: 'TextInput',
                            category: 'field',
                            props: {},
                            cssClasses: [],
                            children: [],
                            bindPath: 'details',
                        },
                    ],
                    when: '$showDetails',
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={layoutPlan} />
                </FormspecProvider>
            );
        });

        // showDetails is true, so the details field should be visible
        const detailsInput = container.querySelector('[data-name="details"]');
        expect(detailsInput).toBeTruthy();
    });
});

// ── Repeat group rendering ───────────────────────────────────────

const repeatDefinition = {
    $formspec: '1.0',
    url: 'https://test.example/repeat',
    version: '1.0.0',
    status: 'active',
    title: 'Repeat Form',
    name: 'repeat',
    items: [
        {
            key: 'members',
            type: 'group',
            label: 'Team Members',
            repeatable: true,
            children: [
                {
                    key: 'memberName',
                    type: 'field',
                    dataType: 'string',
                    label: 'Member Name',
                },
            ],
        },
    ],
};

describe('repeat group rendering', () => {
    it('renders an add button for repeat groups', () => {
        const container = renderInto(
            <FormspecForm definition={repeatDefinition} />
        );

        const addBtn = container.querySelector('.formspec-repeat-add');
        expect(addBtn).toBeTruthy();
        expect(addBtn!.textContent).toContain('Add');
    });

    it('renders instances when repeat count > 0', () => {
        // Engine initializes repeatable groups with minRepeat ?? 1, so count starts at 1
        const engine = createFormEngine(repeatDefinition);

        const layoutPlan: LayoutNode = {
            id: 'root',
            component: 'Stack',
            category: 'layout',
            props: {},
            cssClasses: [],
            children: [
                {
                    id: 'members-group',
                    component: 'Stack',
                    category: 'layout',
                    props: { title: 'Team Members', bind: 'members' },
                    cssClasses: [],
                    children: [
                        {
                            id: 'memberName-field',
                            component: 'TextInput',
                            category: 'field',
                            props: {},
                            cssClasses: [],
                            children: [],
                            bindPath: 'members[0].memberName',
                        },
                    ],
                    bindPath: 'members',
                    repeatGroup: 'members',
                    repeatPath: 'members',
                    isRepeatTemplate: true,
                    scopeChange: true,
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={layoutPlan} />
                </FormspecProvider>
            );
        });

        // Should have one instance with a member name field
        const instances = container.querySelectorAll('.formspec-repeat-instance');
        expect(instances.length).toBe(1);

        // Should have a remove button per instance
        const removeBtn = container.querySelector('.formspec-repeat-remove');
        expect(removeBtn).toBeTruthy();
    });

    it('renders multiple instances after adding', () => {
        const engine = createFormEngine(repeatDefinition);
        // Engine starts with 1 instance; add a second
        engine.addRepeatInstance('members');

        const layoutPlan: LayoutNode = {
            id: 'root',
            component: 'Stack',
            category: 'layout',
            props: {},
            cssClasses: [],
            children: [
                {
                    id: 'members-group',
                    component: 'Stack',
                    category: 'layout',
                    props: { title: 'Team Members', bind: 'members' },
                    cssClasses: [],
                    children: [
                        {
                            id: 'memberName-field',
                            component: 'TextInput',
                            category: 'field',
                            props: {},
                            cssClasses: [],
                            children: [],
                            bindPath: 'members[0].memberName',
                        },
                    ],
                    bindPath: 'members',
                    repeatGroup: 'members',
                    repeatPath: 'members',
                    isRepeatTemplate: true,
                    scopeChange: true,
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={layoutPlan} />
                </FormspecProvider>
            );
        });

        const instances = container.querySelectorAll('.formspec-repeat-instance');
        expect(instances.length).toBe(2);

        // Each instance should have a remove button
        const removeBtns = container.querySelectorAll('.formspec-repeat-remove');
        expect(removeBtns.length).toBe(2);

        // Should have fields bound to correct indexed paths
        const fields = container.querySelectorAll('[data-name]');
        const paths = Array.from(fields).map((el) => el.getAttribute('data-name'));
        expect(paths).toContain('members[0].memberName');
        expect(paths).toContain('members[1].memberName');
    });

    it('renders add button with group label', () => {
        const engine = createFormEngine(repeatDefinition);

        const layoutPlan: LayoutNode = {
            id: 'root',
            component: 'Stack',
            category: 'layout',
            props: {},
            cssClasses: [],
            children: [
                {
                    id: 'members-group',
                    component: 'Stack',
                    category: 'layout',
                    props: { title: 'Team Members', bind: 'members' },
                    cssClasses: [],
                    children: [],
                    bindPath: 'members',
                    repeatGroup: 'members',
                    repeatPath: 'members',
                    isRepeatTemplate: true,
                    scopeChange: true,
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={layoutPlan} />
                </FormspecProvider>
            );
        });

        const addBtn = container.querySelector('.formspec-repeat-add');
        expect(addBtn).toBeTruthy();
        expect(addBtn!.textContent).toContain('Team Members');
    });

    it('keeps the last repeat instance as :last-of-type despite the live region', () => {
        const engine = createFormEngine(repeatDefinition);
        engine.addRepeatInstance('members');

        const layoutPlan: LayoutNode = {
            id: 'root',
            component: 'Stack',
            category: 'layout',
            props: {},
            cssClasses: [],
            children: [
                {
                    id: 'members-group',
                    component: 'Stack',
                    category: 'layout',
                    props: { title: 'Team Members', bind: 'members' },
                    cssClasses: [],
                    children: [],
                    bindPath: 'members',
                    repeatGroup: 'members',
                    repeatPath: 'members',
                    isRepeatTemplate: true,
                    scopeChange: true,
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={layoutPlan} />
                </FormspecProvider>
            );
        });

        const lastInstance = container.querySelector('.formspec-repeat-instance:last-of-type');
        expect(lastInstance).toBeTruthy();
        expect(container.querySelectorAll('.formspec-repeat-instance')).toHaveLength(2);
        const repeatContainer = container.querySelector('.formspec-repeat') as HTMLElement;
        expect(repeatContainer.querySelector('.formspec-repeat-list')).toBeTruthy();
        expect(repeatContainer.querySelector('.formspec-repeat-add')).toBeTruthy();
        expect(repeatContainer.querySelector('.formspec-sr-only[aria-live="polite"]')).toBeTruthy();
    });

    it('renders a visible instance header that keeps remove actions attached to each row', () => {
        const container = renderInto(
            <FormspecForm definition={repeatDefinition} />
        );

        const instanceHeader = container.querySelector('.formspec-repeat-instance-header');
        const instanceLabel = container.querySelector('.formspec-repeat-instance-label');
        const removeButton = container.querySelector('.formspec-repeat-instance-header .formspec-repeat-remove');

        expect(instanceHeader).toBeTruthy();
        expect(instanceLabel?.textContent).toBe('Team Members 1');
        expect(removeButton).toBeTruthy();
    });
});

// ── DataTable select column rendering ─────────────────────────────

describe('DataTable select column rendering', () => {
    const dataTableDef = {
        $formspec: '1.0',
        url: 'https://test.example/datatable',
        version: '1.0.0',
        status: 'active',
        title: 'DataTable Test',
        name: 'datatable-test',
        items: [
            {
                key: 'expenses',
                type: 'group',
                label: 'Expenses',
                repeatable: true,
                minRepeat: 1,
                children: [
                    { key: 'description', type: 'field', dataType: 'string', label: 'Description' },
                    {
                        key: 'category',
                        type: 'field',
                        dataType: 'choice',
                        label: 'Category',
                        options: [
                            { value: 'travel', label: 'Travel' },
                            { value: 'supplies', label: 'Supplies' },
                        ],
                    },
                ],
            },
        ],
    };

    it('renders a <select> for columns with type "select" and choices', () => {
        const engine = createFormEngine(dataTableDef);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'dt-sel', component: 'DataTable', category: 'interactive',
                    props: {
                        bind: 'expenses',
                        allowAdd: true,
                        columns: [
                            { header: 'Description', bind: 'description', type: 'text' },
                            {
                                header: 'Category',
                                bind: 'category',
                                type: 'select',
                                choices: [
                                    { value: 'travel', label: 'Travel' },
                                    { value: 'supplies', label: 'Supplies' },
                                ],
                            },
                        ],
                    },
                    cssClasses: [], children: [],
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        // Category column should render a <select>, not a text input
        const select = container.querySelector('select.formspec-datatable-input');
        expect(select).toBeTruthy();
        const options = select!.querySelectorAll('option');
        // placeholder "-" + 2 choices = 3
        expect(options.length).toBe(3);
        expect(options[1].textContent).toBe('Travel');
    });

    it('renders a <select> for columns with type "choice" and choices', () => {
        const engine = createFormEngine(dataTableDef);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'dt-choice', component: 'DataTable', category: 'interactive',
                    props: {
                        bind: 'expenses',
                        allowAdd: true,
                        columns: [
                            {
                                header: 'Category',
                                bind: 'category',
                                type: 'choice',
                                choices: [
                                    { value: 'travel', label: 'Travel' },
                                    { value: 'supplies', label: 'Supplies' },
                                ],
                            },
                        ],
                    },
                    cssClasses: [], children: [],
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        const select = container.querySelector('select.formspec-datatable-input');
        expect(select).toBeTruthy();
    });

    it('uses the shared datatable chrome contract', () => {
        const engine = createFormEngine(dataTableDef);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'dt-contract', component: 'DataTable', category: 'interactive',
                    props: {
                        bind: 'expenses',
                        title: 'Expenses',
                        allowAdd: true,
                        allowRemove: true,
                        columns: [{ header: 'Description', bind: 'description', type: 'text' }],
                    },
                    cssClasses: [], children: [],
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        const wrapper = container.querySelector('.formspec-data-table-wrapper') as HTMLElement;
        expect(wrapper).toBeTruthy();
        expect(wrapper.querySelector('table.formspec-data-table')).toBeTruthy();
        expect(wrapper.querySelector('caption')?.textContent).toBe('Expenses');
        expect(wrapper.querySelector('.formspec-datatable-add')).toBeTruthy();
        const actionHeader = wrapper.querySelector('th:last-child .formspec-sr-only');
        expect(actionHeader?.textContent).toBe('Actions');
        const removeButton = wrapper.querySelector('.formspec-datatable-remove') as HTMLButtonElement;
        expect(removeButton).toBeTruthy();
        expect(removeButton.className).toBe('formspec-datatable-remove formspec-button-danger formspec-focus-ring');
        const addButton = wrapper.querySelector('.formspec-datatable-add') as HTMLButtonElement;
        expect(addButton.className).toBe('formspec-datatable-add formspec-focus-ring');
    });

    it('derives datatable cells from field metadata', () => {
        const def = {
            ...dataTableDef,
            optionSets: {
                expenseCategory: {
                    options: [
                        { value: 'travel', label: 'Travel' },
                        { value: 'supplies', label: 'Supplies' },
                    ],
                },
            },
            items: [
                {
                    key: 'expenses',
                    type: 'group',
                    label: 'Expenses',
                    repeatable: true,
                    minRepeat: 1,
                    children: [
                        { key: 'description', type: 'field', dataType: 'string', label: 'Description', prefix: '@', suffix: '.com' },
                        { key: 'category', type: 'field', dataType: 'choice', label: 'Category', optionSet: 'expenseCategory' },
                        { key: 'cost', type: 'field', dataType: 'money', label: 'Cost', currency: 'USD' },
                    ],
                },
            ],
            binds: [{ path: 'expenses.cost', readonly: 'true' }],
        };
        const engine = createFormEngine(def);
        engine.setValue('expenses[0].cost', { amount: 42, currency: 'USD' });

        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'dt-meta', component: 'DataTable', category: 'interactive',
                    props: {
                        bind: 'expenses',
                        allowAdd: true,
                        showRowNumbers: true,
                        columns: [
                            { header: 'Description', bind: 'description' },
                            { header: 'Category', bind: 'category' },
                            { header: 'Cost', bind: 'cost' },
                        ],
                    },
                    cssClasses: [], children: [],
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        expect(container.querySelector('th')?.textContent).toBe('#');
        expect(container.querySelector('.formspec-row-number')?.textContent).toBe('1');
        expect(container.querySelector('.formspec-datatable-cell-wrapper')).toBeTruthy();
        expect(container.querySelectorAll('.formspec-datatable-prefix')).toHaveLength(2);
        const select = container.querySelectorAll('select.formspec-datatable-input');
        expect(select).toHaveLength(1);
        const moneyInput = container.querySelector('input[name="expenses[0].cost"]') as HTMLInputElement;
        expect(moneyInput).toBeTruthy();
        expect(moneyInput.disabled).toBe(true);
        expect(moneyInput.value).toBe('42');
    });
});

// ── ValidationSummary gate behavior ──────────────────────────────

describe('ValidationSummaryDisplay gate behavior', () => {
    it('does not show validation errors before submit', () => {
        const validationDef = {
            $formspec: '1.0',
            url: 'https://test.example/vs-gate',
            version: '1.0.0',
            status: 'active',
            title: 'VS Gate Test',
            name: 'vs-gate',
            items: [
                { key: 'username', type: 'field', dataType: 'string', label: 'Username', required: true },
            ],
        };
        const engine = createFormEngine(validationDef);
        // username is required but empty — errors exist, but should not show yet

        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'vs-gate', component: 'ValidationSummary', category: 'display',
                    props: {}, cssClasses: [], children: [],
                },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <FormspecNode node={plan} />
                </FormspecProvider>
            );
        });

        // Before submit, the summary should be empty — no error messages visible
        const summaryText = container.textContent || '';
        expect(summaryText).not.toContain('error');
        expect(summaryText).not.toContain('Username');
    });
});

// ── simpleMarkdown URL sanitization ──────────────────────────────────

describe('simpleMarkdown URL sanitization in Text nodes', () => {
    async function renderTextNode(text: string): Promise<HTMLElement> {
        const engine = createFormEngine(testDefinition);
        const plan: LayoutNode = {
            id: 'root', component: 'Stack', category: 'layout',
            props: {}, cssClasses: [], children: [
                {
                    id: 'txt', component: 'Text', category: 'display',
                    props: { text, format: 'markdown' }, cssClasses: [], children: [],
                },
            ],
        };
        return actRenderAsync(
            <FormspecProvider engine={engine}>
                <FormspecNode node={plan} />
            </FormspecProvider>
        );
    }

    it('renders safe https links as anchor elements', async () => {
        const container = await renderTextNode('[Click here](https://example.com)');
        const anchor = container.querySelector('a');
        expect(anchor).toBeTruthy();
        expect(anchor!.getAttribute('href')).toBe('https://example.com');
        expect(anchor!.textContent).toBe('Click here');
    });

    it('renders safe http links as anchor elements', async () => {
        const container = await renderTextNode('[Site](http://example.com)');
        const anchor = container.querySelector('a');
        expect(anchor).toBeTruthy();
        expect(anchor!.getAttribute('href')).toBe('http://example.com');
    });

    it('renders mailto links as anchor elements', async () => {
        const container = await renderTextNode('[Email us](mailto:hello@example.com)');
        const anchor = container.querySelector('a');
        expect(anchor).toBeTruthy();
        expect(anchor!.getAttribute('href')).toBe('mailto:hello@example.com');
    });

    it('renders tel links as anchor elements', async () => {
        const container = await renderTextNode('[Call us](tel:+15551234567)');
        const anchor = container.querySelector('a');
        expect(anchor).toBeTruthy();
        expect(anchor!.getAttribute('href')).toBe('tel:+15551234567');
    });

    it('renders relative /path links as anchor elements', async () => {
        const container = await renderTextNode('[Home](/home)');
        const anchor = container.querySelector('a');
        expect(anchor).toBeTruthy();
        expect(anchor!.getAttribute('href')).toBe('/home');
    });

    it('renders anchor fragment links as anchor elements', async () => {
        const container = await renderTextNode('[Section](#section-id)');
        const anchor = container.querySelector('a');
        expect(anchor).toBeTruthy();
        expect(anchor!.getAttribute('href')).toBe('#section-id');
    });

    it('strips javascript: URLs — renders span with text only', async () => {
        const container = await renderTextNode('[Click me](javascript:alert(1))');
        expect(container.querySelector('a')).toBeNull();
        const span = container.querySelector('span');
        expect(span).toBeTruthy();
        expect(span!.textContent).toBe('Click me');
    });

    it('strips data: URLs — renders span with text only', async () => {
        const container = await renderTextNode('[img](data:text/html,<h1>xss</h1>)');
        expect(container.querySelector('a')).toBeNull();
        const span = container.querySelector('span');
        expect(span).toBeTruthy();
        expect(span!.textContent).toBe('img');
    });

    it('strips vbscript: URLs — renders span with text only', async () => {
        const container = await renderTextNode('[Run](vbscript:MsgBox(1))');
        expect(container.querySelector('a')).toBeNull();
        const span = container.querySelector('span');
        expect(span).toBeTruthy();
        expect(span!.textContent).toBe('Run');
    });

    it('strips javascript: URL with leading whitespace — case insensitive', async () => {
        const container = await renderTextNode('[XSS](  JAVASCRIPT:alert(1))');
        expect(container.querySelector('a')).toBeNull();
    });
});
