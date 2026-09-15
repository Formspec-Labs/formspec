/** @filedesc Locale §3.1.10: the DataTable's own words — Add Row, Remove — follow a loaded Locale. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
let FormspecRender: any;
beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
});
afterEach(() => document.body.querySelectorAll('formspec-render').forEach((el) => el.remove()));

describe('DataTable chrome follows the Locale', () => {
    it('renames Add Row and the Remove buttons', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.componentDocument = {
            $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: 'urn:test:dt' },
            tree: { component: 'Stack', children: [{ component: 'DataTable', bind: 'rows', columns: [{ bind: 'qty', label: 'Qty' }] }] },
        };
        el.localeDocuments = [{
            $formspecLocale: '2.0', locale: 'fr', version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:dt' },
            strings: { '$ui.dataTable.addRow': 'Ajouter une ligne', '$ui.dataTable.remove': 'Supprimer' },
        }];
        el.definition = {
            $formspec: '1.0', url: 'urn:test:dt', version: '1.0.0', title: 'DT',
            items: [{ key: 'rows', type: 'group', label: 'Rows', repeatable: true, children: [{ key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' }] }],
        };
        el.locale = 'fr';
        el.render();
        expect(el.querySelector('.formspec-datatable-add')?.textContent).toBe('Ajouter une ligne');
        // The header's screen-reader column name keeps the inventory's English default, unauthored here.
        expect(el.querySelector('thead .formspec-sr-only')?.textContent).toBe('Actions');
    });
});
