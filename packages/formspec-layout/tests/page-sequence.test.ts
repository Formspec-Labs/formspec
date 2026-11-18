import { describe, expect, it } from 'vitest';
import { resolvePageSequence } from '../src/index';

// Renderable subtrees are verified in form-progress.test. Keep these assertions on page order and ownership.
const describePages = (plan: ReturnType<typeof resolvePageSequence>) =>
    plan.map(({ id, title, fields }) => ({ id, title, fields }));

function makeDefinition() {
    return {
        $formspec: '1.0',
        url: 'https://example.org/forms/grant',
        version: '1.0.0',
        title: 'Grant Application',
        formPresentation: { pageMode: 'wizard' },
        items: [
            {
                key: 'organization',
                type: 'group',
                children: [
                    { key: 'name', type: 'field', dataType: 'string', label: 'Organization Name' },
                    { key: 'ein', type: 'field', dataType: 'string', label: 'Employer Identification Number' },
                ],
            },
            { key: 'contactEmail', type: 'field', dataType: 'string', label: 'Contact Email' },
            {
                key: 'details',
                type: 'group',
                children: [
                    { key: 'summary', type: 'field', dataType: 'string', label: 'Project Summary' },
                ],
            },
        ],
    } as any;
}

describe('resolvePageSequence', () => {
    it('uses component pages before theme and definition hints', () => {
        const pages = resolvePageSequence(makeDefinition(), {
            component: {
                $formspecComponent: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'https://example.org/forms/grant' },
                tree: {
                    component: 'Stack',
                    children: [
                        {
                            component: 'Section',
                            id: 'component-contact',
                            title: 'Component Contact',
                            children: [{ component: 'TextInput', bind: 'contactEmail' }],
                        },
                        {
                            component: 'Section',
                            id: 'component-org',
                            title: 'Component Organization',
                            children: [
                                { component: 'TextInput', bind: 'organization.name' },
                                { component: 'TextInput', bind: 'organization.ein' },
                            ],
                        },
                        {
                            component: 'Section',
                            id: 'component-review',
                            title: 'Review',
                            children: [],
                        },
                    ],
                },
            } as any,
            theme: {
                $formspecTheme: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'https://example.org/forms/grant' },
                pages: [
                    { id: 'theme-contact', title: 'Theme Contact', regions: [{ key: 'contactEmail' }] },
                ],
            } as any,
        });

        expect(describePages(pages)).toEqual([
            { id: 'component-contact', title: 'Component Contact', fields: ['contactEmail'] },
            { id: 'component-org', title: 'Component Organization', fields: ['organization.name', 'organization.ein'] },
            { id: 'component-review', title: 'Review', fields: [] },
        ]);
    });

    it('uses a root component Section before theme pages', () => {
        const pages = resolvePageSequence(makeDefinition(), {
            component: {
                $formspecComponent: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'https://example.org/forms/grant' },
                tree: {
                    component: 'Section',
                    id: 'component-root',
                    title: 'Component Root',
                    children: [{ component: 'TextInput', bind: 'contactEmail' }],
                },
            } as any,
            theme: {
                $formspecTheme: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'https://example.org/forms/grant' },
                pages: [
                    { id: 'theme-contact', title: 'Theme Contact', regions: [{ key: 'contactEmail' }] },
                ],
            } as any,
        });

        expect(describePages(pages)).toEqual([
            { id: 'component-root', title: 'Component Root', fields: ['contactEmail'] },
        ]);
    });

    it('resolves theme regions with bracket-indexed bind paths (fs-i17a)', () => {
        const definition = {
            $formspec: '1.0',
            url: 'https://example.org/forms/repeat',
            version: '1.0.0',
            title: 'Repeat',
            items: [
                {
                    key: 'lineItems',
                    type: 'group',
                    repeatable: true,
                    children: [
                        { key: 'amount', type: 'field', dataType: 'decimal', label: 'Amount' },
                    ],
                },
            ],
        } as any;

        const pages = resolvePageSequence(definition, {
            theme: {
                $formspecTheme: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'https://example.org/forms/repeat' },
                pages: [
                    {
                        id: 'lines-page',
                        title: 'Line items',
                        regions: [{ key: 'lineItems[0].amount' }],
                    },
                ],
            } as any,
        });

        expect(describePages(pages)).toEqual([
            { id: 'lines-page', title: 'Line items', fields: ['lineItems[0].amount'] },
            // An explicit row placement only owns that row. The loose template still renders other rows.
            { id: 'lineItems', title: 'Additional items', fields: ['lineItems[*].amount'] },
        ]);
    });

    it('falls back to theme pages when no component pages exist', () => {
        const pages = resolvePageSequence(makeDefinition(), {
            theme: {
                $formspecTheme: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'https://example.org/forms/grant' },
                pages: [
                    { id: 'theme-contact', title: 'Theme Contact', regions: [{ key: 'contactEmail' }] },
                    { id: 'theme-details', title: 'Theme Details', regions: [{ key: 'details' }] },
                ],
            } as any,
        });

        expect(describePages(pages)).toEqual([
            { id: 'theme-contact', title: 'Theme Contact', fields: ['contactEmail'] },
            { id: 'theme-details', title: 'Theme Details', fields: ['details.summary'] },
            {
                id: 'organization',
                title: 'Additional items',
                fields: ['organization.name', 'organization.ein'],
            },
        ]);
    });

    it('still honors hand-authored theme pages when pageMode is single', () => {
        const definition = {
            ...makeDefinition(),
            formPresentation: { pageMode: 'single' },
        } as any;

        const pages = resolvePageSequence(definition, {
            theme: {
                $formspecTheme: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'https://example.org/forms/grant' },
                pages: [
                    { id: 'theme-contact', title: 'Theme Contact', regions: [{ key: 'contactEmail' }] },
                ],
            } as any,
        });

        expect(describePages(pages)).toEqual([
            { id: 'theme-contact', title: 'Theme Contact', fields: ['contactEmail'] },
            // A single-mode Theme still leaves its unassigned Items in the shared section plan.
            { id: 'organization', title: 'Additional items', fields: ['organization.name', 'organization.ein', 'details.summary'] },
        ]);
    });

    it('falls back to generated definition group sections when no component or theme pages exist', () => {
        const pages = resolvePageSequence(makeDefinition());
        expect(describePages(pages)).toEqual([
            // Generated IDs are Item keys and loose Items stay in structural order.
            { id: 'organization', title: 'organization', fields: ['organization.name', 'organization.ein'] },
            { id: 'contactEmail', title: 'Additional items', fields: ['contactEmail'] },
            { id: 'details', title: 'details', fields: ['details.summary'] },
        ]);
    });

    it('keeps generated group IDs independent of their labels', () => {
        const definition = {
            ...makeDefinition(),
            items: [
                {
                    key: 'contact',
                    type: 'group',
                    label: 'Contact',
                    children: [
                        { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
                    ],
                },
                {
                    key: 'details',
                    type: 'group',
                    label: 'Project Details',
                    children: [
                        { key: 'summary', type: 'field', dataType: 'string', label: 'Summary' },
                    ],
                },
            ],
        } as any;

        expect(describePages(resolvePageSequence(definition))).toEqual([
            { id: 'contact', title: 'Contact', fields: ['contact.email'] },
            { id: 'details', title: 'Project Details', fields: ['details.summary'] },
        ]);
    });

    it('uses component-tree theme pages when a component doc has no explicit Section nodes', () => {
        const pages = resolvePageSequence(makeDefinition(), {
            component: {
                $formspecComponent: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'https://example.org/forms/grant' },
                tree: {
                    component: 'Stack',
                    children: [
                        {
                            component: 'Stack',
                            bind: 'organization',
                            children: [{ component: 'TextInput', bind: 'name' }],
                        },
                    ],
                },
            } as any,
            theme: {
                $formspecTheme: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'https://example.org/forms/grant' },
                pages: [
                    { id: 'theme-org', title: 'Theme Org', regions: [{ key: 'organization' }] },
                ],
            } as any,
        });

        expect(describePages(pages)).toEqual([
            { id: 'theme-org', title: 'Theme Org', fields: ['organization.name'] },
            {
                id: 'contactEmail',
                title: 'Additional items',
                fields: ['contactEmail', 'details.summary'],
            },
        ]);
    });

    it('ignores theme pages when explicit component Section nodes exist', () => {
        const pages = resolvePageSequence(makeDefinition(), {
            component: {
                $formspecComponent: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'https://example.org/forms/grant' },
                tree: {
                    component: 'Stack',
                    children: [
                        {
                            component: 'Section',
                            id: 'component-only',
                            title: 'Component Only',
                            children: [{ component: 'TextInput', bind: 'contactEmail' }],
                        },
                    ],
                },
            } as any,
            theme: {
                $formspecTheme: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'https://example.org/forms/grant' },
                pages: [
                    { id: 'theme-contact', title: 'Theme Contact', regions: [{ key: 'contactEmail' }] },
                ],
            } as any,
        });

        expect(describePages(pages)).toEqual([
            { id: 'component-only', title: 'Component Only', fields: ['contactEmail'] },
        ]);
    });

    it('preserves theme page ids when earlier theme pages are skipped', () => {
        const pages = resolvePageSequence(makeDefinition(), {
            theme: {
                $formspecTheme: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'https://example.org/forms/grant' },
                pages: [
                    { id: 'theme-missing', title: 'Missing', regions: [{ key: 'missing' }] },
                    { id: 'theme-details', title: 'Theme Details', regions: [{ key: 'details' }] },
                ],
            } as any,
        });

        expect(describePages(pages)).toEqual([
            { id: 'theme-details', title: 'Theme Details', fields: ['details.summary'] },
            {
                id: 'organization',
                title: 'Additional items',
                fields: ['organization.name', 'organization.ein', 'contactEmail'],
            },
        ]);
    });
});
