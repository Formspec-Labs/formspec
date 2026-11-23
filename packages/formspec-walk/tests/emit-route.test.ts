/** @filedesc An emitted walk keeps the form slot selected on a multi-form Surface route. */
import { expect, it } from 'vitest';
import { derivePlan, emitSpec } from '../src/index.js';
import type { FormDefinition } from '@formspec-org/types';

it('opens the selected form slot on the supplied app route for every generated check', () => {
    const definition: FormDefinition = {
        $formspec: '1.0', version: '1.0.0', url: 'urn:example:contact', title: 'Contact',
        items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Contact name' }],
    };
    const root = '[data-route="apply"] [data-slot="contact"] [data-formspec-render-root]';
    const spec = emitSpec(derivePlan(definition), definition, {
        url: '/filing/#/apply', root, source: 'example', command: 'formspec-walk emit',
    });
    expect(spec).toContain("const PAGE = '/filing/#/apply'");
    expect(spec).toContain(`Walk.open(page, { url: PAGE, root: '${root}'`);
});

it('routes exact field and repeat cases to their configured page and requires each check to run', () => {
    const definition: FormDefinition = {
        $formspec: '1.0', version: '1.0.0', url: 'urn:example:scoped', title: 'Scoped contact',
        items: [
            { key: 'name', type: 'field', dataType: 'string', label: 'Contact name' },
            { key: 'contacts', type: 'group', label: 'Contacts', repeatable: true, children: [
                { key: 'name', type: 'field', dataType: 'string', label: 'Contact name' },
            ] },
        ],
        binds: [{ path: 'contacts', relevant: '@instance("people").active' }],
    };
    const plan = derivePlan(definition);
    const options = { url: '/basic', source: 'example', command: 'formspec-walk emit', caseUrls: { contacts: '/alternate', 'contacts.name': '/alternate' } };
    const spec = emitSpec(plan, definition, { ...options, recipes: new Map([['contacts.name', [{ path: 'name', value: 'old input' }]]]) });
    expect(spec).toContain('{"type":"formspec-item-path","description":"contacts.name"}');
    expect(spec.match(/"type":"formspec-case-url","description":"\/alternate"/g)).toHaveLength(2);
    expect(spec).toContain("await walk.field('name', { label: 'Contact name' });");
    expect(spec).toContain("if (!await walk.reveal('contacts.name', { label: 'Contact name', shownBy: 'engine' }))");
    expect(spec).toContain("if (!await walk.repeat('contacts',");
    expect(spec).not.toContain('old input');
    expect(() => emitSpec(plan, definition, { ...options, caseUrls: { unrelated: '/alternate' } })).toThrow('unrelated');
});
