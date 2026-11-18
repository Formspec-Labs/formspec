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
