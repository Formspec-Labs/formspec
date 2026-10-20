/** @filedesc Public declaration types preserve the canonical schema shapes and existing conditional-field seam. */
import type { FormDefinition, FormItem, DocumentSource } from '../../src/index.js';
const source: DocumentSource = { kind: 'inline', data: 'SGVsbG8=' };
const field: FormItem = { key: 'sign', type: 'field', label: 'Sign', dataType: 'attachment', attests: ['terms-v2'] };
const definition: FormDefinition = { $formspec: '1.0', url: 'urn:test:documents', version: '1.0.0', title: 'Declarations', items: [field],
  documents: { 'terms-v2': { defaultLocale: 'en', variants: { en: { source, mediaType: 'text/plain',
    documentHash: '185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969' } } } } };
const ids: string[] | undefined = definition.items[0].attests;
const locale: string | undefined = definition.documents?.['terms-v2'].defaultLocale;
// @ts-expect-error Field scope contains document IDs, never numeric values.
field.attests = [42];
// @ts-expect-error URL sources use href, not inline data.
const badSource: DocumentSource = { kind: 'url', data: 'SGVsbG8=' };
// @ts-expect-error Declarations require locale variants.
definition.documents = { 'terms-v2': { defaultLocale: 'en' } };
void [ids, locale, badSource];
