import { describe, it, expect } from 'vitest';
import { RawProject, createRawProject } from '../src/index.js';

describe('RawProject', () => {
  it('is exported as RawProject class', () => {
    const raw = createRawProject();
    expect(raw).toBeInstanceOf(RawProject);
  });

  describe('dispatch with array (atomic multi-command)', () => {
    it('executes multiple commands atomically with single undo entry', () => {
      const raw = createRawProject();
      raw.dispatch([
        { type: 'definition.addItem', payload: { type: 'field', key: 'a' } },
        { type: 'definition.addItem', payload: { type: 'field', key: 'b' } },
      ]);
      expect(raw.state.definition.items).toHaveLength(2);
      raw.undo();
      expect(raw.state.definition.items).toHaveLength(0);
    });

    it('rolls back all commands if any throws — no partial commit', () => {
      const raw = createRawProject();
      raw.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'existing', label: 'Original' } });

      expect(() => raw.dispatch([
        { type: 'definition.setItemProperty', payload: { path: 'existing', property: 'label', value: 'Modified' } },
        { type: 'definition.deleteItem', payload: { path: 'nonexistent' } },
      ])).toThrow();

      expect(raw.state.definition.items).toHaveLength(1);
      expect(raw.state.definition.items[0].key).toBe('existing');
      expect(raw.state.definition.items[0].label).toBe('Original');
    });

    it('runs middleware once for array dispatch', () => {
      let callCount = 0;
      const raw = createRawProject({
        middleware: [(_state, _cmds, next) => {
          callCount++;
          return next(_cmds);
        }],
      });
      raw.dispatch([
        { type: 'definition.addItem', payload: { type: 'field', key: 'a' } },
        { type: 'definition.addItem', payload: { type: 'field', key: 'b' } },
      ]);
      expect(callCount).toBe(1);
    });

    it('notifies listeners once for array dispatch', () => {
      let notifyCount = 0;
      const raw = createRawProject();
      raw.onChange(() => { notifyCount++; });
      raw.dispatch([
        { type: 'definition.addItem', payload: { type: 'field', key: 'a' } },
        { type: 'definition.addItem', payload: { type: 'field', key: 'b' } },
      ]);
      expect(notifyCount).toBe(1);
    });
  });

  describe('batchWithRebuild', () => {
    it('executes phase1, rebuilds component tree, then executes phase2', () => {
      const raw = createRawProject();
      const results = raw.batchWithRebuild(
        [{ type: 'definition.addItem', payload: { type: 'field', key: 'email', label: 'Email' } }],
        [{ type: 'component.setFieldWidget', payload: { fieldKey: 'email', widget: 'TextInput' } }],
      );
      expect(results).toHaveLength(2);
      expect(raw.state.definition.items).toHaveLength(1);
    });

    it('produces a single undo entry', () => {
      const raw = createRawProject();
      raw.batchWithRebuild(
        [{ type: 'definition.addItem', payload: { type: 'field', key: 'f1' } }],
        [{ type: 'component.setFieldWidget', payload: { fieldKey: 'f1', widget: 'TextInput' } }],
      );
      raw.undo();
      expect(raw.state.definition.items).toHaveLength(0);
    });

    it('notifies listeners once', () => {
      let notifyCount = 0;
      const raw = createRawProject();
      raw.onChange(() => { notifyCount++; });
      raw.batchWithRebuild(
        [{ type: 'definition.addItem', payload: { type: 'field', key: 'f1' } }],
        [{ type: 'component.setFieldWidget', payload: { fieldKey: 'f1', widget: 'TextInput' } }],
      );
      expect(notifyCount).toBe(1);
    });
  });

  describe('handler table', () => {
    it('two instances have independent handler tables when custom handlers provided', () => {
      const customHandler = (_state: any, _payload: any) => ({
        rebuildComponentTree: false,
        custom: true,
      });
      const p1 = createRawProject({
        handlers: { 'custom.test': customHandler },
      });
      const p2 = createRawProject();

      const result = p1.dispatch({ type: 'custom.test', payload: {} });
      expect((result as any).custom).toBe(true);

      expect(() => p2.dispatch({ type: 'custom.test', payload: {} })).toThrow('Unknown command type');
    });
  });

  describe('batch middleware', () => {
    it('runs middleware for batch operations', () => {
      let middlewareRan = false;
      const project = createRawProject({
        middleware: [(_state, commands, next) => {
          middlewareRan = true;
          return next(commands);
        }],
      });
      project.batch([
        { type: 'definition.setFormTitle', payload: { title: 'Batched' } },
      ]);
      expect(middlewareRan).toBe(true);
      expect(project.definition.title).toBe('Batched');
    });
  });

  describe('clearRedo', () => {
    it('clears the redo stack', () => {
      const raw = createRawProject();
      raw.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f' } });
      raw.undo();
      expect(raw.canRedo).toBe(true);
      raw.clearRedo();
      expect(raw.canRedo).toBe(false);
    });
  });

  describe('JSON-native state', () => {
    it('loads registries from ProjectOptions.registries at creation', () => {
      const raw = createRawProject({
        registries: [
          {
            url: 'https://example.org/bundled',
            entries: [{ name: 'x-init-type', category: 'dataType', baseType: 'string', description: 't' }],
          },
        ],
      });
      expect(raw.listRegistries()).toEqual([{ url: 'https://example.org/bundled', entryCount: 1 }]);
      expect(raw.resolveExtension('x-init-type')).toMatchObject({ category: 'dataType', baseType: 'string' });
    });

    it('state round-trips through JSON.stringify', () => {
      const raw = createRawProject();
      raw.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f1' } });
      const json = JSON.stringify(raw.state);
      const parsed = JSON.parse(json);
      expect(parsed.definition.items).toHaveLength(1);
      expect(parsed.definition.items[0].key).toBe('f1');
      expect(() => JSON.stringify(parsed.extensions)).not.toThrow();
    });

    it('state with loaded registry round-trips through JSON', () => {
      const raw = createRawProject();
      raw.dispatch({
        type: 'project.loadRegistry',
        payload: {
          registry: {
            url: 'https://example.org/registry',
            entries: [{ name: 'x-test', category: 'dataType' }],
          },
        },
      });
      const json = JSON.stringify(raw.state);
      const parsed = JSON.parse(json);
      expect(parsed.extensions.registries).toHaveLength(1);
      expect(parsed.extensions.registries[0].entries['x-test']).toBeDefined();
    });

    it('theme getter exposes ThemeDocument fields from working state', () => {
      const raw = createRawProject({
        seed: {
          theme: {
            targetDefinition: { url: 'urn:formspec:def-1' },
            defaults: { labelPosition: 'top' },
          },
        },
      });
      expect(raw.theme.defaults?.labelPosition).toBe('top');
    });

    it('registry queries work after JSON round-trip and re-seeding', () => {
      const raw = createRawProject();
      raw.dispatch({
        type: 'project.loadRegistry',
        payload: {
          registry: {
            url: 'https://example.org/reg',
            entries: [
              { name: 'x-url', category: 'dataType', baseType: 'string' },
              { name: 'x-sum', category: 'function' },
            ],
          },
        },
      });
      // Round-trip through JSON
      const json = JSON.stringify(raw.state);
      const parsed = JSON.parse(json);
      // Re-seed a new project from the parsed state
      const raw2 = createRawProject({ seed: parsed });
      expect(raw2.resolveExtension('x-url')).toBeDefined();
      expect(raw2.listRegistries()).toEqual([{ url: 'https://example.org/reg', entryCount: 2 }]);
    });
  });
});
