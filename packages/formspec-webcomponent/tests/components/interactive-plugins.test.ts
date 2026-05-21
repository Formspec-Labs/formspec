import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { minimalComponentDoc, multiFieldDef } from '../helpers/engine-fixtures';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

function renderWithTree(tree: any) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = minimalComponentDoc(tree);
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:form',
        version: '1.0.0',
        title: 'Test',
        items: [],
    };
    el.render();
    return el;
}

describe('pageMode wizard (Stack + Pages + formPresentation)', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    function renderPageModeWizard(pages: any[], opts?: { showProgress?: boolean; allowSkip?: boolean }) {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: pages.map(p => ({
                component: 'Section',
                ...p,
            })),
        });
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [],
            formPresentation: {
                pageMode: 'wizard',
                ...(opts?.showProgress !== undefined ? { showProgress: opts.showProgress } : {}),
                ...(opts?.allowSkip !== undefined ? { allowSkip: opts.allowSkip } : {}),
            },
        };
        el.render();
        return el;
    }

    it('first panel visible, others hidden', () => {
        const el = renderPageModeWizard([
            { title: 'Step 1', children: [{ component: 'Text', text: 'Step 1' }] },
            { title: 'Step 2', children: [{ component: 'Text', text: 'Step 2' }] },
            { title: 'Step 3', children: [{ component: 'Text', text: 'Step 3' }] },
        ]);
        const panels = el.querySelectorAll('.formspec-wizard-panel');
        expect(panels.length).toBe(3);
        expect(panels[0].classList.contains('formspec-hidden')).toBe(false);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[2].classList.contains('formspec-hidden')).toBe(true);
    });

    it('Next advances to next panel', () => {
        const el = renderPageModeWizard([
            { title: 'Step 1', children: [{ component: 'Text', text: 'Step 1' }] },
            { title: 'Step 2', children: [{ component: 'Text', text: 'Step 2' }] },
        ]);
        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        nextBtn.click();
        const panels = el.querySelectorAll('.formspec-wizard-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(false);
    });

    it('Previous goes back', () => {
        const el = renderPageModeWizard([
            { title: 'Step 1', children: [{ component: 'Text', text: 'Step 1' }] },
            { title: 'Step 2', children: [{ component: 'Text', text: 'Step 2' }] },
        ]);
        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        const prevBtn = el.querySelector('.formspec-wizard-prev') as HTMLButtonElement;
        nextBtn.click();
        prevBtn.click();
        const panels = el.querySelectorAll('.formspec-wizard-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(false);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(true);
    });

    it('Previous disabled at step 0 (visible, matches React)', () => {
        const el = renderPageModeWizard([
            { title: 'Step 1', children: [{ component: 'Text', text: 'Step 1' }] },
            { title: 'Step 2', children: [{ component: 'Text', text: 'Step 2' }] },
        ]);
        const prevBtn = el.querySelector('.formspec-wizard-prev') as HTMLButtonElement;
        expect(prevBtn.disabled).toBe(true);
        expect(prevBtn.classList.contains('formspec-hidden')).toBe(false);
    });

    it('keeps the last-step submit button enabled', () => {
        const el = renderPageModeWizard([
            { title: 'Step 1', children: [{ component: 'Text', text: 'Step 1' }] },
            { title: 'Step 2', children: [{ component: 'Text', text: 'Step 2' }] },
        ]);
        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        nextBtn.click(); // go to last step
        expect(nextBtn.disabled).toBe(false);
        expect(nextBtn.textContent).toBe('Submit');
    });

    it('dispatches formspec-submit when clicking submit on the last step', async () => {
        const el = renderPageModeWizard([
            { title: 'Step 1', children: [{ component: 'Text', text: 'Step 1' }] },
            { title: 'Step 2', children: [{ component: 'Text', text: 'Step 2' }] },
        ]);
        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        nextBtn.click(); // go to last step

        const submitDetail = new Promise<any>(resolve => {
            el.addEventListener('formspec-submit', (e: CustomEvent) => resolve(e.detail), { once: true });
        });

        nextBtn.click();

        const detail = await submitDetail;
        expect(detail.response).toBeTruthy();
        expect(detail.validationReport).toBeTruthy();
    });

    it('progress indicator marks active/completed steps', () => {
        const el = renderPageModeWizard([
            { title: 'Step 1', children: [{ component: 'Text', text: 'Step 1' }] },
            { title: 'Step 2', children: [{ component: 'Text', text: 'Step 2' }] },
            { title: 'Step 3', children: [{ component: 'Text', text: 'Step 3' }] },
        ]);
        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        nextBtn.click(); // go to step 2

        const steps = el.querySelectorAll('.formspec-wizard-step');
        expect(steps[0].classList.contains('formspec-wizard-step--completed')).toBe(true);
        expect(steps[1].classList.contains('formspec-wizard-step--active')).toBe(true);
        expect(steps[2].classList.contains('formspec-wizard-step--completed')).toBe(false);
        expect(steps[2].classList.contains('formspec-wizard-step--active')).toBe(false);
    });

    it('skip button present when allowSkip = true', () => {
        const el = renderPageModeWizard([
            { title: 'Step 1', children: [{ component: 'Text', text: 'Step 1' }] },
            { title: 'Step 2', children: [{ component: 'Text', text: 'Step 2' }] },
        ], { allowSkip: true });
        expect(el.querySelector('.formspec-wizard-skip')).not.toBeNull();
    });

    it('skip button absent when allowSkip not set', () => {
        const el = renderPageModeWizard([
            { title: 'Step 1', children: [{ component: 'Text', text: 'Step 1' }] },
            { title: 'Step 2', children: [{ component: 'Text', text: 'Step 2' }] },
        ]);
        expect(el.querySelector('.formspec-wizard-skip')).toBeNull();
    });

    it('responds to formspec-wizard-set-step control event', () => {
        const el = renderPageModeWizard([
            { title: 'Step 1', children: [{ component: 'Text', text: 'Step 1' }] },
            { title: 'Step 2', children: [{ component: 'Text', text: 'Step 2' }] },
            { title: 'Step 3', children: [{ component: 'Text', text: 'Step 3' }] },
        ]);
        const wizard = el.querySelector('.formspec-wizard') as HTMLElement;
        wizard.dispatchEvent(new CustomEvent('formspec-wizard-set-step', {
            detail: { index: 2 },
            bubbles: false,
        }));

        const panels = el.querySelectorAll('.formspec-wizard-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[2].classList.contains('formspec-hidden')).toBe(false);
    });

    it('Next click touches fields in current panel, showing inline errors', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            ...multiFieldDef([
                { key: 'name', label: 'Name', dataType: 'string', required: true },
            ]),
            formPresentation: { pageMode: 'wizard' },
        };
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: [
                {
                    component: 'Section',
                    title: 'Step 1',
                    children: [{ component: 'TextInput', bind: 'name' }],
                },
                {
                    component: 'Section',
                    title: 'Step 2',
                    children: [{ component: 'Text', text: 'Done' }],
                },
            ],
        });
        el.render();

        // Initially, no error shown (field not yet touched)
        const errorDiv = el.querySelector('.formspec-error') as HTMLElement;
        expect(errorDiv.textContent).toBe('');

        // Click Next — should touch page-1 fields and show errors, then advance
        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        nextBtn.click();

        // After Next click: error should now be visible for the required field
        expect(errorDiv.textContent).not.toBe('');

        // And we should have advanced to step 2
        const panels = el.querySelectorAll('.formspec-wizard-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(false);
    });

    it('Next click shows errors but still advances (soft validation)', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            ...multiFieldDef([
                { key: 'step1field', label: 'Step 1 Field', dataType: 'string', required: true },
                { key: 'step2field', label: 'Step 2 Field', dataType: 'string', required: true },
            ]),
            formPresentation: { pageMode: 'wizard' },
        };
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: [
                {
                    component: 'Section',
                    title: 'Step 1',
                    children: [{ component: 'TextInput', bind: 'step1field' }],
                },
                {
                    component: 'Section',
                    title: 'Step 2',
                    children: [{ component: 'TextInput', bind: 'step2field' }],
                },
            ],
        });
        el.render();

        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        nextBtn.click();

        // Should have advanced (soft — not blocked)
        const panels = el.querySelectorAll('.formspec-wizard-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(false);
    });

    it('navigating back to a touched page still shows errors', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            ...multiFieldDef([
                { key: 'name', label: 'Name', dataType: 'string', required: true },
            ]),
            formPresentation: { pageMode: 'wizard' },
        };
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: [
                {
                    component: 'Section',
                    title: 'Step 1',
                    children: [{ component: 'TextInput', bind: 'name' }],
                },
                {
                    component: 'Section',
                    title: 'Step 2',
                    children: [{ component: 'Text', text: 'Done' }],
                },
            ],
        });
        el.render();

        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        const prevBtn = el.querySelector('.formspec-wizard-prev') as HTMLButtonElement;
        const errorDiv = el.querySelector('.formspec-error') as HTMLElement;

        // Click Next to touch page 1 fields and advance
        nextBtn.click();

        // Navigate back to page 1
        prevBtn.click();

        // Error should still be visible (field remains touched)
        expect(errorDiv.textContent).not.toBe('');
    });

    it('no errors shown on Next when all required fields are filled', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            ...multiFieldDef([
                { key: 'name', label: 'Name', dataType: 'string', required: true },
            ]),
            formPresentation: { pageMode: 'wizard' },
        };
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: [
                {
                    component: 'Section',
                    title: 'Step 1',
                    children: [{ component: 'TextInput', bind: 'name' }],
                },
                {
                    component: 'Section',
                    title: 'Step 2',
                    children: [{ component: 'Text', text: 'Done' }],
                },
            ],
        });
        el.render();
        el.getEngine().setValue('name', 'Alice');

        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        nextBtn.click();

        const errorDiv = el.querySelector('.formspec-error') as HTMLElement;
        // Field is touched but has no error since it's filled
        expect(errorDiv.textContent).toBe('');
    });

    it('goToWizardStep works with pageMode wizard', () => {
        const el = renderPageModeWizard([
            { title: 'Step 1', children: [{ component: 'Text', text: 'Step 1' }] },
            { title: 'Step 2', children: [{ component: 'Text', text: 'Step 2' }] },
            { title: 'Step 3', children: [{ component: 'Text', text: 'Step 3' }] },
        ]);

        const success = el.goToWizardStep(2);
        expect(success).toBe(true);

        const panels = el.querySelectorAll('.formspec-wizard-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[2].classList.contains('formspec-hidden')).toBe(false);
    });

    it('definition-fallback (no component doc) with pageMode wizard', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [
                { key: 'info', type: 'group', label: 'Info', children: [
                    { key: 'name', type: 'field', label: 'Name', dataType: 'string' },
                ]},
                { key: 'review', type: 'group', label: 'Review', children: [
                    { key: 'notes', type: 'field', label: 'Notes', dataType: 'string' },
                ]},
            ],
            formPresentation: { pageMode: 'wizard' },
        };
        el.render();

        const panels = el.querySelectorAll('.formspec-wizard-panel');
        expect(panels.length).toBe(2);
        expect(panels[0].classList.contains('formspec-hidden')).toBe(false);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(true);
    });
});

describe('pageMode tabs (Stack + Pages + formPresentation)', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    function renderPageModeTabs(
        pages: any[],
        opts?: { defaultTab?: number; tabPosition?: string },
    ) {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: pages.map(p => ({
                component: 'Section',
                ...p,
            })),
        });
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [],
            formPresentation: {
                pageMode: 'tabs',
                ...(opts?.defaultTab !== undefined ? { defaultTab: opts.defaultTab } : {}),
                ...(opts?.tabPosition !== undefined ? { tabPosition: opts.tabPosition } : {}),
            },
        };
        el.render();
        return el;
    }

    it('renders tab bar with one tab per Section child', () => {
        const el = renderPageModeTabs([
            { title: 'Info', children: [{ component: 'Text', text: 'Info content' }] },
            { title: 'Review', children: [{ component: 'Text', text: 'Review content' }] },
            { title: 'Submit', children: [{ component: 'Text', text: 'Submit content' }] },
        ]);
        const buttons = el.querySelectorAll('.formspec-tab');
        expect(buttons.length).toBe(3);
        expect(buttons[0].textContent).toBe('Info');
        expect(buttons[1].textContent).toBe('Review');
        expect(buttons[2].textContent).toBe('Submit');
    });

    it('first tab active and first panel visible by default', () => {
        const el = renderPageModeTabs([
            { title: 'Tab A', children: [{ component: 'Text', text: 'A' }] },
            { title: 'Tab B', children: [{ component: 'Text', text: 'B' }] },
        ]);
        const buttons = el.querySelectorAll('.formspec-tab');
        expect(buttons[0].getAttribute('aria-selected')).toBe('true');
        expect(buttons[1].getAttribute('aria-selected')).toBe('false');

        const panels = el.querySelectorAll('.formspec-tab-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(false);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(true);
    });

    it('clicking tab switches visible panel', () => {
        const el = renderPageModeTabs([
            { title: 'Tab A', children: [{ component: 'Text', text: 'A' }] },
            { title: 'Tab B', children: [{ component: 'Text', text: 'B' }] },
        ]);
        const buttons = el.querySelectorAll('.formspec-tab');
        (buttons[1] as HTMLButtonElement).click();

        const panels = el.querySelectorAll('.formspec-tab-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(false);
    });

    it('honors defaultTab from formPresentation', () => {
        const el = renderPageModeTabs([
            { title: 'Tab A', children: [{ component: 'Text', text: 'A' }] },
            { title: 'Tab B', children: [{ component: 'Text', text: 'B' }] },
        ], { defaultTab: 1 });
        const panels = el.querySelectorAll('.formspec-tab-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(false);

        const buttons = el.querySelectorAll('.formspec-tab');
        expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    });

    it('tabPosition bottom renders panels before tab bar', () => {
        const el = renderPageModeTabs([
            { title: 'Tab A', children: [{ component: 'Text', text: 'A' }] },
        ], { tabPosition: 'bottom' });
        const tabs = el.querySelector('.formspec-tabs') as HTMLElement;
        const children = Array.from(tabs.children);
        const panelIndex = children.findIndex(c => c.classList.contains('formspec-tab-panels'));
        const barIndex = children.findIndex(c => c.classList.contains('formspec-tab-bar'));
        expect(panelIndex).toBeLessThan(barIndex);
    });

    it('renders non-Section orphan children in a final fallback tab', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: [
                { component: 'Text', text: 'Orphan banner' },
                { component: 'Section', title: 'Tab A', children: [{ component: 'Text', text: 'A' }] },
                { component: 'Section', title: 'Tab B', children: [{ component: 'Text', text: 'B' }] },
            ],
        });
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [],
            formPresentation: { pageMode: 'tabs' },
        };
        el.render();

        const buttons = el.querySelectorAll('.formspec-tab');
        expect(buttons.length).toBe(3);
        expect(buttons[2].textContent).toBe('Additional Items');

        const tabsContainer = el.querySelector('.formspec-tabs') as HTMLElement;
        expect(tabsContainer).not.toBeNull();
        expect(tabsContainer.textContent).toContain('Orphan banner');
    });

    it('tab labels derived from Section title property', () => {
        const el = renderPageModeTabs([
            { title: 'Personal Info', children: [{ component: 'Text', text: 'A' }] },
            { children: [{ component: 'Text', text: 'B' }] }, // no title
        ]);
        const buttons = el.querySelectorAll('.formspec-tab');
        expect(buttons[0].textContent).toBe('Personal Info');
        expect(buttons[1].textContent).toBe('Tab 2');
    });
});

describe('Tabs plugin', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('first tab active and first panel visible by default', () => {
        const el = renderWithTree({
            component: 'Tabs',
            tabLabels: ['Tab A', 'Tab B'],
            children: [
                { component: 'Text', text: 'Panel A' },
                { component: 'Text', text: 'Panel B' },
            ],
        });
        const buttons = el.querySelectorAll('.formspec-tab');
        expect(buttons[0].classList.contains('formspec-tab--active')).toBe(true);
        expect(buttons[1].classList.contains('formspec-tab--active')).toBe(false);

        const panels = el.querySelectorAll('.formspec-tab-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(false);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(true);
    });

    it('clicking tab shows its panel and hides others', () => {
        const el = renderWithTree({
            component: 'Tabs',
            tabLabels: ['Tab A', 'Tab B'],
            children: [
                { component: 'Text', text: 'Panel A' },
                { component: 'Text', text: 'Panel B' },
            ],
        });
        const buttons = el.querySelectorAll('.formspec-tab');
        (buttons[1] as HTMLButtonElement).click();

        const panels = el.querySelectorAll('.formspec-tab-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(false);
        expect(buttons[0].classList.contains('formspec-tab--active')).toBe(false);
        expect(buttons[1].classList.contains('formspec-tab--active')).toBe(true);
    });

    it('defaultTab honors specified index', () => {
        const el = renderWithTree({
            component: 'Tabs',
            defaultTab: 1,
            tabLabels: ['Tab A', 'Tab B'],
            children: [
                { component: 'Text', text: 'Panel A' },
                { component: 'Text', text: 'Panel B' },
            ],
        });
        const panels = el.querySelectorAll('.formspec-tab-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(false);

        const buttons = el.querySelectorAll('.formspec-tab');
        expect(buttons[1].classList.contains('formspec-tab--active')).toBe(true);
    });

    it('placement bottom renders panels before tab bar', () => {
        const el = renderWithTree({
            component: 'Tabs',
            placement: 'bottom',
            tabLabels: ['Tab A'],
            children: [{ component: 'Text', text: 'Panel A' }],
        });
        const tabs = el.querySelector('.formspec-tabs') as HTMLElement;
        const children = Array.from(tabs.children);
        const panelIndex = children.findIndex(c => c.classList.contains('formspec-tab-panels'));
        const barIndex = children.findIndex(c => c.classList.contains('formspec-tab-bar'));
        expect(panelIndex).toBeLessThan(barIndex);
    });

    it('responds to formspec-tabs-set-active control event', () => {
        const el = renderWithTree({
            component: 'Tabs',
            tabLabels: ['Tab A', 'Tab B', 'Tab C'],
            children: [
                { component: 'Text', text: 'Panel A' },
                { component: 'Text', text: 'Panel B' },
                { component: 'Text', text: 'Panel C' },
            ],
        });
        const tabs = el.querySelector('.formspec-tabs') as HTMLElement;
        tabs.dispatchEvent(new CustomEvent('formspec-tabs-set-active', {
            detail: { index: 2 },
            bubbles: false,
        }));

        const panels = el.querySelectorAll('.formspec-tab-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[2].classList.contains('formspec-hidden')).toBe(false);
    });
});

describe('SubmitButton plugin', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('click dispatches formspec-submit with response + validationReport', async () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
        };
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: [
                { component: 'TextInput', bind: 'name' },
                { component: 'SubmitButton', label: 'Save Draft' },
            ],
        });
        el.render();
        el.getEngine().setValue('name', 'Alice');

        const received = new Promise<any>((resolve) => {
            el.addEventListener('formspec-submit', (e: CustomEvent) => resolve(e.detail), { once: true });
        });

        const submitBtn = el.querySelector('.formspec-submit') as HTMLButtonElement;
        expect(submitBtn).not.toBeNull();
        expect(submitBtn.textContent).toBe('Save Draft');
        submitBtn.click();

        const detail = await received;
        expect(detail.response.data?.name).toBe('Alice');
        expect(detail.validationReport).toBeDefined();
        expect(typeof detail.validationReport.valid).toBe('boolean');
    });

    it('emitEvent=false suppresses formspec-submit event', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [],
        };
        el.componentDocument = minimalComponentDoc({
            component: 'SubmitButton',
            emitEvent: false,
        });
        el.render();

        let emitted = false;
        el.addEventListener('formspec-submit', () => {
            emitted = true;
        });
        (el.querySelector('.formspec-submit') as HTMLButtonElement).click();
        expect(emitted).toBe(false);
    });

    it('reacts to shared submit pending state', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [],
        };
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: [
                { component: 'SubmitButton', label: 'Save', pendingLabel: 'Saving...' },
                { component: 'SubmitButton', label: 'Queue', pendingLabel: 'Queued...', disableWhenPending: false },
            ],
        });
        el.render();

        const buttons = el.querySelectorAll('.formspec-submit') as NodeListOf<HTMLButtonElement>;
        expect(buttons[0].disabled).toBe(false);
        expect(buttons[0].textContent).toBe('Save');
        expect(buttons[1].disabled).toBe(false);
        expect(buttons[1].textContent).toBe('Queue');

        el.setSubmitPending(true);
        expect(buttons[0].disabled).toBe(true);
        expect(buttons[0].textContent).toBe('Saving...');
        expect(buttons[1].disabled).toBe(false);
        expect(buttons[1].textContent).toBe('Queued...');

        el.setSubmitPending(false);
        expect(buttons[0].disabled).toBe(false);
        expect(buttons[0].textContent).toBe('Save');
        expect(buttons[1].disabled).toBe(false);
        expect(buttons[1].textContent).toBe('Queue');
    });
});

describe('ValidationSummary plugin', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders submit-source results with dedupe and jump links', async () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name', required: true }],
            shapes: [
                {
                    id: 'dup-a',
                    target: 'name',
                    timing: 'submit',
                    constraint: 'false',
                    message: 'Name is required.',
                    severity: 'error',
                },
                {
                    id: 'dup-b',
                    target: 'name',
                    timing: 'submit',
                    constraint: 'false',
                    message: 'Name is required.',
                    severity: 'error',
                },
            ],
        };
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: [
                { component: 'TextInput', bind: 'name' },
                { component: 'ValidationSummary', source: 'submit', dedupe: true, jumpLinks: true, showFieldErrors: false },
            ],
        });
        el.render();

        const focusSpy = vi.spyOn(el, 'focusField').mockReturnValue(true);
        el.submit();

        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const summary = el.querySelector('.formspec-validation-summary') as HTMLElement;
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(true);

        const links = summary.querySelectorAll('.formspec-validation-summary-link');
        expect(links.length).toBe(1);
        (links[0] as HTMLButtonElement).click();
        expect(focusSpy).toHaveBeenCalledWith('name');
    });
});

describe('Accordion plugin', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('defaultOpen opens specified section', () => {
        const el = renderWithTree({
            component: 'Accordion',
            defaultOpen: 1,
            labels: ['Section A', 'Section B', 'Section C'],
            children: [
                { component: 'Text', text: 'A' },
                { component: 'Text', text: 'B' },
                { component: 'Text', text: 'C' },
            ],
        });
        const details = el.querySelectorAll('.formspec-accordion-item') as NodeListOf<HTMLDetailsElement>;
        expect(details[0].open).toBe(false);
        expect(details[1].open).toBe(true);
        expect(details[2].open).toBe(false);
    });

    it('exclusive mode: opening one closes others', () => {
        const el = renderWithTree({
            component: 'Accordion',
            defaultOpen: 0,
            labels: ['A', 'B'],
            children: [
                { component: 'Text', text: 'A' },
                { component: 'Text', text: 'B' },
            ],
        });
        const details = el.querySelectorAll('.formspec-accordion-item') as NodeListOf<HTMLDetailsElement>;
        expect(details[0].open).toBe(true);

        // Simulate opening second — happy-dom dispatches toggle event on attribute set
        details[1].open = true;
        details[1].dispatchEvent(new Event('toggle'));

        expect(details[0].open).toBe(false);
        expect(details[1].open).toBe(true);
    });

    it('allowMultiple keeps all open', () => {
        const el = renderWithTree({
            component: 'Accordion',
            allowMultiple: true,
            defaultOpen: 0,
            labels: ['A', 'B'],
            children: [
                { component: 'Text', text: 'A' },
                { component: 'Text', text: 'B' },
            ],
        });
        const details = el.querySelectorAll('.formspec-accordion-item') as NodeListOf<HTMLDetailsElement>;
        details[1].open = true;
        details[1].dispatchEvent(new Event('toggle'));

        expect(details[0].open).toBe(true);
        expect(details[1].open).toBe(true);
    });
});
