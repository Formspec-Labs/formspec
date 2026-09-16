import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

describe('project.import', () => {
  it('converts object-shaped binds to an array (matches createDefaultState)', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{
          $formspec: '1.0',
          url: 'urn:formspec:binds',
          version: '1.0.0',
          title: 'Binds',
          items: [{ key: 'a', type: 'text' }],
          binds: {
            a: { required: 'true' },
            b: { relevant: "$x = 'y'" },
          },
        }],
      },
    });
    const binds = project.definition.binds;
    expect(Array.isArray(binds)).toBe(true);
    expect(binds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'a', required: 'true' }),
        expect.objectContaining({ path: 'b', relevant: "$x = 'y'" }),
      ]),
    );
    expect(binds).toHaveLength(2);
  });

  it('drops malformed binds (non-array, non-object) on import', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{
          $formspec: '1.0',
          url: 'urn:formspec:bad-binds',
          version: '1.0.0',
          title: 'Bad',
          items: [],
          binds: 'not-valid' as never,
        }],
      },
    });
    expect(project.definition.binds).toBeUndefined();
  });

  it('replaces the entire project state', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.setFormTitle', payload: { title: 'Before' } });

    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{
          $formspec: '1.0',
          url: 'urn:formspec:imported',
          version: '1.0.0',
          title: 'Imported',
          items: [],
        }],
      },
    });

    expect(project.definition.title).toBe('Imported');
    expect(project.definition.url).toBe('urn:formspec:imported');
    expect(project.canUndo).toBe(true);
  });

  it('keeps a Theme document\'s identity (url, version, name, title, description) through import → export', () => {
    const project = createRawProject();
    const theme = {
      $formspecTheme: '1.0',
      version: '0.3.0',
      url: 'https://demo.example/theme',
      name: 'demo-uswds',
      title: 'Demo — USWDS',
      description: 'How the form looks.',
      targetDefinition: { url: 'urn:formspec:imported' },
      tokens: { 'spacing.field': '2rem' },
    };
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{ $formspec: '1.0', url: 'urn:formspec:imported', version: '1.0.0', title: 'Imported', items: [] }],
        theme,
      },
    });

    expect(project.state.theme).not.toHaveProperty('$formspecTheme');
    expect(project.export().theme).toEqual(theme);
    // Key order survives too: a saved file is the file that was opened.
    expect(Object.keys(project.export().theme)).toEqual(Object.keys(theme));
  });

  it('keeps every Locale field (formats included) and its key order through import → export', () => {
    const project = createRawProject();
    const locale = {
      $formspecLocale: '2.0',
      locale: 'en',
      version: '1.0.0',
      url: 'https://demo.example/locales/en',
      name: 'demo-en',
      target: { kind: 'definition', url: 'urn:formspec:imported' },
      formats: { date: { medium: 'MM/dd/yyyy' } },
      strings: { 'name.label': 'Name' },
    };
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{ $formspec: '1.0', url: 'urn:formspec:imported', version: '1.0.0', title: 'Imported', items: [] }],
        locales: { en: locale },
      },
    });

    expect(project.export().locales!.en).toEqual(locale);
    expect(Object.keys(project.export().locales!.en as object)).toEqual(Object.keys(locale));
  });

  it('keeps a Mapping document\'s key order through import → export', () => {
    const project = createRawProject();
    const mapping = {
      $formspecMapping: '1.0',
      version: '1.0.0',
      name: 'weekly-record-v1',
      title: 'Weekly → batch record',
      definitionRef: 'urn:formspec:imported',
      definitionVersion: '^2.0.0',
      targetSchema: { format: 'json' },
      direction: 'forward',
      defaults: { RECORD_VERSION: 1 },
      rules: [{ sourcePath: 'name', targetPath: 'NAME' }],
    };
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{ $formspec: '1.0', url: 'urn:formspec:imported', version: '1.0.0', title: 'Imported', items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }] }],
        mappings: { default: mapping },
      },
    });

    expect(project.export().mappings.default).toEqual(mapping);
    expect(Object.keys(project.export().mappings.default)).toEqual(Object.keys(mapping));
  });

  it('imports mapping documents as working mapping state', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{
          $formspec: '1.0',
          url: 'urn:formspec:imported',
          version: '1.0.0',
          title: 'Imported',
          items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
        }],
        mappings: {
          default: {
            $formspecMapping: '1.0',
            $schema: 'https://schemas.formspec.org/mapping/v1.json',
            version: '2.0.0',
            definitionRef: 'urn:formspec:imported',
            definitionVersion: '1.2.3',
            targetSchema: { format: 'json', root: 'payload' },
            rules: [{ sourcePath: 'name', targetPath: 'fullName' }],
          },
        },
      },
    });

    expect(project.state.mappings.default).toEqual({
      version: '2.0.0',
      definitionRef: 'urn:formspec:imported',
      definitionVersion: '1.2.3',
      targetSchema: { format: 'json', root: 'payload' },
      rules: [{ sourcePath: 'name', targetPath: 'fullName' }],
    });
    expect(project.state.mappings.default).not.toHaveProperty('$formspecMapping');
    expect(project.state.mappings.default).not.toHaveProperty('$schema');
    expect(project.state.mappings.default).toHaveProperty('version', '2.0.0');
    expect(project.mapping).toMatchObject({
      $formspecMapping: '1.0',
      version: '2.0.0',
      definitionRef: 'urn:formspec:imported',
      definitionVersion: '1.2.3',
      targetSchema: { format: 'json', root: 'payload' },
      rules: [{ sourcePath: 'name', targetPath: 'fullName' }],
    });
  });

  describe('mappings (export omits rule-less mappings: mapping.schema.json rules minItems 1)', () => {
    const definition = { $formspec: '1.0', url: 'urn:m', version: '1.0.0', title: 'M', items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }] };
    const mappingDoc = (targetPath: string) => ({ $formspecMapping: '1.0', definitionRef: 'urn:m', rules: [{ sourcePath: 'name', targetPath }] });

    it('an export -> import round trip keeps rule-less mapping tabs and their settings', () => {
      const project = createRawProject({ seed: { definition: definition as any } });
      project.dispatch({ type: 'mapping.create', payload: { id: 'csv', targetSchema: { format: 'csv' } } });
      project.dispatch({ type: 'project.import', payload: project.export() });

      expect(project.state.mappings.csv).toEqual({ rules: [], targetSchema: { format: 'csv' } });
      expect(Object.keys(project.state.mappings)).toEqual(['default', 'csv']);
      expect(project.state.selectedMappingId).toBe('csv');
    });

    it('bundle mappings replace rule-bearing ones and keep rule-less tabs the bundle does not name', () => {
      const project = createRawProject({ seed: { definition: definition as any } });
      project.dispatch({ type: 'mapping.create', payload: { id: 'csv', targetSchema: { format: 'csv' } } });
      project.dispatch({ type: 'mapping.create', payload: { id: 'old' } });
      project.dispatch({ type: 'mapping.addRule', payload: { mappingId: 'old', sourcePath: 'name', targetPath: 'n' } });

      project.dispatch({ type: 'project.import', payload: { mappings: { default: mappingDoc('fullName') } } as any });

      expect(Object.keys(project.state.mappings)).toEqual(['default', 'csv']);
      expect(project.state.mappings.default.rules).toEqual([{ sourcePath: 'name', targetPath: 'fullName' }]);
      // `old` was selected and is gone: selection moves to a mapping that exists.
      expect(project.state.selectedMappingId).toBe('default');
    });

    it('a replace import installs the bundle as the whole project, keeping no rule-less tab', () => {
      const project = createRawProject({ seed: { definition: definition as any } });
      project.batch([
        { type: 'mapping.create', payload: { id: 'csv', targetSchema: { format: 'csv' } } },
        { type: 'mapping.select', payload: { id: 'csv' } },
        { type: 'locale.load', payload: { document: { $formspecLocale: '2.0', locale: 'fr', version: '1', target: { kind: 'definition', url: 'urn:m' }, strings: { 'name.label': 'Nom' } } } },
        { type: 'locale.select', payload: { localeId: 'fr' } },
        { type: 'component.setNodeType', payload: { node: { bind: 'name' }, component: 'Textarea' } },
        { type: 'theme.setToken', payload: { key: 'color.primary', value: '#000' } },
      ] as any);
      project.dispatch({ type: 'project.import', payload: { experience: { $formspecExperience: '1.0' } } as any });
      project.dispatch({ type: 'project.publish', payload: { version: '2.0.0' } });
      const blank = createRawProject({ seed: { definition: definition as any } });

      project.dispatch({ type: 'project.import', payload: { ...blank.export(), replace: true } as any });

      expect(project.state.mappings).toEqual({ default: { rules: [] } });
      expect(project.state.selectedMappingId).toBe('default');
      expect(project.state.locales).toEqual({});
      expect(project.state.selectedLocaleId).toBeUndefined();
      expect(project.state.experience).toBeNull();
      // Versions and the changelog baseline belong to the form being replaced.
      expect(project.state.versioning).toEqual({ baseline: project.state.definition, releases: [] });
      expect(project.componentFor('name')!.component).toBe('TextInput');
      expect(project.export()).toEqual(blank.export());
    });

    it('a replace import needs a Definition', () => {
      const project = createRawProject({ seed: { definition: definition as any } });
      expect(() => project.dispatch({ type: 'project.import', payload: { replace: true } as any })).toThrow(/Definition/);
    });

    it('clears the selection when no mapping is left', () => {
      const project = createRawProject({ seed: { definition: definition as any, mappings: {} } as any });
      project.dispatch({ type: 'mapping.addRule', payload: { sourcePath: 'name', targetPath: 'n' } });
      expect(project.state.selectedMappingId).toBe('default');

      project.dispatch({ type: 'project.import', payload: { mappings: {} } as any });

      expect(project.state.mappings).toEqual({});
      expect(project.state.selectedMappingId).toBeUndefined();
    });
  });

  it('preserves imported theme pages on definition-only import', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{
          $formspec: '1.0', url: 'urn:test', version: '1.0.0', title: 'Test',
          items: [
            { key: 'name', type: 'text' },
            { key: 'age', type: 'number' },
            { key: 'deleted_field', type: 'text' },
          ],
        }],
        theme: {
          pages: [
            { title: 'Valid', regions: [{ key: 'name' }, { key: 'age' }] },
            { title: 'Stale', regions: [{ key: 'deleted_field' }] },
          ],
        },
      },
    });
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{
          $formspec: '1.0', url: 'urn:test', version: '2.0.0', title: 'Updated',
          items: [
            { key: 'name', type: 'text' },
            { key: 'age', type: 'number' },
          ],
        }],
      },
    });
    const pages = (project.state.theme as any).pages;
    expect(pages).toHaveLength(2);
    expect(pages[0].title).toBe('Valid');
  });

  it('does not strip theme pages during import', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{
          $formspec: '1.0', url: 'urn:test', version: '1.0.0', title: 'Test',
          items: [{ key: 'old_field', type: 'text' }],
        }],
        theme: {
          pages: [{ title: 'Page1', regions: [{ key: 'old_field' }] }],
        },
      },
    });
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{
          $formspec: '1.0', url: 'urn:test', version: '2.0.0', title: 'New',
          items: [{ key: 'new_field', type: 'text' }],
        }],
      },
    });
    const pages = (project.state.theme as any).pages;
    expect(pages).toHaveLength(1);
  });

  it('normalizes imported locale keys to canonical BCP 47 codes', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{
          $formspec: '1.0',
          url: 'urn:formspec:imported',
          version: '1.0.0',
          title: 'Imported',
          items: [],
        }],
        locales: {
          'fr-ca': {
            locale: 'fr-ca',
            version: '0.1.0',
            targetDefinition: { url: 'urn:formspec:imported' },
            strings: { greeting: 'Bonjour' },
          },
        },
      },
    });

    expect(project.state.locales['fr-CA']).toBeDefined();
    expect(project.state.locales['fr-ca']).toBeUndefined();
  });

  it('clears selectedLocaleId if import removes selected locale', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{
          $formspec: '1.0',
          url: 'urn:formspec:before',
          version: '1.0.0',
          title: 'Before',
          items: [],
        }],
        locales: {
          fr: {
            locale: 'fr',
            version: '0.1.0',
            targetDefinition: { url: 'urn:formspec:before' },
            strings: {},
          },
        },
      },
    });
    project.dispatch({ type: 'locale.select', payload: { localeId: 'fr' } });
    expect(project.state.selectedLocaleId).toBe('fr');

    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{
          $formspec: '1.0',
          url: 'urn:formspec:after',
          version: '1.0.0',
          title: 'After',
          items: [],
        }],
        locales: {
          de: {
            locale: 'de',
            version: '0.1.0',
            targetDefinition: { url: 'urn:formspec:after' },
            strings: {},
          },
        },
      },
    });

    expect(project.state.selectedLocaleId).toBeUndefined();
  });
});

describe('project.importSubform', () => {
  it('merges a definition fragment as a nested group', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'address' } });

    project.dispatch({
      type: 'project.importSubform',
      payload: {
        definition: {
          $formspec: '1.0',
          url: 'urn:formspec:address-fragment',
          version: '0.1.0',
          title: 'Address',
          items: [
            { type: 'field', key: 'street', label: 'Street' },
            { type: 'field', key: 'city', label: 'City' },
          ],
        },
        targetGroupPath: 'address',
      },
    });

    const group = project.itemAt('address')!;
    expect(group.children).toHaveLength(2);
    expect(group.children![0].key).toBe('street');
    expect(group.children![1].key).toBe('city');
  });
});

describe('project.loadRegistry', () => {
  it('loads a registry and indexes entries', () => {
    const project = createRawProject();

    project.dispatch({
      type: 'project.loadRegistry',
      payload: {
        registry: {
          url: 'https://registry.example.com/common',
          entries: [
            { name: 'x-validation-pattern', category: 'constraint' },
            { name: 'x-mask', category: 'presentation' },
          ],
        },
      },
    });

    expect(project.state.extensions.registries).toHaveLength(1);
    expect(project.state.extensions.registries[0].url).toBe('https://registry.example.com/common');
    expect(Object.keys(project.state.extensions.registries[0].entries)).toHaveLength(2);
  });
});

describe('project.removeRegistry', () => {
  it('removes a registry by URL', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.loadRegistry',
      payload: {
        registry: { url: 'https://example.com/reg', entries: [] },
      },
    });

    project.dispatch({
      type: 'project.removeRegistry',
      payload: { url: 'https://example.com/reg' },
    });

    expect(project.state.extensions.registries).toHaveLength(0);
  });
});

describe('project.publish', () => {
  it('creates a versioned release', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.setFormTitle', payload: { title: 'Published Form' } });

    project.dispatch({
      type: 'project.publish',
      payload: { version: '1.0.0', summary: 'First release' },
    });

    expect(project.state.versioning.releases).toHaveLength(1);
    expect(project.state.versioning.releases[0].version).toBe('1.0.0');
    expect(project.definition.version).toBe('1.0.0');
  });
});
