import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

// ── Tokens & Defaults ───────────────────────────────────────────

describe('theme.setToken', () => {
  it('sets a design token', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.setToken', payload: { key: 'color.primary', value: '#007bff' } });
    expect((project.theme as any).tokens?.['color.primary']).toBe('#007bff');
  });

  it('removes a token with null', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.setToken', payload: { key: 'x', value: '1' } });
    project.dispatch({ type: 'theme.setToken', payload: { key: 'x', value: null } });
    expect((project.theme as any).tokens?.x).toBeUndefined();
  });
});

describe('theme.setTokens', () => {
  it('batch-sets multiple tokens', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'theme.setTokens',
      payload: { tokens: { 'color.bg': '#fff', 'color.fg': '#000' } },
    });
    expect((project.theme as any).tokens?.['color.bg']).toBe('#fff');
    expect((project.theme as any).tokens?.['color.fg']).toBe('#000');
  });
});

describe('theme.setDefaults', () => {
  it('sets a form-wide presentation default', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.setDefaults', payload: { property: 'labelPosition', value: 'left' } });
    expect((project.theme as any).defaults?.labelPosition).toBe('left');
  });
});

// ── Selectors ───────────────────────────────────────────────────

describe('theme.addSelector', () => {
  it('adds a selector', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'theme.addSelector',
      payload: { match: { type: 'field' }, apply: { widget: 'TextInput' } },
    });
    expect((project.theme as any).selectors).toHaveLength(1);
    expect((project.theme as any).selectors[0].match.type).toBe('field');
  });
});

describe('theme.setSelector', () => {
  it('updates a selector', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'theme.addSelector',
      payload: { match: { type: 'field' }, apply: { widget: 'TextInput' } },
    });
    project.dispatch({
      type: 'theme.setSelector',
      payload: { index: 0, apply: { widget: 'NumberInput' } },
    });
    expect((project.theme as any).selectors[0].apply.widget).toBe('NumberInput');
  });
});

describe('theme.deleteSelector', () => {
  it('removes a selector by index', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'theme.addSelector',
      payload: { match: { type: 'field' }, apply: { widget: 'A' } },
    });
    project.dispatch({
      type: 'theme.addSelector',
      payload: { match: { type: 'group' }, apply: { widget: 'B' } },
    });
    project.dispatch({ type: 'theme.deleteSelector', payload: { index: 0 } });
    expect((project.theme as any).selectors).toHaveLength(1);
    expect((project.theme as any).selectors[0].apply.widget).toBe('B');
  });
});

describe('theme.reorderSelector', () => {
  it('reorders selectors', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.addSelector', payload: { match: { type: 'field' }, apply: { widget: 'A' } } });
    project.dispatch({ type: 'theme.addSelector', payload: { match: { type: 'group' }, apply: { widget: 'B' } } });
    project.dispatch({ type: 'theme.reorderSelector', payload: { index: 0, direction: 'down' } });
    expect((project.theme as any).selectors[0].apply.widget).toBe('B');
  });
});

// ── Per-Item Overrides ──────────────────────────────────────────

describe('theme.setItemOverride', () => {
  it('sets a per-item override', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'theme.setItemOverride',
      payload: { itemKey: 'name', property: 'widget', value: 'TextInput' },
    });
    expect((project.theme as any).items?.name?.widget).toBe('TextInput');
  });

  it('removes property with null, cleans up empty', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.setItemOverride', payload: { itemKey: 'x', property: 'widget', value: 'A' } });
    project.dispatch({ type: 'theme.setItemOverride', payload: { itemKey: 'x', property: 'widget', value: null } });
    expect((project.theme as any).items?.x).toBeUndefined();
  });
});

describe('theme.deleteItemOverride', () => {
  it('removes entire item override', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.setItemOverride', payload: { itemKey: 'name', property: 'widget', value: 'A' } });
    project.dispatch({ type: 'theme.deleteItemOverride', payload: { itemKey: 'name' } });
    expect((project.theme as any).items?.name).toBeUndefined();
  });
});

describe('theme.setItemStyle', () => {
  it('sets a CSS property on a per-item style', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'theme.setItemStyle',
      payload: { itemKey: 'f1', property: 'color', value: 'red' },
    });
    expect((project.theme as any).items?.f1?.style?.color).toBe('red');
  });
});

describe('theme.setItemWidgetConfig', () => {
  it('sets a widgetConfig property', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'theme.setItemWidgetConfig',
      payload: { itemKey: 'f1', property: 'maxLength', value: 100 },
    });
    expect((project.theme as any).items?.f1?.widgetConfig?.maxLength).toBe(100);
  });
});

describe('theme.setItemAccessibility', () => {
  it('sets an accessibility property', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'theme.setItemAccessibility',
      payload: { itemKey: 'f1', property: 'role', value: 'textbox' },
    });
    expect((project.theme as any).items?.f1?.accessibility?.role).toBe('textbox');
  });
});

// ── Document-Level ──────────────────────────────────────────────

describe('theme.setBreakpoint', () => {
  it('sets a breakpoint', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.setBreakpoint', payload: { name: 'md', minWidth: 768 } });
    expect((project.theme as any).breakpoints?.md).toBe(768);
  });
});

describe('theme.setStylesheets', () => {
  it('sets external stylesheets', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.setStylesheets', payload: { urls: ['https://cdn/style.css'] } });
    expect((project.theme as any).stylesheets).toEqual(['https://cdn/style.css']);
  });
});

describe('theme.setDocumentProperty', () => {
  it('sets a document property', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.setDocumentProperty', payload: { property: 'title', value: 'My Theme' } });
    expect((project.theme as any).title).toBe('My Theme');
  });
});

describe('theme.setExtension', () => {
  it('sets a document-level extension', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.setExtension', payload: { key: 'x-vendor', value: { flag: true } } });
    expect((project.theme as any).extensions['x-vendor']).toEqual({ flag: true });
  });

  it('deletes an extension with null', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.setExtension', payload: { key: 'x-vendor', value: { flag: true } } });
    project.dispatch({ type: 'theme.setExtension', payload: { key: 'x-vendor', value: null } });
    expect((project.theme as any).extensions['x-vendor']).toBeUndefined();
  });
});

describe('theme.setTargetCompatibility', () => {
  it('sets compatible versions', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.setTargetCompatibility', payload: { compatibleVersions: '>=1.0.0' } });
    expect((project.theme as any).targetDefinition?.compatibleVersions).toBe('>=1.0.0');
  });
});
