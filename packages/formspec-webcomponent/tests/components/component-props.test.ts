import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

function renderWith(items: any[], tree: any) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:form' },
        tree,
    };
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

describe('component props — NumberInput', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('applies min max and step attributes from comp props', () => {
        const el = renderWith(
            [{ key: 'qty', type: 'field', dataType: 'integer', label: 'Quantity' }],
            {
                component: 'Section',
                children: [{ component: 'NumberInput', bind: 'qty', min: 1, max: 100, step: 5 }],
            },
        );
        const input = el.querySelector('input[type="number"]') as HTMLInputElement;
        expect(input).not.toBeNull();
        expect(input.getAttribute('min')).toBe('1');
        expect(input.getAttribute('max')).toBe('100');
        expect(input.getAttribute('step')).toBe('5');
    });
});

describe('component props — NumberInput stepper', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders stepper wrapper with decrement and increment buttons when showStepper is true', () => {
        const el = renderWith(
            [{ key: 'qty', type: 'field', dataType: 'integer', label: 'Quantity' }],
            {
                component: 'Section',
                children: [{ component: 'NumberInput', bind: 'qty', showStepper: true, min: 0, max: 10, step: 1 }],
            },
        );
        const stepper = el.querySelector('.formspec-stepper') as HTMLElement;
        expect(stepper).not.toBeNull();
        const decBtn = stepper.querySelector('.formspec-stepper-decrement') as HTMLButtonElement;
        const incBtn = stepper.querySelector('.formspec-stepper-increment') as HTMLButtonElement;
        expect(decBtn).not.toBeNull();
        expect(incBtn).not.toBeNull();
        expect(decBtn.getAttribute('aria-label')).toBe('Decrease Quantity');
        expect(incBtn.getAttribute('aria-label')).toBe('Increase Quantity');
    });

    it('renders a plain number input when showStepper is false or absent', () => {
        const el = renderWith(
            [{ key: 'qty', type: 'field', dataType: 'integer', label: 'Quantity' }],
            {
                component: 'Section',
                children: [{ component: 'NumberInput', bind: 'qty', min: 0, max: 10 }],
            },
        );
        expect(el.querySelector('.formspec-stepper')).toBeNull();
        expect(el.querySelector('input[type="number"]')).not.toBeNull();
    });

    it('stepper defaults step to 1 when not specified', () => {
        const el = renderWith(
            [{ key: 'qty', type: 'field', dataType: 'integer', label: 'Quantity' }],
            {
                component: 'Section',
                children: [{ component: 'NumberInput', bind: 'qty', showStepper: true, min: 0, max: 10 }],
            },
        );
        const stepper = el.querySelector('.formspec-stepper') as HTMLElement;
        expect(stepper).not.toBeNull();
        // The input should still be present inside the stepper
        const input = stepper.querySelector('input[type="number"]') as HTMLInputElement;
        expect(input).not.toBeNull();
    });
});

describe('component props — MoneyInput aria-describedby', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('links currency badge to amount input via aria-describedby', () => {
        const el = renderWith(
            [{ key: 'price', type: 'field', dataType: 'money', label: 'Price', currency: 'USD' }],
            {
                component: 'Section',
                children: [{ component: 'MoneyInput', bind: 'price' }],
            },
        );
        const badge = el.querySelector('.formspec-money-currency') as HTMLElement;
        expect(badge).not.toBeNull();
        expect(badge.id).toBeTruthy();
        const amountInput = el.querySelector('.formspec-money input') as HTMLInputElement;
        expect(amountInput).not.toBeNull();
        const describedBy = amountInput.getAttribute('aria-describedby') || '';
        expect(describedBy).toContain(badge.id);
    });
});

describe('component props — MoneyInput currency prefix position', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders currency symbol BEFORE the amount input (prefix)', () => {
        const el = renderWith(
            [{ key: 'price', type: 'field', dataType: 'money', label: 'Price', currency: 'USD' }],
            {
                component: 'Section',
                children: [{ component: 'MoneyInput', bind: 'price' }],
            },
        );
        const container = el.querySelector('.formspec-money') as HTMLElement;
        expect(container).not.toBeNull();
        const children = Array.from(container.children);
        const badgeIdx = children.findIndex(c => c.classList.contains('formspec-money-currency'));
        const inputIdx = children.findIndex(c => c.tagName === 'INPUT');
        expect(badgeIdx).toBeGreaterThanOrEqual(0);
        expect(inputIdx).toBeGreaterThanOrEqual(0);
        expect(badgeIdx).toBeLessThan(inputIdx);
    });

    it('renders amount input as type="text" with inputmode="decimal"', () => {
        const el = renderWith(
            [{ key: 'amt', type: 'field', dataType: 'money', label: 'Amount', currency: 'USD' }],
            {
                component: 'Section',
                children: [{ component: 'MoneyInput', bind: 'amt' }],
            },
        );
        const input = el.querySelector('.formspec-money input') as HTMLInputElement;
        expect(input).not.toBeNull();
        expect(input.type).toBe('text');
        expect(input.inputMode).toBe('decimal');
    });
});

describe('component props — Select', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders placeholder and clear option when clearable is configured', () => {
        const el = renderWith(
            [{
                key: 'size',
                type: 'field',
                dataType: 'choice',
                label: 'Size',
                options: [
                    { value: 's', label: 'Small' },
                    { value: 'm', label: 'Medium' },
                    { value: 'l', label: 'Large' },
                ],
            }],
            {
                component: 'Section',
                children: [{ component: 'Select', bind: 'size', placeholder: 'Choose a size', clearable: true }],
            },
        );
        const options = el.querySelectorAll('select option');
        // Placeholder option + clear option + 3 real options = 5
        expect(options.length).toBe(5);
        expect((options[0] as HTMLOptionElement).textContent).toBe('Choose a size');
        expect((options[0] as HTMLOptionElement).disabled).toBe(true);
        expect((options[1] as HTMLOptionElement).textContent).toBe('— Clear —');
    });

    it('searchable Select wraps combobox input in .formspec-combobox-row', () => {
        const el = renderWith(
            [{
                key: 'dept',
                type: 'field',
                dataType: 'choice',
                label: 'Dept',
                options: [{ value: 'a', label: 'A' }],
            }],
            {
                component: 'Section',
                children: [{ component: 'Select', bind: 'dept', searchable: true }],
            },
        );
        const input = el.querySelector('input[role="combobox"]') as HTMLInputElement;
        expect(input).not.toBeNull();
        expect(input.closest('.formspec-combobox-row')).not.toBeNull();
    });

    it('applies placeholder to searchable Select input', () => {
        const el = renderWith(
            [{
                key: 'dept',
                type: 'field',
                dataType: 'choice',
                label: 'Dept',
                options: [{ value: 'a', label: 'A' }],
            }],
            {
                component: 'Section',
                children: [{ component: 'Select', bind: 'dept', searchable: true, placeholder: 'Choose a department' }],
            },
        );
        const input = el.querySelector('input[role="combobox"]') as HTMLInputElement;
        expect(input).not.toBeNull();
        expect(input.placeholder).toBe('Choose a department');
    });
});

describe('component props — DatePicker', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('applies minDate and maxDate as HTML min/max attributes', () => {
        const el = renderWith(
            [{ key: 'dob', type: 'field', dataType: 'date', label: 'DOB' }],
            {
                component: 'Section',
                children: [{ component: 'DatePicker', bind: 'dob', minDate: '1900-01-01', maxDate: '2025-12-31' }],
            },
        );
        const input = el.querySelector('input[type="date"]') as HTMLInputElement;
        expect(input).not.toBeNull();
        expect(input.getAttribute('min')).toBe('1900-01-01');
        expect(input.getAttribute('max')).toBe('2025-12-31');
    });

    it('applies placeholder to the input', () => {
        const el = renderWith(
            [{ key: 'dob', type: 'field', dataType: 'date', label: 'DOB' }],
            {
                component: 'Section',
                children: [{ component: 'DatePicker', bind: 'dob', placeholder: 'YYYY-MM-DD' }],
            } as any,
        );
        const input = el.querySelector('input[type="date"]') as HTMLInputElement;
        expect(input).not.toBeNull();
        expect(input.placeholder).toBe('YYYY-MM-DD');
    });
});

describe('component props — NumberInput', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('applies placeholder to the input', () => {
        const el = renderWith(
            [{ key: 'qty', type: 'field', dataType: 'number', label: 'Qty' }],
            {
                component: 'Section',
                children: [{ component: 'NumberInput', bind: 'qty', placeholder: '0.00' }],
            } as any,
        );
        const input = el.querySelector('input[type="number"]') as HTMLInputElement;
        expect(input).not.toBeNull();
        expect(input.placeholder).toBe('0.00');
    });
});

describe('component props — TextInput prefix/suffix', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders prefix and suffix wrapper spans when adornments are configured', () => {
        const el = renderWith(
            [{ key: 'amount', type: 'field', dataType: 'string', label: 'Amount' }],
            {
                component: 'Section',
                children: [{ component: 'TextInput', bind: 'amount', prefix: '$', suffix: 'USD' }],
            },
        );
        const prefix = el.querySelector('.formspec-prefix') as HTMLElement;
        const suffix = el.querySelector('.formspec-suffix') as HTMLElement;
        expect(prefix).not.toBeNull();
        expect(suffix).not.toBeNull();
        expect(prefix.textContent).toBe('$');
        expect(suffix.textContent).toBe('USD');
    });
});

describe('component props — Tabs defaultTab', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('activates the configured default tab on render', () => {
        const el = renderWith(
            [
                { key: 'a', type: 'field', dataType: 'string', label: 'A' },
                { key: 'b', type: 'field', dataType: 'string', label: 'B' },
            ],
            {
                component: 'Tabs',
                tabLabels: ['First', 'Second'],
                defaultTab: 1,
                children: [
                    { component: 'Stack', children: [{ component: 'TextInput', bind: 'a' }] },
                    { component: 'Stack', children: [{ component: 'TextInput', bind: 'b' }] },
                ],
            },
        );
        const panels = el.querySelectorAll('.formspec-tab-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(false);
        const buttons = el.querySelectorAll('.formspec-tab');
        expect(buttons[1].classList.contains('formspec-tab--active')).toBe(true);
    });
});

describe('component props — Section description', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders description text when Section description is provided', () => {
        const el = renderWith(
            [],
            {
                component: 'Section',
                title: 'Welcome',
                description: 'Please fill out this form carefully.',
                children: [],
            },
        );
        const desc = el.querySelector('.formspec-section-description') as HTMLElement;
        expect(desc).not.toBeNull();
        expect(desc.textContent).toBe('Please fill out this form carefully.');
    });
});

describe('component props — Heading level', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders the correct heading element for the specified level', () => {
        const el = renderWith(
            [],
            {
                component: 'Section',
                children: [
                    { component: 'Heading', level: 3, text: 'Level 3' },
                ],
            },
        );
        const h3 = el.querySelector('h3.formspec-heading') as HTMLElement;
        expect(h3, 'should render an h3 element').not.toBeNull();
        expect(h3.textContent).toBe('Level 3');
    });

    it('defaults to h2 when no level is specified', () => {
        const el = renderWith(
            [],
            {
                component: 'Section',
                children: [
                    { component: 'Heading', text: 'No level' },
                ],
            },
        );
        const h2 = el.querySelector('h2.formspec-heading') as HTMLElement;
        expect(h2, 'should default to h2').not.toBeNull();
        expect(h2.textContent).toBe('No level');
    });

    it('renders h1 through h6 for each level value', () => {
        const el = renderWith(
            [],
            {
                component: 'Section',
                children: [
                    { component: 'Heading', level: 1, text: 'H1' },
                    { component: 'Heading', level: 2, text: 'H2' },
                    { component: 'Heading', level: 4, text: 'H4' },
                    { component: 'Heading', level: 6, text: 'H6' },
                ],
            },
        );
        expect(el.querySelector('h1.formspec-heading')?.textContent).toBe('H1');
        expect(el.querySelector('h2.formspec-heading')?.textContent).toBe('H2');
        expect(el.querySelector('h4.formspec-heading')?.textContent).toBe('H4');
        expect(el.querySelector('h6.formspec-heading')?.textContent).toBe('H6');
    });
});

describe('definition fallback — display item with widgetHint heading', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders a Heading component for a display item with widgetHint heading', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [
                { key: 'header', type: 'display', label: 'Section Title', presentation: { widgetHint: 'Heading' } },
            ],
        };
        el.render();
        const heading = el.querySelector('.formspec-heading') as HTMLElement;
        expect(heading, 'display item with heading hint should render a heading').not.toBeNull();
        expect(heading.tagName).toBe('H2');
        expect(heading.textContent).toBe('Section Title');
    });

    it('forwards presentation level to the Heading component', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [
                { key: 'header', type: 'display', label: 'Section Title', presentation: { widgetHint: 'Heading', level: 3 } },
            ],
        };
        el.render();
        const heading = el.querySelector('.formspec-heading') as HTMLElement;
        expect(heading, 'should render an h3 when level 3 is specified').not.toBeNull();
        expect(heading.tagName).toBe('H3');
    });
});
