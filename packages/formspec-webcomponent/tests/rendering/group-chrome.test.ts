/** @filedesc A group's chrome: grid-flow children, a hidden-but-accessible title, and the group's own hint. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

function render(group: Record<string, unknown>, theme?: Record<string, unknown>, locale?: Record<string, string>) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    if (theme) el.themeDocument = { $formspecTheme: '1.0', version: '1.0.0', items: theme };
    if (locale) {
        el.localeDocuments = {
            $formspecLocale: '2.0',
            locale: 'en',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:group' },
            strings: locale,
        };
        el.locale = 'en';
    }
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:group',
        version: '1.0.0',
        title: 'Group chrome',
        items: [group],
    };
    el.render();
    return { el: el as HTMLElement, engine: el.getEngine() };
}

describe('grid-flow groups', () => {
    it('puts the children in one grid, so their spans have a grid to sit in', () => {
        const { el } = render({
            key: 'hoursWorked',
            type: 'group',
            label: 'Hours worked',
            presentation: { layout: { flow: 'grid', columns: 12 } },
            children: [
                { key: 'hours', type: 'field', dataType: 'integer', label: 'Hours', presentation: { layout: { grid: { span: 6 } } } },
                { key: 'minutes', type: 'field', dataType: 'integer', label: 'Minutes', presentation: { layout: { grid: { span: 6 } } } },
            ],
        });

        const grid = el.querySelector('.formspec-grid') as HTMLElement;
        expect(grid).not.toBeNull();
        expect(grid.style.gridTemplateColumns).toBe('repeat(12, 1fr)');
        expect(grid.querySelectorAll('input')).toHaveLength(2);
        // The grid sits inside the group, which keeps its own title and scope.
        expect(grid.closest('.formspec-group')).not.toBeNull();
        expect(el.querySelector('.formspec-group-title')?.textContent).toBe('Hours worked');
    });

    it('leaves a stack-flow group alone', () => {
        const { el } = render({
            key: 'address',
            type: 'group',
            label: 'Address',
            children: [{ key: 'city', type: 'field', dataType: 'string', label: 'City' }],
        });

        expect(el.querySelector('.formspec-grid')).toBeNull();
    });
});

describe('group title and hint', () => {
    it("keeps a hidden title in the accessible markup and off the page (theme §5.2)", () => {
        const { el } = render(
            {
                key: 'workWeek',
                type: 'group',
                label: 'Work this week',
                children: [{ key: 'worked', type: 'field', dataType: 'string', label: 'Worked' }],
            },
            { workWeek: { labelPosition: 'hidden' } },
        );
        const title = el.querySelector('.formspec-group-title') as HTMLElement;

        expect(title.textContent).toBe('Work this week');
        expect(title.classList.contains('formspec-sr-only')).toBe(true);
    });

    it('draws no title at all for an authored empty group label', () => {
        const { el } = render({
            key: 'workWeek',
            type: 'group',
            label: '',
            children: [{ key: 'worked', type: 'field', dataType: 'string', label: 'Worked' }],
        });

        expect(el.querySelector('.formspec-group-title')).toBeNull();
        expect(el.querySelector('input')).not.toBeNull();
    });

    it("renders the group's own hint, from the Locale when it has one", () => {
        const inline = render({
            key: 'hoursWorked',
            type: 'group',
            label: 'Hours worked',
            hint: "If you have worked more than 99 hours, enter '99'.",
            children: [{ key: 'hours', type: 'field', dataType: 'integer', label: 'Hours' }],
        });
        expect(inline.el.querySelector('.formspec-group > .formspec-hint')?.textContent)
            .toBe("If you have worked more than 99 hours, enter '99'.");

        const localized = render(
            {
                key: 'hoursWorked',
                type: 'group',
                label: 'Hours worked',
                hint: 'Enter 99 at most.',
                children: [{ key: 'hours', type: 'field', dataType: 'integer', label: 'Hours' }],
            },
            undefined,
            { 'hoursWorked.hint': 'Au plus 99.' },
        );
        expect(localized.el.querySelector('.formspec-group > .formspec-hint')?.textContent).toBe('Au plus 99.');
    });

    it('renders no hint node when the group has none', () => {
        const { el } = render({
            key: 'hoursWorked',
            type: 'group',
            label: 'Hours worked',
            children: [{ key: 'hours', type: 'field', dataType: 'integer', label: 'Hours' }],
        });

        expect(el.querySelector('.formspec-group > .formspec-hint')).toBeNull();
    });
});
