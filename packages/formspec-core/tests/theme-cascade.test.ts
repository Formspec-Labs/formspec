import { describe, it, expect } from 'vitest';
import { resolveThemeCascade } from '../src/index.js';
import type { ThemeState } from '../src/index.js';

describe('resolveThemeCascade', () => {
  it('returns defaults when no selectors or item overrides exist', () => {
    const theme: ThemeState = {
      defaults: { labelPosition: 'top', widget: 'TextInput' },
    };
    const result = resolveThemeCascade(theme, 'name', 'field');
    expect(result.labelPosition).toEqual({ value: 'top', source: 'default' });
    expect(result.widget).toEqual({ value: 'TextInput', source: 'default' });
  });

  it('selector overrides default, provenance says selector', () => {
    const theme: ThemeState = {
      defaults: { widget: 'TextInput' },
      selectors: [
        { match: { type: 'field', dataType: 'money' }, apply: { widget: 'MoneyInput' } },
      ],
    };
    const result = resolveThemeCascade(theme, 'amount', 'field', 'money');
    expect(result.widget).toEqual({
      value: 'MoneyInput',
      source: 'selector',
      sourceDetail: 'selector #1: field + money',
    });
  });

  it('item override wins over selector, provenance says item-override', () => {
    const theme: ThemeState = {
      defaults: { widget: 'TextInput' },
      selectors: [
        { match: { type: 'field' }, apply: { widget: 'x-custom-widget' } },
      ],
      items: {
        name: { widget: 'x-fancy-input' },
      },
    };
    const result = resolveThemeCascade(theme, 'name', 'field');
    expect(result.widget).toEqual({
      value: 'x-fancy-input',
      source: 'item-override',
    });
  });

  it('multiple selectors merge in order', () => {
    const theme: ThemeState = {
      selectors: [
        { match: { type: 'field' }, apply: { widget: 'x-base-widget', cssClass: 'field-base' } },
        { match: { dataType: 'money' }, apply: { widget: 'MoneyInput' } },
      ],
    };
    const result = resolveThemeCascade(theme, 'amount', 'field', 'money');
    expect(result.widget?.value).toBe('MoneyInput');
    expect(result.cssClass?.value).toEqual(['field-base']);
  });

  it('unions cssClass across cascade levels while other properties replace', () => {
    const theme: ThemeState = {
      defaults: { cssClass: 'formspec-field', widget: 'TextInput' },
      selectors: [
        { match: { type: 'field' }, apply: { cssClass: ['usa-input', 'formspec-field'], widget: 'NumberInput' } },
        { match: { dataType: 'money' }, apply: { cssClass: 'usa-input--currency' } },
      ],
      items: {
        totalBudget: { cssClass: 'budget-highlight usa-input', widget: 'MoneyInput' },
      },
    };

    const result = resolveThemeCascade(theme, 'totalBudget', 'field', 'money');
    expect(result.cssClass).toEqual({
      value: ['formspec-field', 'usa-input', 'usa-input--currency', 'budget-highlight'],
      source: 'item-override',
    });
    expect(result.widget?.value).toBe('MoneyInput');
  });

  it('unmatched selectors are skipped', () => {
    const theme: ThemeState = {
      defaults: { widget: 'TextInput' },
      selectors: [
        { match: { type: 'group' }, apply: { widget: 'x-group-widget' } },
      ],
    };
    const result = resolveThemeCascade(theme, 'name', 'field');
    expect(result.widget).toEqual({ value: 'TextInput', source: 'default' });
  });

  it('empty theme returns empty record', () => {
    const result = resolveThemeCascade({}, 'name', 'field');
    expect(result).toEqual({});
  });

  it('formPresentation provides baseline at form-default level', () => {
    const theme: ThemeState = {};
    const result = resolveThemeCascade(theme, 'name', 'field', undefined, {
      formPresentation: { labelPosition: 'start' },
    });
    expect(result.labelPosition).toEqual({ value: 'start', source: 'form-default' });
  });

  it('item presentation hints override formPresentation at item-hint level', () => {
    const theme: ThemeState = {};
    const result = resolveThemeCascade(theme, 'name', 'field', undefined, {
      formPresentation: { labelPosition: 'start' },
      itemPresentation: { widgetHint: 'TextInput' },
    });
    expect(result.labelPosition).toEqual({ value: 'start', source: 'form-default' });
    expect(result.widgetHint).toEqual({ value: 'TextInput', source: 'item-hint' });
  });

  it('theme defaults override formPresentation', () => {
    const theme: ThemeState = {
      defaults: { labelPosition: 'top' },
    };
    const result = resolveThemeCascade(theme, 'name', 'field', undefined, {
      formPresentation: { labelPosition: 'start' },
    });
    expect(result.labelPosition).toEqual({ value: 'top', source: 'default' });
  });

  it('full 5-level cascade: form-default < item-hint < default < selector < item-override', () => {
    const theme: ThemeState = {
      defaults: { labelPosition: 'top' },
      selectors: [
        { match: { type: 'field' }, apply: { labelPosition: 'hidden' } },
      ],
      items: {
        name: { widget: 'x-fancy' },
      },
    };
    const result = resolveThemeCascade(theme, 'name', 'field', undefined, {
      formPresentation: { labelPosition: 'start' },
      itemPresentation: { widgetHint: 'TextInput' },
    });
    expect(result.labelPosition).toEqual({ value: 'hidden', source: 'selector', sourceDetail: 'selector #1: field' });
    expect(result.widget).toEqual({ value: 'x-fancy', source: 'item-override' });
    expect(result.widgetHint).toEqual({ value: 'TextInput', source: 'item-hint' });
  });

  it('item-hint properties not overridden by theme persist', () => {
    const theme: ThemeState = { defaults: { labelPosition: 'top' } };
    const result = resolveThemeCascade(theme, 'name', 'field', undefined, {
      itemPresentation: { widgetHint: 'Slider' },
    });
    expect(result.widgetHint).toEqual({ value: 'Slider', source: 'item-hint' });
    expect(result.labelPosition).toEqual({ value: 'top', source: 'default' });
  });
});
