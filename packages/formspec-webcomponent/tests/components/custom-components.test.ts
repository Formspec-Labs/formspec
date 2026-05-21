import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

function renderWith(items: any[], compDoc: any) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = compDoc;
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:form',
        version: '1.0.0',
        title: 'Test',
        items,
    };
    el.render();
    return el;
}

describe('custom components — template expansion', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('expands custom component templates when parameter values are provided', () => {
        const el = renderWith(
            [
                { key: 'firstName', type: 'field', dataType: 'string', label: 'First Name' },
                { key: 'lastName', type: 'field', dataType: 'string', label: 'Last Name' },
            ],
            {
                $formspecComponent: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'urn:test:form' },
                components: {
                    LabeledInput: {
                        tree: {
                            component: 'Stack',
                            children: [
                                { component: 'Heading', text: '{title}', level: 4 },
                                { component: 'TextInput', bind: '{field}' },
                            ],
                        },
                    },
                },
                tree: {
                    component: 'Section',
                    children: [
                        { component: 'LabeledInput', title: 'Your First Name', field: 'firstName' },
                        { component: 'LabeledInput', title: 'Your Last Name', field: 'lastName' },
                    ],
                },
            },
        );

        // Custom components should be expanded: 2 headings and 2 inputs
        const headings = el.querySelectorAll('h4');
        expect(headings.length).toBe(2);
        expect((headings[0] as HTMLElement).textContent).toBe('Your First Name');
        expect((headings[1] as HTMLElement).textContent).toBe('Your Last Name');

        const inputs = el.querySelectorAll('input[type="text"]');
        expect(inputs.length).toBe(2);

        // Should bind correctly
        const firstInput = inputs[0] as HTMLInputElement;
        firstInput.value = 'John';
        firstInput.dispatchEvent(new Event('input', { bubbles: true }));
        const engine = el.getEngine();
        expect(engine.signals['firstName'].value).toBe('John');
    });
});

describe('custom components — DataTable and Summary tab-sync', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('keeps DataTable and Summary synchronized when switching between tabs', () => {
        const items = [
            { key: 'projectName', type: 'field', dataType: 'string', label: 'Project Name' },
            {
                key: 'lineItems',
                type: 'group',
                repeatable: true,
                label: 'Line Items',
                children: [
                    { key: 'desc', type: 'field', dataType: 'string', label: 'Description' },
                    { key: 'amount', type: 'field', dataType: 'integer', label: 'Amount' },
                ],
            },
        ];
        const el = renderWith(items, {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:form' },
            tree: {
                component: 'Tabs',
                tabLabels: ['Input', 'Review'],
                children: [
                    {
                        component: 'Stack',
                        children: [
                            { component: 'TextInput', bind: 'projectName' },
                            {
                                component: 'DataTable',
                                bind: 'lineItems',
                                columns: [
                                    { header: 'Description', bind: 'desc' },
                                    { header: 'Amount', bind: 'amount' },
                                ],
                            },
                        ],
                    },
                    {
                        component: 'Summary',
                        items: [{ label: 'Project Name', bind: 'projectName' }],
                    },
                ],
            },
        });

        const engine = el.getEngine();

        // Engine initializes repeatable groups with 1 instance by default
        engine.setValue('lineItems[0].desc', 'Item 1');
        engine.setValue('lineItems[0].amount', 100);

        // Verify DataTable has one row with the desc value
        const tbody = el.querySelector('tbody') as HTMLElement;
        const rows = tbody.querySelectorAll('tr');
        expect(rows.length).toBe(1);
        // First cell contains a span with the desc value (read-only mode)
        const firstCell = rows[0].querySelector('td') as HTMLElement;
        const cellSpan = firstCell.querySelector('span') as HTMLElement;
        expect(cellSpan.textContent).toBe('Item 1');

        // Switch to Tab 2 (Review)
        const tabButtons = el.querySelectorAll('.formspec-tab') as NodeListOf<HTMLButtonElement>;
        tabButtons[1].click();

        // Verify Summary shows project name label
        const summary = el.querySelector('.formspec-summary') as HTMLElement;
        expect(summary).not.toBeNull();
        const dt = summary.querySelector('dt') as HTMLElement;
        expect(dt.textContent).toBe('Project Name');

        // Update Project Name via engine and check Summary updates reactively
        engine.setValue('projectName', 'New Project');
        const dd = summary.querySelector('dd') as HTMLElement;
        expect(dd.textContent).toBe('New Project');
    });
});
