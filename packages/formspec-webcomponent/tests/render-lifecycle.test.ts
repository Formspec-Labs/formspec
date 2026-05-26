import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { singleFieldDef, minimalComponentDoc, multiFieldDef } from './helpers/engine-fixtures';

const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';

function completedUiGraphPolicyReport(source = 'host://policy/respondent-ui-policy') {
    return {
        version: '0.1',
        ok: true,
        phases: [
            { phase: 'schema', status: 'completed' },
            { phase: 'cross-artifact', status: 'completed' },
        ],
        evidenceResults: [{
            evidenceSlot: 'hostEvidence.uiGraphPolicies[0]',
            evidenceKind: 'uiGraphPolicy',
            schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
            source,
            status: 'completed',
            ok: true,
        }],
    };
}

/** Standalone Screener Document (spec Appendix A: `routes` → first-match `evaluation`). */
function standaloneGate(opts: {
    items: any[];
    routes: Array<{ condition: string; target: string; label?: string }>;
    binds?: any[];
    title?: string;
}) {
    return {
        $formspecScreener: '1.0',
        url: 'urn:test:gate',
        version: '1.0.0',
        title: opts.title ?? 'Screening',
        items: opts.items,
        ...(opts.binds?.length ? { binds: opts.binds } : {}),
        evaluation: [
            {
                id: 'form-selection',
                strategy: 'first-match',
                routes: opts.routes,
            },
        ],
    };
}

function screenedDefinition() {
    return {
        $formspec: '1.0',
        url: 'urn:test:screened',
        version: '1.0.0',
        title: 'Screened Test',
        items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
    };
}

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

describe('render lifecycle', () => {
    let el: InstanceType<any>;

    beforeEach(() => {
        el = document.createElement('formspec-render');
        document.body.appendChild(el);
    });

    afterEach(() => {
        el.remove();
    });

    it('setting definition creates engine and renders container + fields', () => {
        el.definition = singleFieldDef();
        el.render();
        expect(el.getEngine()).not.toBeNull();
        expect(el.querySelector('.formspec-container')).not.toBeNull();
        expect(el.querySelector('.formspec-field')).not.toBeNull();
    });

    it('renders host-supplied Component graph identity as inert DOM metadata', () => {
        el.componentGraph = {
            component: {
                handle: 'respondent',
                url: 'formspec://components/respondent',
                version: '1.0.0',
            },
            surface: {
                url: 'formspec://surfaces/respondent',
                version: '1.0.0',
            },
            route: 'intake',
        };
        el.componentDocument = {
            $formspecComponent: '1.2',
            version: '1.0.0',
            targetSurfaceRoutes: [{
                surface: { url: 'formspec://surfaces/respondent', version: '1.0.0' },
                route: 'intake',
                slot: 'main',
            }],
            tree: {
                component: 'Stack',
                id: 'root',
                children: [{ component: 'TextInput', bind: 'name', id: 'nameField' }],
            },
        };
        el.definition = singleFieldDef();
        el.render();

        const stack = el.querySelector('.formspec-stack') as HTMLElement;
        const field = el.querySelector('.formspec-field') as HTMLElement;
        expect(stack.dataset.formspecComponentHandle).toBe('respondent');
        expect(stack.dataset.formspecSurfaceUrl).toBe('formspec://surfaces/respondent');
        expect(stack.dataset.formspecRoute).toBe('intake');
        expect(stack.dataset.formspecNodePath).toBe('/root');
        expect(field.dataset.formspecNodePath).toBe('/root/name');
        expect(field.dataset.formspecComponentNodeId).toBe('nameField');
    });

    it('renders host-supplied UI Graph Policy route metadata as inert DOM metadata', () => {
        el.componentGraph = {
            component: {
                handle: 'respondent',
                url: 'formspec://components/respondent',
                version: '1.0.0',
            },
            surface: {
                url: 'formspec://surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        el.hostEvidence = {
            appGraphReport: completedUiGraphPolicyReport(),
            uiGraphPolicies: [{
                schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                source: 'host://policy/respondent-ui-policy',
                document: {
                    $formspecUiGraphPolicy: '0.1',
                    version: '1.0.0',
                    targetSurface: {
                        url: 'formspec://surfaces/respondent',
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
                                url: 'formspec://definitions/internal-notes',
                                version: '1.0.0',
                            }],
                        },
                    }],
                },
            }],
        };
        el.componentDocument = {
            $formspecComponent: '1.2',
            version: '1.0.0',
            targetSurfaceRoutes: [{
                surface: { url: 'formspec://surfaces/respondent', version: '1.0.0' },
                route: 'review',
                slot: 'main',
            }],
            tree: {
                component: 'Stack',
                id: 'root',
                children: [{ component: 'TextInput', bind: 'name', id: 'nameField' }],
            },
        };
        el.definition = singleFieldDef();
        el.render();

        const stack = el.querySelector('.formspec-stack') as HTMLElement;
        const field = el.querySelector('.formspec-field') as HTMLElement;
        expect(stack.dataset.formspecUiPolicySchema).toBe(UI_GRAPH_POLICY_SCHEMA_ID);
        expect(stack.dataset.formspecUiPolicySource).toBe('host://policy/respondent-ui-policy');
        expect(stack.dataset.formspecUiPolicySurfaceUrl).toBe('formspec://surfaces/respondent');
        expect(stack.dataset.formspecUiPolicySurfaceVersion).toBe('1.0.0');
        expect(stack.dataset.formspecUiPolicyRoute).toBe('review');
        expect(stack.dataset.formspecUiPolicyA11yLandmark).toBe('main');
        expect(stack.dataset.formspecUiPolicyKeyboardNavigation).toBe('true');
        expect(stack.dataset.formspecUiPolicyResponsiveMinColumns).toBe('1');
        expect(stack.dataset.formspecUiPolicyResponsiveCollapseOrder).toBe('["summary","details"]');
        expect(stack.dataset.formspecUiPolicyHiddenDefinitionRefs).toBeUndefined();
        expect(field.dataset.formspecUiPolicyRoute).toBeUndefined();
        expect(stack.getAttribute('role')).toBe('main');
        expect(stack.getAttribute('tabindex')).toBeNull();
    });

    it('maps validated region route policy to role and aria-label on layout route root', () => {
        el.componentGraph = {
            component: {
                handle: 'respondent',
                url: 'formspec://components/respondent',
                version: '1.0.0',
            },
            surface: {
                url: 'formspec://surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        el.hostEvidence = {
            appGraphReport: completedUiGraphPolicyReport(),
            uiGraphPolicies: [{
                schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                source: 'host://policy/respondent-ui-policy',
                document: {
                    $formspecUiGraphPolicy: '0.1',
                    version: '1.0.0',
                    targetSurface: {
                        url: 'formspec://surfaces/respondent',
                        version: '1.0.0',
                    },
                    routePolicies: [{
                        routeId: 'review',
                        a11y: {
                            landmark: 'region',
                            landmarkLabel: 'Application review',
                            keyboardNavigation: true,
                        },
                    }],
                },
            }],
        };
        el.componentDocument = {
            $formspecComponent: '1.2',
            version: '1.0.0',
            targetSurfaceRoutes: [{
                surface: { url: 'formspec://surfaces/respondent', version: '1.0.0' },
                route: 'review',
            }],
            tree: {
                component: 'Stack',
                id: 'root',
                children: [{ component: 'TextInput', bind: 'name', id: 'nameField' }],
            },
        };
        el.definition = singleFieldDef();
        el.render();

        const stack = el.querySelector('.formspec-stack') as HTMLElement;
        expect(stack.getAttribute('role')).toBe('region');
        expect(stack.getAttribute('aria-label')).toBe('Application review');
        expect(stack.dataset.formspecUiPolicyKeyboardNavigation).toBe('true');
        expect(stack.getAttribute('tabindex')).toBeNull();
    });

    it('suppresses active route landmark when projection marks host reservation', () => {
        el.componentGraph = {
            component: {
                handle: 'respondent',
                url: 'formspec://components/respondent',
                version: '1.0.0',
            },
            surface: {
                url: 'formspec://surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        el.hostEvidence = {
            appGraphReport: completedUiGraphPolicyReport(),
            hostLandmarks: { reserved: ['main'] },
            uiGraphPolicies: [{
                schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                source: 'host://policy/respondent-ui-policy',
                document: {
                    $formspecUiGraphPolicy: '0.1',
                    version: '1.0.0',
                    targetSurface: {
                        url: 'formspec://surfaces/respondent',
                        version: '1.0.0',
                    },
                    routePolicies: [{
                        routeId: 'review',
                        a11y: { landmark: 'main' },
                    }],
                },
            }],
        };
        el.componentDocument = {
            $formspecComponent: '1.2',
            version: '1.0.0',
            targetSurfaceRoutes: [{
                surface: { url: 'formspec://surfaces/respondent', version: '1.0.0' },
                route: 'review',
            }],
            tree: {
                component: 'Stack',
                id: 'root',
                children: [{ component: 'TextInput', bind: 'name', id: 'nameField' }],
            },
        };
        el.definition = singleFieldDef();
        el.render();

        const stack = el.querySelector('.formspec-stack') as HTMLElement;
        expect(stack.getAttribute('role')).toBeNull();
        expect(stack.dataset.formspecUiPolicyA11yLandmarkSuppressed).toBe('true');
    });

    it('keeps Modal route roots metadata-only even when policy requests main', () => {
        el.componentGraph = {
            component: {
                handle: 'respondent',
                url: 'formspec://components/respondent',
                version: '1.0.0',
            },
            surface: {
                url: 'formspec://surfaces/respondent',
                version: '1.0.0',
            },
            route: 'review',
        };
        el.hostEvidence = {
            appGraphReport: completedUiGraphPolicyReport(),
            uiGraphPolicies: [{
                schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
                source: 'host://policy/respondent-ui-policy',
                document: {
                    $formspecUiGraphPolicy: '0.1',
                    version: '1.0.0',
                    targetSurface: {
                        url: 'formspec://surfaces/respondent',
                        version: '1.0.0',
                    },
                    routePolicies: [{
                        routeId: 'review',
                        a11y: { landmark: 'main' },
                    }],
                },
            }],
        };
        el.componentDocument = {
            $formspecComponent: '1.2',
            version: '1.0.0',
            targetSurfaceRoutes: [{
                surface: { url: 'formspec://surfaces/respondent', version: '1.0.0' },
                route: 'review',
            }],
            tree: {
                component: 'Modal',
                id: 'modal-1',
                props: { title: 'Confirm', triggerLabel: 'Open' },
                children: [],
            },
        };
        el.definition = singleFieldDef();
        el.render();

        const dialog = el.querySelector('dialog.formspec-modal') as HTMLDialogElement;
        expect(dialog).toBeTruthy();
        expect(dialog.getAttribute('role')).toBeNull();
        expect(dialog.dataset.formspecUiPolicyA11yLandmark).toBe('main');
    });

    it('setting definition again re-renders in place (root container preserved)', () => {
        el.definition = singleFieldDef();
        el.render();
        const firstContainer = el.querySelector('.formspec-container');
        expect(firstContainer).not.toBeNull();

        el.definition = multiFieldDef([
            { key: 'a', dataType: 'string' },
            { key: 'b', dataType: 'integer' },
        ]);
        el.render();
        // Root container remains stable; children are refreshed.
        expect(el.querySelector('.formspec-container')).toBe(firstContainer);
        // Two fields now
        expect(el.querySelectorAll('.formspec-field').length).toBe(2);
    });

    it('submit() dispatches formspec-submit event with response payload', async () => {
        el.definition = singleFieldDef();
        el.render();
        el.getEngine().setValue('name', 'Alice');

        const received = new Promise<any>((resolve) => {
            el.addEventListener('formspec-submit', (e: CustomEvent) => resolve(e.detail));
        });

        const detail = el.submit();
        expect(detail).toBeDefined();

        const response = await received;
        expect(response).toBeDefined();
        expect(response.response.data?.name).toBe('Alice');
        expect(response.validationReport).toBeDefined();
    });

    it('submit({ mode: continuous }) emits a live report but gates response completion with on-submit', () => {
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:submit-gate',
            version: '1.0.0',
            title: 'Submit Gate',
            items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
            shapes: [
                {
                    id: 'submitName',
                    target: '#',
                    timing: 'submit',
                    constraint: 'name == "Bob"',
                    message: 'Name must be Bob',
                },
            ],
        };
        el.render();
        el.getEngine().setValue('name', 'Alice');

        const detail = el.submit({ profile: 'live', emitEvent: false });

        expect(detail?.validationReport?.valid).toBe(true);
        expect(detail?.validationReport?.results).toHaveLength(0);
        expect(detail?.response.status).toBe('in-progress');
        expect(detail?.response).not.toHaveProperty('validationResults');
    });

    it('setSubmitPending() toggles state and emits pending-change events', () => {
        const pendingValues: boolean[] = [];
        el.addEventListener('formspec-submit-pending-change', (event: Event) => {
            pendingValues.push(!!(event as CustomEvent).detail?.pending);
        });

        expect(el.isSubmitPending()).toBe(false);
        el.setSubmitPending(true);
        el.setSubmitPending(true);
        expect(el.isSubmitPending()).toBe(true);
        el.setSubmitPending(false);
        expect(el.isSubmitPending()).toBe(false);

        expect(pendingValues).toEqual([true, false]);
    });

    it('resolveValidationTarget() returns field metadata and jumpability', () => {
        el.definition = singleFieldDef();
        el.render();

        const fieldTarget = el.resolveValidationTarget({ path: 'name' });
        expect(fieldTarget.path).toBe('name');
        expect(fieldTarget.label).toBe('Name');
        expect(fieldTarget.formLevel).toBe(false);
        expect(fieldTarget.jumpable).toBe(true);

        const formTarget = el.resolveValidationTarget('#');
        expect(formTarget.formLevel).toBe(true);
        expect(formTarget.jumpable).toBe(false);
    });

    it('screener route event includes internal/external classification', async () => {
        el.screenerDocument = standaloneGate({
            items: [
                {
                    key: 'kind',
                    type: 'field',
                    dataType: 'choice',
                    label: 'Kind',
                    options: [
                        { value: 'internal', label: 'Internal' },
                        { value: 'external', label: 'External' },
                    ],
                },
            ],
            routes: [
                { condition: "$kind = 'internal'", target: 'urn:test:screened' },
                { condition: "$kind = 'external'", target: 'https://example.org/forms/external' },
            ],
        });
        el.definition = screenedDefinition();
        el.render();

        const routeEvent = new Promise<any>((resolve) => {
            el.addEventListener('formspec-screener-route', (event: CustomEvent) => resolve(event.detail), { once: true });
        });
        const select = el.querySelector('.formspec-screener select') as HTMLSelectElement;
        const continueBtn = el.querySelector('.formspec-screener-continue') as HTMLButtonElement;
        select.value = 'external';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        continueBtn.click();

        const routeDetail = await routeEvent;
        expect(routeDetail.routeType).toBe('external');
        expect(routeDetail.isInternal).toBe(false);
        expect(el.getScreenerState().completed).toBe(false);
    });

    it('initialData before definition hydrates main form and auto-skips internal screener', () => {
        el.initialData = { kind: 'internal', name: 'Hydrated' };
        el.screenerDocument = standaloneGate({
            items: [
                {
                    key: 'kind',
                    type: 'field',
                    dataType: 'choice',
                    label: 'Kind',
                    options: [{ value: 'internal', label: 'Internal' }],
                },
            ],
            binds: [{ path: 'kind', required: 'true' }],
            routes: [{ condition: "$kind = 'internal'", target: 'urn:test:screened' }],
        });
        el.definition = screenedDefinition();
        el.render();
        expect(el.querySelector('.formspec-screener')).toBeNull();
        expect(el.getEngine()?.signals.name?.value).toBe('Hydrated');
    });

    it('screenerSeedAnswers before definition auto-skips when route is internal', () => {
        el.screenerSeedAnswers = { kind: 'internal' };
        el.screenerDocument = standaloneGate({
            items: [
                {
                    key: 'kind',
                    type: 'field',
                    dataType: 'choice',
                    label: 'Kind',
                    options: [{ value: 'internal', label: 'Internal' }],
                },
            ],
            binds: [{ path: 'kind', required: 'true' }],
            routes: [{ condition: "$kind = 'internal'", target: 'urn:test:screened' }],
        });
        el.definition = screenedDefinition();
        el.render();
        expect(el.querySelector('.formspec-screener')).toBeNull();
        expect(el.getScreenerState()).toMatchObject({
            hasScreener: true,
            completed: true,
            routeType: 'internal',
        });
        expect(el.getScreenerRoute()?.target).toBe('urn:test:screened');
    });

    it('getScreenerState updates across internal route, restart, and skip', () => {
        const stateEvents: any[] = [];
        el.addEventListener('formspec-screener-state-change', (event: CustomEvent) => {
            stateEvents.push(event.detail);
        });

        el.screenerDocument = standaloneGate({
            items: [
                {
                    key: 'kind',
                    type: 'field',
                    dataType: 'choice',
                    label: 'Kind',
                    options: [{ value: 'internal', label: 'Internal' }],
                },
            ],
            routes: [{ condition: "$kind = 'internal'", target: 'urn:test:screened' }],
        });
        el.definition = screenedDefinition();
        el.render();

        const select = el.querySelector('.formspec-screener select') as HTMLSelectElement;
        const continueBtn = el.querySelector('.formspec-screener-continue') as HTMLButtonElement;
        select.value = 'internal';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        continueBtn.click();

        expect(el.getScreenerState()).toMatchObject({
            hasScreener: true,
            completed: true,
            routeType: 'internal',
        });

        el.restartScreener();
        expect(el.getScreenerState()).toMatchObject({
            hasScreener: true,
            completed: false,
            routeType: 'none',
            route: null,
        });

        el.skipScreener();
        expect(el.getScreenerState()).toMatchObject({
            hasScreener: true,
            completed: true,
            routeType: 'none',
            route: null,
        });

        expect(stateEvents.map((event) => event.reason)).toContain('definition-set');
        expect(stateEvents.map((event) => event.reason)).toContain('route-internal');
        expect(stateEvents.map((event) => event.reason)).toContain('restart');
        expect(stateEvents.map((event) => event.reason)).toContain('skip');
    });

    it('treats missing screenerDocument as no gate (definition has no embedded screener)', () => {
        el.definition = screenedDefinition();
        el.render();

        expect(el.getScreenerState()).toMatchObject({
            hasScreener: false,
            completed: true,
            routeType: 'none',
            route: null,
        });
        expect(el.querySelector('.formspec-screener')).toBeNull();
        expect(el.querySelector('.formspec-field')).not.toBeNull();
    });

    it('does not append a submit button when showSubmit is false', () => {
        el.showSubmit = false;
        el.definition = singleFieldDef();
        el.render();
        expect(el.querySelector('.formspec-submit')).toBeNull();
    });

    it('focusField navigates wizard and tabs to reveal target field', () => {
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [
                {
                    key: 'applicant',
                    type: 'group',
                    children: [
                        { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                    ],
                },
                {
                    key: 'narrative',
                    type: 'group',
                    children: [
                        { key: 'summary', type: 'field', dataType: 'string', label: 'Summary' },
                        { key: 'details', type: 'field', dataType: 'string', label: 'Details' },
                    ],
                },
            ],
            formPresentation: { pageMode: 'wizard' },
        };
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: [
                {
                    component: 'Section',
                    title: 'Applicant',
                    children: [{ component: 'TextInput', bind: 'applicant.name' }],
                },
                {
                    component: 'Section',
                    title: 'Narrative',
                    children: [
                        {
                            component: 'Tabs',
                            tabLabels: ['Summary', 'Details'],
                            children: [
                                { component: 'TextInput', bind: 'narrative.summary' },
                                { component: 'TextInput', bind: 'narrative.details' },
                            ],
                        },
                    ],
                },
            ],
        });
        el.render();

        const focused = el.focusField('narrative.details');
        expect(focused).toBe(true);

        const panels = el.querySelectorAll('.formspec-wizard-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(false);

        const tabs = el.querySelectorAll('.formspec-tab');
        expect(tabs[1].classList.contains('formspec-tab--active')).toBe(true);
    });

    it('unknown component type in tree logs warning', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [],
        };
        el.componentDocument = minimalComponentDoc({
            component: 'TotallyFakeWidget',
        });
        el.render();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('TotallyFakeWidget'));
        warn.mockRestore();
    });

    // Removed: custom component recursion is now handled by the planner
    // (planComponentTree expands custom components before render).

    it('disconnectedCallback drains cleanup functions', () => {
        el.definition = singleFieldDef();
        el.render();
        // After setting a definition, there should be reactive effects in cleanupFns
        // disconnectedCallback should clear them
        el.remove();
        // Re-append to verify it's truly cleaned up (no errors)
        document.body.appendChild(el);
        // Should be empty — no leftover DOM
        expect(el.querySelector('.formspec-container')).toBeNull();
    });

    it('reference-counts external theme stylesheets across multiple instances', () => {
        document.head.querySelectorAll('link[data-formspec-theme]').forEach(link => link.remove());

        const theme = {
            $formspecTheme: '1.0' as const,
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:form' },
            stylesheets: ['data:text/css,.formspec-test%7Bcolor%3Ainherit%7D'],
        };

        el.themeDocument = theme;
        el.definition = singleFieldDef();
        el.render();
        expect(document.head.querySelectorAll('link[data-formspec-theme]').length).toBe(1);

        const el2 = document.createElement('formspec-render') as InstanceType<any>;
        document.body.appendChild(el2);
        el2.themeDocument = theme;
        el2.definition = singleFieldDef();
        el2.render();
        expect(document.head.querySelectorAll('link[data-formspec-theme]').length).toBe(1);

        el.remove();
        expect(document.head.querySelectorAll('link[data-formspec-theme]').length).toBe(1);

        el2.remove();
        expect(document.head.querySelectorAll('link[data-formspec-theme]').length).toBe(0);

        // Recreate for suite afterEach cleanup contract.
        el = document.createElement('formspec-render');
        document.body.appendChild(el);
    });
});
