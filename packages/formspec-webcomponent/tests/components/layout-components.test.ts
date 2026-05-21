import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

function renderWith(items: any[], tree: any, componentOverrides: Record<string, unknown> = {}) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:form' },
        ...componentOverrides,
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

// ── progressive-component-rendering tests ─────────────────────────────────────

describe('layout components — Divider', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders unlabeled and labeled dividers', () => {
        const el = renderWith(
            [],
            {
                component: 'Stack',
                children: [
                    { component: 'Divider' },
                    { component: 'Divider', label: 'Section Break' },
                ],
            },
        );
        const dividers = el.querySelectorAll('.formspec-divider');
        expect(dividers.length).toBe(2);
        const labelEl = dividers[1].querySelector('.formspec-divider-label') as HTMLElement;
        expect(labelEl).not.toBeNull();
        expect(labelEl.textContent).toBe('Section Break');
    });
});

describe('layout components — Collapsible', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders collapsible content as open when defaultOpen is true', () => {
        const el = renderWith(
            [{ key: 'x', type: 'field', dataType: 'string', label: 'X' }],
            {
                component: 'Stack',
                children: [
                    {
                        component: 'Collapsible',
                        title: 'More Details',
                        defaultOpen: true,
                        children: [{ component: 'TextInput', bind: 'x' }],
                    },
                ],
            },
        );
        const details = el.querySelector('.formspec-collapsible') as HTMLDetailsElement;
        expect(details).not.toBeNull();
        expect(details.open).toBe(true);
        const summary = details.querySelector('summary') as HTMLElement;
        expect(summary.textContent).toBe('More Details');
        const content = details.querySelector('.formspec-collapsible-content') as HTMLElement;
        expect(content.querySelector('input')).not.toBeNull();
    });
});

describe('layout components — Panel', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders panel chrome and title when Panel content is mounted', () => {
        const el = renderWith(
            [],
            {
                component: 'Panel',
                title: 'Important Info',
                children: [{ component: 'Text', text: 'Panel content' }],
            },
        );
        const panel = el.querySelector('.formspec-panel') as HTMLElement;
        expect(panel).not.toBeNull();
        const header = panel.querySelector('.formspec-panel-header') as HTMLElement;
        expect(header.textContent).toBe('Important Info');
        const body = panel.querySelector('.formspec-panel-body') as HTMLElement;
        expect(body.textContent).toContain('Panel content');
    });
});

describe('layout components — Accordion defaultOpen', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('opens only the default section when Accordion is initialized', () => {
        const el = renderWith(
            [],
            {
                component: 'Accordion',
                labels: ['Section 1', 'Section 2', 'Section 3'],
                defaultOpen: 0,
                children: [
                    { component: 'Text', text: 'Content 1' },
                    { component: 'Text', text: 'Content 2' },
                    { component: 'Text', text: 'Content 3' },
                ],
            },
        );
        const items = el.querySelectorAll('.formspec-accordion-item') as NodeListOf<HTMLDetailsElement>;
        expect(items.length).toBe(3);
        expect(items[0].open).toBe(true);
        const summary = items[0].querySelector('summary') as HTMLElement;
        expect(summary.textContent).toBe('Section 1');
        expect(items[1].open).toBe(false);
        expect(items[2].open).toBe(false);
    });
});

describe('layout components — Accordion repeats', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('opens the newest repeat instance so its remove control is immediately available', () => {
        const el = renderWith(
            [
                {
                    key: 'members',
                    type: 'group',
                    label: 'Members',
                    repeatable: true,
                    children: [
                        { key: 'memberName', type: 'field', dataType: 'string', label: 'Member Name' },
                    ],
                },
            ],
            {
                component: 'Stack',
                children: [
                    {
                        component: 'Accordion',
                        bind: 'members',
                        children: [{ component: 'TextInput', bind: 'memberName' }],
                    },
                ],
            },
        );

        const addButton = Array.from(el.querySelectorAll('button')).find(button => button.textContent === 'Add Members');
        expect(addButton).not.toBeUndefined();
        addButton!.click();

        const items = el.querySelectorAll('.formspec-accordion-item') as NodeListOf<HTMLDetailsElement>;
        expect(items.length).toBeGreaterThan(0);
        const repeatWrapper = el.querySelector('.formspec-repeat.formspec-repeat--accordion') as HTMLElement;
        expect(repeatWrapper).not.toBeNull();
        expect(el.querySelector('.formspec-accordion--repeat')).not.toBeNull();
        expect(el.querySelectorAll('.formspec-accordion-content--repeat').length).toBe(items.length);
        expect(repeatWrapper.querySelector('.formspec-repeat-add')).not.toBeNull();
        expect(repeatWrapper.querySelector('.formspec-sr-only[aria-live="polite"]')).not.toBeNull();
        expect(items[items.length - 1].open).toBe(true);
        expect(items[items.length - 1].textContent).toContain('Remove Members');
        expect(items[items.length - 1].querySelector('.formspec-repeat-remove')).not.toBeNull();
    });
});

describe('layout components — Toggle', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('keeps off/on labels on fixed spans and toggles formspec-toggle--on', async () => {
        const el = renderWith(
            [{ key: 't', type: 'field', dataType: 'boolean', label: 'T' }],
            {
                component: 'Stack',
                children: [
                    { component: 'Toggle', bind: 't', onLabel: 'On', offLabel: 'Off' },
                ],
            },
        );
        const wrap = el.querySelector('.formspec-toggle') as HTMLElement;
        const off = wrap.querySelector('.formspec-toggle-off') as HTMLElement;
        const on = wrap.querySelector('.formspec-toggle-on') as HTMLElement;
        expect(off.textContent).toBe('Off');
        expect(on.textContent).toBe('On');
        expect(wrap.classList.contains('formspec-toggle--on')).toBe(false);

        const input = wrap.querySelector('input[type="checkbox"]') as HTMLInputElement;
        input.click();
        await Promise.resolve();
        expect(wrap.classList.contains('formspec-toggle--on')).toBe(true);
        expect(off.textContent).toBe('Off');
        expect(on.textContent).toBe('On');
    });
});

describe('layout components — FileUpload', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders drop zone and accept attribute when dragDrop and accept are configured', () => {
        const el = renderWith(
            [{ key: 'doc', type: 'field', dataType: 'attachment', label: 'Document' }],
            {
                component: 'Section',
                children: [{ component: 'FileUpload', bind: 'doc', accept: '.pdf,.doc', dragDrop: true }],
            },
        );
        const dropZone = el.querySelector('.formspec-file-drop-zone') as HTMLElement;
        expect(dropZone).not.toBeNull();
        expect(dropZone.textContent).toContain('Drag & drop a file here');
        expect(dropZone.getAttribute('aria-label')).toContain('Drop files here');
        const fileInput = el.querySelector('.formspec-file-upload input[type="file"]') as HTMLInputElement;
        expect(fileInput.getAttribute('accept')).toBe('.pdf,.doc');
        const list = el.querySelector('.formspec-file-upload .formspec-file-list') as HTMLUListElement;
        expect(list).not.toBeNull();
        expect(list.hidden).toBe(true);
    });
});

describe('layout components — DataTable parity', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('uses the shared datatable chrome contract', () => {
        const el = renderWith(
            [
                {
                    key: 'expenses',
                    type: 'group',
                    label: 'Expenses',
                    repeatable: true,
                    minRepeat: 1,
                    children: [
                        { key: 'description', type: 'field', dataType: 'string', label: 'Description' },
                    ],
                },
            ],
            {
                component: 'Stack',
                children: [
                    {
                        component: 'DataTable',
                        bind: 'expenses',
                        title: 'Expenses',
                        allowAdd: true,
                        allowRemove: true,
                        columns: [{ header: 'Description', bind: 'description' }],
                    },
                ],
            },
        );

        const wrapper = el.querySelector('.formspec-data-table-wrapper') as HTMLElement;
        expect(wrapper).not.toBeNull();
        expect(wrapper.querySelector('table.formspec-data-table')).not.toBeNull();
        expect(wrapper.querySelector('caption')?.textContent).toBe('Expenses');
        expect(wrapper.querySelector('.formspec-datatable-add')).not.toBeNull();
        const actionHeader = wrapper.querySelector('th:last-child .formspec-sr-only');
        expect(actionHeader?.textContent).toBe('Actions');
        const removeButton = wrapper.querySelector('.formspec-datatable-remove') as HTMLButtonElement;
        expect(removeButton).not.toBeNull();
        expect(removeButton.className).toBe('formspec-datatable-remove formspec-button-danger formspec-focus-ring');
        const addButton = wrapper.querySelector('.formspec-datatable-add') as HTMLButtonElement;
        expect(addButton.className).toBe('formspec-datatable-add formspec-focus-ring');
    });
});

describe('layout components — Signature', () => {
    beforeAll(() => {
        // Mock getContext for happy-dom
        HTMLCanvasElement.prototype.getContext = function(type: string) {
            if (type === '2d') {
                return {
                    scale: () => {},
                    beginPath: () => {},
                    moveTo: () => {},
                    lineTo: () => {},
                    stroke: () => {},
                    clearRect: () => {},
                    canvas: this,
                } as any;
            }
            return null;
        };
    });

    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders signature canvas and clear control when Signature is mounted', () => {
        const el = renderWith(
            [{ key: 'sig', type: 'field', dataType: 'attachment', label: 'Signature' }],
            {
                component: 'Section',
                children: [{ component: 'Signature', bind: 'sig', height: 150, strokeColor: '#0000ff' }],
            },
        );
        const canvas = el.querySelector('.formspec-signature-canvas') as HTMLCanvasElement;
        expect(canvas).not.toBeNull();
        
        // Mock bounding rect because happy-dom returns zeros
        canvas.getBoundingClientRect = () => ({
            width: 300,
            height: 150,
            top: 0,
            left: 0,
            right: 300,
            bottom: 150,
            x: 0,
            y: 0,
            toJSON: () => {},
        });
        
        // Trigger resize logic manually since it happened on mount with 0/0
        // Or just check that it was rendered. The component calls resizeCanvas in mount.
        // Actually, let's re-render or just check the DOM presence.
        // The component's resizeCanvas uses the rect from the canvas element.
        // Since we want to test that the component *respects* the height prop:
        expect(canvas).not.toBeNull();
        const clearBtn = el.querySelector('.formspec-signature-clear') as HTMLButtonElement;
        expect(clearBtn).not.toBeNull();
        expect(clearBtn.textContent).toBe('Clear');
    });
});

describe('layout components — ProgressBar (static)', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders progress value and percentage text when showPercent is enabled', () => {
        const el = renderWith(
            [],
            {
                component: 'Stack',
                children: [{ component: 'ProgressBar', value: 65, max: 100, showPercent: true }],
            },
        );
        const progress = el.querySelector('.formspec-progress-bar progress') as HTMLProgressElement;
        expect(progress).not.toBeNull();
        expect(progress.max).toBe(100);
        expect(progress.value).toBe(65);
        const percent = el.querySelector('.formspec-progress-percent') as HTMLElement;
        expect(percent.textContent).toBe('65%');
    });
});

// ── renderer-parity-gaps tests (task 4.5) ────────────────────────────────────

describe('layout components — Popover triggerBind', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('falls back to triggerLabel when field is empty', () => {
        const el = renderWith(
            [{ key: 'itemDesc', type: 'field', dataType: 'string', label: 'Item Desc' }],
            {
                component: 'Stack',
                children: [
                    {
                        component: 'Popover',
                        triggerBind: 'itemDesc',
                        triggerLabel: 'Line Item Details',
                        placement: 'left',
                        children: [{ component: 'Text', text: 'Details content' }],
                    },
                ],
            },
        );
        const trigger = el.querySelector('.formspec-popover-trigger') as HTMLButtonElement;
        expect(trigger).not.toBeNull();
        // Field is empty/null → should show fallback triggerLabel
        expect(trigger.textContent).toBe('Line Item Details');
    });

    it('shows field value as trigger text when triggerBind has a value', () => {
        const el = renderWith(
            [{ key: 'itemDesc', type: 'field', dataType: 'string', label: 'Item Desc' }],
            {
                component: 'Stack',
                children: [
                    {
                        component: 'Popover',
                        triggerBind: 'itemDesc',
                        triggerLabel: 'Line Item Details',
                        placement: 'left',
                        children: [{ component: 'Text', text: 'Details content' }],
                    },
                ],
            },
        );
        const engine = el.getEngine();
        engine.setValue('itemDesc', 'Office supplies');
        const trigger = el.querySelector('.formspec-popover-trigger') as HTMLButtonElement;
        expect(trigger.textContent).toBe('Office supplies');
    });
});

describe('layout components — Grid columns', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('sets inline gridTemplateColumns style when columns is a string', () => {
        const el = renderWith(
            [],
            {
                component: 'Grid',
                columns: '1fr 2fr 1fr',
                children: [
                    { component: 'Text', text: 'A' },
                    { component: 'Text', text: 'B' },
                    { component: 'Text', text: 'C' },
                ],
            },
        );
        const grid = el.querySelector('.formspec-grid') as HTMLElement;
        expect(grid).not.toBeNull();
        expect(grid.style.gridTemplateColumns).toBe('1fr 2fr 1fr');
    });

    it('uses data-columns attribute when columns is a number', () => {
        const el = renderWith(
            [],
            {
                component: 'Grid',
                columns: 3,
                children: [
                    { component: 'Text', text: 'A' },
                    { component: 'Text', text: 'B' },
                    { component: 'Text', text: 'C' },
                ],
            },
        );
        const grid = el.querySelector('.formspec-grid') as HTMLElement;
        expect(grid).not.toBeNull();
        expect(grid.dataset.columns).toBe('3');
    });

    it('resolves tokenized track arrays before rendering', () => {
        const el = renderWith(
            [],
            {
                component: 'Grid',
                columns: ['$token.layout.sidebar', 1],
                children: [{ component: 'Text', text: 'A' }],
            },
            { tokens: { 'layout.sidebar': '16rem' } },
        );
        const grid = el.querySelector('.formspec-grid') as HTMLElement;
        expect(grid).not.toBeNull();
        expect(grid.style.gridTemplateColumns).toBe('16rem 1fr');
    });

    it('applies grid placement from child layout.grid', () => {
        const el = renderWith(
            [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
            {
                component: 'Grid',
                columns: 12,
                children: [
                    {
                        component: 'TextInput',
                        bind: 'name',
                        layout: { grid: { span: 4, start: 2, rowSpan: 2, rowStart: 3 } },
                    },
                ],
            },
        );
        const field = el.querySelector('.formspec-field') as HTMLElement;
        expect(field).not.toBeNull();
        expect(field.style.gridColumn).toBe('2 / span 4');
        expect(field.style.gridRow).toBe('3 / span 2');
    });
});

describe('layout components — Stack horizontal', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('applies horizontal class when direction is horizontal', () => {
        const el = renderWith(
            [],
            {
                component: 'Stack',
                direction: 'horizontal',
                children: [
                    { component: 'Text', text: 'A' },
                    { component: 'Text', text: 'B' },
                ],
            },
        );
        expect(el.querySelector('.formspec-stack--horizontal')).not.toBeNull();
    });

    it('maps Stack justify tokens to CSS justify-content values', () => {
        const el = renderWith(
            [],
            {
                component: 'Stack',
                direction: 'horizontal',
                justify: 'between',
                children: [
                    { component: 'Text', text: 'A' },
                    { component: 'Text', text: 'B' },
                ],
            },
        );
        const stack = el.querySelector('.formspec-stack') as HTMLElement;
        expect(stack.style.justifyContent).toBe('space-between');
    });
});
