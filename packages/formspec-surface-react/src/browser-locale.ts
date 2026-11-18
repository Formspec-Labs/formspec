/** @filedesc Select an offered browser Locale and bind the Surface shell's string family. */
import { evalFEL, interpolateMessage, LocaleStore, preactReactiveRuntime } from '@formspec-org/engine';
import { resolveSurfaceLocaleStrings, type ResolvedBundle } from '@formspec-org/surface';
import { targetDefinitionMatches, type FormDefinition, type LocaleDocument } from '@formspec-org/types';

/** Build the Definition-targeted cascade without opening a draft or starting a form engine. */
export function definitionLocaleLookup(documents: readonly LocaleDocument[] = [], activeLocale?: string) {
  const stores = new Map<FormDefinition, LocaleStore>();
  return (definition: FormDefinition, key: string): string | null => {
    let store = stores.get(definition);
    if (!store) {
      store = new LocaleStore(preactReactiveRuntime, undefined, { kind: 'definition', url: definition.url });
      for (const document of documents) {
        if (document.target.kind === 'definition' && targetDefinitionMatches(document.target, definition)) store.loadLocale(document);
      }
      if (activeLocale !== undefined) store.setLocale(activeLocale);
      stores.set(definition, store);
    }
    return store.lookupKey(key);
  };
}

function selectLanguage(available: readonly string[], requested: readonly string[]): string {
  const offered = new Set(available);
  for (const language of requested) {
    let candidate = LocaleStore.normalizeCode(language);
    while (candidate) {
      if (offered.has(candidate)) return candidate;
      const separator = candidate.lastIndexOf('-');
      candidate = separator < 0 ? '' : candidate.slice(0, separator);
    }
  }
  return available[0] ?? '';
}

export function resolveBrowserLocale(bundle: ResolvedBundle, documents: readonly LocaleDocument[] = []) {
  const id = bundle.manifest.id;
  const target = id ? { kind: 'app' as const, url: id } : undefined;
  const store = new LocaleStore(preactReactiveRuntime, 'auto', target);
  for (const doc of documents) {
    if (target && doc.target.kind === 'app' && doc.target.url === target.url) store.loadLocale(doc);
  }
  const appLanguages = store.getAvailableLocales();
  const available = appLanguages.length ? appLanguages : documents.flatMap(doc => {
    const definition = doc.target.kind === 'definition' ? bundle.definitions.get(doc.target.url) : undefined;
    return definition && targetDefinitionMatches(doc.target, definition)
      ? [LocaleStore.normalizeCode(doc.locale)]
      : [];
  });
  const preferred = typeof navigator === 'undefined' ? [] :
    navigator.languages?.length ? navigator.languages : [navigator.language];
  const activeLocale = selectLanguage(available, preferred);
  store.setLocale(activeLocale);
  return {
    activeLocale,
    direction: store.direction.value,
    strings: resolveSurfaceLocaleStrings({
      lookup: key => store.lookupKey(key),
      interpolate: (template, vars) => interpolateMessage(
        template, expression => evalFEL(expression, { ...vars }),
      ).text,
    }),
  };
}
