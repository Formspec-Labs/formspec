import { describe, it, expect, beforeEach } from 'vitest';
import type { AppGraphValidationReport } from '@formspec-org/types';
import { findItemAtPath } from '../src/planner-path-utils.js';
import {
    planComponentTree,
    planDefinitionFallback,
    createNodeIdGenerator,
    preparePlanContext,
    ensureActionButton,
    ensureValidationSummary,
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

const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';

function completedUiGraphPolicyReport(sources: readonly string[] = ['host://policy/respondent-ui-policy']): AppGraphValidationReport {
    return {
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
        evidenceResults: sources.map((source, index) => ({
            evidenceSlot: `hostEvidence.uiGraphPolicies[${index}]`,
            schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
            source,
            status: 'completed',
            ok: true,
            diagnostics: [],
        })),
        diagnostics: [],
        phases: [
            { phase: 'schema', status: 'completed' },
            { phase: 'cross-artifact', status: 'completed' },
        ],
    };
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
    it('sizes a text TextInput from theme widgetConfig.rows, defaulting to 3 lines', () => {
        const items = [{ key: 'notes', type: 'field', dataType: 'text', label: 'Notes' }];
        const tree = { component: 'Stack', children: [{ component: 'TextInput', bind: 'notes' }] };
        const plan = (theme?: any) =>
            planComponentTree(tree, makeCtx({ items, theme, findItem: (k) => findItems(items, k) })).children[0];

        expect(plan().props.maxLines).toBe(3);
        expect(plan({ items: { notes: { widgetConfig: { rows: 5 } } } }).props.maxLines).toBe(5);
    });

    it('carries widgetConfig.width to props for TextInput, NumberInput, MoneyInput, DatePicker, and Select (theme §4.2 Width Stops)', () => {
        // Component Document authored forms (Studio output, most e2e fixtures) go through this planner,
        // not planDefinitionFallback — the carry must hold on both paths or Studio-authored width is dead.
        const items = [{ key: 'zip', type: 'field', dataType: 'string', label: 'ZIP' }];
        const plan = (component: string) =>
            planComponentTree(
                { component: 'Stack', children: [{ component, bind: 'zip' }] },
                makeCtx({
                    items,
                    theme: { items: { zip: { widgetConfig: { width: 'sm' } } } },
                    findItem: (k) => findItems(items, k),
                }),
            ).children[0];

        for (const component of ['TextInput', 'NumberInput', 'MoneyInput', 'DatePicker', 'Select']) {
            expect(plan(component).props.width).toBe('sm');
        }
    });

    it('plans a display component bound to a display Item as that Item (label text, path link, no value bind)', () => {
        const items = [
            {
                key: 'section',
                type: 'group',
                label: 'Section',
                children: [{ key: 'notice', type: 'display', label: 'Week of {{$week}}' }],
            },
        ];
        const tree = {
            component: 'Stack',
            children: [
                {
                    component: 'Stack',
                    bind: 'section',
                    children: [{ component: 'Text', bind: 'notice', text: 'Ignored when bind is present' }],
                },
            ],
        };
        const ctx = makeCtx({ items, findItem: (k) => findItemAtPath(items as any, k) });

        const text = planComponentTree(tree, ctx).children[0].children[0];
        expect(text.category).toBe('display');
        expect(text.bindPath).toBe('section.notice');
        expect(text.props.bind).toBeUndefined();
        expect(text.props.text).toBe('Week of {{$week}}');
    });

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

    it('preserves canonical Need anchors from Component nodes and bound Definition Items', () => {
        const tree = {
            component: 'Stack',
            'x-generation': { anchors: ['need:layout@1'] },
            children: [{
                component: 'TextInput',
                bind: 'name',
                'x-generation': { anchors: ['need:control@1'] },
            }],
        };
        const items = [{
            key: 'name',
            type: 'field',
            dataType: 'string',
            label: 'Name',
            'x-generation': { anchors: ['need:identity@2'] },
        }];

        const node = planComponentTree(
            tree,
            makeCtx({ items, findItem: (key) => findItems(items, key) }),
        );

        expect(node.needAnchors).toEqual(['need:layout@1']);
        expect(node.children[0].needAnchors).toEqual([
            'need:control@1',
            'need:identity@2',
        ]);
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
            component: 'Grid',
            columns: ['3fr', '1fr'],
            responsive: { sm: { columns: ['1fr'] } },
        };
        const ctx = makeCtx({ activeBreakpoint: 'sm' });
        const node = planComponentTree(tree, ctx);
        expect(node.props.columns).toEqual(['1fr']);
    });

    it('resolves component responsive overrides against theme breakpoint names', () => {
        const tree = {
            component: 'Grid',
            columns: ['3fr', '1fr'],
            gap: '8px',
            responsive: {
                compact: { gap: '12px' },
                tablet: { columns: ['1fr'] },
            },
        };
        const ctx = makeCtx({
            activeBreakpoint: 'tablet',
            theme: { breakpoints: { compact: 480, tablet: 768 } },
        });
        const node = planComponentTree(tree, ctx);
        expect(node.props.columns).toEqual(['1fr']);
        expect(node.props.gap).toBe('12px');
    });

    it('projects graph-wide Component node identity when graph context is supplied', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
            children: [
                { component: 'ActionButton', id: 'submitButton', nodeId: 'submit', actionRef: 'submit-review' },
            ],
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({ componentGraph }));

        expect(node.componentGraphIdentity).toEqual({
            component: componentGraph.component,
            surface: componentGraph.surface,
            route: 'review',
            nodePath: '/reviewLayout',
            nodeId: 'reviewLayout',
        });
        expect(node.children[0].componentGraphIdentity).toEqual({
            component: componentGraph.component,
            surface: componentGraph.surface,
            route: 'review',
            nodePath: '/reviewLayout/submit',
            id: 'submitButton',
            nodeId: 'submit',
        });
    });

    it('projects matching UI Graph Policy route metadata from host evidence onto the route root only', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
            children: [
                { component: 'TextInput', nodeId: 'nameField', bind: 'name' },
            ],
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: completedUiGraphPolicyReport(),
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                            version: '1.0.0',
                        },
                        routePolicies: [{
                            routeId: 'review',
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
                                    url: 'https://example.gov/forms/intake/internal-notes',
                                    version: '1.0.0',
                                }],
                            },
                        }],
                    },
                }],
            },
        }));

        expect(node.uiGraphRoutePolicy).toEqual({
            schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
            source: 'host://policy/respondent-ui-policy',
            targetSurface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            routeId: 'review',
            a11y: {
                landmark: 'main',
                keyboardNavigation: true,
            },
            responsive: {
                minColumns: 1,
                collapseOrder: ['summary', 'details'],
            },
        });
        expect(node.uiGraphRoutePolicy).not.toHaveProperty('definitionVisibility');
        expect(node.children[0].uiGraphRoutePolicy).toBeUndefined();
    });

    it('projects region landmarkLabel through UI Graph Policy route metadata', () => {
        const tree = { component: 'Stack', nodeId: 'reviewLayout' };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: completedUiGraphPolicyReport(),
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                            version: '1.0.0',
                        },
                        routePolicies: [{
                            routeId: 'review',
                            a11y: {
                                landmark: 'region',
                                landmarkLabel: 'Application review',
                            },
                        }],
                    },
                }],
            },
        }));

        expect(node.uiGraphRoutePolicy?.a11y).toEqual({
            landmark: 'region',
            landmarkLabel: 'Application review',
        });
    });

    it('marks route landmark suppressed when host reserves the same landmark', () => {
        const tree = { component: 'Stack', nodeId: 'reviewLayout' };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: completedUiGraphPolicyReport(),
                hostLandmarks: { reserved: ['main'] },
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                            version: '1.0.0',
                        },
                        routePolicies: [{
                            routeId: 'review',
                            a11y: { landmark: 'main' },
                        }],
                    },
                }],
            },
        }));

        expect(node.uiGraphRoutePolicy?.a11y).toEqual({
            landmark: 'main',
            landmarkSuppressed: true,
        });
    });

    it('does not project UI Graph Policy route metadata for a different surface or route', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: completedUiGraphPolicyReport([
                    'host://policy/admin-ui-policy',
                    'host://policy/respondent-ui-policy',
                ]),
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/admin-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/admin',
                        },
                        routePolicies: [{
                            routeId: 'review',
                            a11y: { landmark: 'main' },
                        }],
                    },
                }, {
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                        },
                        routePolicies: [{
                            routeId: 'submit',
                            a11y: { landmark: 'main' },
                        }],
                    },
                }],
            },
        }));

        expect(node.uiGraphRoutePolicy).toBeUndefined();
    });

    it('requires completed AppGraph validation before projecting UI Graph Policy route metadata', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                            version: '1.0.0',
                        },
                        routePolicies: [{
                            routeId: 'review',
                            a11y: { landmark: 'main' },
                        }],
                    },
                }],
            },
        }));

        expect(node.uiGraphRoutePolicy).toBeUndefined();
    });

    it('requires AppGraph validation evidence to match the host evidence source', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: completedUiGraphPolicyReport(['host://policy/other']),
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                            version: '1.0.0',
                        },
                        routePolicies: [{
                            routeId: 'review',
                            a11y: { landmark: 'main' },
                        }],
                    },
                }],
            },
        }));

        expect(node.uiGraphRoutePolicy).toBeUndefined();
    });

    it('does not revalidate UI Graph Policy target Surface version after completed AppGraph validation', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '2.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: completedUiGraphPolicyReport(),
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                            version: '>=1.0.0',
                        },
                        routePolicies: [{
                            routeId: 'review',
                            a11y: { landmark: 'main' },
                        }],
                    },
                }],
            },
        }));

        expect(node.uiGraphRoutePolicy).toEqual({
            schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
            source: 'host://policy/respondent-ui-policy',
            targetSurface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '>=1.0.0',
            },
            routeId: 'review',
            a11y: { landmark: 'main' },
        });
    });

    it('fails closed for malformed UI Graph Policy host evidence', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: completedUiGraphPolicyReport(['host://policy/malformed']),
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/malformed',
                    document: null,
                } as any],
            },
        }));

        expect(node.uiGraphRoutePolicy).toBeUndefined();
    });

    it('fails closed for malformed AppGraph validation report phases', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const malformedReport = {
            ...completedUiGraphPolicyReport(),
            phases: [null],
        } as any;
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: malformedReport,
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                            version: '1.0.0',
                        },
                        routePolicies: [{
                            routeId: 'review',
                            a11y: { landmark: 'main' },
                        }],
                    },
                }],
            },
        }));

        expect(node.uiGraphRoutePolicy).toBeUndefined();
    });

    it('fails closed for conflicting duplicate AppGraph validation report phases', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const conflictingReport = {
            ...completedUiGraphPolicyReport(),
            phases: [
                { phase: 'schema', status: 'completed' },
                { phase: 'schema', status: 'skipped', reason: 'schema-errors' },
                { phase: 'cross-artifact', status: 'completed' },
            ],
        } as any;
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: conflictingReport,
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                            version: '1.0.0',
                        },
                        routePolicies: [{
                            routeId: 'review',
                            a11y: { landmark: 'main' },
                        }],
                    },
                }],
            },
        }));

        expect(node.uiGraphRoutePolicy).toBeUndefined();
    });

    it('fails closed for duplicate AppGraph validation evidence slots', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const baseReport = completedUiGraphPolicyReport();
        const duplicateReport = {
            ...baseReport,
            evidenceResults: [
                ...baseReport.evidenceResults,
                {
                    ...baseReport.evidenceResults[0],
                    source: 'host://policy/duplicate',
                },
            ],
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: duplicateReport,
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                            version: '1.0.0',
                        },
                        routePolicies: [{
                            routeId: 'review',
                            a11y: { landmark: 'main' },
                        }],
                    },
                }],
            },
        }));

        expect(node.uiGraphRoutePolicy).toBeUndefined();
    });

    it('fails closed for malformed UI Graph Policy route policy records', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: completedUiGraphPolicyReport(),
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                            version: '1.0.0',
                        },
                        routePolicies: [null],
                    },
                } as any],
            },
        }));

        expect(node.uiGraphRoutePolicy).toBeUndefined();
    });

    it('fails closed for mixed valid and malformed UI Graph Policy route policy records', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: completedUiGraphPolicyReport(),
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                            version: '1.0.0',
                        },
                        routePolicies: [{
                            routeId: 'review',
                            a11y: { landmark: 'main' },
                        }, null],
                    },
                } as any],
            },
        }));

        expect(node.uiGraphRoutePolicy).toBeUndefined();
    });

    it('fails closed for malformed UI Graph Policy route optional payloads', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };

        for (const routePolicy of [
            { routeId: 'review', a11y: false },
            { routeId: 'review', responsive: false },
            { routeId: 'review', a11y: { landmark: 'banner' } },
            { routeId: 'review', a11y: { keyboardNavigation: 'true' } },
            { routeId: 'review', responsive: { minColumns: '1' } },
            { routeId: 'review', responsive: { collapseOrder: ['summary', 1] } },
        ]) {
            const node = planComponentTree(tree, makeCtx({
                componentGraph,
                hostEvidence: {
                    appGraphReport: completedUiGraphPolicyReport(),
                    uiGraphPolicies: [{
                        schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                        source: 'host://policy/respondent-ui-policy',
                        document: {
                            $formspecUiGraphPolicy: '0.1',
                            version: '1.0.0',
                            targetSurface: {
                                url: 'https://example.gov/apps/intake/surfaces/respondent',
                                version: '1.0.0',
                            },
                            routePolicies: [routePolicy],
                        },
                    } as any],
                },
            }));

            expect(node.uiGraphRoutePolicy).toBeUndefined();
        }
    });

    it('projects UI Graph Policy route metadata for a route root even when page wrapping is disabled', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: completedUiGraphPolicyReport(),
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                        },
                        routePolicies: [{
                            routeId: 'review',
                            a11y: { landmark: 'main' },
                        }],
                    },
                }],
            },
        }), '', undefined, false);

        expect(node.uiGraphRoutePolicy).toEqual({
            schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
            source: 'host://policy/respondent-ui-policy',
            targetSurface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
            },
            routeId: 'review',
            a11y: { landmark: 'main' },
        });
    });

    it('fails closed instead of projecting duplicate matching UI Graph Policy route evidence', () => {
        const tree = {
            component: 'Stack',
            nodeId: 'reviewLayout',
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const policyDocument = {
            $formspecUiGraphPolicy: '0.1' as const,
            version: '1.0.0',
            targetSurface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
            },
            routePolicies: [{
                routeId: 'review',
                a11y: { landmark: 'main' as const },
            }],
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            hostEvidence: {
                appGraphReport: completedUiGraphPolicyReport([
                    'host://policy/respondent-ui-policy-a',
                    'host://policy/respondent-ui-policy-b',
                ]),
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy-a',
                    document: policyDocument,
                }, {
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy-b',
                    document: policyDocument,
                }],
            },
        }));

        expect(node.uiGraphRoutePolicy).toBeUndefined();
    });

    it('does not project graph identity onto expanded custom component templates', () => {
        const tree = {
            component: 'ContactField',
            nodeId: 'contactInvocation',
            params: { field: 'contactName' },
        };
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            componentGraph,
            componentDocument: {
                components: {
                    ContactField: {
                        params: ['field'],
                        tree: {
                            component: 'Stack',
                            nodeId: 'templateRoot',
                            children: [
                                { component: 'TextInput', nodeId: 'templateField', bind: '{field}' },
                            ],
                        },
                    },
                },
            },
        }));

        expect(node.component).toBe('Stack');
        expect(node.componentGraphIdentity).toBeUndefined();
        expect(node.children[0].componentGraphIdentity).toBeUndefined();
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

    it('keeps explicit component Section nodes ahead of theme.pages', () => {
        const items = [
            { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
            { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
        ];
        const tree = {
            component: 'Stack',
            children: [
                {
                    component: 'Section',
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
        expect(node.children[0]?.component).toBe('Section');
        expect(node.children[0]?.props.title).toBe('Component Page');
        expect(node.children[0]?.children[0]?.bindPath).toBe('name');
    });

    it('uses theme.pages when the component tree has no explicit Section nodes', () => {
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
        expect(node.children[0]?.component).toBe('Section');
        expect(node.children[0]?.props.id).toBe('theme-org');
        expect(node.children[1]?.bindPath).toBe('email');
    });

    it('does not project UI Graph Policy route metadata onto theme page internal fragments', () => {
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
        const componentGraph = {
            component: {
                handle: 'reviewRoute',
                url: 'https://example.gov/apps/intake/components/review-route',
                version: '1.0.0',
            },
            surface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        const node = planComponentTree(tree, makeCtx({
            items,
            componentDocument: { tree },
            componentGraph,
            theme: {
                pages: [{
                    id: 'details',
                    title: 'Details',
                    regions: [
                        { key: 'projectName', span: 7 },
                        { key: 'amount', span: 5 },
                    ],
                }],
            },
            hostEvidence: {
                appGraphReport: completedUiGraphPolicyReport(),
                uiGraphPolicies: [{
                    schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                    source: 'host://policy/respondent-ui-policy',
                    document: {
                        $formspecUiGraphPolicy: '0.1',
                        version: '1.0.0',
                        targetSurface: {
                            url: 'https://example.gov/apps/intake/surfaces/respondent',
                        },
                        routePolicies: [{
                            routeId: 'review',
                            a11y: { landmark: 'main' },
                        }],
                    },
                }],
            },
            findItem: (k) => findItemByPath(items, k),
        }));

        expect(node.uiGraphRoutePolicy).toEqual({
            schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
            source: 'host://policy/respondent-ui-policy',
            targetSurface: {
                url: 'https://example.gov/apps/intake/surfaces/respondent',
            },
            routeId: 'review',
            a11y: { landmark: 'main' },
        });
        const grid = node.children[0].children[0];
        expect(grid.children[0].uiGraphRoutePolicy).toBeUndefined();
        expect(grid.children[0].children[0].uiGraphRoutePolicy).toBeUndefined();
        expect(grid.children[1].uiGraphRoutePolicy).toBeUndefined();
        expect(grid.children[1].children[0].uiGraphRoutePolicy).toBeUndefined();
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

    it('translates Grid child layout placement into renderer-visible style', () => {
        const items = [
            { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
        ];
        const tree = {
            component: 'Grid',
            columns: 12,
            children: [
                {
                    component: 'TextInput',
                    bind: 'name',
                    layout: { grid: { span: 4, start: 2, rowSpan: 2, rowStart: 3 } },
                },
            ],
        };
        const ctx = makeCtx({
            items,
            findItem: (key) => findItems(items, key),
        });

        const node = planComponentTree(tree, ctx);

        expect(node.children[0].style).toMatchObject({
            gridColumn: '2 / span 4',
            gridRow: '3 / span 2',
        });
    });

    it('resolves token references inside Grid column tracks', () => {
        const tree = {
            component: 'Grid',
            columns: ['$token.layout.sidebar', 1],
            children: [],
        };
        const ctx = makeCtx({
            componentDocument: {
                $formspecComponent: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'urn:test' },
                tree,
                tokens: { 'layout.sidebar': '16rem' },
            },
        });

        const node = planComponentTree(tree, ctx);

        expect(node.props.columns).toEqual(['16rem', 1]);
    });

    it('leaves pages as direct Stack children in wizard mode (no Wizard wrapper)', () => {
        // Page units are direct Section children of the root Stack; the renderer
        // applies navigation behavior based on pageMode.
        const items = [
            {
                key: 'basics',
                type: 'group',
                label: 'Basics',
                children: [
                    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                ],
            },
            {
                key: 'details',
                type: 'group',
                label: 'Details',
                children: [
                    { key: 'desc', type: 'field', dataType: 'text', label: 'Description' },
                ],
            },
            {
                key: 'review',
                type: 'group',
                label: 'Review',
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
                    children: [{ component: 'TextInput', bind: 'desc', maxLines: 3 }],
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

        // Root is a Stack with Section children directly
        expect(node.component).toBe('Stack');
        const pages = node.children.filter(c => c.component === 'Section');
        expect(pages).toHaveLength(3);
        expect(pages.every(c => c.component === 'Section')).toBe(true);
    });

    it('wraps a root Section page unit for tabs mode', () => {
        const items = [
            { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
        ];
        const tree = {
            component: 'Section',
            id: 'root-page',
            title: 'Root Page',
            children: [{ component: 'TextInput', bind: 'name' }],
        };
        const ctx = makeCtx({
            items,
            formPresentation: { pageMode: 'tabs' },
            componentDocument: { tree },
            findItem: (key) => findItems(items, key),
        });

        const node = planComponentTree(tree, ctx);

        expect(node.component).toBe('Stack');
        expect(node.pageMode).toBe('tabs');
        expect(node.children).toHaveLength(1);
        expect(node.children[0].component).toBe('Section');
        expect(node.children[0].props.title).toBe('Root Page');
        expect(node.children[0].children[0].bindPath).toBe('name');
    });

    it('strips group title from Stack nodes inside generated pages (wizard mode)', () => {
        // When a group is placed on a generated page, the Page already shows
        // the title in its heading. The inner Stack should not duplicate it.
        const items = [
            {
                key: 'basics',
                type: 'group',
                label: 'Basics',
                children: [
                    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                ],
            },
            {
                key: 'details',
                type: 'group',
                label: 'Details',
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
                    children: [{ component: 'TextInput', bind: 'desc', maxLines: 3 }],
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
        const pages = node.children.filter(c => c.component === 'Section');
        expect(pages.length).toBeGreaterThan(0);
        for (const page of pages) {
            expect(page.component).toBe('Section');
            const stackInPage = page.children.find(c => c.component === 'Stack');
            expect(stackInPage).toBeDefined();
            expect(stackInPage!.props.title).toBeUndefined();
        }
    });

    it('wraps generated top-level groups in wizard mode with orphan fields in a final fallback section', () => {
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
        // Page is a direct child of the root Stack (no Wizard wrapper)
        expect(node.children[0].component).toBe('Section');
        expect(node.children[0].props.title).toBe('Page One');
        expect(node.children[0].children[0].component).toBe('Stack');
        expect(node.children[0].children[0].bindPath).toBe('pageOne');
        expect(node.children[0].children[0].children[0].component).toBe('RadioGroup');
        expect(node.children[0].children[0].children[0].bindPath).toBe('pageOne.priority');
        expect(node.children[1].component).toBe('Section');
        expect(node.children[1].props.title).toBe('Additional Items');
        expect(node.children[1].children[0].component).toBe('TextInput');
        expect(node.children[1].children[0].bindPath).toBe('intro');
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
                        presentation: { widgetHint: 'RadioGroup' },
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
    it('sizes a text field textarea from theme widgetConfig.rows, defaulting to 3 lines', () => {
        const items = [{ key: 'notes', type: 'field', dataType: 'text', label: 'Notes' }];
        const plan = (theme?: any) =>
            planDefinitionFallback(items, makeCtx({ items, theme, findItem: (k) => findItems(items, k) }))[0];

        expect(plan().props.maxLines).toBe(3);
        expect(plan({ items: { notes: { widgetConfig: { rows: 5 } } } }).props.maxLines).toBe(5);
    });

    it('carries widgetConfig.width to props for TextInput, NumberInput, MoneyInput, DatePicker, and Select (theme §4.2 Width Stops)', () => {
        const items = [{ key: 'zip', type: 'field', dataType: 'string', label: 'ZIP' }];
        const plan = (widget: string) =>
            planDefinitionFallback(items, makeCtx({
                items,
                theme: { items: { zip: { widget, widgetConfig: { width: 'sm' } } } },
                findItem: (k) => findItems(items, k),
            }))[0];

        for (const widget of ['TextInput', 'NumberInput', 'MoneyInput', 'DatePicker', 'Select']) {
            expect(plan(widget).props.width).toBe('sm');
        }
    });

    it('does not carry widgetConfig.width onto a widget outside the width-stop set', () => {
        const items = [{ key: 'agree', type: 'field', dataType: 'boolean', label: 'Agree' }];
        const node = planDefinitionFallback(items, makeCtx({
            items,
            theme: { items: { agree: { widget: 'Toggle', widgetConfig: { width: 'sm' } } } },
            findItem: (k) => findItems(items, k),
        }))[0];
        expect(node.props.width).toBeUndefined();
    });

    // Theme `items`/`selectors` apply to display Items too, and adapters ship display widgets.
    it('honors a theme widget on a display Item, carrying its widgetConfig into props', () => {
        const items = [{ key: 'weekNotice', type: 'display', label: 'Certify for the week of {{$week}}' }];
        const theme = {
            items: { weekNotice: { widget: 'Alert', widgetConfig: { severity: 'info', title: 'This week' } } },
        };
        const node = planDefinitionFallback(items, makeCtx({ items, theme, findItem: (k) => findItems(items, k) }))[0];

        expect(node.component).toBe('Alert');
        expect(node.category).toBe('display');
        expect(node.props.severity).toBe('info');
        expect(node.props.title).toBe('This week');
        expect(node.props.text).toBe('Certify for the week of {{$week}}');
    });

    it('plans an unthemed display Item as Text', () => {
        const items = [{ key: 'weekNotice', type: 'display', label: 'Certify for the week' }];
        const node = planDefinitionFallback(items, makeCtx({ items, findItem: (k) => findItems(items, k) }))[0];

        expect(node.component).toBe('Text');
        expect(node.props.text).toBe('Certify for the week');
    });

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

    it('preserves canonical Need anchors for fallback fields and displays', () => {
        const items = [{
            key: 'name',
            type: 'field',
            dataType: 'string',
            label: 'Full Name',
            'x-generation': { anchors: ['need:identity@1'] },
        }, {
            key: 'help',
            type: 'display',
            label: 'Use your public name.',
            'x-generation': { anchors: ['need:identity@1'] },
        }];

        const nodes = planDefinitionFallback(
            items,
            makeCtx({ items, findItem: (key) => findItems(items, key) }),
        );

        expect(nodes.map((node) => node.needAnchors)).toEqual([
            ['need:identity@1'],
            ['need:identity@1'],
        ]);
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
            ['money', 'MoneyInput'],
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
        expect(nodes[0].props).not.toHaveProperty('allowAdd');
        expect(nodes[0].props).not.toHaveProperty('allowRemove');
    });

    it('passes theme widgetConfig allowAdd/allowRemove on a repeatable group to its repeat template (theme §4.2)', () => {
        const items = [
            {
                key: 'employersOnRecord', type: 'group', label: 'Employer', repeatable: true,
                children: [{ key: 'payerName', type: 'field', dataType: 'string', label: 'Payer' }],
            },
            {
                key: 'dependents', type: 'group', label: 'Dependent', repeatable: true,
                children: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
            },
        ];
        const theme = {
            selectors: [{ match: { type: 'group' }, apply: { widgetConfig: { allowRemove: false } } }],
            items: { employersOnRecord: { widgetConfig: { allowAdd: false } } },
        } as PlanContext['theme'];
        const nodes = planDefinitionFallback(items, makeCtx({ items, findItem: (k) => findItems(items, k), theme }));
        expect(nodes[0].props).toMatchObject({ allowAdd: false, allowRemove: false });
        expect(nodes[1].props).toMatchObject({ allowRemove: false });
        expect(nodes[1].props).not.toHaveProperty('allowAdd');
    });

    it('keeps widgetConfig allowAdd/allowRemove whatever widget and fallback chain the theme names (theme §4.3)', () => {
        const items = [{
            key: 'employersOnRecord', type: 'group', label: 'Employer', repeatable: true,
            children: [{ key: 'payerName', type: 'field', dataType: 'string', label: 'Payer' }],
        }];
        const theme = {
            items: {
                employersOnRecord: {
                    widget: 'x-employer-cards', fallback: ['DataTable', 'Accordion'],
                    widgetConfig: { allowAdd: false, allowRemove: false },
                },
            },
        } as PlanContext['theme'];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k), theme, isComponentAvailable: (type) => type === 'Stack' });
        const [node] = planDefinitionFallback(items, ctx);
        expect(node.isRepeatTemplate).toBe(true);
        expect(node.props).toMatchObject({ allowAdd: false, allowRemove: false });
    });

    it('records a theme RepeatCards widget as the repeat presentation (theme §4.2)', () => {
        const items = [{
            key: 'jobs', type: 'group', label: 'Job', repeatable: true,
            children: [{ key: 'payerName', type: 'field', dataType: 'string', label: 'Payer' }],
        }];
        const theme = { items: { jobs: { widget: 'RepeatCards' } } } as PlanContext['theme'];
        // The adapter owns the card render, not the component registry: availability is the renderer's call.
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k), theme, isComponentAvailable: () => false });
        const [node] = planDefinitionFallback(items, ctx);

        expect(node.isRepeatTemplate).toBe(true);
        expect(node.repeatPresentation).toBe('RepeatCards');
        // The group is still a Stack-shaped scope: the presentation is chrome, not a different tree.
        expect(node.component).toBe('Stack');
        expect(node.children).toHaveLength(1);
    });

    it('ignores a theme widget on a repeat group that is not a repeat presentation', () => {
        const items = [{
            key: 'jobs', type: 'group', label: 'Job', repeatable: true,
            children: [{ key: 'payerName', type: 'field', dataType: 'string', label: 'Payer' }],
        }];
        const theme = { items: { jobs: { widget: 'MoneyInput' } } } as PlanContext['theme'];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k), theme, isComponentAvailable: () => true });
        const [node] = planDefinitionFallback(items, ctx);

        expect(node.repeatPresentation).toBeUndefined();
    });

    it('leaves a non-repeatable group without a repeat presentation', () => {
        const items = [{
            key: 'address', type: 'group', label: 'Address',
            children: [{ key: 'city', type: 'field', dataType: 'string', label: 'City' }],
        }];
        const theme = { items: { address: { widget: 'RepeatCards' } } } as PlanContext['theme'];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k), theme, isComponentAvailable: () => true });
        const [node] = planDefinitionFallback(items, ctx);

        expect(node.repeatPresentation).toBeUndefined();
    });

    it('plans a Hidden field to the Hidden widget so the engine keeps the value (theme §4.2)', () => {
        const items = [{ key: 'payerName', type: 'field', dataType: 'string', label: 'Payer' }];
        const theme = { items: { payerName: { widget: 'Hidden' } } } as PlanContext['theme'];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k), theme, isComponentAvailable: () => true });
        const [node] = planDefinitionFallback(items, ctx);

        expect(node.component).toBe('Hidden');
        expect(node.category).toBe('field');
        expect(node.bindPath).toBe('payerName');
    });

    it('plans a grid-flow group as a Grid of its children, so spans have a grid to sit in', () => {
        const items = [{
            key: 'hoursWorked',
            type: 'group',
            label: 'Hours worked',
            presentation: { layout: { flow: 'grid', columns: 12 } },
            children: [
                { key: 'hours', type: 'field', dataType: 'integer', label: 'Hours', presentation: { layout: { grid: { span: 6 } } } },
                { key: 'minutes', type: 'field', dataType: 'integer', label: 'Minutes', presentation: { layout: { grid: { span: 6 } } } },
            ],
        }];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });
        const [group] = planDefinitionFallback(items, ctx);

        expect(group.children).toHaveLength(1);
        const grid = group.children[0];
        expect(grid.component).toBe('Grid');
        expect(grid.props.columns).toBe(12);
        expect(grid.children.map((c: any) => c.props.bind)).toEqual(['hours', 'minutes']);
        expect(grid.children.map((c: any) => c.style?.gridColumn)).toEqual(['span 6', 'span 6']);
        // The group keeps its own identity: the grid is the arrangement inside it, not a replacement.
        expect(group.scopeChange).toBe(true);
        expect(group.props.bind).toBe('hoursWorked');
    });

    it('gives a child with no span the whole row of a 12-column canvas', () => {
        const items = [{
            key: 'jobs',
            type: 'group',
            label: 'Job',
            presentation: { layout: { flow: 'grid', columns: 12 } },
            children: [
                { key: 'employer', type: 'field', dataType: 'string', label: 'Employer' },
                { key: 'city', type: 'field', dataType: 'string', label: 'City', presentation: { layout: { grid: { span: 6 } } } },
                { key: 'state', type: 'field', dataType: 'string', label: 'State', presentation: { layout: { grid: { span: 4 } } } },
                { key: 'zip', type: 'field', dataType: 'string', label: 'ZIP', presentation: { layout: { grid: { span: 2 } } } },
            ],
        }];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });
        const [group] = planDefinitionFallback(items, ctx);

        // Unspanned: a full-width row of its own. Spanned: 6 + 4 + 2 share the next row.
        expect(group.children[0].children.map((c: any) => c.style?.gridColumn))
            .toEqual(['span 12', 'span 6', 'span 4', 'span 2']);
    });

    it('leaves an equal-column grid to arrange its unspanned children itself', () => {
        const items = [{
            key: 'pair', type: 'group', label: 'Pair', presentation: { layout: { flow: 'grid', columns: 2 } },
            children: [
                { key: 'a', type: 'field', dataType: 'string', label: 'A' },
                { key: 'b', type: 'field', dataType: 'string', label: 'B' },
            ],
        }];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });
        const [group] = planDefinitionFallback(items, ctx);

        expect(group.children[0].props.columns).toBe(2);
        expect(group.children[0].children.map((c: any) => c.style?.gridColumn)).toEqual([undefined, undefined]);
    });

    it('defaults a grid-flow group to the 12-column grid its children were authored against', () => {
        const items = [{
            key: 'address', type: 'group', label: 'Address', presentation: { layout: { flow: 'grid' } },
            children: [{ key: 'city', type: 'field', dataType: 'string', label: 'City' }],
        }];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });
        const [group] = planDefinitionFallback(items, ctx);

        expect(group.children[0].component).toBe('Grid');
        expect(group.children[0].props.columns).toBe(12);
    });

    it("leaves a stack-flow group's children where they are", () => {
        const items = [{
            key: 'address', type: 'group', label: 'Address',
            children: [{ key: 'city', type: 'field', dataType: 'string', label: 'City' }],
        }];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });
        const [group] = planDefinitionFallback(items, ctx);

        expect(group.children.map((c: any) => c.component)).toEqual(['TextInput']);
    });

    it("carries a group's resolved labelPosition so a hidden legend stays in the accessible markup", () => {
        const items = [{
            key: 'workWeek', type: 'group', label: 'Work this week',
            children: [{ key: 'worked', type: 'field', dataType: 'boolean', label: 'Worked' }],
        }];
        const theme = { items: { workWeek: { labelPosition: 'hidden' } } } as PlanContext['theme'];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k), theme });
        const [group] = planDefinitionFallback(items, ctx);

        expect(group.labelPosition).toBe('hidden');
        expect(group.props.title).toBe('Work this week');
    });

    it('keeps an authored empty group label empty instead of falling back to the key', () => {
        const items = [{
            key: 'workWeek', type: 'group', label: '',
            children: [{ key: 'worked', type: 'field', dataType: 'boolean', label: 'Worked' }],
        }];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });
        const [group] = planDefinitionFallback(items, ctx);

        expect(group.props.title).toBe('');
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

    it('plans a Divider display item with its label as the Divider `label` prop (component §5.15)', () => {
        const items = [
            { key: 'rule', type: 'display', label: 'Section break', presentation: { widgetHint: 'Divider' } },
        ];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });

        const [node] = planDefinitionFallback(items, ctx);
        expect(node.component).toBe('Divider');
        expect(node.props.label).toBe('Section break');
        expect(node.props.text).toBeUndefined();
    });

    it('links display items to their Definition path so renderers resolve Locale, {{}} and relevance', () => {
        const items = [
            { key: 'info', type: 'display', label: 'Week of {{$week}}' },
            {
                key: 'rows',
                type: 'group',
                repeatable: true,
                label: 'Rows',
                children: [{ key: 'rowNote', type: 'display', label: 'Row {{@index}}' }],
            },
        ];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });

        const nodes = planDefinitionFallback(items, ctx);
        expect(nodes[0].bindPath).toBe('info');
        expect(nodes[1].children[0].bindPath).toBe('rows[0].rowNote');
    });

    it('does not read a non-schema Item `relevant`; relevance comes from Binds', () => {
        const items = [
            { key: 'info', type: 'display', label: 'Info', relevant: '$show = true' },
        ];
        const ctx = makeCtx({ items, findItem: (k) => findItems(items, k) });

        const nodes = planDefinitionFallback(items, ctx);
        expect(nodes[0].when).toBeUndefined();
        expect(nodes[0].whenPrefix).toBeUndefined();
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

        // Pages are direct children (no Wizard wrapper). Unassigned items move to a final fallback section.
        expect(nodes).toHaveLength(3);
        const pages = nodes.filter(n => n.component === 'Section');
        expect(pages).toHaveLength(3);
        expect(pages[0].props.title).toBe('Applicant');
        expect(pages[0].children[0].component).toBe('Grid');
        expect(pages[1].props.title).toBe('Review');
        expect(pages[2].props.title).toBe('Additional Items');
        expect(pages[2].children[0].bindPath).toBe('intro');
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

        // Sections are direct children (no Wizard wrapper). Orphan intro moves to a final fallback section.
        expect(nodes).toHaveLength(4);
        expect(nodes[0].component).toBe('Section');
        expect(nodes[0].props.title).toBe('Applicant Details');
        expect(nodes[0].children).toHaveLength(1);
        expect(nodes[0].children[0].bindPath).toBe('applicant');
        expect(nodes[0].children[0].children[1].component).toBe('Stack');
        expect(nodes[0].children[0].children[1].bindPath).toBe('applicant.address');
        expect(nodes[0].children[0].children[1].children[0].bindPath).toBe('applicant.address.city');
        expect(nodes[1].component).toBe('Section');
        expect(nodes[1].props.title).toBe('Attachments');
        expect(nodes[1].children[0].bindPath).toBe('attachments');
        expect(nodes[2].component).toBe('Section');
        expect(nodes[2].props.title).toBe('Review');
        expect(nodes[2].children[0].bindPath).toBe('review');
        expect(nodes[3].component).toBe('Section');
        expect(nodes[3].props.title).toBe('Additional Items');
        expect(nodes[3].children[0].bindPath).toBe('intro');
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

        // Root should be a Stack with Section children (no Wizard wrapper)
        expect(node.component).toBe('Stack');
        expect(node.category).toBe('layout');

        // Should have Section children directly
        expect(node.children.length).toBeGreaterThan(0);

        // First child should be a theme-defined page
        expect(node.children[0].component).toBe('Section');
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

        // When formPresentation.pageMode is 'wizard', groups become Section children.
        // Find applicantInfo either at top level or inside a Section's children.
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
        expect(nodes[0].component).toBe('Section');
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
        expect(nodes[0].component).toBe('Section');
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

        expect(nodes[0].component).toBe('Section');
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

        expect(nodes[0].component).toBe('Section');
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

    it('finds component nodes by bind in nested layouts (Grid→Stack→Input)', () => {
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

        // Nested layout: Grid wrapping Stacks wrapping inputs —
        // positional parallel walk would fail here
        const tree = {
            component: 'Stack',
            children: [
                {
                    component: 'Grid',
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
        expect(node.children[0].component).toBe('Section');
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
        expect(node.children[0].component).toBe('Section');
        expect(node.children[0].children[0].component).toBe('Grid');
        expect(node.children[0].children[0].children[0].style).toEqual({ gridColumn: 'span 7' });
        expect(node.children[0].children[0].children[0].children[0].component).toBe('TextInput');
        expect(node.children[0].children[0].children[1].children[0].component).toBe('MoneyInput');
    });
});

// ── ensureActionButton ────────────────────────────────────────────────

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

describe('ensureActionButton', () => {
    it('does not invent an ActionButton actionRef when none is configured', () => {
        const root = makeNode('Stack', [makeNode('TextInput')]);
        ensureActionButton(root);
        expect(root.children.some(c => c.component === 'ActionButton')).toBe(false);
    });

    it('uses the caller-provided actionRef when injecting an ActionButton', () => {
        const root = makeNode('Stack', [makeNode('TextInput')]);
        ensureActionButton(root, createNodeIdGenerator(), { actionRef: 'send-application' });
        expect(root.children.at(-1)?.component).toBe('ActionButton');
        expect(root.children.at(-1)?.props?.actionRef).toBe('send-application');
    });

    it('does not duplicate an explicitly authored ActionButton for the same actionRef', () => {
        const authored = makeNode('ActionButton');
        authored.props = { actionRef: 'save-draft' };
        const root = makeNode('Stack', [authored]);
        ensureActionButton(root, createNodeIdGenerator(), { actionRef: 'save-draft' });
        expect(root.children.filter(c => c.component === 'ActionButton')).toHaveLength(1);
        expect(root.children[0]).toBe(authored);
    });

    it('preserves authored ActionButtons while appending other configured actions in call order', () => {
        const authored = makeNode('ActionButton');
        authored.props = { actionRef: 'save-draft', label: { literal: 'Keep my draft' } };
        const root = makeNode('Stack', [makeNode('TextInput'), authored]);
        const nextId = createNodeIdGenerator();

        ensureActionButton(root, nextId, { actionRef: 'save-draft' });
        ensureActionButton(root, nextId, { actionRef: 'review' });
        ensureActionButton(root, nextId, { actionRef: 'publish' });

        expect(root.children
            .filter(c => c.component === 'ActionButton')
            .map(c => c.props?.actionRef))
            .toEqual(['save-draft', 'review', 'publish']);
        expect(authored.props?.label).toEqual({ literal: 'Keep my draft' });
    });

    it('adds configured actions to the final step when the tree contains a Wizard', () => {
        const first = makeNode('Section', [makeNode('TextInput')]);
        const final = makeNode('Section', [makeNode('Select')]);
        const root = makeNode('Stack', [makeNode('Wizard', [first, final])]);
        const nextId = createNodeIdGenerator();

        ensureActionButton(root, nextId, { actionRef: 'save-draft' });
        ensureActionButton(root, nextId, { actionRef: 'review' });
        ensureActionButton(root, nextId, { actionRef: 'publish' });

        expect(first.children.map(c => c.component)).toEqual(['TextInput']);
        expect(final.children.map(c => c.props?.actionRef)).toEqual([
            undefined,
            'save-draft',
            'review',
            'publish',
        ]);
        expect(root.children.some(c => c.component === 'ActionButton')).toBe(false);
    });

    it('adds an ActionButton when Section children are ordinary single-page structure', () => {
        const root = makeNode('Stack', [
            makeNode('Section', [makeNode('TextInput')]),
            makeNode('Section', [makeNode('Select')]),
        ]);
        ensureActionButton(root, createNodeIdGenerator(), { actionRef: 'send-application' });
        expect(root.children.at(-1)?.component).toBe('ActionButton');
    });

    it('adds configured actions to the final Section in wizard page mode', () => {
        const root = makeNode('Stack', [
            makeNode('Section', [makeNode('TextInput')]),
            makeNode('Section', [makeNode('Select')]),
        ]);
        ensureActionButton(root, createNodeIdGenerator(), {
            pageMode: 'wizard',
            actionRef: 'send-application',
        });
        expect(root.children.some(c => c.component === 'ActionButton')).toBe(false);
        expect(root.children[0].children.some(c => c.component === 'ActionButton')).toBe(false);
        expect(root.children[1].children.at(-1)?.props?.actionRef).toBe('send-application');
    });

    it('adds an ActionButton after Section page units in tabs mode', () => {
        const root = makeNode('Stack', [
            makeNode('Section', [makeNode('TextInput')]),
            makeNode('Section', [makeNode('Select')]),
        ]);
        ensureActionButton(root, createNodeIdGenerator(), { pageMode: 'tabs', actionRef: 'send-application' });
        expect(root.children.map(c => c.component)).toEqual(['Section', 'Section', 'ActionButton']);
    });

    it('wraps a root Accordion in Stack so ActionButton is not an accordion section', () => {
        const root = makeNode('Accordion', [makeNode('Text'), makeNode('Text'), makeNode('Text')]);
        ensureActionButton(root, createNodeIdGenerator(), { actionRef: 'send-application' });
        expect(root.component).toBe('Stack');
        expect(root.children).toHaveLength(2);
        expect(root.children[0].component).toBe('Accordion');
        expect(root.children[0].children).toHaveLength(3);
        expect(root.children[1].component).toBe('ActionButton');
    });
});

describe('ensureValidationSummary', () => {
    it('opens the plan with a submit-sourced summary that links to each field', () => {
        const root = makeNode('Stack', [makeNode('TextInput'), makeNode('ActionButton')]);
        ensureValidationSummary(root, createNodeIdGenerator());
        expect(root.children[0].component).toBe('ValidationSummary');
        expect(root.children[0].props).toEqual({ source: 'submit', showFieldErrors: true, jumpLinks: true });
        expect(root.children.map(c => c.component)).toEqual(['ValidationSummary', 'TextInput', 'ActionButton']);
    });

    it('leaves a plan alone when the document already places a summary, wherever it sits', () => {
        const authored = makeNode('ValidationSummary');
        const root = makeNode('Stack', [makeNode('Section', [authored]), makeNode('TextInput')]);
        ensureValidationSummary(root, createNodeIdGenerator());
        expect(root.children.map(c => c.component)).toEqual(['Section', 'TextInput']);
    });

    it('wraps a root Accordion in Stack so the summary is not an accordion section', () => {
        const root = makeNode('Accordion', [makeNode('Text'), makeNode('Text')]);
        ensureValidationSummary(root, createNodeIdGenerator());
        expect(root.component).toBe('Stack');
        expect(root.children.map(c => c.component)).toEqual(['ValidationSummary', 'Accordion']);
        expect(root.children[1].children).toHaveLength(2);
    });
});
