/** @filedesc RED tests for ALL remaining parity gaps — responsive, DataTable reactivity, Wizard submit,
 * input prop completeness, interaction tests for Wizard/Tabs/Modal/Popover, ValidationSummary live mode. */
import { describe, it, expect, beforeAll, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import type { LayoutNode } from '@formspec-org/layout';
import { FormspecNode } from '../src/node-renderer';
import { FormspecProvider } from '../src/context';
import { FormspecForm } from '../src/renderer';
import { ValidationSummary } from '../src/validation-summary';

beforeAll(async () => {
    await initFormspecEngine();
});

// ── Helpers ───────────────────────────────────────────────────────────

const simpleDef = {
    $formspec: '1.0',
    url: 'https://test.example/parity',
    version: '1.0.0',
    status: 'active',
    title: 'Parity Tests',
    name: 'parity-test',
    items: [],
};

function renderNode(node: LayoutNode, opts: { engine?: any; components?: any } = {}): HTMLElement {
    const engine = opts.engine ?? createFormEngine(simpleDef);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => {
        root.render(
            <FormspecProvider engine={engine} components={opts.components}>
                <FormspecNode node={node} />
            </FormspecProvider>
        );
    });
    return container;
}

function fieldNode(component: string, bindPath: string, props: Record<string, unknown> = {}, fieldItem: any = {}): LayoutNode {
    return {
        id: `field-${bindPath}`,
        component,
        category: 'field',
        bindPath,
        props,
        cssClasses: [],
        children: [],
        fieldItem: { key: bindPath, label: fieldItem.label || bindPath, dataType: fieldItem.dataType || 'string', ...fieldItem },
    };
}

// ── 1. Responsive breakpoint detection ───────────────────────────────

describe('Responsive breakpoint detection', () => {
    let originalMatchMedia: typeof window.matchMedia;

    beforeEach(() => {
        originalMatchMedia = window.matchMedia;
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
    });

    it('detects active breakpoint from componentDocument breakpoints via matchMedia', () => {
        // Mock matchMedia: tablet breakpoint (768px) matches, desktop (1024px) does not
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: query.includes('768'),
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            onchange: null,
            dispatchEvent: vi.fn(),
        }));

        // We test that FormspecProvider passes activeBreakpoint to the planner.
        // The planner applies responsive overrides onto the LayoutNode props.
        // We render a component document tree with a responsive override on direction:
        //   base: direction='vertical', tablet: direction='horizontal'
        // If activeBreakpoint is detected as 'tablet', the planner resolves
        // direction='horizontal', and the Stack renders with flexDirection='row'.
        const componentDocument = {
            breakpoints: {
                tablet: { minWidth: 768 },
                desktop: { minWidth: 1024 },
            },
            tree: {
                component: 'Stack',
                direction: 'vertical',
                responsive: {
                    tablet: { direction: 'horizontal' },
                },
                children: [],
            },
        };

        const def = { ...simpleDef, items: [] };
        const engine = createFormEngine(def);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine} componentDocument={componentDocument}>
                    <div data-testid="inner" />
                </FormspecProvider>
            );
        });

        // Verify the matchMedia mock was called with the breakpoint queries
        expect(window.matchMedia).toHaveBeenCalled();
        const calls = (window.matchMedia as any).mock.calls.map((c: any) => c[0]);
        const hasBreakpointQuery = calls.some((q: string) => q.includes('768'));
        expect(hasBreakpointQuery).toBe(true);
    });
});

// ── 2. DataTable reactivity ──────────────────────────────────────────

describe('DataTable reactivity', () => {
    it('updates cell values when engine signals change', () => {
        const def = {
            ...simpleDef,
            items: [
                {
                    key: 'rows',
                    type: 'group',
                    label: 'Rows',
                    repeatable: true,
                    children: [
                        { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                    ],
                },
            ],
        };
        const engine = createFormEngine(def);
        engine.addRepeatInstance('rows');
        engine.setValue('rows[0].name', 'Alice');

        const tableNode: LayoutNode = {
            id: 'dt-1',
            component: 'DataTable',
            category: 'display',
            props: {
                bind: 'rows',
                columns: [{ header: 'Name', bind: 'name' }],
            },
            cssClasses: [],
            children: [],
        };

        // Render inside a wrapper that can trigger updates
        let triggerUpdate: () => void;
        function Wrapper() {
            const [, setState] = React.useState(0);
            triggerUpdate = () => setState(n => n + 1);
            return (
                <FormspecProvider engine={engine}>
                    <FormspecNode node={tableNode} />
                </FormspecProvider>
            );
        }

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => { root.render(<Wrapper />); });

        // Initial value should be rendered (editable cells use <input>)
        const cells = container.querySelectorAll('td');
        expect(cells.length).toBeGreaterThanOrEqual(1);
        const input = cells[0].querySelector('input') as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe('Alice');

        // Change the value — DataTable should reactively update via signal subscription
        engine.setValue('rows[0].name', 'Bob');
        flushSync(() => { triggerUpdate!(); });

        const updatedCells = container.querySelectorAll('td');
        const updatedInput = updatedCells[0].querySelector('input') as HTMLInputElement;
        expect(updatedInput.value).toBe('Bob');
    });
});

// ── 3. Wizard submit integration ─────────────────────────────────────

describe('Wizard submit integration', () => {
    it('triggers onSubmit when submit button is clicked on last step', () => {
        const def = { ...simpleDef, items: [] };
        const engine = createFormEngine(def);
        const onSubmit = vi.fn();

        const wizardNode: LayoutNode = {
            id: 'wiz-submit',
            component: 'Wizard',
            category: 'interactive',
            props: {},
            cssClasses: [],
            children: [
                { id: 'step-1', component: 'Section', category: 'layout', props: { title: 'Only Step' }, cssClasses: [], children: [] },
            ],
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine} onSubmit={onSubmit}>
                    <FormspecNode node={wizardNode} />
                </FormspecProvider>
            );
        });

        // With one step, we should see a submit button (it's the last step)
        const submitBtn = container.querySelector('.formspec-wizard-submit') as HTMLButtonElement;
        expect(submitBtn).toBeTruthy();

        // Click submit — should trigger onSubmit callback
        flushSync(() => { submitBtn.click(); });
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});

// ── 4. Wizard step navigation ────────────────────────────────────────

describe('Wizard step navigation', () => {
    function twoStepWizard(items: any[] = [], binds: any[] = []): { node: LayoutNode; def: any } {
        const def = { ...simpleDef, items, binds };
        return {
            def,
            node: {
                id: 'wiz-nav',
                component: 'Wizard',
                category: 'interactive',
                props: {},
                cssClasses: [],
                children: [
                    {
                        id: 'step-1', component: 'Section', category: 'layout',
                        props: { title: 'Step One' }, cssClasses: [],
                        children: items.length > 0 ? [{
                            id: 'f-name', component: 'TextInput', category: 'field',
                            bindPath: 'name', props: {}, cssClasses: [], children: [],
                            fieldItem: { key: 'name', label: 'Name', dataType: 'string' },
                        }] : [],
                    },
                    {
                        id: 'step-2', component: 'Section', category: 'layout',
                        props: { title: 'Step Two' }, cssClasses: [], children: [],
                    },
                ],
            },
        };
    }

    it('navigates to next step on Next click', () => {
        const { node, def } = twoStepWizard();
        const container = renderNode(node, { engine: createFormEngine(def) });

        const indicator = container.querySelector('.formspec-wizard-step-indicator')!;
        expect(indicator.textContent).toContain('Step 1 of 2');

        const nextBtn = container.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        flushSync(() => { nextBtn.click(); });

        expect(indicator.textContent).toContain('Step 2 of 2');
    });

    it('navigates to previous step on Previous click', () => {
        const { node, def } = twoStepWizard();
        const container = renderNode(node, { engine: createFormEngine(def) });

        // Go to step 2
        const nextBtn = container.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        flushSync(() => { nextBtn.click(); });

        const indicator = container.querySelector('.formspec-wizard-step-indicator')!;
        expect(indicator.textContent).toContain('Step 2 of 2');

        // Go back
        const prevBtn = container.querySelector('.formspec-wizard-prev') as HTMLButtonElement;
        flushSync(() => { prevBtn.click(); });

        expect(indicator.textContent).toContain('Step 1 of 2');
    });

    it('blocks navigation when current step has validation errors', () => {
        const items = [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }];
        const binds = [{ path: 'name', required: 'true' }];
        const { node, def } = twoStepWizard(items, binds);
        const engine = createFormEngine(def);
        // name is required but empty — should have error

        const container = renderNode(node, { engine });

        const indicator = container.querySelector('.formspec-wizard-step-indicator')!;
        const nextBtn = container.querySelector('.formspec-wizard-next') as HTMLButtonElement;

        // Click next — should be blocked by validation
        flushSync(() => { nextBtn.click(); });

        // Should still be on step 1
        expect(indicator.textContent).toContain('Step 1 of 2');
    });
});

// ── 5. Tabs keyboard navigation ──────────────────────────────────────

describe('Tabs keyboard navigation', () => {
    const tabsNode: LayoutNode = {
        id: 'tabs-kb',
        component: 'Tabs',
        category: 'interactive',
        props: {},
        cssClasses: [],
        children: [
            { id: 'tab-a', component: 'Stack', category: 'layout', props: { title: 'Alpha' }, cssClasses: [], children: [] },
            { id: 'tab-b', component: 'Stack', category: 'layout', props: { title: 'Beta' }, cssClasses: [], children: [] },
            { id: 'tab-c', component: 'Stack', category: 'layout', props: { title: 'Gamma' }, cssClasses: [], children: [] },
        ],
    };

    it('ArrowRight moves to next tab', () => {
        const container = renderNode(tabsNode);
        const tabs = container.querySelectorAll('[role="tab"]');
        expect(tabs[0].getAttribute('aria-selected')).toBe('true');

        // Simulate ArrowRight on tablist
        const tablist = container.querySelector('[role="tablist"]')!;
        flushSync(() => {
            tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        });

        expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    });

    it('ArrowLeft moves to previous tab (wraps)', () => {
        const container = renderNode(tabsNode);
        const tabs = container.querySelectorAll('[role="tab"]');

        // First tab is active — ArrowLeft should wrap to last
        const tablist = container.querySelector('[role="tablist"]')!;
        flushSync(() => {
            tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        });

        expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    });

    it('Home moves to first tab, End moves to last tab', () => {
        const container = renderNode(tabsNode);
        const tabs = container.querySelectorAll('[role="tab"]');

        // Move to last tab first
        const tablist = container.querySelector('[role="tablist"]')!;
        flushSync(() => {
            tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        });
        expect(tabs[2].getAttribute('aria-selected')).toBe('true');

        // Home back to first
        flushSync(() => {
            tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        });
        expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    });
});

// ── 6. Input prop completeness ───────────────────────────────────────

describe('Input prop completeness', () => {
    function renderField(component: string, bindPath: string, props: Record<string, unknown>, fieldItem?: any): HTMLElement {
        const def = {
            ...simpleDef,
            items: [{ key: bindPath, type: 'field', dataType: fieldItem?.dataType || 'string', label: bindPath, ...fieldItem }],
        };
        const engine = createFormEngine(def);
        return renderNode(fieldNode(component, bindPath, props, fieldItem), { engine });
    }

    describe('TextInput', () => {
        it('applies placeholder attribute', () => {
            const container = renderField('TextInput', 'name', { placeholder: 'Enter name...' });
            const input = container.querySelector('input[type="text"]') as HTMLInputElement;
            expect(input).toBeTruthy();
            expect(input.placeholder).toBe('Enter name...');
        });

        it('applies inputMode attribute', () => {
            const container = renderField('TextInput', 'email', { inputMode: 'email' });
            const input = container.querySelector('input[type="text"]') as HTMLInputElement;
            expect(input).toBeTruthy();
            expect(input.inputMode).toBe('email');
        });
    });

    describe('NumberInput', () => {
        it('renders stepper buttons when showStepper is true', () => {
            const container = renderField('NumberInput', 'qty', { showStepper: true, min: 0, max: 10, step: 1 }, { dataType: 'integer' });
            const incBtn = container.querySelector('.formspec-stepper-increment, .formspec-stepper-up, [aria-label*="Increment"], [aria-label*="increment"]');
            const decBtn = container.querySelector('.formspec-stepper-decrement, .formspec-stepper-down, [aria-label*="Decrement"], [aria-label*="decrement"]');
            expect(incBtn).toBeTruthy();
            expect(decBtn).toBeTruthy();
        });

        it('applies placeholder attribute', () => {
            const container = renderField('NumberInput', 'qty', { placeholder: '0.00' }, { dataType: 'number' });
            const input = container.querySelector('input[type="number"]') as HTMLInputElement;
            expect(input).toBeTruthy();
            expect(input.placeholder).toBe('0.00');
        });
    });

    describe('DatePicker', () => {
        it('applies placeholder attribute', () => {
            const container = renderField('DatePicker', 'dob', { placeholder: 'YYYY-MM-DD' }, { dataType: 'date' });
            const input = container.querySelector('input[type="date"]') as HTMLInputElement;
            expect(input).toBeTruthy();
            expect(input.placeholder).toBe('YYYY-MM-DD');
        });
    });

    describe('Select', () => {
        it('renders clear button when clearable is true and value is set', () => {
            const def = {
                ...simpleDef,
                items: [{
                    key: 'color', type: 'field', dataType: 'choice', label: 'Color',
                    options: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }],
                }],
            };
            const engine = createFormEngine(def);
            engine.setValue('color', 'red');

            const node = fieldNode('Select', 'color', { clearable: true }, {
                dataType: 'choice',
                options: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }],
            });
            const container = renderNode(node, { engine });

            const clearBtn = container.querySelector('.formspec-select-clear, [aria-label*="Clear"], [aria-label*="clear"]');
            expect(clearBtn).toBeTruthy();
        });

        it('uses placeholder for searchable select input', () => {
            const container = renderField('Select', 'color', { searchable: true, placeholder: 'Choose color' }, {
                dataType: 'choice',
                options: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }],
            });
            const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
            expect(input).toBeTruthy();
            expect(input.placeholder).toBe('Choose color');
        });
    });

    describe('CheckboxGroup', () => {
        it('renders options in columns when columns prop is set', () => {
            const container = renderField('CheckboxGroup', 'tags', { columns: 2 }, {
                dataType: 'multiChoice',
                options: [
                    { value: 'a', label: 'A' }, { value: 'b', label: 'B' },
                    { value: 'c', label: 'C' }, { value: 'd', label: 'D' },
                ],
            });
            const group = container.querySelector('.formspec-checkbox-group') as HTMLElement;
            expect(group).toBeTruthy();
            expect(group.getAttribute('data-columns')).toBe('2');
            expect(group.getAttribute('role')).toBe('group');
        });

        it('renders selectAll checkbox when selectAll is true', () => {
            const container = renderField('CheckboxGroup', 'tags', { selectAll: true }, {
                dataType: 'multiChoice',
                options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
            });
            const selectAll = container.querySelector('.formspec-select-all, [data-select-all], input[aria-label*="Select all"], input[aria-label*="select all"]');
            expect(selectAll).toBeTruthy();
        });
    });

    describe('Toggle', () => {
        it('renders onLabel and offLabel', () => {
            const container = renderField('Toggle', 'active', { onLabel: 'Enabled', offLabel: 'Disabled' }, { dataType: 'boolean' });
            const text = container.textContent;
            // Should display the appropriate label based on current value
            expect(text).toMatch(/Enabled|Disabled/);
            // Should have both labels present in the DOM (one may be visually hidden)
            const allText = container.innerHTML;
            expect(allText).toContain('Enabled');
            expect(allText).toContain('Disabled');
        });
    });
});

// ── 7. ValidationSummary live mode ───────────────────────────────────

describe('ValidationSummary live mode', () => {
    it('shows validation results in live mode without submit', () => {
        const def = {
            ...simpleDef,
            items: [{ key: 'email', type: 'field', dataType: 'string', label: 'Email' }],
            binds: [{ path: 'email', required: 'true' }],
        };
        const engine = createFormEngine(def);
        // email is required but empty — should produce validation error

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => {
            root.render(
                <FormspecProvider engine={engine}>
                    <ValidationSummary source="live" />
                </FormspecProvider>
            );
        });

        // In live mode, required field errors should appear without submit
        const errorText = container.textContent;
        expect(errorText).toContain('error');
    });
});

// ── 8. Modal interaction ─────────────────────────────────────────────

describe('Modal interaction', () => {
    function modalNode(props: Record<string, unknown> = {}): LayoutNode {
        return {
            id: 'modal-1',
            component: 'Modal',
            category: 'layout',
            props: { title: 'Test Modal', triggerLabel: 'Open Modal', ...props },
            cssClasses: [],
            children: [
                { id: 'modal-content', component: 'Text', category: 'display',
                  props: { text: 'Modal body' }, cssClasses: [], children: [] },
            ],
        };
    }

    it('opens dialog on trigger click', () => {
        const container = renderNode(modalNode());
        const trigger = container.querySelector('.formspec-modal-trigger') as HTMLButtonElement;
        const dialog = container.querySelector('dialog') as HTMLDialogElement;

        expect(dialog.open).toBe(false);
        flushSync(() => { trigger.click(); });
        expect(dialog.open).toBe(true);
    });

    it('closes dialog on close button click', () => {
        const container = renderNode(modalNode());
        const trigger = container.querySelector('.formspec-modal-trigger') as HTMLButtonElement;
        flushSync(() => { trigger.click(); });

        const closeBtn = container.querySelector('.formspec-modal-close') as HTMLButtonElement;
        expect(closeBtn).toBeTruthy();
        flushSync(() => { closeBtn.click(); });

        const dialog = container.querySelector('dialog') as HTMLDialogElement;
        expect(dialog.open).toBe(false);
    });
});

// ── 9. Popover interaction ───────────────────────────────────────────

describe('Popover interaction', () => {
    function popoverNode(props: Record<string, unknown> = {}): LayoutNode {
        return {
            id: 'pop-1',
            component: 'Popover',
            category: 'layout',
            props: { triggerLabel: 'Open Popover', title: 'Info', ...props },
            cssClasses: [],
            children: [
                { id: 'pop-content', component: 'Text', category: 'display',
                  props: { text: 'Popover body' }, cssClasses: [], children: [] },
            ],
        };
    }

    it('opens on trigger click', () => {
        const container = renderNode(popoverNode());
        const trigger = container.querySelector('.formspec-popover-trigger') as HTMLButtonElement;
        const content = container.querySelector('.formspec-popover-content') as HTMLElement;

        expect(content.hidden).toBe(true);
        flushSync(() => { trigger.click(); });
        expect(content.hidden).toBe(false);
    });

    it('closes on Escape key', () => {
        const container = renderNode(popoverNode());
        const trigger = container.querySelector('.formspec-popover-trigger') as HTMLButtonElement;
        flushSync(() => { trigger.click(); });

        const content = container.querySelector('.formspec-popover-content') as HTMLElement;
        expect(content.hidden).toBe(false);

        // Dispatch Escape on the popover content
        flushSync(() => {
            content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });

        expect(content.hidden).toBe(true);
    });
});
