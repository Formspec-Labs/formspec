/** @filedesc Synthetic exported Surface with two forms and a route that mounts both. */
import type { BundleExport } from '@formspec-org/surface';

const surface = 'urn:example:surface:registration';
const contact = 'urn:example:form:contact';
const equipment = 'urn:example:form:equipment';

const slot = (id: string, definitionRef: string) => ({ id, slotType: 'definition-form', binding: { definitionRef } });
const section = (key: string, label: string, field: string, question: string) => ({
    key, type: 'group', label,
    children: [{ key: field, type: 'field', dataType: 'string', label: question }],
});

export const surfaceWalkExport: BundleExport = {
    manifest: {
        $formspecBundle: '2.4', id: 'urn:example:registration', title: 'Registration', entrySurface: surface,
        surfaces: [{ url: surface }], definitions: [{ url: contact }, { url: equipment }],
    },
    documents: {
        [surface]: {
            $formspecSurface: '0.2', id: 'registration', entry: 'contact',
            routes: [
                { id: 'contact', path: '/contact', title: 'Contact', routeClass: 'intake', slots: [slot('details', contact)] },
                { id: 'equipment', path: '/equipment/{state}', title: 'Equipment', routeClass: 'intake',
                    params: [{ name: 'state', type: 'string' }], slots: [slot('details', contact), slot('inventory', equipment)] },
            ],
        },
        [contact]: {
            $formspec: '1.0', version: '1.0.0', url: contact, title: 'Contact', formPresentation: { pageMode: 'workspace' },
            items: [section('person', 'Person', 'name', 'Full name'), section('address', 'Address', 'city', 'City')],
        },
        [equipment]: {
            $formspec: '1.0', version: '1.0.0', url: equipment, title: 'Equipment', formPresentation: { pageMode: 'tabs', defaultTab: 1 },
            items: [section('device', 'Device', 'model', 'Model'), section('storage', 'Storage', 'room', 'Room')],
        },
    },
};
