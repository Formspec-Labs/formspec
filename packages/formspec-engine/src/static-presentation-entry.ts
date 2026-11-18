/** @filedesc Public static presentation reader; no Engine or WASM initialization. */
export { createStaticResponseMetadataReader } from './static-response-metadata.js';
export type { StaticResponseMetadataInput } from './static-response-metadata.js';

import { targetDefinitionMatches, type FormDefinition, type LocaleDocument } from '@formspec-org/types';
import { LocaleStore } from './locale.js';
import { preactReactiveRuntime } from './reactivity/preact-runtime.js';

/** Look up authored strings without evaluating answers, using the runtime Locale cascade. */
export function createDefinitionLocaleLookup(definition: FormDefinition, documents: readonly LocaleDocument[]) {
    const target = { kind: 'definition' as const, url: definition.url };
    const store = new LocaleStore(preactReactiveRuntime, 'ltr', target);
    for (const document of documents) {
        if (document.target.kind === 'definition' && targetDefinitionMatches(document.target, definition)) {
            store.loadLocale(document);
        }
    }
    return {
        locales: store.getAvailableLocales(),
        lookup: (locale: string, key: string) => store.lookupKeyForTarget(key, target, locale).value,
    };
}
