import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

/** Minimal locale document payload for locale.load. */
function localeDoc(locale: string, strings: Record<string, string> = {}) {
  return {
    $formspecLocale: '2.0',
    locale,
    version: '0.1.0',
    target: { kind: 'definition', url: 'urn:formspec:test' },
    strings,
  };
}

describe('locale.load', () => {
  it('stores a locale document in state.locales keyed by BCP 47 code', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'locale.load',
      payload: { document: localeDoc('fr', { greeting: 'Bonjour' }) },
    });
    const locale = (project.state as any).locales['fr'];
    expect(locale).toBeDefined();
    expect(locale.locale).toBe('fr');
    expect(locale.strings.greeting).toBe('Bonjour');
    expect(locale.version).toBe('0.1.0');
  });

  it('stores optional metadata fields', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'locale.load',
      payload: {
        document: {
          ...localeDoc('de'),
          name: 'Deutsch',
          title: 'German',
          description: 'German locale',
          fallback: 'en',
        },
      },
    });
    const locale = (project.state as any).locales['de'];
    expect(locale.name).toBe('Deutsch');
    expect(locale.title).toBe('German');
    expect(locale.description).toBe('German locale');
    expect(locale.fallback).toBe('en');
  });

  it('overwrites an existing locale on re-load', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr', { a: '1' }) } });
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr', { b: '2' }) } });
    const locale = (project.state as any).locales['fr'];
    expect(locale.strings).toEqual({ b: '2' });
  });

  it('normalizes locale code with title-cased script subtags', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('zh-hant-tw') } });
    expect((project.state as any).locales['zh-Hant-TW']).toBeDefined();
  });
});

describe('locale commands normalize localeId for lookup (matches locale.load keys)', () => {
  it('locale.select accepts non-canonical code when locale was loaded normalized', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('zh-hant-tw') } });
    project.dispatch({ type: 'locale.select', payload: { localeId: 'zh-hant-tw' } });
    expect((project.state as any).selectedLocaleId).toBe('zh-Hant-TW');
  });

  it('locale.remove deletes by non-canonical localeId', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('zh-hant-tw') } });
    project.dispatch({ type: 'locale.remove', payload: { localeId: 'zh-hant-tw' } });
    expect((project.state as any).locales['zh-Hant-TW']).toBeUndefined();
  });

  it('locale.remove clears selectedLocaleId when selection used canonical key', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('zh-hant-tw') } });
    project.dispatch({ type: 'locale.select', payload: { localeId: 'zh-Hant-TW' } });
    project.dispatch({ type: 'locale.remove', payload: { localeId: 'zh-hant-tw' } });
    expect((project.state as any).selectedLocaleId).toBeUndefined();
  });

  it('getLocale-backed handlers accept non-canonical localeId', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('zh-hant-tw', { a: '1' }) } });
    project.dispatch({
      type: 'locale.setString',
      payload: { localeId: 'zh-hant-tw', key: 'b', value: '2' },
    });
    const strings = (project.state as any).locales['zh-Hant-TW'].strings;
    expect(strings.a).toBe('1');
    expect(strings.b).toBe('2');
  });
});

describe('locale.remove', () => {
  it('deletes a locale from state', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });
    project.dispatch({ type: 'locale.remove', payload: { localeId: 'fr' } });
    expect((project.state as any).locales['fr']).toBeUndefined();
  });

  it('clears selectedLocaleId if it matches the removed locale', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });
    project.dispatch({ type: 'locale.select', payload: { localeId: 'fr' } });
    project.dispatch({ type: 'locale.remove', payload: { localeId: 'fr' } });
    expect((project.state as any).selectedLocaleId).toBeUndefined();
  });

  it('does not throw when removing a nonexistent locale', () => {
    const project = createRawProject();
    expect(() => {
      project.dispatch({ type: 'locale.remove', payload: { localeId: 'zz' } });
    }).not.toThrow();
  });
});

describe('locale.select', () => {
  it('sets selectedLocaleId', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });
    project.dispatch({ type: 'locale.select', payload: { localeId: 'fr' } });
    expect((project.state as any).selectedLocaleId).toBe('fr');
  });

  it('throws when selecting a locale that is not loaded', () => {
    const project = createRawProject();
    expect(() => {
      project.dispatch({ type: 'locale.select', payload: { localeId: 'zz' } });
    }).toThrow();
  });
});

describe('locale.setString', () => {
  it('sets a string key on the selected locale', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });
    project.dispatch({ type: 'locale.select', payload: { localeId: 'fr' } });
    project.dispatch({ type: 'locale.setString', payload: { key: 'hello', value: 'Bonjour' } });
    expect((project.state as any).locales['fr'].strings.hello).toBe('Bonjour');
  });

  it('sets a string key on an explicit localeId', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });
    project.dispatch({ type: 'locale.setString', payload: { localeId: 'fr', key: 'hello', value: 'Bonjour' } });
    expect((project.state as any).locales['fr'].strings.hello).toBe('Bonjour');
  });

  it('deletes a string key when value is null', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr', { hello: 'Bonjour' }) } });
    project.dispatch({ type: 'locale.setString', payload: { localeId: 'fr', key: 'hello', value: null } });
    expect((project.state as any).locales['fr'].strings.hello).toBeUndefined();
  });
});

describe('locale.setStrings', () => {
  it('batch merges multiple string keys', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr', { existing: 'oui' }) } });
    project.dispatch({
      type: 'locale.setStrings',
      payload: { localeId: 'fr', strings: { hello: 'Bonjour', goodbye: 'Au revoir' } },
    });
    const strings = (project.state as any).locales['fr'].strings;
    expect(strings.existing).toBe('oui');
    expect(strings.hello).toBe('Bonjour');
    expect(strings.goodbye).toBe('Au revoir');
  });
});

describe('locale.removeString', () => {
  it('deletes a single string key', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr', { a: '1', b: '2' }) } });
    project.dispatch({ type: 'locale.removeString', payload: { localeId: 'fr', key: 'a' } });
    const strings = (project.state as any).locales['fr'].strings;
    expect(strings.a).toBeUndefined();
    expect(strings.b).toBe('2');
  });
});

describe('locale.setMetadata', () => {
  it('sets name on a locale', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });
    project.dispatch({ type: 'locale.setMetadata', payload: { localeId: 'fr', property: 'name', value: 'Français' } });
    expect((project.state as any).locales['fr'].name).toBe('Français');
  });

  it('sets version on a locale', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });
    project.dispatch({ type: 'locale.setMetadata', payload: { localeId: 'fr', property: 'version', value: '1.0.0' } });
    expect((project.state as any).locales['fr'].version).toBe('1.0.0');
  });

  it('sets title and description', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });
    project.dispatch({ type: 'locale.setMetadata', payload: { localeId: 'fr', property: 'title', value: 'French' } });
    project.dispatch({ type: 'locale.setMetadata', payload: { localeId: 'fr', property: 'description', value: 'French locale' } });
    expect((project.state as any).locales['fr'].title).toBe('French');
    expect((project.state as any).locales['fr'].description).toBe('French locale');
  });
});

describe('locale.setFallback', () => {
  it('sets a fallback locale', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr-CA') } });
    project.dispatch({ type: 'locale.setFallback', payload: { localeId: 'fr-CA', fallback: 'fr' } });
    expect((project.state as any).locales['fr-CA'].fallback).toBe('fr');
  });

  it('clears fallback with null', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'locale.load',
      payload: { document: { ...localeDoc('fr-CA'), fallback: 'fr' } },
    });
    project.dispatch({ type: 'locale.setFallback', payload: { localeId: 'fr-CA', fallback: null } });
    expect((project.state as any).locales['fr-CA'].fallback).toBeUndefined();
  });
});

describe('locale handlers return rebuildComponentTree: false', () => {
  it('locale.load does not rebuild component tree', () => {
    const project = createRawProject();
    const result = project.dispatch({
      type: 'locale.load',
      payload: { document: localeDoc('fr') },
    });
    expect(result.rebuildComponentTree).toBe(false);
  });
});

// ── State normalizer: Definition-target Locale URL sync ─────────────

describe('state normalizer — Locale target sync', () => {
  it('syncs a Definition-target Locale URL when definition URL changes', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });

    // Change the definition URL
    project.dispatch({ type: 'definition.setDefinitionProperty', payload: { property: 'url', value: 'urn:formspec:new-url' } });

    const locale = project.state.locales['fr'];
    expect(locale.target.url).toBe('urn:formspec:new-url');
  });

  it('syncs all loaded Definition-target Locale URLs', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('de') } });

    project.dispatch({ type: 'definition.setDefinitionProperty', payload: { property: 'url', value: 'urn:formspec:multi' } });

    expect(project.state.locales['fr'].target.url).toBe('urn:formspec:multi');
    expect(project.state.locales['de'].target.url).toBe('urn:formspec:multi');
  });

  it('does not rewrite an app-target Locale when the Definition URL changes', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'locale.load',
      payload: {
        document: {
          ...localeDoc('fr'),
          target: { kind: 'app', url: 'urn:formspec:app' },
        },
      },
    });

    project.dispatch({
      type: 'definition.setDefinitionProperty',
      payload: { property: 'url', value: 'urn:formspec:new-url' },
    });

    expect(project.state.locales['fr'].target).toEqual({
      kind: 'app',
      url: 'urn:formspec:app',
    });
  });
});

// ── Import with locales ─────────────────────────────────────────────

describe('project.import — locale support', () => {
  it('imports locale documents into state.locales', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.import',
      payload: {
        definition: {
          $formspec: '1.0',
          url: 'urn:formspec:imported',
          version: '1.0.0',
          title: 'Imported Form',
          items: [],
        },
        locales: {
          fr: {
            locale: 'fr',
            version: '0.1.0',
            target: { kind: 'definition', url: 'urn:formspec:imported' },
            strings: { greeting: 'Bonjour' },
          },
        },
      },
    });

    const locale = project.state.locales['fr'];
    expect(locale).toBeDefined();
    expect(locale.locale).toBe('fr');
    expect(locale.strings.greeting).toBe('Bonjour');
  });

  it('replaces existing locales on import', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('de') } });

    project.dispatch({
      type: 'project.import',
      payload: {
        definition: {
          $formspec: '1.0',
          url: 'urn:formspec:new',
          version: '1.0.0',
          title: '',
          items: [],
        },
        locales: {
          fr: {
            locale: 'fr',
            version: '0.1.0',
            target: { kind: 'definition', url: 'urn:formspec:new' },
            strings: {},
          },
        },
      },
    });

    expect(project.state.locales['de']).toBeUndefined();
    expect(project.state.locales['fr']).toBeDefined();
  });
});

// ── Export includes locales ──────────────────────────────────────────

describe('export — locale documents', () => {
  it('includes locale documents with $formspecLocale envelope', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'locale.load',
      payload: {
        document: {
          ...localeDoc('fr', { hello: 'Bonjour' }),
          name: 'Français',
          fallback: 'en',
        },
      },
    });

    const bundle = project.export();
    expect(bundle.locales).toBeDefined();
    expect(bundle.locales!['fr']).toBeDefined();

    const exported = bundle.locales!['fr'] as Record<string, unknown>;
    expect(exported.$formspecLocale).toBe('2.0');
    expect(exported.locale).toBe('fr');
    expect(exported.version).toBe('0.1.0');
    expect(exported.name).toBe('Français');
    expect(exported.fallback).toBe('en');
    expect(exported.strings).toEqual({ hello: 'Bonjour' });
  });

  it('omits locales key when no locales are loaded', () => {
    const project = createRawProject();
    const bundle = project.export();
    expect(bundle.locales).toBeUndefined();
  });

  it('omits optional fields that are not set', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });
    const bundle = project.export();
    const exported = bundle.locales!['fr'] as Record<string, unknown>;
    expect(exported.fallback).toBeUndefined();
    expect(exported.name).toBeUndefined();
    expect(exported.title).toBeUndefined();
    expect(exported.description).toBeUndefined();
  });
});

// ── IProjectCore locale queries ─────────────────────────────────────

describe('IProjectCore locale queries', () => {
  it('localeAt() returns correct LocaleState', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr', { a: '1' }) } });

    const locale = project.localeAt('fr');
    expect(locale).toBeDefined();
    expect(locale!.locale).toBe('fr');
    expect(locale!.strings.a).toBe('1');
  });

  it('localeAt() returns undefined for missing locale', () => {
    const project = createRawProject();
    expect(project.localeAt('zz')).toBeUndefined();
  });

  it('activeLocaleCode() returns selectedLocaleId', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });
    project.dispatch({ type: 'locale.select', payload: { localeId: 'fr' } });

    expect(project.activeLocaleCode()).toBe('fr');
  });

  it('activeLocaleCode() returns undefined when no locale selected', () => {
    const project = createRawProject();
    expect(project.activeLocaleCode()).toBeUndefined();
  });

  it('locales getter returns all loaded locales', () => {
    const project = createRawProject();
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('fr') } });
    project.dispatch({ type: 'locale.load', payload: { document: localeDoc('de') } });

    const locales = project.locales;
    expect(Object.keys(locales)).toEqual(['fr', 'de']);
  });
});

// ── State init ──────────────────────────────────────────────────────

describe('initial state — locale defaults', () => {
  it('fresh project has empty locales and undefined selectedLocaleId', () => {
    const project = createRawProject();
    expect(project.state.locales).toEqual({});
    expect(project.state.selectedLocaleId).toBeUndefined();
  });
});
