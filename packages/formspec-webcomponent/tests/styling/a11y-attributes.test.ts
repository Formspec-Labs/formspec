import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

function renderWith(items: any[], binds: any[], tree: any) {
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
        ...(binds.length > 0 ? { binds } : {}),
    };
    el.render();
    return el;
}

describe('a11y attributes — label/describedby', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('links label and hint via aria-describedby', () => {
        const el = renderWith(
            [{ key: 'age', type: 'field', dataType: 'integer', label: 'Age', hint: 'Enter your age' }],
            [],
            {
                component: 'Section',
                children: [{ component: 'NumberInput', bind: 'age' }],
            },
        );
        const label = el.querySelector('label[for="field-age"]') as HTMLLabelElement;
        expect(label).not.toBeNull();

        const input = el.querySelector('#field-age') as HTMLInputElement;
        expect(input).not.toBeNull();
        const describedBy = input.getAttribute('aria-describedby') || '';
        expect(describedBy).toContain('field-age-hint');
        // Error ID is handled by role="alert" / aria-live, not linked via describedby in modern USWDS patterns
        expect(describedBy).not.toContain('field-age-error');

        const hint = el.querySelector('#field-age-hint') as HTMLElement;
        expect(hint).not.toBeNull();
        expect(hint.textContent).toBe('Enter your age');
    });
});

describe('a11y attributes — description linked via aria-describedby', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('links description element via aria-describedby before hint', () => {
        const el = renderWith(
            [{ key: 'name', type: 'field', dataType: 'string', label: 'Name', description: 'Your full legal name', hint: 'As it appears on your ID' }],
            [],
            {
                component: 'Section',
                children: [{ component: 'TextInput', bind: 'name' }],
            },
        );

        // Description element should have the correct id
        const descEl = el.querySelector('#field-name-desc') as HTMLElement;
        expect(descEl).not.toBeNull();
        expect(descEl.textContent).toBe('Your full legal name');

        // Input's aria-describedby should include description id
        const input = el.querySelector('#field-name') as HTMLInputElement;
        const describedBy = input.getAttribute('aria-describedby') || '';
        expect(describedBy).toContain('field-name-desc');
        expect(describedBy).toContain('field-name-hint');

        // Description id should come BEFORE hint id
        const descIdx = describedBy.indexOf('field-name-desc');
        const hintIdx = describedBy.indexOf('field-name-hint');
        expect(descIdx).toBeLessThan(hintIdx);
    });

    it('links description without hint', () => {
        const el = renderWith(
            [{ key: 'email', type: 'field', dataType: 'string', label: 'Email', description: 'Work email only' }],
            [],
            {
                component: 'Section',
                children: [{ component: 'TextInput', bind: 'email' }],
            },
        );

        const descEl = el.querySelector('#field-email-desc') as HTMLElement;
        expect(descEl).not.toBeNull();

        const input = el.querySelector('#field-email') as HTMLInputElement;
        const describedBy = input.getAttribute('aria-describedby') || '';
        expect(describedBy).toContain('field-email-desc');
    });
});

describe('a11y attributes — group heading levels', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('renders top-level group title as h3', () => {
        const el = renderWith(
            [
                { key: 'address', type: 'group', label: 'Address', children: [
                    { key: 'street', type: 'field', dataType: 'string', label: 'Street' },
                ] },
            ],
            [],
            {
                component: 'Section',
                children: [
                    { component: 'Group', bind: 'address', title: 'Address', children: [
                        { component: 'TextInput', bind: 'street' },
                    ] },
                ],
            },
        );
        const heading = el.querySelector('.formspec-group h3') as HTMLElement;
        expect(heading, 'group should render an h3 heading').not.toBeNull();
        expect(heading.textContent).toBe('Address');
        // Ensure it's specifically h3, not some other heading level
        expect(heading.tagName).toBe('H3');
    });

    it('renders nested group title as h4', () => {
        const el = renderWith(
            [
                { key: 'outer', type: 'group', label: 'Outer', children: [
                    { key: 'inner', type: 'group', label: 'Inner', children: [
                        { key: 'val', type: 'field', dataType: 'string', label: 'Value' },
                    ] },
                ] },
            ],
            [],
            {
                component: 'Section',
                children: [
                    { component: 'Group', bind: 'outer', title: 'Outer', children: [
                        { component: 'Group', bind: 'inner', title: 'Inner', children: [
                            { component: 'TextInput', bind: 'val' },
                        ] },
                    ] },
                ],
            },
        );
        const outerHeading = el.querySelector('.formspec-group > h3') as HTMLElement;
        expect(outerHeading).not.toBeNull();
        expect(outerHeading.textContent).toBe('Outer');

        const innerHeading = el.querySelector('.formspec-group .formspec-group > h4') as HTMLElement;
        expect(innerHeading).not.toBeNull();
        expect(innerHeading.textContent).toBe('Inner');
    });
});

describe('a11y attributes — accessibility metadata', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('applies role and aria-description attributes from accessibility metadata', () => {
        const el = renderWith(
            [{ key: 'search', type: 'field', dataType: 'string', label: 'Search' }],
            [],
            {
                component: 'Section',
                children: [
                    {
                        component: 'TextInput',
                        bind: 'search',
                        accessibility: {
                            role: 'search',
                            description: 'Search for items',
                        },
                    },
                ],
            },
        );
        const field = el.querySelector('.formspec-field') as HTMLElement;
        expect(field).not.toBeNull();
        expect(field.getAttribute('role')).toBe('search');
        expect(field.getAttribute('aria-description')).toBe('Search for items');
    });

    it('applies surface and accessibility metadata to scoped groups', () => {
        const el = renderWith(
            [
                { key: 'address', type: 'group', label: 'Address', children: [
                    { key: 'street', type: 'field', dataType: 'string', label: 'Street' },
                ] },
            ],
            [],
            {
                component: 'Section',
                children: [
                    {
                        component: 'Group',
                        bind: 'address',
                        title: 'Address',
                        padding: '1rem',
                        background: '#fff',
                        elevation: 'sm',
                        accessibility: {
                            role: 'group',
                            description: 'Address section',
                        },
                        children: [{ component: 'TextInput', bind: 'street' }],
                    },
                ],
            },
        );

        const group = el.querySelector('.formspec-group') as HTMLElement;
        expect(group).not.toBeNull();
        expect(group.style.padding).toBe('1rem');
        expect(group.style.background).toBe('#fff');
        expect(group.dataset.elevation).toBe('sm');
        expect(group.getAttribute('role')).toBe('group');
        expect(group.getAttribute('aria-description')).toBe('Address section');
    });
});
